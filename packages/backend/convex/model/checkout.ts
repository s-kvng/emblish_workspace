import { ConvexError, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { checkoutLine } from "../schema";
import { deliveryFeeToday, type FulfilmentRequest, freezeFulfilment } from "./fulfilment";
import { stockCounts } from "./stock";
import { unitsLeft, windowRowFor } from "./windowLookups";

export type CheckoutLine = Infer<typeof checkoutLine>;

/** What Pay submits: the Bag's Variants and quantities, Pre-order lines naming their window. */
export type BagRequest = {
  variantId: Id<"variants">;
  quantity: number;
  windowId?: Id<"orderWindows">;
}[];

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

/** The Checkout's In-stock lines, which become its one Store Order. */
export function storeLines(lines: CheckoutLine[]) {
  return lines.filter((line) => line.orderWindowId === undefined);
}

/** The Checkout's Pre-order lines grouped by Order Window, each group one Pre-order. */
export function preorderGroups(lines: CheckoutLine[]) {
  const groups = new Map<Id<"orderWindows">, CheckoutLine[]>();
  for (const line of lines) {
    if (line.orderWindowId === undefined) continue;
    groups.set(line.orderWindowId, [...(groups.get(line.orderWindowId) ?? []), line]);
  }
  return [...groups].map(([orderWindowId, windowLines]) => ({
    orderWindowId,
    lines: windowLines,
  }));
}

/**
 * How many orders a Checkout becomes, each delivered (and charged its Delivery Fee) on its own:
 * at most one Store Order, plus one Pre-order per Order Window.
 */
export function orderCount(lines: CheckoutLine[]) {
  return (storeLines(lines).length > 0 ? 1 : 0) + preorderGroups(lines).length;
}

/**
 * The fixed-zone Delivery Fee a Checkout charges now: the Store Order's only, since each
 * Pre-order pays its own on its Shipping Fee Invoice. None for Pickup or Elsewhere.
 */
export function deliveryFeesToday(checkout: Pick<Doc<"checkouts">, "lines" | "fulfilment">) {
  return storeLines(checkout.lines).length > 0 ? deliveryFeeToday(checkout.fulfilment) : 0;
}

/**
 * Creates the Checkout at Pay: prices each Bag line at its Store Price, freezes the
 * fulfilment and its Delivery Fee (once per resulting order), holds its Stock and
 * schedules the 30-minute expiry. Any earlier pending Checkout of the Customer's is released
 * first, since the Bag it came from has been submitted again.
 */
export async function startCheckout(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  customer: Doc<"customers">,
  bag: BagRequest,
  name: string | undefined,
  fulfilmentRequest: FulfilmentRequest = { method: "pickup" },
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
  for (const request of mergeLines(bag)) {
    if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
      refuse("INVALID_QUANTITY", "Pick at least 1 of each item.");
    }
    lines.push(
      request.windowId === undefined
        ? await priceInStock(ctx, request)
        : await pricePreorder(ctx, request, request.windowId),
    );
  }
  await assertMinimums(ctx, lines);

  const fulfilment = await freezeFulfilment(
    ctx,
    { name: customer.name ?? trimmedName, phone: customer.phone },
    fulfilmentRequest,
  );
  if (trimmedName && !customer.name) await ctx.db.patch(customer._id, { name: trimmedName });

  const expiresAt = Date.now() + checkoutLifetimeMs;
  const checkoutId = await ctx.db.insert("checkouts", {
    customerId: customer._id,
    lines,
    fulfilment,
    total:
      lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) +
      deliveryFeesToday({ lines, fulfilment }),
    status: "pending",
    expiresAt,
  });
  for (const line of lines) {
    const hold = {
      checkoutId,
      variantId: line.variantId,
      quantity: line.quantity,
    };
    if (line.orderWindowId === undefined) {
      await ctx.db.insert("checkoutHolds", {
        ...hold,
        kind: "stock",
        status: "active",
      });
    } else {
      const row = await windowRowFor(ctx, line.orderWindowId, line.variantId);
      if (row?.cap === undefined) continue;
      await ctx.db.insert("checkoutHolds", {
        ...hold,
        kind: "windowCap",
        orderWindowId: line.orderWindowId,
        status: "active",
      });
    }
    await moveHeld(ctx, { ...hold, orderWindowId: line.orderWindowId }, line.quantity);
  }
  await ctx.scheduler.runAt(expiresAt, internal.system.checkout.expire, { checkoutId });
  return checkoutId;
}

/** One line per Variant In-stock and per Variant in each window, quantities added up. */
function mergeLines(bag: BagRequest): BagRequest {
  const merged = new Map<string, BagRequest[number]>();
  for (const line of bag) {
    const key = `${line.variantId}:${line.windowId ?? ""}`;
    const earlier = merged.get(key);
    merged.set(key, {
      ...line,
      quantity: (earlier?.quantity ?? 0) + line.quantity,
    });
  }
  return [...merged.values()];
}

/** An In-stock line at its Store Price, refused unless Stock still covers it. */
async function priceInStock(
  ctx: Pick<QueryCtx, "db">,
  { variantId, quantity }: BagRequest[number],
): Promise<CheckoutLine> {
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
  return {
    variantId,
    productName: product.name,
    variantLabel: variant.optionValues.join(" / "),
    quantity,
    unitPrice: variant.storePrice,
  };
}

/** A Pre-order line at its window's price, refused unless the window is open with room under any cap. */
async function pricePreorder(
  ctx: Pick<QueryCtx, "db">,
  { variantId, quantity }: BagRequest[number],
  windowId: Id<"orderWindows">,
): Promise<CheckoutLine> {
  const variant = await ctx.db.get(variantId);
  const window = await ctx.db.get(windowId);
  const product = variant && (await ctx.db.get(variant.productId));
  if (
    !variant ||
    !window ||
    !product ||
    product.status !== "published" ||
    window.productId !== product._id ||
    window.stage !== "open" ||
    window.closesAt <= Date.now()
  ) {
    refuse(
      "PREORDER_CLOSED",
      `Pre-orders for ${product?.name ?? "something in your bag"} have closed. Remove it to continue.`,
    );
  }
  const row = await windowRowFor(ctx, windowId, variantId);
  if (!row || row.preorderPrice === undefined) {
    refuse("NOT_FOR_SALE", "Something in your bag isn't for sale any more.");
  }
  const left = unitsLeft(row);
  if (left !== undefined && left < quantity) {
    refuse(
      "WINDOW_FULL",
      left > 0
        ? `Only ${left} of ${product.name} left to pre-order. Lower the quantity to continue.`
        : `Pre-orders for ${product.name} are full for that option. Remove it to continue.`,
    );
  }
  return {
    variantId,
    orderWindowId: windowId,
    productName: product.name,
    variantLabel: variant.optionValues.join(" / "),
    quantity,
    unitPrice: row.preorderPrice,
  };
}

/** Each Pre-order meets its window's Minimum Order Quantity, counted across the window's Variants. */
async function assertMinimums(ctx: Pick<QueryCtx, "db">, lines: CheckoutLine[]) {
  for (const group of preorderGroups(lines)) {
    const window = await ctx.db.get(group.orderWindowId);
    const minimum = window?.minimumOrderQuantity;
    const units = group.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (minimum !== undefined && units < minimum) {
      refuse(
        "BELOW_MINIMUM",
        `${group.lines[0]?.productName} needs at least ${minimum} per Pre-order, any mix of options. You have ${units}.`,
      );
    }
  }
}

/**
 * Moves the cached held count a hold counts against, in the same mutation as the hold that
 * changes it: the Variant's Stock for a Stock Hold, the window's row for a window-cap hold.
 */
async function moveHeld(
  ctx: Pick<MutationCtx, "db">,
  hold: { variantId: Id<"variants">; orderWindowId?: Id<"orderWindows"> },
  by: number,
) {
  if (hold.orderWindowId !== undefined) {
    const row = await windowRowFor(ctx, hold.orderWindowId, hold.variantId);
    if (row) await ctx.db.patch(row._id, { held: Math.max(0, row.held + by) });
    return;
  }
  const variant = await ctx.db.get(hold.variantId);
  if (!variant) return;
  await ctx.db.patch(hold.variantId, {
    stockHeld: Math.max(0, stockCounts(variant).held + by),
  });
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
 * changed. Its Stock Holds and window-cap holds lapse or are released together, so their
 * Stock and window places are back on sale.
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
    await moveHeld(ctx, hold, -hold.quantity);
  }
  await ctx.db.patch(checkout._id, { status });
}

/**
 * Marks a paid Checkout's active holds converted and stops holding their units, returning
 * them so the caller records the Sold movements, and the windows' Pre-ordered units, against
 * the orders it creates.
 */
export async function convertHolds(
  ctx: Pick<MutationCtx, "db">,
  checkoutId: Id<"checkouts">,
): Promise<Doc<"checkoutHolds">[]> {
  const holds = await activeHolds(ctx, checkoutId);
  for (const hold of holds) {
    await ctx.db.patch(hold._id, { status: "converted" });
    await moveHeld(ctx, hold, -hold.quantity);
  }
  return holds;
}
