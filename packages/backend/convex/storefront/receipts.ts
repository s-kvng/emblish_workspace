import { v } from "convex/values";

import { query } from "../_generated/server";
import { deliveryFeeToday, fulfilmentAsShown, shownFulfilment } from "../model/fulfilment";
import { pickupLocation } from "../model/settings";
import { invoiceKind, invoiceLine, orderKind, orderStatus } from "../schema";

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
          kind: orderKind,
          reference: v.string(),
          status: orderStatus,
          /**
           * Pesewas of this payment that went to the order: a Store Order's lines and Delivery
           * Fee, or a Pre-order's Item Payment.
           */
          amount: v.number(),
          /** Store Orders for Pickup only: a Pre-order's goods haven't arrived to collect yet. */
          pickupCode: v.optional(v.string()),
          fulfilment: shownFulfilment,
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
      /** Set when the payment paid an invoice at `/p/`, rather than a Checkout. */
      invoice: v.optional(
        v.object({
          number: v.string(),
          kind: invoiceKind,
          orderReference: v.string(),
          lines: v.array(invoiceLine),
        }),
      ),
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
      const itemsTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      orders.push({
        kind: order.kind,
        reference: order.reference,
        status: order.status,
        amount:
          order.kind === "preorder"
            ? (order.itemPayment ?? itemsTotal)
            : itemsTotal + deliveryFeeToday(order.fulfilment),
        ...(order.kind === "store" && order.fulfilment.method === "pickup"
          ? { pickupCode: order.pickupCode }
          : {}),
        fulfilment: fulfilmentAsShown(order.fulfilment),
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
    const invoice = payment.invoiceId ? await ctx.db.get(payment.invoiceId) : null;
    const invoiceOrder = invoice && (await ctx.db.get(invoice.orderId));
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
      ...(invoice && invoiceOrder
        ? {
            invoice: {
              number: invoice.number,
              kind: invoice.kind,
              orderReference: invoiceOrder.reference,
              lines: invoice.lines,
            },
          }
        : {}),
    };
  },
});
