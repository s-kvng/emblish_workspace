import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { convertHolds, deliveryFeesToday, preorderGroups, storeLines } from "./checkout";
import { newPickupCode, newReceiptCode, nextReference } from "./codes";
import { awaitsDeliveryQuote } from "./fulfilment";
import { pickupLocation } from "./settings";
import { queueSms } from "./sms";
import { recordMovement, stockCounts } from "./stock";
import { windowRowFor } from "./windowLookups";

/** The public link to a Receipt. */
export function receiptUrl(code: string) {
  return `${process.env.SITE_URL}/r/${code}`;
}

/** Window stages from which the supplier order is placed, so a late Pre-order can't join it. */
const supplierOrdered: readonly Doc<"orderWindows">["stage"][] = [
  "orderedFromSupplier",
  "inTransit",
  "arrived",
];

/**
 * Settles a payment Seev has verified, once per reference however often it's reported.
 * It always writes the `payments` row, so no charge goes unrecorded, then splits the Checkout
 * into at most one Store Order plus one Pre-order per Order Window:
 * - In-stock lines, paid while the Checkout still holds their Stock: every held unit is Sold
 *   to the Store Order. Paid late (the Checkout expired or was released): Stock fills what it
 *   can, earliest line first, and the rest is a `latePaid` Refund.
 * - Pre-order lines, per window: a Pre-order awaiting arrival. Paid late, it's placed even
 *   past the cap, unless the window has reached "Ordered from supplier": then its whole
 *   Item Payment share is a `latePaid` Refund. Paid on time, its held places are kept.
 * - A second charge on an already-paid Checkout, or an amount that doesn't match it, makes
 *   no order: all of it is a Refund for an Owner to look at.
 * Then one SMS goes out for the charge.
 */
export async function settlePayment(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  { reference, amount }: { reference: string; amount: number },
): Promise<void> {
  const session = await ctx.db
    .query("paymentSessions")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .unique();
  if (!session || session.settledAt !== undefined) return;
  if (session.invoiceId) {
    await settleInvoicePayment(ctx, session, session.invoiceId, { reference, amount });
    return;
  }
  const checkout = session.checkoutId && (await ctx.db.get(session.checkoutId));
  const customer = checkout && (await ctx.db.get(checkout.customerId));
  if (!checkout || !customer) return;

  const now = Date.now();
  await ctx.db.patch(session._id, { settledAt: now });
  const receiptCode = await newReceiptCode(ctx);
  const paymentId = await ctx.db.insert("payments", {
    seevReference: reference,
    amount,
    paidAt: now,
    customerId: customer._id,
    checkoutId: checkout._id,
    receiptNumber: await nextReference(ctx, "R"),
    receiptCode,
  });

  const url = receiptUrl(receiptCode);
  // Seev prices the session from our lines, so a different amount means something is wrong.
  const unmatched =
    checkout.status === "paid"
      ? "A second payment for a Checkout that was already paid."
      : amount !== checkout.total
        ? `Seev confirmed ${amount} pesewas, but the Checkout totals ${checkout.total}.`
        : null;
  if (unmatched) {
    console.error(`${reference}: ${unmatched}`);
    await ctx.db.insert("refunds", {
      paymentId,
      kind: "discretionary",
      amount,
      status: "toRefund",
      returnToStock: false,
      note: unmatched,
    });
    await queueSms(ctx, customer.phone, "paymentUnmatched", { amount, receiptUrl: url });
    return;
  }

  const onTime = checkout.status === "pending";
  const held = onTime ? await convertHolds(ctx, checkout._id) : [];
  const order = await settleStoreLines(ctx, checkout, paymentId, held, now);
  let toRefund = order.toRefund;
  const preorders: string[] = [];
  for (const group of preorderGroups(checkout.lines)) {
    const window = await ctx.db.get(group.orderWindowId);
    const share = group.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    if (!window || (!onTime && supplierOrdered.includes(window.stage))) {
      toRefund += share;
      await ctx.db.insert("refunds", {
        paymentId,
        kind: "latePaid",
        amount: share,
        status: "toRefund",
        returnToStock: false,
        note: window
          ? `Paid after W${window.number} of ${group.lines[0]?.productName} was ordered from the supplier.`
          : "Paid for an Order Window that no longer exists.",
      });
      continue;
    }
    preorders.push(await createPreorder(ctx, checkout, paymentId, group, share, now));
  }
  await ctx.db.patch(checkout._id, { status: "paid" });

  const extras = {
    ...(toRefund > 0 ? { refund: toRefund } : {}),
    ...(preorders.length > 0 ? { preorders } : {}),
  };
  const { fulfilment } = checkout;
  const store = order.created;
  if (store && fulfilment.method === "delivery") {
    await queueSms(
      ctx,
      customer.phone,
      awaitsDeliveryQuote(fulfilment)
        ? "paymentConfirmedQuoteDelivery"
        : "paymentConfirmedDelivery",
      {
        amount,
        reference: store.reference,
        zoneName: fulfilment.zoneName,
        receiptUrl: url,
        ...extras,
      },
    );
  } else if (store) {
    await queueSms(ctx, customer.phone, "paymentConfirmed", {
      amount,
      reference: store.reference,
      pickupCode: store.pickupCode,
      receiptUrl: url,
      ...extras,
    });
  } else if (preorders.length > 0) {
    await queueSms(ctx, customer.phone, "paymentConfirmedPreorder", {
      amount,
      references: preorders,
      receiptUrl: url,
      ...(toRefund > 0 ? { refund: toRefund } : {}),
    });
  } else {
    await queueSms(ctx, customer.phone, "paymentNotFilled", { amount, receiptUrl: url });
  }
}

/**
 * Settles a verified payment of an invoice paid at `/p/`. It always writes the `payments` row
 * (its Receipt). A full payment of an unpaid invoice marks it paid and makes the order Ready
 * (unless its Delivery Fee is still to be quoted), and the payment SMS carries the Pickup Code
 * when it's for Pickup. A payment of an invoice that's no longer unpaid, or of a different
 * amount, is all a Refund for an Owner to look at.
 */
async function settleInvoicePayment(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  session: Doc<"paymentSessions">,
  invoiceId: Id<"invoices">,
  { reference, amount }: { reference: string; amount: number },
) {
  const invoice = await ctx.db.get(invoiceId);
  const order = invoice && (await ctx.db.get(invoice.orderId));
  const customer = order && (await ctx.db.get(order.customerId));
  if (!invoice || !order || !customer) return;

  const now = Date.now();
  await ctx.db.patch(session._id, { settledAt: now });
  const receiptCode = await newReceiptCode(ctx);
  const paymentId = await ctx.db.insert("payments", {
    seevReference: reference,
    amount,
    paidAt: now,
    customerId: customer._id,
    invoiceId,
    receiptNumber: await nextReference(ctx, "R"),
    receiptCode,
  });
  const url = receiptUrl(receiptCode);

  const unmatched =
    invoice.status !== "unpaid"
      ? `A payment for ${invoice.number}, which is already ${invoice.status}.`
      : amount !== invoice.total
        ? `Seev confirmed ${amount} pesewas, but ${invoice.number} totals ${invoice.total}.`
        : null;
  if (unmatched) {
    console.error(`${reference}: ${unmatched}`);
    await ctx.db.insert("refunds", {
      paymentId,
      orderId: order._id,
      kind: "discretionary",
      amount,
      status: "toRefund",
      returnToStock: false,
      note: unmatched,
    });
    await queueSms(ctx, customer.phone, "paymentUnmatched", { amount, receiptUrl: url });
    return;
  }

  await ctx.db.patch(invoice._id, { status: "paid", paymentId, paidAt: now });
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "invoicePaid",
    actor: { kind: "system" },
    amount,
  });
  const ready = order.status === "paymentDue" && !awaitsDeliveryQuote(order.fulfilment);
  if (ready) {
    await ctx.db.patch(order._id, { status: "ready", readyAt: now });
    await ctx.db.insert("orderEvents", { orderId: order._id, kind: "ready", actor: { kind: "system" } });
  }
  await queueSms(ctx, customer.phone, "invoicePaid", {
    amount,
    reference: order.reference,
    receiptUrl: url,
    ...(ready && order.fulfilment.method === "pickup"
      ? { pickup: { code: order.pickupCode, location: await pickupLocation(ctx) } }
      : {}),
    ...(ready && order.fulfilment.method === "delivery" ? { delivering: true } : {}),
  });
}

/**
 * The Checkout's In-stock lines become its Store Order, filled from the Stock its holds kept
 * (or, paid late, from whatever is still free), with a `latePaid` Refund for the rest.
 */
async function settleStoreLines(
  ctx: Pick<MutationCtx, "db">,
  checkout: Doc<"checkouts">,
  paymentId: Id<"payments">,
  held: Doc<"checkoutHolds">[],
  now: number,
) {
  const lines = storeLines(checkout.lines);
  const filled = [];
  let toRefund = 0;
  for (const line of lines) {
    const variant = await ctx.db.get(line.variantId);
    const { onHand, available } = variant ? stockCounts(variant) : { onHand: 0, available: 0 };
    const isHeld = held.some((hold) => hold.kind === "stock" && hold.variantId === line.variantId);
    // Held units only need to be on hand; anything else must also be free of others' holds.
    const coverable = Math.max(0, isHeld ? onHand : available);
    const quantity = Math.min(line.quantity, coverable);
    if (quantity > 0) filled.push({ ...line, quantity });
    toRefund += (line.quantity - quantity) * line.unitPrice;
  }

  const created =
    filled.length > 0 ? await createStoreOrder(ctx, checkout, paymentId, filled, now) : null;
  // With nothing filled there's nothing to deliver, so its Delivery Fee goes back too.
  if (lines.length > 0 && !created) toRefund += deliveryFeesToday(checkout);
  if (toRefund > 0) {
    await ctx.db.insert("refunds", {
      paymentId,
      ...(created ? { orderId: created.orderId } : {}),
      kind: "latePaid",
      amount: toRefund,
      status: "toRefund",
      returnToStock: false,
    });
  }
  return { created, toRefund };
}

/**
 * A Pre-order for one window's lines, at the prices frozen at Pay, awaiting arrival. Its units
 * count as Pre-ordered in the window (past the cap, if paid late). Its Delivery Fee, if any,
 * comes on its Shipping Fee Invoice.
 */
async function createPreorder(
  ctx: Pick<MutationCtx, "db">,
  checkout: Doc<"checkouts">,
  paymentId: Id<"payments">,
  group: {
    orderWindowId: Id<"orderWindows">;
    lines: Doc<"checkouts">["lines"];
  },
  itemPayment: number,
  now: number,
) {
  const reference = await nextReference(ctx, "P");
  const orderId = await ctx.db.insert("orders", {
    kind: "preorder",
    reference,
    orderWindowId: group.orderWindowId,
    itemPayment,
    customerId: checkout.customerId,
    checkoutId: checkout._id,
    paymentId,
    placedAt: now,
    fulfilment: checkout.fulfilment,
    pickupCode: await newPickupCode(ctx),
    status: "awaitingArrival",
  });
  await ctx.db.insert("orderEvents", {
    orderId,
    kind: "paid",
    actor: { kind: "system" },
  });
  for (const line of group.lines) {
    await ctx.db.insert("orderLines", {
      orderId,
      variantId: line.variantId,
      productName: line.productName,
      variantLabel: line.variantLabel,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    });
    const row = await windowRowFor(ctx, group.orderWindowId, line.variantId);
    if (row)
      await ctx.db.patch(row._id, {
        preordered: row.preordered + line.quantity,
      });
  }
  return reference;
}

/**
 * A Store Order for the filled lines, its units Sold out of Stock. It's ready at once, unless
 * its Delivery Fee is still to be quoted (Elsewhere in Ghana): then it waits at payment due.
 */
async function createStoreOrder(
  ctx: Pick<MutationCtx, "db">,
  checkout: Doc<"checkouts">,
  paymentId: Id<"payments">,
  lines: Doc<"checkouts">["lines"],
  now: number,
) {
  const reference = await nextReference(ctx, "S");
  const pickupCode = await newPickupCode(ctx);
  const orderId = await ctx.db.insert("orders", {
    kind: "store",
    reference,
    customerId: checkout.customerId,
    checkoutId: checkout._id,
    paymentId,
    placedAt: now,
    fulfilment: checkout.fulfilment,
    pickupCode,
    ...(awaitsDeliveryQuote(checkout.fulfilment)
      ? { status: "paymentDue" as const }
      : { status: "ready" as const, readyAt: now }),
  });
  await ctx.db.insert("orderEvents", { orderId, kind: "paid", actor: { kind: "system" } });
  for (const line of lines) {
    await ctx.db.insert("orderLines", {
      orderId,
      variantId: line.variantId,
      productName: line.productName,
      variantLabel: line.variantLabel,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    });
    await recordMovement(ctx, {
      variantId: line.variantId,
      kind: "sold",
      quantity: -line.quantity,
      orderId,
    });
  }
  return { orderId, reference, pickupCode };
}
