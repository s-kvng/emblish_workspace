import { ConvexError, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { checkoutLine } from "../schema";
import { stockCounts } from "./stock";

export type CheckoutLine = Infer<typeof checkoutLine>;

/** What Pay submits: the Bag's Variants and quantities. */
export type BagRequest = { variantId: Id<"variants">; quantity: number }[];

/** One of this Customer's Checkouts by its id from the browser, or null for anyone else's. */
export async function findOwnCheckout(
  ctx: Pick<QueryCtx, "db">,
  customer: Doc<"customers"> | null,
  checkoutId: string,
) {
  const id = ctx.db.normalizeId("checkouts", checkoutId);
  const checkout = id && (await ctx.db.get(id));
  return customer && checkout?.customerId === customer._id ? checkout : null;
}

/** How long a Checkout holds its Stock while it awaits payment. */
export const checkoutLifetimeMs = 30 * 60 * 1000;

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Creates the Checkout at Pay: prices each Bag line at its Store Price, holds its Stock and
 * schedules the 30-minute expiry. Any earlier pending Checkout of the Customer's is released
 * first, since the Bag it came from has been submitted again.
 */
export async function startCheckout(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  customer: Doc<"customers">,
  bag: BagRequest,
  name: string | undefined,
): Promise<Id<"checkouts">> {
  const trimmedName = name?.trim();
  if (!customer.name && !trimmedName) {
    refuse("NAME_REQUIRED", "Tell us your name so we know who's picking up.");
  }
  if (bag.length === 0) refuse("EMPTY_BAG", "Your bag is empty.");

  for (const pending of await ctx.db
    .query("checkouts")
    .withIndex("by_customer_and_status", (q) =>
      q.eq("customerId", customer._id).eq("status", "pending"),
    )
    .collect()) {
    await endCheckout(ctx, pending, "released");
  }

  const lines: CheckoutLine[] = [];
  for (const { variantId, quantity } of mergeLines(bag)) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      refuse("INVALID_QUANTITY", "Pick at least 1 of each item.");
    }
    const variant = await ctx.db.get(variantId);
    const product = variant && (await ctx.db.get(variant.productId));
    if (
      !variant ||
      !product ||
      product.status !== "published" ||
      !product.sellInStock ||
      variant.storePrice === undefined
    ) {
      refuse("NOT_FOR_SALE", "Something in your bag isn't for sale any more.");
    }
    const { available } = stockCounts(variant);
    if (available < quantity) {
      refuse(
        "NOT_ENOUGH_STOCK",
        available > 0
          ? `Only ${available} of ${product.name} left. Lower the quantity to continue.`
          : `${product.name} just sold out. Remove it to continue.`,
      );
    }
    lines.push({
      variantId,
      productName: product.name,
      variantLabel: variant.optionValues.join(" / "),
      quantity,
      unitPrice: variant.storePrice,
    });
  }

  if (trimmedName && !customer.name) await ctx.db.patch(customer._id, { name: trimmedName });

  const expiresAt = Date.now() + checkoutLifetimeMs;
  const checkoutId = await ctx.db.insert("checkouts", {
    customerId: customer._id,
    lines,
    fulfilment: { method: "pickup" },
    total: lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    status: "pending",
    expiresAt,
  });
  for (const line of lines) {
    await ctx.db.insert("checkoutHolds", {
      checkoutId,
      kind: "stock",
      variantId: line.variantId,
      quantity: line.quantity,
      status: "active",
    });
    await moveHeld(ctx, line.variantId, line.quantity);
  }
  await ctx.scheduler.runAt(expiresAt, internal.system.checkout.expire, { checkoutId });
  return checkoutId;
}

/** One line per Variant, quantities added up. */
function mergeLines(bag: BagRequest): BagRequest {
  const merged = new Map<Id<"variants">, number>();
  for (const { variantId, quantity } of bag) {
    merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
  }
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** Moves a Variant's cached held count, in the same mutation as the hold that changes it. */
async function moveHeld(ctx: Pick<MutationCtx, "db">, variantId: Id<"variants">, by: number) {
  const variant = await ctx.db.get(variantId);
  if (!variant) return;
  await ctx.db.patch(variantId, { stockHeld: Math.max(0, stockCounts(variant).held + by) });
}

/** The Checkout's holds still setting Stock aside. */
export async function activeHolds(ctx: Pick<MutationCtx, "db">, checkoutId: Id<"checkouts">) {
  const holds = await ctx.db
    .query("checkoutHolds")
    .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
    .collect();
  return holds.filter((hold) => hold.status === "active");
}

/**
 * Ends an unpaid Checkout: `expired` when its 30 minutes run out, `released` when the Bag
 * changed. Its holds lapse or are released together and their Stock is back on sale.
 * A Checkout that isn't pending is left alone, so a stale expiry job does nothing.
 */
export async function endCheckout(
  ctx: Pick<MutationCtx, "db">,
  checkout: Doc<"checkouts">,
  status: "expired" | "released",
) {
  if (checkout.status !== "pending") return;
  for (const hold of await activeHolds(ctx, checkout._id)) {
    await ctx.db.patch(hold._id, { status: status === "expired" ? "lapsed" : "released" });
    await moveHeld(ctx, hold.variantId, -hold.quantity);
  }
  await ctx.db.patch(checkout._id, { status });
}

/**
 * Marks a paid Checkout's active holds converted and stops holding their units, returning
 * them so the caller records the Sold movements against the order it creates.
 */
export async function convertHolds(
  ctx: Pick<MutationCtx, "db">,
  checkoutId: Id<"checkouts">,
): Promise<Doc<"checkoutHolds">[]> {
  const holds = await activeHolds(ctx, checkoutId);
  for (const hold of holds) {
    await ctx.db.patch(hold._id, { status: "converted" });
    await moveHeld(ctx, hold.variantId, -hold.quantity);
  }
  return holds;
}
