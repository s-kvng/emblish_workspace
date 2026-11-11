import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publishChecklist } from "./catalog";
import { getProduct, listVariants } from "./products";
import { listWindowVariants, windowInStage } from "./windowLookups";

const DAY = 24 * 60 * 60 * 1000;

/** What the opening wizard saves: the offered Variants with their prices and caps, and the window's terms. */
export type WindowDraft = {
  windowId?: Id<"orderWindows">;
  productId: Id<"products">;
  variants: {
    variantId: Id<"variants">;
    preorderPrice?: number;
    cap?: number;
  }[];
  closesAt: number;
  minimumOrderQuantity?: number;
  shippingFeeEstimate?: number;
};

function refuse(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new ConvexError({ code, message, ...extra });
}

/** One Order Window, or a NOT_FOUND refusal. */
export async function getWindow(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">) {
  const window = await ctx.db.get(windowId);
  if (!window) refuse("NOT_FOUND", "That Order Window doesn't exist.");
  return window;
}

function wholeAbove(value: number | undefined, min: number) {
  return value === undefined || (Number.isSafeInteger(value) && value >= min);
}

/** Checks the wizard's numbers: whole pesewas above zero, caps and minimums of at least 1. */
function assertTerms(draft: WindowDraft) {
  if (draft.variants.length === 0) {
    refuse("NO_VARIANTS", "Pick at least one Variant that can be pre-ordered.");
  }
  if (new Set(draft.variants.map((v) => v.variantId)).size !== draft.variants.length) {
    refuse("INVALID_VARIANTS", "A Variant is in the window twice.");
  }
  for (const row of draft.variants) {
    if (!wholeAbove(row.preorderPrice, 1)) {
      refuse("INVALID_PRICE", "A Pre-order price must be more than GH₵0, to the pesewa.");
    }
    if (!wholeAbove(row.cap, 1)) refuse("INVALID_CAP", "A cap must be at least 1 unit.");
  }
  if (!wholeAbove(draft.minimumOrderQuantity, 1)) {
    refuse("INVALID_MINIMUM", "The Minimum Order Quantity must be at least 1 unit.");
  }
  if (!wholeAbove(draft.shippingFeeEstimate, 1)) {
    refuse("INVALID_FEE", "The Shipping Fee estimate must be more than GH₵0, to the pesewa.");
  }
  if (!Number.isFinite(draft.closesAt)) refuse("INVALID_DATE", "Pick a close date.");
}

/** Opening needs the Product publishable (bar Store Prices it isn't sold at) and a price on every row. */
async function assertCanOpen(
  ctx: Pick<QueryCtx, "db">,
  product: Doc<"products">,
  draft: WindowDraft,
  windowId: Id<"orderWindows"> | undefined,
) {
  const missing = publishChecklist({
    name: product.name,
    categoryId: product.categoryId,
    photoCount: product.gallery.length,
    sellInStock: product.sellInStock,
    offeredForPreorder: true,
    variants: await listVariants(ctx, product._id),
  })
    .filter((check) => !check.ok)
    .map((check) => check.label);
  if (missing.length > 0) {
    refuse("WINDOW_BLOCKED", `Can't open yet. The Product is missing: ${missing.join(", ")}.`, {
      missing,
    });
  }
  if (draft.variants.some((row) => row.preorderPrice === undefined)) {
    refuse(
      "PRICES_MISSING",
      "Every offered Variant needs a Pre-order price from the Owner. Save a draft for them.",
    );
  }
  if (draft.closesAt <= Date.now())
    refuse("INVALID_DATE", "The close date has to be in the future.");
  const open = await windowInStage(ctx, product._id, "open");
  if (open && open._id !== windowId) {
    refuse("WINDOW_ALREADY_OPEN", `W${open.number} is already open. A Product has one at a time.`);
  }
}

/**
 * Creates or updates a draft or open window from the wizard, opening it when asked. Only an
 * Owner may set or change a Pre-order price; Staff send back whatever each row already has.
 * Opening a window on a Draft Product publishes the Product with it.
 */
export async function saveWindow(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  draft: WindowDraft,
  open: boolean,
): Promise<{ windowId: Id<"orderWindows">; stage: "draft" | "open" }> {
  const product = await getProduct(ctx, draft.productId);
  if (product.status === "archived") {
    refuse("ARCHIVED", "This Product is archived. Restore it before opening a window.");
  }
  const current = draft.windowId ? await getWindow(ctx, draft.windowId) : undefined;
  if (current && current.productId !== product._id) {
    refuse("INVALID_WINDOW", "That window belongs to another Product.");
  }
  if (current && current.stage !== "draft" && current.stage !== "open") {
    refuse("WINDOW_CLOSED", `W${current.number} has closed, so it can't be changed here.`);
  }
  assertTerms(draft);
  const productVariants = await listVariants(ctx, product._id);
  if (draft.variants.some((row) => !productVariants.some((v) => v._id === row.variantId))) {
    refuse("INVALID_VARIANTS", "That Variant belongs to another Product.");
  }
  const existing = current ? await listWindowVariants(ctx, current._id) : [];
  for (const row of draft.variants) {
    const stored = existing.find((e) => e.variantId === row.variantId)?.preorderPrice;
    if (row.preorderPrice !== stored && actor.role !== "owner") {
      refuse(
        "FORBIDDEN",
        "Only an Owner can set Pre-order prices. Save a draft for them to price.",
      );
    }
  }
  for (const row of existing) {
    const kept = draft.variants.find((r) => r.variantId === row.variantId);
    const taken = row.preordered + row.held;
    if (!kept && taken > 0) {
      refuse("VARIANT_ORDERED", "A Variant with Pre-orders can't be taken out of the window.");
    }
    if (kept?.cap !== undefined && kept.cap < taken) {
      refuse("CAP_BELOW_ORDERS", `That cap is below the ${taken} units already ordered.`);
    }
  }
  const stays = current?.stage === "open";
  if (open || stays) await assertCanOpen(ctx, product, draft, current?._id);
  if (!current && (await windowInStage(ctx, product._id, "draft"))) {
    refuse("DRAFT_EXISTS", "This Product already has a draft window. Finish that one instead.");
  }

  const terms = {
    closesAt: draft.closesAt,
    minimumOrderQuantity: draft.minimumOrderQuantity,
    shippingFeeEstimate: draft.shippingFeeEstimate,
  };
  let windowId: Id<"orderWindows">;
  if (current) {
    windowId = current._id;
    await ctx.db.patch(windowId, terms);
  } else {
    const number = product.nextWindowNumber ?? 1;
    await ctx.db.patch(product._id, { nextWindowNumber: number + 1 });
    windowId = await ctx.db.insert("orderWindows", {
      productId: product._id,
      number,
      stage: "draft",
      createdBy: actor._id,
      ...terms,
    });
  }
  for (const row of existing) {
    if (!draft.variants.some((r) => r.variantId === row.variantId)) await ctx.db.delete(row._id);
  }
  for (const row of draft.variants) {
    const fields = { preorderPrice: row.preorderPrice, cap: row.cap };
    const stored = existing.find((e) => e.variantId === row.variantId);
    if (stored) await ctx.db.patch(stored._id, fields);
    else {
      await ctx.db.insert("windowVariants", {
        orderWindowId: windowId,
        variantId: row.variantId,
        ...fields,
        preordered: 0,
        held: 0,
      });
    }
  }

  if (stays) {
    if (current && current.closesAt !== draft.closesAt) await scheduleClose(ctx, windowId);
    return { windowId, stage: "open" };
  }
  if (!open) return { windowId, stage: "draft" };
  await ctx.db.patch(windowId, { stage: "open", opensAt: Date.now() });
  await ctx.db.insert("windowStageEvents", {
    orderWindowId: windowId,
    stage: "open",
    staffId: actor._id,
  });
  if (product.status === "draft") await ctx.db.patch(product._id, { status: "published" });
  await scheduleClose(ctx, windowId);
  return { windowId, stage: "open" };
}

/** Replaces the window's auto-close job with one at its current `closesAt`. */
async function scheduleClose(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  windowId: Id<"orderWindows">,
) {
  const window = await getWindow(ctx, windowId);
  if (window.closeJobId) await ctx.scheduler.cancel(window.closeJobId);
  const closeJobId = await ctx.scheduler.runAt(window.closesAt, internal.system.windows.close, {
    windowId,
  });
  await ctx.db.patch(windowId, { closeJobId });
}

/** Throws away a draft window that never opened, with its offered Variants. */
export async function discardDraft(ctx: Pick<MutationCtx, "db">, windowId: Id<"orderWindows">) {
  const window = await getWindow(ctx, windowId);
  if (window.stage !== "draft") {
    refuse("NOT_DRAFT", `W${window.number} has opened, so it can't be discarded.`);
  }
  for (const row of await listWindowVariants(ctx, windowId)) await ctx.db.delete(row._id);
  await ctx.db.delete(windowId);
}

/** Moves an open window's close date on by whole days, replacing its auto-close job. */
export async function extendWindow(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  windowId: Id<"orderWindows">,
  days: number,
) {
  const window = await getWindow(ctx, windowId);
  if (window.stage !== "open") refuse("NOT_OPEN", `W${window.number} isn't open.`);
  if (!Number.isSafeInteger(days) || days < 1 || days > 60) {
    refuse("INVALID_DAYS", "Extend by 1 to 60 days.");
  }
  await ctx.db.patch(windowId, { closesAt: window.closesAt + days * DAY });
  await scheduleClose(ctx, windowId);
}

/**
 * Closes an open window: Staff closing it now, or the auto-close job. Closing texts no one.
 * A window that isn't open is left alone, so a stale job does nothing.
 */
export async function closeWindow(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  window: Doc<"orderWindows">,
  staffId: Id<"staff"> | undefined,
) {
  if (window.stage !== "open") return;
  // The auto-close job is the one running when no Staff member closes it.
  if (staffId && window.closeJobId) await ctx.scheduler.cancel(window.closeJobId);
  await ctx.db.patch(window._id, {
    stage: "closed",
    closesAt: Math.min(window.closesAt, Date.now()),
    closeJobId: undefined,
  });
  await ctx.db.insert("windowStageEvents", {
    orderWindowId: window._id,
    stage: "closed",
    staffId,
  });
}
