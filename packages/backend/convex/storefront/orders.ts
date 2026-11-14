import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCustomer } from "../lib/guards";
import { deliveryAsShown, shownDelivery } from "../model/fulfilment";
import {
  customerNeedsToAct,
  handOverable,
  isPastOrder,
  orderLinesWithPhotos,
  refundsOnOrder,
} from "../model/orders";
import { invoicesOnOrder } from "../model/invoices";
import { cancelPreorder as cancelOwnPreorder, selfCancellable } from "../model/refunds";
import { pickupLocation } from "../model/settings";
import {
  cancelReason,
  invoiceKind,
  orderEventKind,
  orderKind,
  orderStatus,
  refundKind,
  windowStage,
} from "../schema";

const card = v.object({
  orderId: v.id("orders"),
  /** `S-0001` for a Store Order, `P-0001` for a Pre-order. */
  reference: v.string(),
  kind: orderKind,
  status: orderStatus,
  /** The Customer has something to do: a Pickup Code to show, or an invoice to pay. */
  needsAction: v.boolean(),
  /** Collected, Delivered, Cancelled or Forfeited: shown under "Past orders". */
  past: v.boolean(),
  /**
   * Pre-orders only: "Cancel this Pre-order (full refund)" is offered, until the window reaches
   * "Ordered from supplier".
   */
  canCancel: v.boolean(),
  /** On a cancelled Pre-order: whether the Customer or Staff cancelled it. */
  cancelReason: v.optional(cancelReason),
  /**
   * The invoices waiting to be paid, oldest first, each opening `/p/<code>`: "Pay GH₵ X · due
   * <date>". A Pre-order can owe a Shipping Fee Invoice and a Delivery Fee Invoice at once.
   */
  invoices: v.array(
    v.object({ kind: invoiceKind, code: v.string(), total: v.number(), dueAt: v.number() }),
  ),
  /** Only while the order is Ready for pickup; never once it's handed over. */
  pickupCode: v.optional(v.string()),
  lines: v.array(
    v.object({
      productName: v.string(),
      variantLabel: v.string(),
      /** Units paid for. */
      quantity: v.number(),
      unitPrice: v.number(),
      /** Of those, units cancelled or refunded. */
      refundedQuantity: v.number(),
      /** The Variant's photo, else the Product's cover; missing when it has none. */
      imageUrl: v.optional(v.string()),
    }),
  ),
  /** The payment this order was paid with, and its Receipt (`/r/<receiptCode>`). */
  payment: v.object({
    amount: v.number(),
    paidAt: v.number(),
    receiptNumber: v.string(),
    receiptCode: v.string(),
  }),
  /** Pickup with the pickup point, or Delivery to the address frozen at Checkout. */
  fulfilment: v.union(
    v.object({ method: v.literal("pickup"), location: v.string() }),
    shownDelivery,
  ),
  /** From `orderEvents`, oldest first. Who acted stays in the Back Office. */
  history: v.array(v.object({ kind: orderEventKind, at: v.number() })),
  /** Pre-orders only: the Order Window's stage and its timeline, oldest stage first. */
  window: v.optional(
    v.object({
      number: v.number(),
      stage: windowStage,
      /** From `windowStageEvents`. Who acted stays in the Back Office. */
      timeline: v.array(
        v.object({
          stage: windowStage,
          at: v.number(),
          expectedFrom: v.optional(v.number()),
          expectedTo: v.optional(v.number()),
          note: v.optional(v.string()),
        }),
      ),
    }),
  ),
  /** Money owed back on this order: "Refund pending" until Staff send it, then "Refunded". */
  refunds: v.array(v.object({ amount: v.number(), reason: refundKind, refunded: v.boolean() })),
});

/** My orders: the signed-in Customer's orders as feed cards, never anyone else's. */
export const mine = query({
  args: {},
  returns: v.array(card),
  handler: async (ctx) => {
    const customer = await requireCustomer(ctx);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();
    const location = await pickupLocation(ctx);
    const cards = [];
    for (const order of orders) {
      const payment = await ctx.db.get(order.paymentId);
      if (!payment) continue;
      const window = order.orderWindowId ? await ctx.db.get(order.orderWindowId) : null;
      const unpaid = (await invoicesOnOrder(ctx, order._id)).filter((i) => i.status === "unpaid");
      cards.push({
        orderId: order._id,
        reference: order.reference,
        kind: order.kind,
        status: order.status,
        needsAction: customerNeedsToAct(order) || unpaid.length > 0,
        past: isPastOrder(order),
        canCancel: await selfCancellable(ctx, order),
        ...(order.cancelReason ? { cancelReason: order.cancelReason } : {}),
        invoices: unpaid.map(({ kind, code, total, dueAt }) => ({ kind, code, total, dueAt })),
        ...(handOverable(order) ? { pickupCode: order.pickupCode } : {}),
        lines: await orderLinesWithPhotos(ctx, order._id),
        payment: {
          amount: payment.amount,
          paidAt: payment.paidAt,
          receiptNumber: payment.receiptNumber,
          receiptCode: payment.receiptCode,
        },
        fulfilment:
          order.fulfilment.method === "pickup"
            ? { method: "pickup" as const, location }
            : deliveryAsShown(order.fulfilment),
        history: (
          await ctx.db
            .query("orderEvents")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect()
        ).map((event) => ({ kind: event.kind, at: event._creationTime })),
        ...(window
          ? {
              window: {
                number: window.number,
                stage: window.stage,
                timeline: (
                  await ctx.db
                    .query("windowStageEvents")
                    .withIndex("by_window", (q) => q.eq("orderWindowId", window._id))
                    .collect()
                ).map((event) => ({
                  stage: event.stage,
                  at: event._creationTime,
                  ...(event.expectedFrom !== undefined ? { expectedFrom: event.expectedFrom } : {}),
                  ...(event.expectedTo !== undefined ? { expectedTo: event.expectedTo } : {}),
                  ...(event.note !== undefined ? { note: event.note } : {}),
                })),
              },
            }
          : {}),
        refunds: (await refundsOnOrder(ctx, order)).map((refund) => ({
          amount: refund.amount,
          reason: refund.kind,
          refunded: refund.status === "refunded",
        })),
      });
    }
    // Newest first (the index reads oldest first), then a stable sort by what needs the Customer.
    const rank = (c: { needsAction: boolean; past: boolean }) => (c.needsAction ? 0 : c.past ? 2 : 1);
    return cards.reverse().sort((a, b) => rank(a) - rank(b));
  },
});

/**
 * Cancel this Pre-order (full refund): free and immediate until its window reaches "Ordered from
 * supplier", and only the Customer's own. The Item Payment shows as "Refund pending" until the
 * Owner pays it out.
 */
export const cancelPreorder = mutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const customer = await requireCustomer(ctx);
    await cancelOwnPreorder(ctx, { kind: "customer", customer }, { orderId });
    return null;
  },
});
