import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { newInvoiceCode, nextReference } from "./codes";
import { awaitsDeliveryQuote, fulfilmentAsShown } from "./fulfilment";
import { getWindow } from "./orderWindows";
import { pickupLocation } from "./settings";
import { dayMonth, ordersUrl, queueSms, renderSms } from "./sms";

const DAY = 24 * 60 * 60 * 1000;

/** An invoice is due this long after it was first issued. */
export const dueAfterMs = 14 * DAY;

/** The public link to pay an invoice. */
export function payUrl(code: string) {
  return `${process.env.SITE_URL}/p/${code}`;
}

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** A fee this far over the estimate needs Staff to tick "I've checked the supplier's bill". */
export const overEstimateWarnRatio = 1.2;

/** Whether a per-unit fee is more than 20% over the window's estimate. */
export function overEstimate(fee: number, estimate: number | undefined) {
  return estimate !== undefined && fee > estimate * overEstimateWarnRatio;
}

/** The window, once its arrival is locked and before its invoices are issued. */
async function invoiceableWindow(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">) {
  const window = await getWindow(ctx, windowId);
  if (window.stage !== "arrived") {
    refuse("NOT_ARRIVED", `Record W${window.number}'s arrival first.`);
  }
  if (window.invoicesIssuedAt !== undefined) {
    refuse("ALREADY_ISSUED", `W${window.number}'s invoices are already issued.`);
  }
  return window;
}

/**
 * Staff confirm the actual per-unit Shipping Fee after the arrival. More than 20% over the
 * estimate must be acknowledged: Customers can't cancel over it. It can be changed until the
 * invoices are issued.
 */
export async function confirmFee(
  ctx: Pick<MutationCtx, "db">,
  {
    windowId,
    fee,
    overEstimateAcknowledged,
  }: { windowId: Id<"orderWindows">; fee: number; overEstimateAcknowledged?: boolean },
) {
  const window = await invoiceableWindow(ctx, windowId);
  if (!Number.isSafeInteger(fee) || fee < 0) {
    refuse("INVALID_FEE", "Enter the Shipping Fee per unit in GH₵, to the pesewa.");
  }
  const over = overEstimate(fee, window.shippingFeeEstimate);
  if (over && !overEstimateAcknowledged) {
    refuse(
      "OVER_ESTIMATE",
      "That's more than 20% over the estimate Customers saw. Check the supplier's bill first.",
    );
  }
  await ctx.db.patch(window._id, {
    shippingFeeConfirmed: fee,
    overEstimateAcknowledged: over,
  });
}

/**
 * The Fee and Issue steps: the estimate, the confirmed fee, and one row per arrived Pre-order
 * with what it owes at `fee` (else the confirmed fee, else the estimate). Once issued, each row
 * is its invoice as it stands now. Pre-orders that got nothing are skipped.
 */
export async function previewInvoices(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  fee?: number,
) {
  const window = await getWindow(ctx, windowId);
  const product = await ctx.db.get(window.productId);
  const issued = window.invoicesIssuedAt !== undefined;
  const orders = (
    await ctx.db
      .query("orders")
      .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", windowId))
      .collect()
  )
    .filter((order) => order.kind === "preorder")
    .sort((a, b) => a.placedAt - b.placedAt || a.reference.localeCompare(b.reference));
  const nameOf = async (order: Doc<"orders">) => {
    const customer = await ctx.db.get(order.customerId);
    return customer?.name ?? customer?.phone ?? "";
  };
  const skipped = [];
  for (const order of orders) {
    if (order.cancelReason === "nothingArrived") {
      skipped.push({ reference: order.reference, customerName: await nameOf(order) });
    }
  }

  const rate = fee ?? window.shippingFeeConfirmed ?? window.shippingFeeEstimate ?? 0;
  const invoices: {
    orderId: Id<"orders">;
    reference: string;
    customerName: string;
    units: number;
    shipping: number;
    deliveryFee?: number;
    quoteLater: boolean;
    total: number;
    number?: string;
    status?: Doc<"invoices">["status"];
  }[] = [];
  if (window.stage === "arrived") {
    const plans = issued ? [] : await planInvoices(ctx, windowId, rate);
    for (const plan of plans) {
      invoices.push({
        orderId: plan.order._id,
        reference: plan.order.reference,
        customerName: await nameOf(plan.order),
        units: plan.units,
        shipping: plan.shipping,
        ...(plan.deliveryFee > 0 ? { deliveryFee: plan.deliveryFee } : {}),
        quoteLater: plan.quoteLater,
        total: plan.total,
      });
    }
    for (const order of issued ? orders : []) {
      const invoice = await liveInvoice(ctx, order._id, "shippingFee");
      if (!invoice) continue;
      const shipping = invoice.lines.find((line) => line.kind === "shippingFee");
      const delivery = invoice.lines.find((line) => line.kind === "deliveryFee");
      invoices.push({
        orderId: order._id,
        reference: order.reference,
        customerName: await nameOf(order),
        units: shipping?.kind === "shippingFee" ? shipping.units : 0,
        shipping: shipping?.amount ?? 0,
        ...(delivery ? { deliveryFee: delivery.amount } : {}),
        quoteLater: awaitsDeliveryQuote(order.fulfilment),
        total: invoice.total,
        number: invoice.number,
        status: invoice.status,
      });
    }
  }
  // What the first Customer's text will say, with a stand-in for their own Pay link.
  const first = invoices.find((row) => row.total > 0);
  const exampleSms =
    !issued && first
      ? renderSms("shippingFeeInvoice", {
          reference: first.reference,
          units: first.units,
          shipping: first.shipping,
          ...(first.deliveryFee ? { deliveryFee: first.deliveryFee } : {}),
          total: first.total,
          due: dayMonth(Date.now() + dueAfterMs),
          payUrl: payUrl("XXXXXXXX"),
        })
      : undefined;
  return {
    productName: product?.name ?? "",
    ...(exampleSms ? { exampleSms } : {}),
    number: window.number,
    arrived: window.stage === "arrived",
    estimate: window.shippingFeeEstimate,
    confirmedFee: window.shippingFeeConfirmed,
    overEstimateAcknowledged: window.overEstimateAcknowledged ?? false,
    issued,
    invoices,
    skipped,
  };
}

/** An order's invoice of this kind that's still in force: the end of its void chain. */
export async function liveInvoice(
  ctx: Pick<QueryCtx, "db">,
  orderId: Id<"orders">,
  kind: Doc<"invoices">["kind"],
) {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return invoices.find((invoice) => invoice.kind === kind && invoice.status !== "void") ?? null;
}

/**
 * What each of the window's arrived Pre-orders owes: its arrived units × the per-unit fee, plus
 * its frozen Delivery Fee when it's known. Earliest placed first, as the arrival filled them.
 */
async function planInvoices(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  fee: number,
) {
  const orders = (
    await ctx.db
      .query("orders")
      .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", windowId))
      .collect()
  )
    .filter((order) => order.kind === "preorder" && order.status === "awaitingArrival")
    .sort((a, b) => a.placedAt - b.placedAt || a.reference.localeCompare(b.reference));
  const plans = [];
  for (const order of orders) {
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const units = lines.reduce((sum, line) => sum + (line.arrivedUnits ?? 0), 0);
    const shipping = units * fee;
    const { fulfilment } = order;
    const deliveryFee =
      fulfilment.method === "delivery" && fulfilment.deliveryFee ? fulfilment.deliveryFee : 0;
    const invoiceLines: Doc<"invoices">["lines"] = [
      { kind: "shippingFee", units, unitFee: fee, amount: shipping },
    ];
    if (deliveryFee > 0 && fulfilment.method === "delivery") {
      invoiceLines.push({ kind: "deliveryFee", zoneName: fulfilment.zoneName, amount: deliveryFee });
    }
    plans.push({
      order,
      units,
      shipping,
      deliveryFee,
      /** Elsewhere in Ghana: its Delivery Fee comes on its own invoice once quoted. */
      quoteLater: awaitsDeliveryQuote(fulfilment),
      lines: invoiceLines,
      total: shipping + deliveryFee,
    });
  }
  return plans;
}

/**
 * Issue N invoices: one Shipping Fee Invoice per arrived Pre-order in the window, due 14 days
 * from now, each texted to its Customer with its `/p/` link. The order waits at payment due.
 * A Pre-order owing GHS 0 gets no invoice and is Ready at once (texted its Pickup Code), unless
 * its Delivery Fee is still to be quoted.
 */
export async function issueInvoices(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  windowId: Id<"orderWindows">,
) {
  const window = await invoiceableWindow(ctx, windowId);
  const fee = window.shippingFeeConfirmed;
  if (fee === undefined) {
    refuse("FEE_NOT_CONFIRMED", `Confirm W${window.number}'s Shipping Fee first.`);
  }
  const now = Date.now();
  const staff = { kind: "staff" as const, staffId: actor._id };
  let issued = 0;
  let ready = 0;
  for (const plan of await planInvoices(ctx, windowId, fee)) {
    const { order } = plan;
    const customer = await ctx.db.get(order.customerId);
    if (plan.total === 0) {
      if (plan.quoteLater) {
        await ctx.db.patch(order._id, { status: "paymentDue" });
        continue;
      }
      await ctx.db.patch(order._id, { status: "ready", readyAt: now });
      await ctx.db.insert("orderEvents", { orderId: order._id, kind: "ready", actor: staff });
      ready++;
      if (customer && order.fulfilment.method === "pickup") {
        await queueSms(ctx, customer.phone, "readyForPickup", {
          reference: order.reference,
          pickupCode: order.pickupCode,
          location: await pickupLocation(ctx),
          ordersUrl: ordersUrl(),
        });
      }
      continue;
    }
    const code = await newInvoiceCode(ctx);
    await ctx.db.insert("invoices", {
      kind: "shippingFee",
      orderId: order._id,
      number: await nextReference(ctx, "INV"),
      code,
      lines: plan.lines,
      total: plan.total,
      status: "unpaid",
      clockStartedAt: now,
      issuedBy: actor._id,
    });
    await ctx.db.patch(order._id, { status: "paymentDue" });
    await ctx.db.insert("orderEvents", {
      orderId: order._id,
      kind: "invoiced",
      actor: staff,
      units: plan.units,
      amount: plan.total,
    });
    issued++;
    if (customer) {
      await queueSms(ctx, customer.phone, "shippingFeeInvoice", {
        reference: order.reference,
        units: plan.units,
        shipping: plan.shipping,
        ...(plan.deliveryFee > 0 ? { deliveryFee: plan.deliveryFee } : {}),
        total: plan.total,
        due: dayMonth(now + dueAfterMs),
        payUrl: payUrl(code),
      });
    }
  }
  await ctx.db.patch(windowId, { invoicesIssuedAt: now });
  return { issued, ready };
}

/** An invoice by its `/p/` code, or null. */
export async function findInvoiceByCode(ctx: Pick<QueryCtx, "db">, code: string) {
  return await ctx.db
    .query("invoices")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

/**
 * An invoice as its `/p/` page shows it: a paper invoice for the order's arrived lines, its
 * rows, AMOUNT DUE and due date, and a PAID or VOID stamp. Overdue is worked out by the page.
 */
export async function invoiceDocument(ctx: Pick<QueryCtx, "db">, invoice: Doc<"invoices">) {
  const order = await ctx.db.get(invoice.orderId);
  if (!order) return null;
  const customer = await ctx.db.get(order.customerId);
  const itemPayment = await ctx.db.get(order.paymentId);
  const payment = invoice.paymentId ? await ctx.db.get(invoice.paymentId) : null;
  const replacement = invoice.supersededById ? await ctx.db.get(invoice.supersededById) : null;
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  return {
    kind: invoice.kind,
    number: invoice.number,
    code: invoice.code,
    status: invoice.status,
    issuedAt: invoice._creationTime,
    clockStartedAt: invoice.clockStartedAt,
    dueAt: invoice.clockStartedAt + dueAfterMs,
    orderReference: order.reference,
    customerName: customer?.name,
    fulfilment: fulfilmentAsShown(order.fulfilment),
    pickupLocation: await pickupLocation(ctx),
    // A Pre-order's units are only ever cut by its arrival, so what didn't arrive is the rest.
    items: lines.map((line) => ({
      productName: line.productName,
      variantLabel: line.variantLabel,
      arrived: line.arrivedUnits ?? 0,
      missing: line.quantity - (line.arrivedUnits ?? 0),
    })),
    lines: invoice.lines,
    total: invoice.total,
    ...(itemPayment ? { itemReceiptNumber: itemPayment.receiptNumber } : {}),
    ...(payment
      ? {
          paid: {
            paidAt: payment.paidAt,
            receiptNumber: payment.receiptNumber,
            receiptCode: payment.receiptCode,
          },
        }
      : {}),
    ...(invoice.voidReason ? { voidReason: invoice.voidReason } : {}),
    ...(replacement ? { replacedByCode: replacement.code } : {}),
  };
}

/** An order's invoices, oldest first, as the order screens list them. */
export async function invoicesOnOrder(ctx: Pick<QueryCtx, "db">, orderId: Id<"orders">) {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return invoices.map((invoice) => ({
    invoiceId: invoice._id,
    kind: invoice.kind,
    number: invoice.number,
    code: invoice.code,
    status: invoice.status,
    total: invoice.total,
    dueAt: invoice.clockStartedAt + dueAfterMs,
    ...(invoice.paidAt !== undefined ? { paidAt: invoice.paidAt } : {}),
    ...(invoice.paymentId ? { paymentId: invoice.paymentId } : {}),
  }));
}

/** How far an arrived window's Shipping Fee Invoices are paid, for its Arrivals card. */
export async function invoiceProgress(ctx: Pick<QueryCtx, "db">, window: Doc<"orderWindows">) {
  const progress = {
    issued: window.invoicesIssuedAt !== undefined,
    count: 0,
    paid: 0,
    outstanding: 0,
  };
  if (!progress.issued) return progress;
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", window._id))
    .collect();
  for (const order of orders) {
    const invoice = await liveInvoice(ctx, order._id, "shippingFee");
    if (!invoice) continue;
    progress.count++;
    if (invoice.status === "paid") progress.paid++;
    else progress.outstanding += invoice.total;
  }
  return progress;
}
