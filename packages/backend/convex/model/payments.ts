import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { convertHolds } from "./checkout";
import { newPickupCode, newReceiptCode, nextReference } from "./codes";
import { queueSms } from "./sms";
import { recordMovement, stockCounts } from "./stock";

/** The public link to a Receipt. */
export function receiptUrl(code: string) {
  return `${process.env.SITE_URL}/r/${code}`;
}

/**
 * Settles a payment Seev has verified, once per reference however often it's reported.
 * It always writes the `payments` row, so no charge goes unrecorded, then:
 * - Paid while the Checkout still holds its Stock: every held unit is Sold to a Store Order.
 * - Paid late (the Checkout expired or was released): Stock fills what it can, earliest
 *   line first, and the rest is a `latePaid` Refund.
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
  const checkout = await ctx.db.get(session.checkoutId);
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
      note: unmatched,
    });
    await queueSms(ctx, customer.phone, "paymentUnmatched", { amount, receiptUrl: url });
    return;
  }

  const held = checkout.status === "pending" ? await convertHolds(ctx, checkout._id) : [];
  const filled = [];
  let toRefund = 0;
  for (const line of checkout.lines) {
    const variant = await ctx.db.get(line.variantId);
    const { onHand, available } = variant ? stockCounts(variant) : { onHand: 0, available: 0 };
    const isHeld = held.some((hold) => hold.variantId === line.variantId);
    // Held units only need to be on hand; anything else must also be free of others' holds.
    const coverable = Math.max(0, isHeld ? onHand : available);
    const quantity = Math.min(line.quantity, coverable);
    if (quantity > 0) filled.push({ ...line, quantity });
    toRefund += (line.quantity - quantity) * line.unitPrice;
  }

  let order: { orderId: Id<"orders">; reference: string; pickupCode: string } | null = null;
  if (filled.length > 0) {
    order = await createStoreOrder(ctx, checkout, paymentId, filled, now);
  }
  if (toRefund > 0) {
    await ctx.db.insert("refunds", {
      paymentId,
      ...(order ? { orderId: order.orderId } : {}),
      kind: "latePaid",
      amount: toRefund,
      status: "toRefund",
    });
  }
  await ctx.db.patch(checkout._id, { status: "paid" });

  if (order) {
    await queueSms(ctx, customer.phone, "paymentConfirmed", {
      amount,
      reference: order.reference,
      pickupCode: order.pickupCode,
      receiptUrl: url,
      ...(toRefund > 0 ? { refund: toRefund } : {}),
    });
  } else {
    await queueSms(ctx, customer.phone, "paymentNotFilled", { amount, receiptUrl: url });
  }
}

/** A ready Store Order for the filled lines, its units Sold out of Stock. */
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
    status: "ready",
    readyAt: now,
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
