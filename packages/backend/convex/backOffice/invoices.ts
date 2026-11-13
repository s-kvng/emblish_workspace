import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import {
  confirmFee as confirmWindowFee,
  issueInvoices,
  previewInvoices,
} from "../model/invoices";
import { invoiceStatus } from "../schema";

/**
 * Confirm the per-unit Shipping Fee for an arrived window. More than 20% over the estimate is
 * refused (OVER_ESTIMATE) unless Staff tick that they've checked the supplier's bill.
 */
export const confirmFee = mutation({
  args: {
    windowId: v.id("orderWindows"),
    /** Integer pesewas per arrived unit. */
    fee: v.number(),
    overEstimateAcknowledged: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await confirmWindowFee(ctx, args);
    return null;
  },
});

const previewRow = v.object({
  orderId: v.id("orders"),
  reference: v.string(),
  customerName: v.string(),
  /** Arrived units it's charged for. */
  units: v.number(),
  /** Pesewas: units × the fee. */
  shipping: v.number(),
  /** Pesewas, when its Delivery Fee is on the invoice. */
  deliveryFee: v.optional(v.number()),
  /** Elsewhere in Ghana: its Delivery Fee is quoted later, on its own invoice. */
  quoteLater: v.boolean(),
  /** Pesewas; 0 means no invoice, Ready at once. */
  total: v.number(),
  /** Once issued: the invoice's number and where it stands. */
  number: v.optional(v.string()),
  status: v.optional(invoiceStatus),
});

/**
 * The Fee and Issue steps of the arrival wizard: the estimate and confirmed fee, and the invoice
 * each arrived Pre-order gets at `fee` (else the confirmed fee, else the estimate). Once issued,
 * the invoices as they stand, which the Arrivals card counts as paid / outstanding.
 */
export const preview = query({
  args: {
    windowId: v.id("orderWindows"),
    /** Pesewas per unit Staff are typing, before they confirm it. */
    fee: v.optional(v.number()),
  },
  returns: v.object({
    productName: v.string(),
    number: v.number(),
    /** The arrival is locked, so there's something to invoice. */
    arrived: v.boolean(),
    /** Pesewas per unit Customers saw as the estimate. */
    estimate: v.optional(v.number()),
    /** Pesewas per arrived unit, once confirmed. */
    confirmedFee: v.optional(v.number()),
    overEstimateAcknowledged: v.boolean(),
    issued: v.boolean(),
    /** Before issuing: the first Customer's invoice SMS, with a stand-in Pay link. */
    exampleSms: v.optional(v.string()),
    /** Earliest placed first. */
    invoices: v.array(previewRow),
    /** Pre-orders none of whose units arrived: no invoice, fully refunded. */
    skipped: v.array(v.object({ reference: v.string(), customerName: v.string() })),
  }),
  handler: async (ctx, { windowId, fee }) => {
    await requireStaff(ctx);
    return await previewInvoices(ctx, windowId, fee);
  },
});

/**
 * Issue N invoices: one Shipping Fee Invoice per arrived Pre-order in the window, each texted
 * with its `/p/` link. Pre-orders owing nothing become Ready instead. Done once per window.
 */
export const issue = mutation({
  args: { windowId: v.id("orderWindows") },
  returns: v.object({
    /** Invoices issued and texted. */
    issued: v.number(),
    /** Pre-orders owing GHS 0, now Ready. */
    ready: v.number(),
  }),
  handler: async (ctx, { windowId }) => {
    const actor = await requireStaff(ctx);
    return await issueInvoices(ctx, actor, windowId);
  },
});
