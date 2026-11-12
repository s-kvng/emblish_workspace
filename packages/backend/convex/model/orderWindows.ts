import { ConvexError, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publishChecklist } from "./catalog";
import type { markableStage } from "../schema";
import { getProduct, listVariants } from "./products";
import { expectedRange, ordersUrl, queueSms, renderSms } from "./sms";
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

/** The stages Staff mark by hand after Closed; Arrived is set by recording the arrival. */
export type MarkableStage = Infer<typeof markableStage>;

/** The stage Staff can mark next, if any: Closed → Ordered from supplier → In transit. */
export function nextMarkableStage(stage: Doc<"orderWindows">["stage"]): MarkableStage | undefined {
  if (stage === "closed") return "orderedFromSupplier";
  if (stage === "orderedFromSupplier") return "inTransit";
  return undefined;
}

export type StageUpdate = {
  stage: MarkableStage;
  /** The expected arrival range: both days or neither. */
  expectedFrom?: number;
  expectedTo?: number;
  note?: string;
  /** Extra units for Stock per offered Variant; only at "Ordered from supplier". */
  storeQuantities?: { variantId: Id<"variants">; quantity: number }[];
};

const NOTE_LIMIT = 200;

/** Checks the sheet's expected dates and note, returning the note trimmed (or dropped if empty). */
function assertStageUpdate(update: StageUpdate) {
  const { expectedFrom, expectedTo } = update;
  if ((expectedFrom === undefined) !== (expectedTo === undefined)) {
    refuse("INVALID_DATES", "Give the expected arrival as a from and a to date.");
  }
  if (expectedFrom !== undefined && expectedTo !== undefined) {
    if (!Number.isFinite(expectedFrom) || !Number.isFinite(expectedTo)) {
      refuse("INVALID_DATES", "Pick the expected arrival dates.");
    }
    if (expectedTo < expectedFrom) {
      refuse("INVALID_DATES", "The expected arrival can't end before it starts.");
    }
  }
  const note = update.note?.trim() || undefined;
  if (note && note.length > NOTE_LIMIT) {
    refuse("INVALID_NOTE", `Keep the note to ${NOTE_LIMIT} characters.`);
  }
  return note;
}

/**
 * Marks a closed window's next stage, in order only, writing its stage event with the acting
 * Staff member, the expected dates and the note.
 */
export async function advanceWindow(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  windowId: Id<"orderWindows">,
  update: StageUpdate,
) {
  const window = await getWindow(ctx, windowId);
  const next = nextMarkableStage(window.stage);
  if (next !== update.stage) {
    refuse(
      "OUT_OF_ORDER",
      next
        ? `W${window.number} can only be marked as the next stage.`
        : `W${window.number} has no stage to mark by hand now.`,
    );
  }
  const note = assertStageUpdate(update);
  const product = await getProduct(ctx, window.productId);
  const holders = await preorderHolders(ctx, windowId);
  const storeQuantities = update.storeQuantities ?? [];
  if (storeQuantities.length > 0 && update.stage !== "orderedFromSupplier") {
    refuse("INVALID_STORE_QUANTITY", "Store Quantity is set when it's ordered from the supplier.");
  }
  await setStoreQuantities(ctx, windowId, storeQuantities);
  await ctx.db.patch(windowId, { stage: update.stage });
  await ctx.db.insert("windowStageEvents", {
    orderWindowId: windowId,
    stage: update.stage,
    staffId: actor._id,
    expectedFrom: update.expectedFrom,
    expectedTo: update.expectedTo,
    note,
    ...(holders.length > 0 ? { texted: holders.length } : {}),
  });
  for (const holder of holders) {
    await queueSms(
      ctx,
      holder.phone,
      stageTemplate[update.stage],
      stageSmsArgs(holder.references, product.name, update),
    );
  }
  return { texted: holders.length };
}

type StoreQuantities = NonNullable<StageUpdate["storeQuantities"]>;

/** Checks and saves Store Quantities: whole units, 0 or more, for Variants offered in the window. */
async function setStoreQuantities(
  ctx: Pick<MutationCtx, "db">,
  windowId: Id<"orderWindows">,
  storeQuantities: StoreQuantities,
) {
  const rows = await listWindowVariants(ctx, windowId);
  for (const { variantId, quantity } of storeQuantities) {
    if (!rows.some((row) => row.variantId === variantId)) {
      refuse("INVALID_VARIANTS", "That Variant isn't offered in this window.");
    }
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      refuse("INVALID_STORE_QUANTITY", "A Store Quantity is a whole number of units, 0 or more.");
    }
  }
  if (new Set(storeQuantities.map((s) => s.variantId)).size !== storeQuantities.length) {
    refuse("INVALID_VARIANTS", "A Variant is listed twice.");
  }
  for (const { variantId, quantity } of storeQuantities) {
    const row = rows.find((r) => r.variantId === variantId);
    if (row) await ctx.db.patch(row._id, { storeQuantity: quantity });
  }
}

/** What "Change expected dates or note" saves: it replaces the current stage's dates and note. */
export type StageChange = Omit<StageUpdate, "stage">;

/** The stage a window's dates, note and Store Quantity can be changed at: a marked one, until arrival. */
function changeableStage(window: Doc<"orderWindows">): MarkableStage {
  if (window.stage !== "orderedFromSupplier" && window.stage !== "inTransit") {
    refuse(
      "NOT_CHANGEABLE",
      window.stage === "arrived"
        ? `W${window.number} has arrived, so its dates can't be changed.`
        : `Mark W${window.number} as ordered from the supplier first.`,
    );
  }
  return window.stage;
}

/** The stage event the window is at now, which holds its expected dates and note. */
async function currentStageEvent(ctx: Pick<QueryCtx, "db">, window: Doc<"orderWindows">) {
  const events = await ctx.db
    .query("windowStageEvents")
    .withIndex("by_window", (q) => q.eq("orderWindowId", window._id))
    .collect();
  const event = [...events].reverse().find((e) => e.stage === window.stage);
  if (!event) refuse("NOT_FOUND", `W${window.number} has no record of its current stage.`);
  return event;
}

/**
 * "Change expected dates or note" on a window's current stage, until it arrives: replaces the
 * stage's expected dates and note with these, recording who changed them, and saves any Store
 * Quantities. New dates text every Pre-order holder; a change to the note alone texts no one.
 */
export async function changeWindowStage(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  windowId: Id<"orderWindows">,
  change: StageChange,
) {
  const window = await getWindow(ctx, windowId);
  const stage = changeableStage(window);
  const note = assertStageUpdate({ ...change, stage });
  await setStoreQuantities(ctx, windowId, change.storeQuantities ?? []);
  const event = await currentStageEvent(ctx, window);
  const { expectedFrom, expectedTo } = change;
  const sameDates = expectedFrom === event.expectedFrom && expectedTo === event.expectedTo;
  if (sameDates && note === event.note) return { texted: 0 };
  await ctx.db.patch(event._id, {
    expectedFrom,
    expectedTo,
    note,
    changedAt: Date.now(),
    changedBy: actor._id,
  });
  if (sameDates || expectedFrom === undefined || expectedTo === undefined) return { texted: 0 };
  const product = await getProduct(ctx, window.productId);
  const holders = await preorderHolders(ctx, windowId);
  for (const holder of holders) {
    await queueSms(ctx, holder.phone, "stageNewDates", {
      references: holder.references,
      productName: product.name,
      expected: expectedRange(expectedFrom, expectedTo),
      ordersUrl: ordersUrl(),
    });
  }
  return { texted: holders.length };
}

/**
 * The "Change expected dates or note" sheet: the stage it changes, how many Customers new dates
 * would text, and the SMS the first of them would get. Null when the window can't be changed.
 */
export async function describeChangeSheet(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  dates: Pick<StageUpdate, "expectedFrom" | "expectedTo">,
) {
  const window = await getWindow(ctx, windowId);
  if (window.stage !== "orderedFromSupplier" && window.stage !== "inTransit") return null;
  const event = await currentStageEvent(ctx, window);
  const product = await getProduct(ctx, window.productId);
  const holders = await preorderHolders(ctx, windowId);
  const from = dates.expectedFrom ?? event.expectedFrom;
  const to = dates.expectedTo ?? event.expectedTo;
  const preview =
    from !== undefined && to !== undefined && to >= from
      ? renderSms("stageNewDates", {
          references: holders[0]?.references ?? ["P-0000"],
          productName: product.name,
          expected: expectedRange(from, to),
          ordersUrl: ordersUrl(),
        })
      : null;
  return { stage: window.stage, customers: holders.length, preview };
}

const stageTemplate = {
  orderedFromSupplier: "stageOrdered",
  inTransit: "stageInTransit",
} as const satisfies Record<MarkableStage, string>;

function stageSmsArgs(
  references: string[],
  productName: string,
  { expectedFrom, expectedTo }: Pick<StageUpdate, "expectedFrom" | "expectedTo">,
) {
  return {
    references,
    productName,
    ...(expectedFrom !== undefined && expectedTo !== undefined
      ? { expected: expectedRange(expectedFrom, expectedTo) }
      : {}),
    ordersUrl: ordersUrl(),
  };
}

/**
 * The Customers holding Pre-orders still awaiting arrival in a window, each with their phone and
 * Pre-order references in the order they were placed: who "Text N Customers" texts.
 */
export async function preorderHolders(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", windowId))
    .collect();
  const byCustomer = new Map<Id<"customers">, string[]>();
  for (const order of orders.sort((a, b) => a.placedAt - b.placedAt)) {
    if (order.kind !== "preorder" || order.status !== "awaitingArrival") continue;
    byCustomer.set(order.customerId, [
      ...(byCustomer.get(order.customerId) ?? []),
      order.reference,
    ]);
  }
  const holders = [];
  for (const [customerId, references] of byCustomer) {
    const customer = await ctx.db.get(customerId);
    if (customer) holders.push({ phone: customer.phone, references });
  }
  return holders;
}

/**
 * The "Mark as <next>" sheet for a window: the stage it would mark, how many Customers it
 * texts, and the SMS the first of them would get with these dates.
 */
export async function describeStageSheet(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  dates: Pick<StageUpdate, "expectedFrom" | "expectedTo">,
) {
  const window = await getWindow(ctx, windowId);
  const next = nextMarkableStage(window.stage);
  if (!next) return { next: null, customers: 0, preview: null };
  const product = await getProduct(ctx, window.productId);
  const holders = await preorderHolders(ctx, windowId);
  const valid =
    dates.expectedFrom !== undefined &&
    dates.expectedTo !== undefined &&
    dates.expectedTo >= dates.expectedFrom;
  const preview = renderSms(
    stageTemplate[next],
    stageSmsArgs(holders[0]?.references ?? ["P-0000"], product.name, valid ? dates : {}),
  );
  return { next, customers: holders.length, preview };
}
