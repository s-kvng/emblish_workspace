import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { describeAllocation, lockArrival, recordLateArrival } from "../model/arrivals";
import { invoiceProgress } from "../model/invoices";
import { getWindow } from "../model/orderWindows";
import { getProduct, inOptionOrder, listVariants } from "../model/products";
import { listWindowVariants } from "../model/windowLookups";
import { windowStage } from "../schema";

/** Staff's count for one Variant: how many units arrived. */
const counts = v.array(v.object({ variantId: v.id("variants"), arrived: v.number() }));

/**
 * The Arrivals to-do: windows ordered from the supplier or in transit, waiting for their arrival
 * to be recorded (oldest first), then windows whose arrival is locked (newest first).
 */
export const toDo = query({
  args: {},
  returns: v.array(
    v.object({
      windowId: v.id("orderWindows"),
      productName: v.string(),
      number: v.number(),
      stage: windowStage,
      /** Pre-ordered units plus Store Quantity, across the window's Variants. */
      expected: v.number(),
      /** Units counted at the lock; missing until then. */
      arrived: v.optional(v.number()),
      /** When the window was last moved on a stage. */
      at: v.number(),
      /**
       * Arrived windows only: whether its Shipping Fee Invoices are issued ("Confirm fee & issue
       * invoices" until they are), how many there are and are paid, and pesewas still unpaid.
       */
      invoices: v.optional(
        v.object({
          issued: v.boolean(),
          count: v.number(),
          paid: v.number(),
          outstanding: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = [];
    for (const stage of ["orderedFromSupplier", "inTransit", "arrived"] as const) {
      const windows = await ctx.db
        .query("orderWindows")
        .withIndex("by_stage_and_closesAt", (q) => q.eq("stage", stage))
        .collect();
      for (const window of windows) {
        const product = await ctx.db.get(window.productId);
        const variants = await listWindowVariants(ctx, window._id);
        const event = await ctx.db
          .query("windowStageEvents")
          .withIndex("by_window", (q) => q.eq("orderWindowId", window._id))
          .order("desc")
          .first();
        rows.push({
          windowId: window._id,
          productName: product?.name ?? "",
          number: window.number,
          stage: window.stage,
          expected: variants.reduce(
            (sum, row) => sum + row.preordered + (row.storeQuantity ?? 0),
            0,
          ),
          ...(stage === "arrived"
            ? {
                arrived: variants.reduce((sum, row) => sum + (row.arrivedUnits ?? 0), 0),
                invoices: await invoiceProgress(ctx, window),
              }
            : {}),
          at: event?._creationTime ?? window._creationTime,
        });
      }
    }
    const toRecord = rows.filter((row) => row.stage !== "arrived").sort((a, b) => a.at - b.at);
    const arrived = rows.filter((row) => row.stage === "arrived").sort((a, b) => b.at - a.at);
    return [...toRecord, ...arrived];
  },
});

/** The Count step: each Variant the window offers, with its supplier order. */
export const countSheet = query({
  args: { windowId: v.id("orderWindows") },
  returns: v.object({
    productName: v.string(),
    number: v.number(),
    stage: windowStage,
    variants: v.array(
      v.object({
        variantId: v.id("variants"),
        label: v.string(),
        preordered: v.number(),
        storeQuantity: v.number(),
        /** Locked count, once the arrival is locked. */
        arrived: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, { windowId }) => {
    await requireStaff(ctx);
    const window = await getWindow(ctx, windowId);
    const product = await getProduct(ctx, window.productId);
    const rows = await listWindowVariants(ctx, windowId);
    const variants = inOptionOrder(product.options, await listVariants(ctx, product._id));
    return {
      productName: product.name,
      number: window.number,
      stage: window.stage,
      variants: variants.flatMap((variant) => {
        const row = rows.find((r) => r.variantId === variant._id);
        return row
          ? [
              {
                variantId: variant._id,
                label: variant.optionValues.join(" / "),
                preordered: row.preordered,
                storeQuantity: row.storeQuantity ?? 0,
                ...(row.arrivedUnits !== undefined ? { arrived: row.arrivedUnits } : {}),
              },
            ]
          : [];
      }),
    };
  },
});

const allocatedVariant = v.object({
  variantId: v.id("variants"),
  label: v.string(),
  arrived: v.number(),
  toPreorders: v.number(),
  toStore: v.number(),
  surplus: v.number(),
  shortfall: v.number(),
});

/**
 * Who gets what: the allocation of `counts` (which must cover every Variant) before the lock, or
 * what was locked after it. Null before the window is ordered from the supplier, or until every
 * Variant is counted.
 */
export const allocation = query({
  args: { windowId: v.id("orderWindows"), counts: v.optional(counts) },
  returns: v.union(
    v.null(),
    v.object({
      locked: v.boolean(),
      variants: v.array(allocatedVariant),
      /** In placement order, earliest first. */
      preorders: v.array(
        v.object({
          orderId: v.id("orders"),
          reference: v.string(),
          customerName: v.string(),
          got: v.number(),
          ordered: v.number(),
          /** Pesewas flagged (or to flag) as a Shortfall Refund. */
          refund: v.number(),
          lines: v.array(
            v.object({
              variantId: v.id("variants"),
              label: v.string(),
              got: v.number(),
              ordered: v.number(),
            }),
          ),
        }),
      ),
      /** Customers "Lock arrival & text N Customers" texts. */
      customers: v.number(),
    }),
  ),
  handler: async (ctx, { windowId, counts }) => {
    await requireStaff(ctx);
    return await describeAllocation(ctx, windowId, counts);
  },
});

/**
 * Lock arrival & text Customers: records the arrived units per Variant once, fills Pre-orders
 * earliest first, flags Shortfall Refunds, puts Store Quantity and Surplus into Stock and marks
 * the window Arrived. It can't be undone.
 */
export const lock = mutation({
  args: { windowId: v.id("orderWindows"), counts },
  returns: v.object({ texted: v.number() }),
  handler: async (ctx, { windowId, counts }) => {
    const actor = await requireStaff(ctx);
    return await lockArrival(ctx, actor, windowId, counts);
  },
});

/** Units that turned up after the arrival was locked: Surplus, straight into Stock. */
export const lateArrival = mutation({
  args: {
    windowId: v.id("orderWindows"),
    variantId: v.id("variants"),
    quantity: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    await recordLateArrival(ctx, actor, args);
    return null;
  },
});
