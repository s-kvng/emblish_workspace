import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import {
  confirmFee as confirmWindowFee,
  invoiceDocumentFields,
  invoiceInbox,
  invoiceSheet,
  issueInvoices,
  previewInvoices,
  voidAndReissue as voidAndReissueInvoice,
} from "../model/invoices";
import { invoiceKind, invoiceStatus } from "../schema";

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

/** The Invoices inbox filters; Overdue includes those Eligible for Forfeit. */
const inboxFilter = v.union(
  v.literal("overdue"),
  v.literal("eligible"),
  v.literal("unpaid"),
  v.literal("paid"),
  v.literal("void"),
);
const filterTotal = v.object({
  count: v.number(),
  /** Pesewas. */
  total: v.number(),
});
/** Where an invoice stands now: never stored, worked out from its first issue date. */
const invoiceStateValidator = v.union(
  v.literal("due"),
  v.literal("overdue"),
  v.literal("forfeitable"),
  v.literal("paid"),
  v.literal("void"),
);

/**
 * The Invoices tab: every invoice across all windows. Each filter header has a count and GH₵
 * total; overdue and Forfeit eligibility are worked out now, from each invoice's first issue.
 */
export const inbox = query({
  args: { filter: inboxFilter },
  returns: v.object({
    counts: v.object({
      overdue: filterTotal,
      eligible: filterTotal,
      unpaid: filterTotal,
      paid: filterTotal,
      void: filterTotal,
    }),
    rows: v.array(
      v.object({
        invoiceId: v.id("invoices"),
        kind: invoiceKind,
        number: v.string(),
        orderReference: v.string(),
        customerName: v.string(),
        windowNumber: v.optional(v.number()),
        productName: v.optional(v.string()),
        /** Pesewas. */
        total: v.number(),
        state: invoiceStateValidator,
        /** Days since first issue; day 0 is the day it was first issued. */
        day: v.number(),
        dueAt: v.number(),
        paidAt: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, { filter }) => {
    await requireStaff(ctx);
    return await invoiceInbox(ctx, filter, Date.now());
  },
});

/**
 * Void & reissue an unpaid invoice with a corrected per-unit fee or Delivery Fee. The
 * replacement keeps the first issue date (due date, reminders, Forfeit clock), gets its own
 * `/p/` code, and is texted to the Customer. A reason is required.
 */
export const voidAndReissue = mutation({
  args: {
    invoiceId: v.id("invoices"),
    /** Why: "Wrong fee", "Wrong Delivery Zone", "Units recounted", or Staff's own words. */
    reason: v.string(),
    /** Pesewas per arrived unit; defaults to the old invoice's. */
    unitFee: v.optional(v.number()),
    /** Pesewas; defaults to the old invoice's Delivery Fee line, 0 drops it. */
    deliveryFee: v.optional(v.number()),
  },
  returns: v.id("invoices"),
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    return await voidAndReissueInvoice(ctx, actor, args);
  },
});

/**
 * The invoice sheet: the live end of the invoice's chain (a reissued invoice follows to its
 * replacement) as a paper invoice, with its day count, reminder dots, payment and the earlier
 * voided versions.
 */
export const sheet = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({
    ...invoiceDocumentFields,
    /** The live invoice shown, which may not be the one asked for. */
    invoiceId: v.id("invoices"),
    orderId: v.id("orders"),
    phone: v.optional(v.string()),
    windowNumber: v.optional(v.number()),
    productName: v.optional(v.string()),
    state: invoiceStateValidator,
    /** Days since first issue. */
    day: v.number(),
    /** Days 7, 13, 15 and 28 (reminders), then 30 (Forfeit eligibility). */
    reminders: v.array(v.object({ day: v.number(), reached: v.boolean() })),
    /** What this invoice replaced, newest first. */
    voidedVersions: v.array(
      v.object({
        invoiceId: v.id("invoices"),
        number: v.string(),
        total: v.number(),
        voidReason: v.optional(v.string()),
        voidedAt: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, { invoiceId }) => {
    await requireStaff(ctx);
    return await invoiceSheet(ctx, invoiceId, Date.now());
  },
});
