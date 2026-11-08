import { v } from "convex/values";

import { query } from "../_generated/server";
import { pickupLocation } from "../model/settings";
import { orderStatus } from "../schema";

/**
 * A Receipt by its `/r/` code: public to whoever holds the link, like the SMS that carries
 * it, so it opens without sign-in (ADR 0001's public-by-code check). Null for an unknown code.
 */
export const get = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      receiptNumber: v.string(),
      paidAt: v.number(),
      phone: v.string(),
      customerName: v.optional(v.string()),
      total: v.number(),
      seevReference: v.string(),
      pickupLocation: v.string(),
      orders: v.array(
        v.object({
          reference: v.string(),
          status: orderStatus,
          pickupCode: v.string(),
          lines: v.array(
            v.object({
              productName: v.string(),
              variantLabel: v.string(),
              quantity: v.number(),
              unitPrice: v.number(),
            }),
          ),
        }),
      ),
      /** Pesewas of this payment Stock couldn't fill, waiting to be refunded. */
      toRefund: v.number(),
    }),
  ),
  handler: async (ctx, { code }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_receiptCode", (q) => q.eq("receiptCode", code))
      .unique();
    const customer = payment && (await ctx.db.get(payment.customerId));
    if (!payment || !customer) return null;
    const orders = [];
    for (const order of await ctx.db
      .query("orders")
      .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
      .collect()) {
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      orders.push({
        reference: order.reference,
        status: order.status,
        pickupCode: order.pickupCode,
        lines: lines.map(({ productName, variantLabel, quantity, unitPrice }) => ({
          productName,
          variantLabel,
          quantity,
          unitPrice,
        })),
      });
    }
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
      .collect();
    return {
      receiptNumber: payment.receiptNumber,
      paidAt: payment.paidAt,
      phone: customer.phone,
      customerName: customer.name,
      total: payment.amount,
      seevReference: payment.seevReference,
      pickupLocation: await pickupLocation(ctx),
      orders,
      toRefund: refunds
        .filter((refund) => refund.status !== "refunded")
        .reduce((sum, refund) => sum + refund.amount, 0),
    };
  },
});
