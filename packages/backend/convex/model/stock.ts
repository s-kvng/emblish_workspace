import { ConvexError, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { adjustmentReason, stockMovementKind } from "../schema";

export type StockMovementKind = Infer<typeof stockMovementKind>;
export type AdjustmentReason = Infer<typeof adjustmentReason>;

/** One Variant, or a NOT_FOUND refusal. */
export async function getVariant(ctx: Pick<QueryCtx, "db">, variantId: Id<"variants">) {
  const variant = await ctx.db.get(variantId);
  if (!variant) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "That Variant doesn't exist.",
    });
  }
  return variant;
}

/** A Variant's cached counts; a Variant saved before Stock existed has none of either. */
export function stockCounts(variant: Pick<Doc<"variants">, "stockOnHand" | "stockHeld">) {
  const onHand = variant.stockOnHand ?? 0;
  const held = variant.stockHeld ?? 0;
  // May be negative: an Adjustment can drop on-hand below active Stock Holds.
  return { onHand, held, available: onHand - held };
}

/** A Variant's Stock Movements, oldest first. */
export async function listMovements(ctx: Pick<QueryCtx, "db">, variantId: Id<"variants">) {
  return await ctx.db
    .query("stockMovements")
    .withIndex("by_variant", (q) => q.eq("variantId", variantId))
    .collect();
}

/** Whether any Stock Movement points at the Variant, so its ledger needs it kept. */
export async function hasStockHistory(ctx: Pick<QueryCtx, "db">, variantId: Id<"variants">) {
  const movement = await ctx.db
    .query("stockMovements")
    .withIndex("by_variant", (q) => q.eq("variantId", variantId))
    .first();
  return movement !== null;
}

function invalidQuantity(message: string): never {
  throw new ConvexError({ code: "INVALID_QUANTITY", message });
}

/** Trimmed, and missing when blank. */
function cleanNote(note: string | undefined) {
  return note?.trim() || undefined;
}

/**
 * The one way Stock changes: appends a Stock Movement and moves the Variant's cached on-hand
 * count in the same mutation. On-hand never goes below zero; it may drop below what's held.
 * An Adjustment always carries a reason, and no other kind does.
 */
export async function recordMovement(
  ctx: Pick<MutationCtx, "db">,
  movement: {
    variantId: Id<"variants">;
    kind: StockMovementKind;
    quantity: number;
    reason?: AdjustmentReason;
    note?: string;
    staffId?: Id<"staff">;
  },
): Promise<Id<"stockMovements">> {
  const { variantId, kind, quantity, reason } = movement;
  if (!Number.isSafeInteger(quantity) || quantity === 0) {
    invalidQuantity("Enter a whole number of units, more than 0.");
  }
  if ((kind === "adjustment") !== (reason !== undefined)) {
    throw new ConvexError({
      code: "INVALID_REASON",
      message: "Pick a reason for the Adjustment.",
    });
  }
  const variant = await getVariant(ctx, variantId);
  const { onHand } = stockCounts(variant);
  const stockOnHand = onHand + quantity;
  if (stockOnHand < 0) {
    throw new ConvexError({
      code: "NOT_ENOUGH_STOCK",
      message: `Only ${onHand} in Stock, so ${-quantity} can't come out.`,
    });
  }
  const movementId = await ctx.db.insert("stockMovements", {
    ...movement,
    note: cleanNote(movement.note),
  });
  await ctx.db.patch(variantId, { stockOnHand });
  return movementId;
}

/** Staff bringing Stock in line with reality: a signed quantity, always with a reason. */
export async function recordAdjustment(
  ctx: Pick<MutationCtx, "db">,
  actor: Doc<"staff">,
  adjustment: {
    variantId: Id<"variants">;
    quantity: number;
    reason: AdjustmentReason;
    note?: string;
  },
) {
  return await recordMovement(ctx, {
    ...adjustment,
    kind: "adjustment",
    staffId: actor._id,
  });
}

/** A walk-in, WhatsApp or DM sale: units out of Stock, with no Customer or price. */
export async function recordSoldOffline(
  ctx: Pick<MutationCtx, "db">,
  actor: Doc<"staff">,
  sale: { variantId: Id<"variants">; quantity: number; note?: string },
) {
  // Positive here; recordMovement checks it's a whole number once it's signed.
  if (!(sale.quantity > 0)) {
    invalidQuantity("Enter how many were sold, a whole number more than 0.");
  }
  return await recordMovement(ctx, {
    variantId: sale.variantId,
    kind: "soldOffline",
    quantity: -sale.quantity,
    note: sale.note,
    staffId: actor._id,
  });
}

/** A Variant's cached on-hand count against the sum of its ledger, when they disagree. */
export async function onHandDrift(ctx: Pick<QueryCtx, "db">, variant: Doc<"variants">) {
  let ledger = 0;
  for (const movement of await listMovements(ctx, variant._id)) ledger += movement.quantity;
  const { onHand } = stockCounts(variant);
  return ledger === onHand ? null : { variantId: variant._id, stockOnHand: onHand, ledger };
}
