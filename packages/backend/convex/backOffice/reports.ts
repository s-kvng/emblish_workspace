import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireOwner } from "../lib/guards";
import { checkPeriod, reportCsv, reportSummary } from "../model/reports";
import { refundKind } from "../schema";

/** A period: `from` inclusive, `to` exclusive, in ms; GMT days, up to 92 of them. */
const period = { from: v.number(), to: v.number() };

/** Units sold and the pesewas they came to. */
const sales = v.object({ units: v.number(), amount: v.number() });
const sellerRow = {
  store: sales,
  preorder: sales,
  /** Units only: Sold offline has no price, so it's in no GH₵ total. */
  soldOffline: v.number(),
};

/**
 * Reports for a period, computed on read with no stored aggregates. Money in (by when it
 * arrived), split by what it paid for; Refunded (by when it was paid back), by kind; Net; and
 * Best sellers per Product and Variant. Amounts are pesewas. Owner-only.
 */
export const summary = query({
  args: period,
  returns: v.object({
    moneyIn: v.object({
      storeItems: v.number(),
      preorderItems: v.number(),
      shippingFees: v.number(),
      deliveryFees: v.number(),
      /** Payments that settled nothing, so were flagged as Refunds in full. */
      unmatched: v.number(),
      total: v.number(),
    }),
    /** How many payments arrived. */
    payments: v.number(),
    refunded: v.object({
      total: v.number(),
      byKind: v.array(v.object({ kind: refundKind, amount: v.number(), count: v.number() })),
    }),
    net: v.number(),
    bestSellers: v.array(
      v.object({
        productId: v.id("products"),
        productName: v.string(),
        ...sellerRow,
        variants: v.array(
          v.object({ variantId: v.id("variants"), variantLabel: v.string(), ...sellerRow }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    checkPeriod(args);
    return await reportSummary(ctx, args);
  },
});

/**
 * The period's payments and Refunds paid back as one CSV file, for the share sheet: one row
 * each, oldest first. Owner-only.
 */
export const exportCsv = query({
  args: period,
  returns: v.object({ filename: v.string(), csv: v.string() }),
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    checkPeriod(args);
    return await reportCsv(ctx, args);
  },
});
