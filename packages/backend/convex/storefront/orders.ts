import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCustomer } from "../lib/guards";
import { deliveryAsShown, shownDelivery } from "../model/fulfilment";
import {
  customerNeedsToAct,
  handOverable,
  isPastOrder,
  orderLinesWithPhotos,
  refundsOnOrder,
} from "../model/orders";
import { pickupLocation } from "../model/settings";
import { orderEventKind, orderStatus, refundKind } from "../schema";

const card = v.object({
  orderId: v.id("orders"),
  /** `S-0001`. */
  reference: v.string(),
  kind: v.literal("store"),
  status: orderStatus,
  /** The Customer has something to do: a Pickup Code to show (an invoice to pay, later). */
  needsAction: v.boolean(),
  /** Collected, Delivered, Cancelled or Forfeited: shown under "Past orders". */
  past: v.boolean(),
  /** Only while the order is Ready for pickup; never once it's handed over. */
  pickupCode: v.optional(v.string()),
  lines: v.array(
    v.object({
      productName: v.string(),
      variantLabel: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
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
      cards.push({
        orderId: order._id,
        reference: order.reference,
        kind: order.kind,
        status: order.status,
        needsAction: customerNeedsToAct(order),
        past: isPastOrder(order),
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
