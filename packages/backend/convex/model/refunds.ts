import { ConvexError, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { refundKind, refundLine, refundMethod } from "../schema";
import { recordMovement } from "./stock";

export type RefundKind = Infer<typeof refundKind>;
export type RefundMethod = Infer<typeof refundMethod>;
export type RefundLine = Infer<typeof refundLine>;

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** Trimmed, and missing when blank. */
function cleanNote(note: string | undefined) {
  return note?.trim() || undefined;
}

/** Units of an order line still the Customer's: paid for, less any cancelled or refunded. */
export function keptUnits(line: Doc<"orderLines">) {
  return line.quantity - (line.refundedQuantity ?? 0);
}

/**
 * Checks the units asked for against the order's lines and marks them refunded on each line,
 * returning the lines with their units and the pesewas they come to.
 */
async function takeUnits(
  ctx: Pick<MutationCtx, "db">,
  order: Doc<"orders">,
  asked: RefundLine[],
) {
  if (new Set(asked.map((line) => line.orderLineId)).size !== asked.length) {
    refuse("DUPLICATE_LINE", "List each line once.");
  }
  const taken = [];
  for (const { orderLineId, quantity } of asked) {
    const line = await ctx.db.get(orderLineId);
    if (!line || line.orderId !== order._id) {
      refuse("NOT_FOUND", `That line isn't on ${order.reference}.`);
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      refuse("INVALID_QUANTITY", "Enter a whole number of units, more than 0.");
    }
    if (quantity > keptUnits(line)) {
      refuse(
        "TOO_MANY_UNITS",
        `Only ${keptUnits(line)} of ${line.productName} ${line.variantLabel} are left on ${order.reference}.`,
      );
    }
    taken.push({ line, quantity });
  }
  for (const { line, quantity } of taken) {
    await ctx.db.patch(line._id, { refundedQuantity: (line.refundedQuantity ?? 0) + quantity });
  }
  return {
    lines: taken.map(({ line, quantity }) => ({ orderLineId: line._id, quantity })),
    units: taken.reduce((sum, { quantity }) => sum + quantity, 0),
    amount: taken.reduce((sum, { line, quantity }) => sum + quantity * line.unitPrice, 0),
    picked: taken,
  };
}

/**
 * Pesewas of the order's Delivery Fee that were paid and not yet flagged for refund. A Store
 * Order's fee is paid at Checkout once known; an Elsewhere fee still to quote has none.
 */
export async function refundableDeliveryFee(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">) {
  // A Pre-order's Delivery Fee is billed on its Shipping Fee Invoice, so none is paid yet.
  if (order.kind === "preorder" || order.fulfilment.method !== "delivery") return 0;
  const paid = order.fulfilment.deliveryFee ?? 0;
  const refunds = await ctx.db
    .query("refunds")
    .withIndex("by_payment", (q) => q.eq("paymentId", order.paymentId))
    .collect();
  const flagged = refunds
    .filter((refund) => refund.orderId === order._id)
    .reduce((sum, refund) => sum + (refund.deliveryFee ?? 0), 0);
  return Math.max(0, paid - flagged);
}

/** Whether every unit on the order has been cancelled or refunded. */
async function nothingKept(ctx: Pick<QueryCtx, "db">, orderId: Id<"orders">) {
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return lines.every((line) => keptUnits(line) === 0);
}

/** Statuses where the goods are still with us, so Staff may cancel units. */
const cancellableStatuses: readonly Doc<"orders">["status"][] = ["paymentDue", "ready"];

/** Whether Staff can cancel units on it: its goods are still with us, not handed over or out. */
export function cancellable(order: Doc<"orders">) {
  return cancellableStatuses.includes(order.status);
}

/**
 * Staff cancel units on a Store Order before handover. Returned to Stock (the default) they're a
 * `cancelled` Stock Movement each; either way their price is flagged as a Refund for the Owner.
 * Cancelling the last units cancels the order, and its paid Delivery Fee goes back too.
 */
export async function cancelUnits(
  ctx: Pick<MutationCtx, "db">,
  actor: Doc<"staff">,
  {
    orderId,
    lines,
    returnToStock = true,
    note,
  }: { orderId: Id<"orders">; lines: RefundLine[]; returnToStock?: boolean; note?: string },
) {
  const order = await ctx.db.get(orderId);
  if (!order) refuse("NOT_FOUND", "That order doesn't exist.");
  if (!cancellable(order)) {
    refuse(
      "NOT_CANCELLABLE",
      `${order.reference} has left the shop, so its units can't be cancelled. An Owner can refund it once it's handed over.`,
    );
  }
  if (lines.length === 0) refuse("NOTHING_TO_CANCEL", "Pick the units to cancel.");
  const taken = await takeUnits(ctx, order, lines);
  if (returnToStock) {
    for (const { line, quantity } of taken.picked) {
      await recordMovement(ctx, {
        variantId: line.variantId,
        kind: "cancelled",
        quantity,
        staffId: actor._id,
        orderId: order._id,
      });
    }
  }
  const reason = cleanNote(note);
  const wholeOrder = await nothingKept(ctx, order._id);
  const deliveryFee = wholeOrder ? await refundableDeliveryFee(ctx, order) : 0;
  await ctx.db.insert("refunds", {
    paymentId: order.paymentId,
    orderId: order._id,
    kind: "cancelledLine",
    amount: taken.amount + deliveryFee,
    ...(deliveryFee > 0 ? { deliveryFee } : {}),
    status: "toRefund",
    returnToStock,
    lines: taken.lines,
    flaggedBy: actor._id,
    ...(reason ? { note: reason } : {}),
  });
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "unitsCancelled",
    actor: { kind: "staff", staffId: actor._id },
    units: taken.units,
    amount: taken.amount + deliveryFee,
    ...(reason ? { note: reason } : {}),
  });
  if (wholeOrder) {
    await ctx.db.patch(order._id, { status: "cancelled" });
    await ctx.db.insert("orderEvents", {
      orderId: order._id,
      kind: "cancelled",
      actor: { kind: "staff", staffId: actor._id },
    });
  }
}

/** Statuses where the Customer has the goods. */
const handedOverStatuses: readonly Doc<"orders">["status"][] = ["collected", "delivered"];

/** Whether the Customer has the goods, so only an Owner's refund after handover applies. */
export function handedOver(order: Doc<"orders">) {
  return handedOverStatuses.includes(order.status);
}

/**
 * The Owner refunds a handed-over order: units, its paid Delivery Fee, or both, always with a
 * reason. Goods that came back can go into Stock as `returned` movements; the order's status
 * stays as it is. The Refund then waits on Refunds to make like any other.
 */
export async function refundAfterHandover(
  ctx: Pick<MutationCtx, "db">,
  owner: Doc<"staff">,
  {
    orderId,
    lines,
    deliveryFee: withDeliveryFee = false,
    returnToStock = false,
    note,
  }: {
    orderId: Id<"orders">;
    lines: RefundLine[];
    deliveryFee?: boolean;
    returnToStock?: boolean;
    note: string;
  },
) {
  const order = await ctx.db.get(orderId);
  if (!order) refuse("NOT_FOUND", "That order doesn't exist.");
  if (!handedOver(order)) {
    refuse(
      "NOT_HANDED_OVER",
      `${order.reference} hasn't been handed over yet. Cancel its units instead.`,
    );
  }
  const reason = cleanNote(note);
  if (!reason) refuse("REASON_REQUIRED", "Say why you're refunding.");
  const deliveryFee = withDeliveryFee ? await refundableDeliveryFee(ctx, order) : 0;
  const taken = await takeUnits(ctx, order, lines);
  const amount = taken.amount + deliveryFee;
  if (amount === 0) refuse("NOTHING_TO_REFUND", "Pick units or a fee to refund.");
  if (returnToStock) {
    for (const { line, quantity } of taken.picked) {
      await recordMovement(ctx, {
        variantId: line.variantId,
        kind: "returned",
        quantity,
        staffId: owner._id,
        orderId: order._id,
        note: reason,
      });
    }
  }
  await ctx.db.insert("refunds", {
    paymentId: order.paymentId,
    orderId: order._id,
    kind: "afterHandover",
    amount,
    status: "toRefund",
    // A fee-only refund puts nothing back, whatever was ticked.
    returnToStock: returnToStock && taken.units > 0,
    lines: taken.lines,
    ...(deliveryFee > 0 ? { deliveryFee } : {}),
    flaggedBy: owner._id,
    note: reason,
  });
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "refundFlagged",
    actor: { kind: "staff", staffId: owner._id },
    units: taken.units,
    amount,
    note: reason,
  });
}

/** Every Refund still to pay out, oldest first, with who it's for and the total owed. */
export async function refundsToMake(ctx: Pick<QueryCtx, "db">) {
  const refunds = await ctx.db
    .query("refunds")
    .withIndex("by_status", (q) => q.eq("status", "toRefund"))
    .collect();
  const rows = [];
  for (const refund of refunds) {
    const payment = await ctx.db.get(refund.paymentId);
    const customer = payment && (await ctx.db.get(payment.customerId));
    const order = refund.orderId && (await ctx.db.get(refund.orderId));
    rows.push({
      refundId: refund._id,
      kind: refund.kind,
      amount: refund.amount,
      flaggedAt: refund._creationTime,
      returnToStock: refund.returnToStock ?? false,
      ...(refund.note ? { note: refund.note } : {}),
      ...(order ? { orderId: order._id, orderReference: order.reference } : {}),
      ...(customer?.name ? { customerName: customer.name } : {}),
      phone: customer?.phone ?? "",
      receiptNumber: payment?.receiptNumber ?? "",
      seevReference: payment?.seevReference ?? "",
    });
  }
  return { total: rows.reduce((sum, row) => sum + row.amount, 0), refunds: rows };
}

/**
 * The Owner has sent a Refund's money back by hand (Seev has no refunds API, ADR 0004): it's
 * marked refunded with how it was paid, when and by whom. A payout by "Other" needs a note.
 */
export async function markRefunded(
  ctx: Pick<MutationCtx, "db">,
  owner: Doc<"staff">,
  { refundId, method, note }: { refundId: Id<"refunds">; method: RefundMethod; note?: string },
) {
  const refund = await ctx.db.get(refundId);
  if (!refund) refuse("NOT_FOUND", "That refund doesn't exist.");
  if (refund.status === "refunded") {
    refuse("ALREADY_REFUNDED", "That refund has already been marked refunded.");
  }
  const refundNote = cleanNote(note);
  if (method === "other" && !refundNote) {
    refuse("NOTE_REQUIRED", "Say how you sent the money back.");
  }
  await ctx.db.patch(refund._id, {
    status: "refunded",
    refundedAt: Date.now(),
    refundedBy: owner._id,
    method,
    ...(refundNote ? { refundNote } : {}),
  });
  if (refund.orderId) {
    await ctx.db.insert("orderEvents", {
      orderId: refund.orderId,
      kind: "refunded",
      actor: { kind: "staff", staffId: owner._id },
      amount: refund.amount,
      ...(refundNote ? { note: refundNote } : {}),
    });
  }
}
