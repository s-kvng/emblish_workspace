import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireOwner, requireStaff } from "../lib/guards";
import { markRefunded as markRefundPaid, refundsToMake } from "../model/refunds";
import { refundKind, refundMethod } from "../schema";

/**
 * Refunds to make: every Refund still to pay out, oldest first, with the GH₵ total. Staff see
 * the list; only an Owner may pay one out (`canRefund`).
 */
export const toMake = query({
  args: {},
  returns: v.object({
    canRefund: v.boolean(),
    /** Pesewas across every row. */
    total: v.number(),
    refunds: v.array(
      v.object({
        refundId: v.id("refunds"),
        kind: refundKind,
        amount: v.number(),
        flaggedAt: v.number(),
        returnToStock: v.boolean(),
        note: v.optional(v.string()),
        /** Missing for a payment that made no order. */
        orderId: v.optional(v.id("orders")),
        orderReference: v.optional(v.string()),
        customerName: v.optional(v.string()),
        phone: v.string(),
        /** The payment it comes from, to find in the Seev dashboard. */
        receiptNumber: v.string(),
        seevReference: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    return { canRefund: staff.role === "owner", ...(await refundsToMake(ctx)) };
  },
});

/**
 * The Owner paid a Refund out by hand, from the Seev dashboard, MoMo or cash, and records how:
 * it leaves Refunds to make and the Customer's card shows it refunded.
 */
export const markRefunded = mutation({
  args: { refundId: v.id("refunds"), method: refundMethod, note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await markRefundPaid(ctx, owner, args);
    return null;
  },
});
