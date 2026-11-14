import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { invoiceKind, invoiceLine, invoiceStatus } from "../schema";
import { newInvoiceCode, nextReference } from "./codes";
import {
  awaitsDeliveryQuote,
  fulfilmentAsShown,
  invoicedDeliveryFee,
  shownFulfilment,
} from "./fulfilment";
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
      const invoice = await windowInvoice(ctx, order._id);
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
 * The invoice an arrived Pre-order's window issued it, still in force: its Shipping Fee Invoice,
 * or a Delivery Fee Invoice when there was no Shipping Fee to charge.
 */
async function windowInvoice(ctx: Pick<QueryCtx, "db">, orderId: Id<"orders">) {
  return (
    (await liveInvoice(ctx, orderId, "shippingFee")) ??
    (await liveInvoice(ctx, orderId, "deliveryFee"))
  );
}

/**
 * What each of the window's arrived Pre-orders owes: its arrived units × the per-unit fee, plus
 * its frozen Delivery Fee when it's known. Earliest placed first, as the arrival filled them.
 */
async function planInvoices(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">, fee: number) {
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
    const deliveryFee = invoicedDeliveryFee(fulfilment);
    // With no Shipping Fee to charge, the Delivery Fee is billed on its own, so it's never
    // Forfeited.
    const kind: Doc<"invoices">["kind"] =
      shipping === 0 && deliveryFee > 0 ? "deliveryFee" : "shippingFee";
    const invoiceLines: Doc<"invoices">["lines"] =
      kind === "shippingFee"
        ? [{ kind: "shippingFee", units, unitFee: fee, amount: shipping }]
        : [];
    if (deliveryFee > 0 && fulfilment.method === "delivery") {
      invoiceLines.push({
        kind: "deliveryFee",
        zoneName: fulfilment.zoneName,
        amount: deliveryFee,
      });
    }
    plans.push({
      order,
      kind,
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
      kind: plan.kind,
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
    if (customer && plan.kind === "deliveryFee" && order.fulfilment.method === "delivery") {
      await queueSms(ctx, customer.phone, "deliveryFeeInvoice", {
        reference: order.reference,
        zoneName: order.fulfilment.zoneName,
        total: plan.total,
        due: dayMonth(now + dueAfterMs),
        payUrl: payUrl(code),
      });
    } else if (customer) {
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

/** Whether Staff can quote this order's Delivery Fee now: Elsewhere, unquoted, and still open. */
export function deliveryQuotable(order: Doc<"orders">) {
  return (
    awaitsDeliveryQuote(order.fulfilment) &&
    (order.status === "awaitingArrival" || order.status === "paymentDue")
  );
}

/**
 * Staff quote an Elsewhere in Ghana Delivery Fee. On a Pre-order whose Shipping Fee Invoice
 * isn't issued yet, the fee waits to go on it as a line. Otherwise it's billed on its own
 * Delivery Fee Invoice, due 14 days from now and texted with its `/p/` link; the order waits at
 * payment due until every invoice on it is paid. A Delivery Fee Invoice never leads to Forfeit.
 */
export async function quoteDeliveryFee(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  { orderId, fee }: { orderId: Id<"orders">; fee: number },
) {
  const order = await ctx.db.get(orderId);
  if (!order) refuse("NOT_FOUND", "That order doesn't exist.");
  const { fulfilment } = order;
  if (fulfilment.method !== "delivery" || fulfilment.deliveryFee !== undefined) {
    refuse("NOT_ELSEWHERE", `${order.reference}'s Delivery Fee was set at Checkout.`);
  }
  if (fulfilment.quotedFee !== undefined) {
    refuse(
      "ALREADY_QUOTED",
      `${order.reference}'s Delivery Fee is already quoted. Void & reissue its invoice to change it.`,
    );
  }
  if (!deliveryQuotable(order)) {
    refuse("NOT_QUOTABLE", `${order.reference} is no longer open, so its fee can't be quoted.`);
  }
  if (!Number.isSafeInteger(fee) || fee <= 0) {
    refuse("INVALID_FEE", "Enter the Delivery Fee in GH₵, to the pesewa.");
  }
  const staff = { kind: "staff" as const, staffId: actor._id };
  await ctx.db.patch(order._id, {
    fulfilment: { ...fulfilment, quotedFee: fee },
  });

  // Before its Shipping Fee Invoice: the fee rides on it as a line when it's issued.
  if (order.status === "awaitingArrival") {
    await ctx.db.insert("orderEvents", {
      orderId: order._id,
      kind: "deliveryQuoted",
      actor: staff,
      amount: fee,
    });
    return;
  }

  const now = Date.now();
  const code = await newInvoiceCode(ctx);
  await ctx.db.insert("invoices", {
    kind: "deliveryFee",
    orderId: order._id,
    number: await nextReference(ctx, "INV"),
    code,
    lines: [{ kind: "deliveryFee", zoneName: fulfilment.zoneName, amount: fee }],
    total: fee,
    status: "unpaid",
    clockStartedAt: now,
    issuedBy: actor._id,
  });
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "invoiced",
    actor: staff,
    amount: fee,
  });
  const customer = await ctx.db.get(order.customerId);
  if (customer) {
    await queueSms(ctx, customer.phone, "deliveryFeeInvoice", {
      reference: order.reference,
      zoneName: fulfilment.zoneName,
      total: fee,
      due: dayMonth(now + dueAfterMs),
      payUrl: payUrl(code),
    });
  }
}

/** The invoice still in force at the end of a void → replacement chain: itself if not replaced. */
export async function chainEnd(ctx: Pick<QueryCtx, "db">, invoice: Doc<"invoices">) {
  let current = invoice;
  while (current.supersededById) {
    const next = await ctx.db.get(current.supersededById);
    if (!next) break;
    current = next;
  }
  return current;
}

/** The earlier versions an invoice replaced, newest first: each voided, with its reason. */
export async function voidedVersions(ctx: Pick<QueryCtx, "db">, invoice: Doc<"invoices">) {
  const versions: Doc<"invoices">[] = [];
  let current = invoice;
  while (current.supersedesId) {
    const previous = await ctx.db.get(current.supersedesId);
    if (!previous) break;
    versions.push(previous);
    current = previous;
  }
  return versions;
}

/**
 * Void & reissue: replaces an unpaid invoice with a corrected one at `unitFee` (per arrived
 * unit) and `deliveryFee`, each defaulting to what the old invoice charged. The replacement has
 * its own number and `/p/` code but keeps the first issue date, so the due date, reminders and
 * Forfeit clock carry on. The old one is voided with the reason, and the Customer is texted the
 * new link.
 */
export async function voidAndReissue(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  {
    invoiceId,
    reason,
    unitFee,
    deliveryFee,
  }: {
    invoiceId: Id<"invoices">;
    reason: string;
    unitFee?: number;
    deliveryFee?: number;
  },
) {
  const voidReason = reason.trim();
  if (!voidReason) refuse("VOID_REASON_REQUIRED", "Say why the invoice is being voided.");
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) refuse("NOT_FOUND", "That invoice doesn't exist.");
  if (invoice.status !== "unpaid") {
    refuse(
      "NOT_UNPAID",
      invoice.status === "paid"
        ? `${invoice.number} is already paid, so it can't be voided.`
        : `${invoice.number} is already void. Open its replacement.`,
    );
  }
  const order = await ctx.db.get(invoice.orderId);
  if (!order) refuse("NOT_FOUND", "That invoice's order doesn't exist.");
  // A Seev checkout still open on it could be paid after the void, leaving a Refund to make.
  const sessions = await ctx.db
    .query("paymentSessions")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
    .collect();
  if (sessions.some((s) => s.settledAt === undefined && s.expiresAt > Date.now())) {
    refuse(
      "PAYMENT_IN_PROGRESS",
      "The Customer is paying this invoice on Seev now. Try again once that checkout ends.",
    );
  }
  if (
    invoice.kind === "shippingFee" &&
    deliveryFee !== undefined &&
    deliveryFee > 0 &&
    !invoice.lines.some((line) => line.kind === "deliveryFee") &&
    (await liveInvoice(ctx, order._id, "deliveryFee"))
  ) {
    refuse(
      "DELIVERY_FEE_INVOICED",
      `${order.reference}'s Delivery Fee is on its own invoice. Correct that one instead.`,
    );
  }
  if (deliveryFee !== undefined && deliveryFee > 0 && order.fulfilment.method !== "delivery") {
    refuse("NOT_DELIVERY", `${order.reference} is for Pickup, so it has no Delivery Fee.`);
  }
  for (const amount of [unitFee, deliveryFee]) {
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      refuse("INVALID_FEE", "Enter fees in GH₵, to the pesewa.");
    }
  }

  const lines: Doc<"invoices">["lines"] = [];
  for (const line of invoice.lines) {
    if (line.kind === "shippingFee") {
      const fee = unitFee ?? line.unitFee;
      lines.push({ ...line, unitFee: fee, amount: line.units * fee });
    } else {
      const amount = deliveryFee ?? line.amount;
      if (amount > 0) lines.push({ ...line, amount });
    }
  }
  const { fulfilment } = order;
  if (
    deliveryFee !== undefined &&
    deliveryFee > 0 &&
    !lines.some((line) => line.kind === "deliveryFee") &&
    fulfilment.method === "delivery"
  ) {
    lines.push({
      kind: "deliveryFee",
      zoneName: fulfilment.zoneName,
      amount: deliveryFee,
    });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  if (total === 0) {
    refuse("ZERO_TOTAL", "The corrected invoice comes to GH₵0. Nothing would be left to pay.");
  }

  const code = await newInvoiceCode(ctx);
  const replacementId = await ctx.db.insert("invoices", {
    kind: invoice.kind,
    orderId: order._id,
    number: await nextReference(ctx, "INV"),
    code,
    lines,
    total,
    status: "unpaid",
    clockStartedAt: invoice.clockStartedAt,
    issuedBy: actor._id,
    supersedesId: invoice._id,
  });
  await ctx.db.patch(invoice._id, {
    status: "void",
    voidReason,
    supersededById: replacementId,
  });
  // A corrected Elsewhere quote replaces the one on the order.
  const reissuedDelivery = lines.find((line) => line.kind === "deliveryFee");
  if (fulfilment.method === "delivery" && fulfilment.quotedFee !== undefined && reissuedDelivery) {
    await ctx.db.patch(order._id, {
      fulfilment: { ...fulfilment, quotedFee: reissuedDelivery.amount },
    });
  }
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "invoiceReissued",
    actor: { kind: "staff", staffId: actor._id },
    amount: total,
    note: voidReason,
  });
  const customer = await ctx.db.get(order.customerId);
  if (customer) {
    await queueSms(ctx, customer.phone, "invoiceReplaced", {
      reference: order.reference,
      total,
      due: dayMonth(invoice.clockStartedAt + dueAfterMs),
      payUrl: payUrl(code),
    });
  }
  return replacementId;
}

/** An invoice as its paper document shows it, for `/p/` and the Back Office invoice sheet. */
export const invoiceDocumentFields = {
  kind: invoiceKind,
  /** `INV-0001`. */
  number: v.string(),
  code: v.string(),
  status: invoiceStatus,
  issuedAt: v.number(),
  /** The first issue date; a reissue keeps it. */
  clockStartedAt: v.number(),
  /** 14 days after `clockStartedAt`. */
  dueAt: v.number(),
  orderReference: v.string(),
  customerName: v.optional(v.string()),
  fulfilment: shownFulfilment,
  pickupLocation: v.string(),
  /** The order's lines: units that arrived, and any that didn't (refunded separately). */
  items: v.array(
    v.object({
      productName: v.string(),
      variantLabel: v.string(),
      arrived: v.number(),
      missing: v.number(),
    }),
  ),
  lines: v.array(invoiceLine),
  /** Pesewas: the AMOUNT DUE. */
  total: v.number(),
  /** The Item Payment's Receipt, for the footer. */
  itemReceiptNumber: v.optional(v.string()),
  /** Set once paid: the PAID stamp and its Receipt. */
  paid: v.optional(
    v.object({ paidAt: v.number(), receiptNumber: v.string(), receiptCode: v.string() }),
  ),
  /** Set on a voided invoice. */
  voidReason: v.optional(v.string()),
};

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
  const replacement = invoice.supersededById ? await chainEnd(ctx, invoice) : null;
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
    // A Store Order's units are all in hand, less any cancelled or refunded.
    items: lines.map((line) => {
      const arrived =
        order.kind === "store"
          ? line.quantity - (line.refundedQuantity ?? 0)
          : (line.arrivedUnits ?? 0);
      return {
        productName: line.productName,
        variantLabel: line.variantLabel,
        arrived,
        missing: order.kind === "store" ? 0 : line.quantity - arrived,
      };
    }),
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
    const invoice = await windowInvoice(ctx, order._id);
    if (!invoice) continue;
    progress.count++;
    if (invoice.status === "paid") progress.paid++;
    else progress.outstanding += invoice.total;
  }
  return progress;
}

/** Unpaid this many days after first issue, a Shipping Fee Invoice can be Forfeited. */
export const forfeitAfterDays = 30;
/** The days after first issue that reminders go out on, while unpaid. */
export const reminderDays = [7, 13, 15, 28] as const;

/** Which day of its clock an invoice is on, in Ghana time (GMT): day 0 is the day of first issue. */
export function invoiceDay(clockStartedAt: number, now: number) {
  return Math.floor(now / DAY) - Math.floor(clockStartedAt / DAY);
}

/**
 * Where an invoice stands, worked out now and never stored: `due` until its due date, then
 * `overdue`, and `forfeitable` from day 30 for a Shipping Fee Invoice (a Delivery Fee Invoice
 * never leads to a Forfeit).
 */
export function invoiceState(
  invoice: Pick<Doc<"invoices">, "kind" | "status" | "clockStartedAt">,
  now: number,
) {
  if (invoice.status !== "unpaid") return invoice.status;
  const day = invoiceDay(invoice.clockStartedAt, now);
  if (invoice.kind === "shippingFee" && day >= forfeitAfterDays) return "forfeitable" as const;
  if (day > dueAfterMs / DAY) return "overdue" as const;
  return "due" as const;
}

export type InboxFilter = "overdue" | "eligible" | "unpaid" | "paid" | "void";

/** Whether an invoice in this state belongs under the filter. Overdue includes Forfeit-eligible. */
function inFilter(filter: InboxFilter, state: ReturnType<typeof invoiceState>) {
  switch (filter) {
    case "overdue":
      return state === "overdue" || state === "forfeitable";
    case "eligible":
      return state === "forfeitable";
    case "unpaid":
      return state === "due" || state === "overdue" || state === "forfeitable";
    default:
      return state === filter;
  }
}

const inboxFilters: InboxFilter[] = ["overdue", "eligible", "unpaid", "paid", "void"];

/**
 * The Invoices inbox across every window: a count and GH₵ total under each filter, and the
 * rows under `filter`. Unpaid ones oldest clock first, paid ones latest paid first, voided ones
 * latest first.
 */
export async function invoiceInbox(ctx: Pick<QueryCtx, "db">, filter: InboxFilter, now: number) {
  const counts = Object.fromEntries(
    inboxFilters.map((key) => [key, { count: 0, total: 0 }]),
  ) as Record<InboxFilter, { count: number; total: number }>;
  const matching: {
    invoice: Doc<"invoices">;
    state: ReturnType<typeof invoiceState>;
  }[] = [];
  for (const status of ["unpaid", "paid", "void"] as const) {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_clock", (q) => q.eq("status", status))
      .collect();
    for (const invoice of invoices) {
      const state = invoiceState(invoice, now);
      for (const key of inboxFilters) {
        if (!inFilter(key, state)) continue;
        counts[key].count++;
        counts[key].total += invoice.total;
      }
      if (inFilter(filter, state)) matching.push({ invoice, state });
    }
  }
  if (filter === "paid") {
    matching.sort((a, b) => (b.invoice.paidAt ?? 0) - (a.invoice.paidAt ?? 0));
  } else if (filter === "void") {
    matching.sort((a, b) => b.invoice._creationTime - a.invoice._creationTime);
  }

  const rows = [];
  for (const { invoice, state } of matching) {
    const order = await ctx.db.get(invoice.orderId);
    if (!order) continue;
    const customer = await ctx.db.get(order.customerId);
    const window = order.orderWindowId ? await ctx.db.get(order.orderWindowId) : null;
    const product = window ? await ctx.db.get(window.productId) : null;
    rows.push({
      invoiceId: invoice._id,
      kind: invoice.kind,
      number: invoice.number,
      orderReference: order.reference,
      customerName: customer?.name ?? customer?.phone ?? "",
      ...(window ? { windowNumber: window.number } : {}),
      ...(product ? { productName: product.name } : {}),
      total: invoice.total,
      state,
      day: invoiceDay(invoice.clockStartedAt, now),
      dueAt: invoice.clockStartedAt + dueAfterMs,
      ...(invoice.paidAt !== undefined ? { paidAt: invoice.paidAt } : {}),
    });
  }
  return { counts, rows };
}

/**
 * The Back Office invoice sheet, for the live end of `invoiceId`'s chain (so a reissued invoice
 * follows to its replacement): the paper invoice, where it stands now and its day count, the
 * reminder dots (days 7/13/15/28, then 30 for Forfeit), the payment, and the earlier voided
 * versions with their reasons.
 */
export async function invoiceSheet(
  ctx: Pick<QueryCtx, "db">,
  invoiceId: Id<"invoices">,
  now: number,
) {
  const first = await ctx.db.get(invoiceId);
  if (!first) refuse("NOT_FOUND", "That invoice doesn't exist.");
  const invoice = await chainEnd(ctx, first);
  const document = await invoiceDocument(ctx, invoice);
  const order = await ctx.db.get(invoice.orderId);
  if (!document || !order) refuse("NOT_FOUND", "That invoice's order doesn't exist.");
  const customer = await ctx.db.get(order.customerId);
  const window = order.orderWindowId ? await ctx.db.get(order.orderWindowId) : null;
  const product = window ? await ctx.db.get(window.productId) : null;
  const day = invoiceDay(invoice.clockStartedAt, now);
  // Once paid, the clock stopped: no more reminders, and no Forfeit.
  const clockDay =
    invoice.paidAt !== undefined ? invoiceDay(invoice.clockStartedAt, invoice.paidAt) : day;
  const versions = [];
  for (const version of await voidedVersions(ctx, invoice)) {
    const replacement = version.supersededById ? await ctx.db.get(version.supersededById) : null;
    versions.push({
      invoiceId: version._id,
      number: version.number,
      total: version.total,
      ...(version.voidReason ? { voidReason: version.voidReason } : {}),
      ...(replacement ? { voidedAt: replacement._creationTime } : {}),
    });
  }
  const { replacedByCode: _live, ...paper } = document;
  return {
    ...paper,
    invoiceId: invoice._id,
    orderId: order._id,
    ...(customer ? { phone: customer.phone } : {}),
    ...(window ? { windowNumber: window.number } : {}),
    ...(product ? { productName: product.name } : {}),
    state: invoiceState(invoice, now),
    day,
    reminders: [...reminderDays, forfeitAfterDays].map((d) => ({
      day: d,
      reached: clockDay >= d,
    })),
    voidedVersions: versions,
  };
}
