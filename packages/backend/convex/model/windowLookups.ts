// Read-only Order Window lookups shared by the catalog and the window lifecycle, kept apart so
// `products` can use them without importing `orderWindows`, which builds on `products`.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** The Product's window in this stage, if any; a Product has at most one draft and one open. */
export async function windowInStage(
  ctx: Pick<QueryCtx, "db">,
  productId: Id<"products">,
  stage: "draft" | "open",
) {
  return await ctx.db
    .query("orderWindows")
    .withIndex("by_product_and_stage", (q) => q.eq("productId", productId).eq("stage", stage))
    .first();
}

/** The window Staff are working on for a Product: its open one, else its draft. */
export async function currentWindow(ctx: Pick<QueryCtx, "db">, productId: Id<"products">) {
  return (
    (await windowInStage(ctx, productId, "open")) ?? (await windowInStage(ctx, productId, "draft"))
  );
}

/** A window's offered Variants. */
export async function listWindowVariants(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">) {
  return await ctx.db
    .query("windowVariants")
    .withIndex("by_window", (q) => q.eq("orderWindowId", windowId))
    .collect();
}

/** Units of a capped Variant still to be had in the window; undefined when it's uncapped. */
export function unitsLeft(row: Pick<Doc<"windowVariants">, "cap" | "preordered" | "held">) {
  return row.cap === undefined ? undefined : Math.max(0, row.cap - row.preordered - row.held);
}
