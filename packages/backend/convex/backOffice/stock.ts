import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { getProduct, inOptionOrder, listVariants } from "../model/products";
import {
  getVariant,
  listMovements,
  recordAdjustment,
  recordSoldOffline,
  stockCounts,
} from "../model/stock";
import { adjustmentReason, productStatus, stockMovementKind } from "../schema";

/** More → Stock: every Product with its Variants' live counts, archived Products last. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("products"),
      name: v.string(),
      status: productStatus,
      variants: v.array(
        v.object({
          _id: v.id("variants"),
          optionValues: v.array(v.string()),
          sku: v.optional(v.string()),
          onHand: v.number(),
          held: v.number(),
          /** Negative when an Adjustment dropped on-hand below active Stock Holds. */
          available: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const products = await ctx.db.query("products").order("desc").collect();
    const rows = await Promise.all(
      products.map(async (product) => {
        const variants = inOptionOrder(product.options, await listVariants(ctx, product._id));
        return {
          _id: product._id,
          name: product.name,
          status: product.status,
          variants: variants.map((variant) => ({
            _id: variant._id,
            optionValues: variant.optionValues,
            sku: variant.sku,
            ...stockCounts(variant),
          })),
        };
      }),
    );
    return [
      ...rows.filter((row) => row.status !== "archived"),
      ...rows.filter((row) => row.status === "archived"),
    ];
  },
});

/** A Variant's Stock screen: its counts, then its ledger newest first with the running balance. */
export const variant = query({
  args: { variantId: v.id("variants") },
  returns: v.object({
    _id: v.id("variants"),
    productId: v.id("products"),
    productName: v.string(),
    optionValues: v.array(v.string()),
    sku: v.optional(v.string()),
    onHand: v.number(),
    held: v.number(),
    available: v.number(),
    movements: v.array(
      v.object({
        _id: v.id("stockMovements"),
        _creationTime: v.number(),
        kind: stockMovementKind,
        quantity: v.number(),
        reason: v.optional(adjustmentReason),
        note: v.optional(v.string()),
        /** Missing for a system movement, such as a paid checkout. */
        staffName: v.optional(v.string()),
        /** On-hand straight after this movement. */
        balance: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { variantId }) => {
    await requireStaff(ctx);
    const variant = await getVariant(ctx, variantId);
    const product = await getProduct(ctx, variant.productId);
    const staffNames = new Map<string, string | undefined>();
    let balance = 0;
    const movements = [];
    for (const movement of await listMovements(ctx, variantId)) {
      balance += movement.quantity;
      const { staffId } = movement;
      if (staffId && !staffNames.has(staffId)) {
        staffNames.set(staffId, (await ctx.db.get(staffId))?.name);
      }
      movements.push({
        _id: movement._id,
        _creationTime: movement._creationTime,
        kind: movement.kind,
        quantity: movement.quantity,
        reason: movement.reason,
        note: movement.note,
        staffName: staffId ? staffNames.get(staffId) : undefined,
        balance,
      });
    }
    return {
      _id: variant._id,
      productId: product._id,
      productName: product.name,
      optionValues: variant.optionValues,
      sku: variant.sku,
      ...stockCounts(variant),
      movements: movements.reverse(),
    };
  },
});

/** An Adjustment: a recount, damage, loss or find, with its reason chip. */
export const adjust = mutation({
  args: {
    variantId: v.id("variants"),
    /** Signed: positive adds units, negative takes them out. */
    quantity: v.number(),
    reason: adjustmentReason,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    await recordAdjustment(ctx, actor, args);
    return null;
  },
});

/** Sold offline: a walk-in, WhatsApp or DM sale, quantity only and no price. */
export const sellOffline = mutation({
  args: {
    variantId: v.id("variants"),
    quantity: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    await recordSoldOffline(ctx, actor, args);
    return null;
  },
});
