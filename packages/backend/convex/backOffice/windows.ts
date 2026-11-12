import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import {
  advanceWindow,
  changeWindowStage,
  closeWindow,
  describeChangeSheet,
  discardDraft,
  extendWindow,
  getWindow,
  saveWindow,
  describeStageSheet,
} from "../model/orderWindows";
import { getProduct, inOptionOrder, listVariants } from "../model/products";
import { currentWindow, listWindowVariants } from "../model/windowLookups";
import { markableStage, windowStage } from "../schema";

const windowRow = {
  variantId: v.id("variants"),
  /** Integer pesewas; only an Owner sets it. */
  preorderPrice: v.optional(v.number()),
  cap: v.optional(v.number()),
};

const terms = {
  closesAt: v.number(),
  minimumOrderQuantity: v.optional(v.number()),
  /** Integer pesewas per unit. */
  shippingFeeEstimate: v.optional(v.number()),
};

/** Extra units for Stock per offered Variant, on the supplier order. */
const storeQuantities = v.optional(
  v.array(v.object({ variantId: v.id("variants"), quantity: v.number() })),
);

/** The opening wizard's Review step: saves a draft, or opens the window. */
export const save = mutation({
  args: {
    windowId: v.optional(v.id("orderWindows")),
    productId: v.id("products"),
    variants: v.array(v.object(windowRow)),
    ...terms,
    open: v.boolean(),
  },
  returns: v.object({
    windowId: v.id("orderWindows"),
    stage: v.union(v.literal("draft"), v.literal("open")),
  }),
  handler: async (ctx, { open, ...draft }) => {
    const actor = await requireStaff(ctx);
    return await saveWindow(ctx, actor, draft, open);
  },
});

/** Extend: +3 / +7 / +14 days on an open window's close date. */
export const extend = mutation({
  args: { windowId: v.id("orderWindows"), days: v.number() },
  returns: v.null(),
  handler: async (ctx, { windowId, days }) => {
    await requireStaff(ctx);
    await extendWindow(ctx, windowId, days);
    return null;
  },
});

/** Close now: ends an open window early. Closing texts no one. */
export const closeNow = mutation({
  args: { windowId: v.id("orderWindows") },
  returns: v.null(),
  handler: async (ctx, { windowId }) => {
    const actor = await requireStaff(ctx);
    const window = await getWindow(ctx, windowId);
    if (window.stage !== "open") return null;
    await closeWindow(ctx, window, actor._id);
    return null;
  },
});

/**
 * "Mark as <next stage>": Closed → Ordered from supplier → In transit, in order only, with the
 * expected arrival dates and a note to Customers.
 */
export const advance = mutation({
  args: {
    windowId: v.id("orderWindows"),
    stage: markableStage,
    expectedFrom: v.optional(v.number()),
    expectedTo: v.optional(v.number()),
    note: v.optional(v.string()),
    /** At "Ordered from supplier": extra units for Stock per offered Variant. */
    storeQuantities,
  },
  returns: v.object({ texted: v.number() }),
  handler: async (ctx, { windowId, ...update }) => {
    const actor = await requireStaff(ctx);
    return await advanceWindow(ctx, actor, windowId, update);
  },
});

/**
 * The "Mark as <next>" sheet: the stage it marks (null when none can be marked by hand), the
 * Customers "Text N Customers" will text, and a preview of their SMS with these dates.
 */
export const stageSheet = query({
  args: {
    windowId: v.id("orderWindows"),
    expectedFrom: v.optional(v.number()),
    expectedTo: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      next: markableStage,
      customers: v.number(),
      preview: v.string(),
    }),
    v.object({ next: v.null(), customers: v.number(), preview: v.null() }),
  ),
  handler: async (ctx, { windowId, ...dates }) => {
    await requireStaff(ctx);
    return await describeStageSheet(ctx, windowId, dates);
  },
});

/**
 * "Change expected dates or note" on the current stage, from Ordered from supplier until
 * arrival. The dates and note replace the stage's (leave them out to clear them), as the sheet
 * shows them; any Store Quantities given are saved too. New dates text every Pre-order holder;
 * a change to the note alone, or to Store Quantity, texts no one.
 */
export const change = mutation({
  args: {
    windowId: v.id("orderWindows"),
    expectedFrom: v.optional(v.number()),
    expectedTo: v.optional(v.number()),
    note: v.optional(v.string()),
    storeQuantities,
  },
  returns: v.object({ texted: v.number() }),
  handler: async (ctx, { windowId, ...change }) => {
    const actor = await requireStaff(ctx);
    return await changeWindowStage(ctx, actor, windowId, change);
  },
});

/**
 * The "Change expected dates or note" sheet: the stage it changes, the Customers new dates
 * would text, and their SMS with these dates (or the current ones). Null once it can't change.
 */
export const changeSheet = query({
  args: {
    windowId: v.id("orderWindows"),
    expectedFrom: v.optional(v.number()),
    expectedTo: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      stage: markableStage,
      customers: v.number(),
      preview: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { windowId, ...dates }) => {
    await requireStaff(ctx);
    return await describeChangeSheet(ctx, windowId, dates);
  },
});

/** Throws away a draft window that never opened. */
export const discard = mutation({
  args: { windowId: v.id("orderWindows") },
  returns: v.null(),
  handler: async (ctx, { windowId }) => {
    await requireStaff(ctx);
    await discardDraft(ctx, windowId);
    return null;
  },
});

/** One window as its timeline screen and the wizard show it. */
export const get = query({
  args: { windowId: v.id("orderWindows") },
  returns: v.object({
    _id: v.id("orderWindows"),
    productId: v.id("products"),
    productName: v.string(),
    number: v.number(),
    stage: windowStage,
    opensAt: v.optional(v.number()),
    ...terms,
    variants: v.array(
      v.object({
        ...windowRow,
        /** The Variant's option values joined, e.g. "Red / M"; empty for a default Variant. */
        label: v.string(),
        preordered: v.number(),
        held: v.number(),
        /** Extra units for Stock on the supplier order; 0 until set. */
        storeQuantity: v.number(),
      }),
    ),
    events: v.array(
      v.object({
        stage: windowStage,
        at: v.number(),
        staffName: v.optional(v.string()),
        expectedFrom: v.optional(v.number()),
        expectedTo: v.optional(v.number()),
        note: v.optional(v.string()),
        /** Customers texted about it; missing when no one was. */
        texted: v.optional(v.number()),
        /** When the expected dates or note were last changed, and by whom. */
        changedAt: v.optional(v.number()),
        changedByName: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { windowId }) => {
    await requireStaff(ctx);
    const window = await getWindow(ctx, windowId);
    const product = await getProduct(ctx, window.productId);
    const variants = inOptionOrder(product.options, await listVariants(ctx, product._id));
    const rows = await listWindowVariants(ctx, windowId);
    const events = await ctx.db
      .query("windowStageEvents")
      .withIndex("by_window", (q) => q.eq("orderWindowId", windowId))
      .collect();
    return {
      _id: window._id,
      productId: product._id,
      productName: product.name,
      number: window.number,
      stage: window.stage,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      minimumOrderQuantity: window.minimumOrderQuantity,
      shippingFeeEstimate: window.shippingFeeEstimate,
      variants: variants.flatMap((variant) => {
        const row = rows.find((r) => r.variantId === variant._id);
        return row
          ? [
              {
                variantId: variant._id,
                label: variant.optionValues.join(" / "),
                preorderPrice: row.preorderPrice,
                cap: row.cap,
                preordered: row.preordered,
                held: row.held,
                storeQuantity: row.storeQuantity ?? 0,
              },
            ]
          : [];
      }),
      events: await Promise.all(
        events.map(async (event) => ({
          stage: event.stage,
          at: event._creationTime,
          staffName: event.staffId ? (await ctx.db.get(event.staffId))?.name : undefined,
          expectedFrom: event.expectedFrom,
          expectedTo: event.expectedTo,
          note: event.note,
          texted: event.texted,
          changedAt: event.changedAt,
          changedByName: event.changedBy ? (await ctx.db.get(event.changedBy))?.name : undefined,
        })),
      ),
    };
  },
});

/** Draft windows waiting for the Owner's Pre-order prices, oldest first. */
export const needsPrices = query({
  args: {},
  returns: v.array(
    v.object({
      windowId: v.id("orderWindows"),
      productId: v.id("products"),
      productName: v.string(),
      number: v.number(),
      unpriced: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const drafts = await ctx.db
      .query("orderWindows")
      .withIndex("by_stage_and_closesAt", (q) => q.eq("stage", "draft"))
      .collect();
    const rows = [];
    for (const window of drafts.sort((a, b) => a._creationTime - b._creationTime)) {
      const product = await ctx.db.get(window.productId);
      if (!product || product.status === "archived") continue;
      const unpriced = (await listWindowVariants(ctx, window._id)).filter(
        (row) => row.preorderPrice === undefined,
      ).length;
      rows.push({
        windowId: window._id,
        productId: product._id,
        productName: product.name,
        number: window.number,
        unpriced,
      });
    }
    return rows;
  },
});

/**
 * Where the opening wizard starts for a Product: the last window's Variants, caps, minimum and
 * Shipping Fee estimate, with its prices (or, on a first window, the Store Prices) for an Owner.
 * `blockedBy` is a draft or open window the Product already has.
 */
export const prefill = query({
  args: { productId: v.id("products") },
  returns: v.object({
    blockedBy: v.union(
      v.null(),
      v.object({
        windowId: v.id("orderWindows"),
        number: v.number(),
        stage: windowStage,
      }),
    ),
    minimumOrderQuantity: v.optional(v.number()),
    shippingFeeEstimate: v.optional(v.number()),
    variants: v.array(
      v.object({
        variantId: v.id("variants"),
        label: v.string(),
        offered: v.boolean(),
        preorderPrice: v.optional(v.number()),
        cap: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, { productId }) => {
    const actor = await requireStaff(ctx);
    const product = await getProduct(ctx, productId);
    const variants = inOptionOrder(product.options, await listVariants(ctx, productId));
    const blocking = await currentWindow(ctx, productId);
    const previous = (
      await ctx.db
        .query("orderWindows")
        .withIndex("by_product_and_stage", (q) => q.eq("productId", productId))
        .collect()
    )
      .filter((window) => window.stage !== "draft")
      .sort((a, b) => b.number - a.number)[0];
    const rows = previous ? await listWindowVariants(ctx, previous._id) : [];
    const isOwner = actor.role === "owner";
    return {
      blockedBy: blocking
        ? {
            windowId: blocking._id,
            number: blocking.number,
            stage: blocking.stage,
          }
        : null,
      minimumOrderQuantity: previous?.minimumOrderQuantity,
      shippingFeeEstimate: previous?.shippingFeeEstimate,
      variants: variants.map((variant) => {
        const row = rows.find((r) => r.variantId === variant._id);
        const price = previous ? row?.preorderPrice : variant.storePrice;
        return {
          variantId: variant._id,
          label: variant.optionValues.join(" / "),
          offered: !previous || row !== undefined,
          ...(isOwner && price !== undefined ? { preorderPrice: price } : {}),
          ...(row?.cap !== undefined ? { cap: row.cap } : {}),
        };
      }),
    };
  },
});

/** A Product's windows, newest first: the chips across the top of its window screen. */
export const forProduct = query({
  args: { productId: v.id("products") },
  returns: v.array(
    v.object({
      windowId: v.id("orderWindows"),
      number: v.number(),
      stage: windowStage,
      closesAt: v.number(),
    }),
  ),
  handler: async (ctx, { productId }) => {
    await requireStaff(ctx);
    const windows = await ctx.db
      .query("orderWindows")
      .withIndex("by_product_and_stage", (q) => q.eq("productId", productId))
      .collect();
    return windows
      .sort((a, b) => b.number - a.number)
      .map((window) => ({
        windowId: window._id,
        number: window.number,
        stage: window.stage,
        closesAt: window.closesAt,
      }));
  },
});
