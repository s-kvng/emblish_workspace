import { ConvexError, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { productOption } from "../schema";
import {
  comboKey,
  MAX_OPTIONS,
  normalizeSku,
  publishChecklist,
  slugFor,
  variantCombinations,
} from "./catalog";
import { buyableNow } from "./shelf";
import { hasStockHistory, stockCounts } from "./stock";

/** The wizard's whole Product, saved in one go at its Review step. */
export type ProductDraft = {
  productId?: Id<"products">;
  name: string;
  description: string;
  categoryId?: Id<"categories">;
  gallery: Id<"_storage">[];
  options: Infer<typeof productOption>[];
  variants: {
    variantId?: Id<"variants">;
    optionValues: string[];
    sku?: string;
    storePrice?: number;
    imageId?: Id<"_storage">;
  }[];
  sellInStock: boolean;
};

export async function getProduct(ctx: Pick<QueryCtx, "db">, productId: Id<"products">) {
  const product = await ctx.db.get(productId);
  if (!product) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "That Product doesn't exist.",
    });
  }
  return product;
}

export async function listVariants(ctx: Pick<QueryCtx, "db">, productId: Id<"products">) {
  return await ctx.db
    .query("variants")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
}

/** The name's slug, or the first of "-2", "-3", … that no other Product has. */
async function uniqueSlug(ctx: Pick<QueryCtx, "db">, name: string) {
  const base = slugFor(name);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!taken) return slug;
  }
}

function invalidOptions(message: string): never {
  throw new ConvexError({ code: "INVALID_OPTIONS", message });
}

/** Up to 3 named options, each with at least one value, trimmed, with no repeats. */
function cleanOptions(options: ProductDraft["options"]): ProductDraft["options"] {
  if (options.length > MAX_OPTIONS)
    invalidOptions(`A Product can have up to ${MAX_OPTIONS} options.`);
  const names = new Set<string>();
  return options.map((option) => {
    const name = option.name.trim();
    if (!name) invalidOptions("Give every option a name, such as Size or Colour.");
    if (names.has(name.toLowerCase())) invalidOptions(`There are two options called ${name}.`);
    names.add(name.toLowerCase());
    const values = option.values.map((value) => value.trim());
    if (values.length === 0 || values.some((value) => !value)) {
      invalidOptions(`Give ${name} at least one value.`);
    }
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
      invalidOptions(`${name} has the same value twice.`);
    }
    return { name, values };
  });
}

/** The Variants must be exactly one per combination of the options' values. */
function assertVariantsMatchOptions(
  options: ProductDraft["options"],
  variants: { optionValues: string[] }[],
) {
  const expected = variantCombinations(options).map(comboKey).sort();
  const given = variants.map((variant) => comboKey(variant.optionValues)).sort();
  if (expected.join("\n") !== given.join("\n")) {
    throw new ConvexError({
      code: "INVALID_VARIANTS",
      message: "The Variants don't match the options. Go back to Options and try again.",
    });
  }
}

/**
 * Every SKU is used once across the store. Within the Product being saved, SKUs may move
 * between its Variants, since every one of them is rewritten by this save.
 */
async function assertSkusUnique(
  ctx: Pick<QueryCtx, "db">,
  productId: Id<"products"> | undefined,
  variants: { sku?: string }[],
) {
  const seen = new Set<string>();
  for (const { sku } of variants) {
    if (sku === undefined) continue;
    const holder = await ctx.db
      .query("variants")
      .withIndex("by_sku", (q) => q.eq("sku", sku))
      .first();
    if (seen.has(sku) || (holder && holder.productId !== productId)) {
      throw new ConvexError({
        code: "DUPLICATE_SKU",
        message: `The SKU ${sku} is already used. Give this Variant another one.`,
      });
    }
    seen.add(sku);
  }
}

/**
 * Store Prices are whole pesewas above zero, and only an Owner may set, change or clear one;
 * Staff send back whatever price a Variant already has.
 */
function assertStorePricesAllowed(
  actor: Doc<"staff">,
  variants: { variantId?: Id<"variants">; storePrice?: number }[],
  existing: Doc<"variants">[],
) {
  for (const { variantId, storePrice } of variants) {
    if (storePrice !== undefined && !(Number.isInteger(storePrice) && storePrice > 0)) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "A Store Price must be more than GH₵0, to the pesewa.",
      });
    }
    const current = existing.find((variant) => variant._id === variantId)?.storePrice;
    if (storePrice !== current && actor.role !== "owner") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only an Owner can set Store Prices. Save it as a Draft for them to price.",
      });
    }
  }
}

function invalidPhoto(message: string): never {
  throw new ConvexError({ code: "INVALID_PHOTO", message });
}

/**
 * Gallery photos are uploaded files, each once, and a photo new to this gallery isn't in any
 * other Product's (removing it here deletes the file). A Variant's photo is one of them.
 */
async function assertPhotos(
  ctx: Pick<QueryCtx, "db">,
  product: Doc<"products"> | undefined,
  gallery: Id<"_storage">[],
  variants: { imageId?: Id<"_storage"> }[],
) {
  if (new Set(gallery).size !== gallery.length) invalidPhoto("A photo is in the gallery twice.");
  for (const storageId of gallery) {
    if (!(await ctx.db.system.get(storageId))) invalidPhoto("A photo didn't finish uploading.");
  }
  const added = gallery.filter((storageId) => !product?.gallery.includes(storageId));
  if (added.length > 0) {
    for await (const other of ctx.db.query("products")) {
      if (other._id !== product?._id && other.gallery.some((id) => added.includes(id))) {
        invalidPhoto("That photo belongs to another Product. Upload it again for this one.");
      }
    }
  }
  if (variants.some((variant) => variant.imageId && !gallery.includes(variant.imageId))) {
    invalidPhoto("Pick each Variant's photo from the Product's photos.");
  }
}

/** A Product's Variants in the order their option combinations come. */
export function inOptionOrder<T extends { optionValues: string[] }>(
  options: ProductDraft["options"],
  variants: T[],
): T[] {
  const order = new Map(variantCombinations(options).map((combo, i) => [comboKey(combo), i]));
  return [...variants].sort(
    (a, b) =>
      (order.get(comboKey(a.optionValues)) ?? 0) - (order.get(comboKey(b.optionValues)) ?? 0),
  );
}

/** Creates or replaces a Product and its Variants as a Draft, returning its id. */
export async function saveProductDraft(
  ctx: Pick<MutationCtx, "db" | "storage">,
  actor: Doc<"staff">,
  draft: ProductDraft,
): Promise<Id<"products">> {
  const current = draft.productId ? await getProduct(ctx, draft.productId) : undefined;
  if (current?.status === "archived") {
    throw new ConvexError({
      code: "ARCHIVED",
      message: "This Product is archived. Restore it before editing.",
    });
  }
  const name = draft.name.trim();
  if (!name) {
    throw new ConvexError({
      code: "INVALID_NAME",
      message: "Give the Product a name.",
    });
  }
  const options = cleanOptions(draft.options);
  const variants = draft.variants.map((variant) => ({
    ...variant,
    optionValues: variant.optionValues.map((value) => value.trim()),
    sku: variant.sku === undefined ? undefined : normalizeSku(variant.sku) || undefined,
  }));
  assertVariantsMatchOptions(options, variants);
  await assertSkusUnique(ctx, current?._id, variants);
  await assertPhotos(ctx, current, draft.gallery, variants);

  const fields = {
    name,
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    gallery: draft.gallery,
    options,
    sellInStock: draft.sellInStock,
    status: "draft" as const,
  };

  let productId: Id<"products">;
  let existing: Doc<"variants">[] = [];
  if (current) {
    productId = current._id;
    existing = await listVariants(ctx, productId);
    assertStorePricesAllowed(actor, variants, existing);
    await ctx.db.patch(productId, fields);
    // Photos removed from the gallery have nothing else pointing at them.
    for (const storageId of current.gallery) {
      if (!draft.gallery.includes(storageId)) await ctx.storage.delete(storageId);
    }
  } else {
    assertStorePricesAllowed(actor, variants, existing);
    productId = await ctx.db.insert("products", {
      ...fields,
      slug: await uniqueSlug(ctx, name),
    });
  }

  const kept = new Set<Id<"variants">>();
  for (const variant of variants) {
    const stored = {
      optionValues: variant.optionValues,
      sku: variant.sku,
      storePrice: variant.storePrice,
      imageId: variant.imageId,
    };
    if (variant.variantId) {
      if (!existing.some((current) => current._id === variant.variantId)) {
        throw new ConvexError({
          code: "INVALID_VARIANTS",
          message: "That Variant belongs to another Product.",
        });
      }
      kept.add(variant.variantId);
      await ctx.db.patch(variant.variantId, stored);
    } else {
      await ctx.db.insert("variants", { productId, ...stored, stockOnHand: 0, stockHeld: 0 });
    }
  }
  // A Variant with Stock history stays, so its ledger keeps resolving; until Variants can be
  // archived, such a Variant can't be removed.
  for (const variant of existing) {
    if (kept.has(variant._id)) continue;
    if (await hasStockHistory(ctx, variant._id)) {
      throw new ConvexError({
        code: "VARIANT_HAS_STOCK",
        message: `${variant.optionValues.join(" / ") || "This Variant"} has Stock history, so it can't be removed.`,
      });
    }
    await ctx.db.delete(variant._id);
  }
  return productId;
}

/** The "Ready to publish?" checklist for a saved Product. */
export function savedProductChecklist(product: Doc<"products">, variants: Doc<"variants">[]) {
  return publishChecklist({
    name: product.name,
    categoryId: product.categoryId,
    photoCount: product.gallery.length,
    sellInStock: product.sellInStock,
    variants,
  });
}

/** Publishes a saved Product, refusing with what's missing while the checklist isn't clear. */
export async function publishProduct(ctx: Pick<MutationCtx, "db">, productId: Id<"products">) {
  const product = await getProduct(ctx, productId);
  const missing = savedProductChecklist(product, await listVariants(ctx, productId))
    .filter((check) => !check.ok)
    .map((check) => check.label);
  if (missing.length > 0) {
    throw new ConvexError({
      code: "PUBLISH_BLOCKED",
      missing,
      message: `Can't publish yet. Missing: ${missing.join(", ")}.`,
    });
  }
  await ctx.db.patch(productId, { status: "published" });
}

/** Hides a Product from the Storefront for good, keeping it so past orders still resolve. */
export async function archiveProduct(ctx: Pick<MutationCtx, "db">, productId: Id<"products">) {
  await getProduct(ctx, productId);
  await ctx.db.patch(productId, { status: "archived" });
}

/** Brings an archived Product back as a Draft, to be checked and published again. */
export async function restoreProduct(ctx: Pick<MutationCtx, "db">, productId: Id<"products">) {
  const product = await getProduct(ctx, productId);
  if (product.status === "archived") await ctx.db.patch(productId, { status: "draft" });
}

/**
 * The Products Customers can see: Published ones only, never Drafts or archived ones,
 * optionally in one Category; newest first.
 */
export async function listStorefrontProducts(
  ctx: Pick<QueryCtx, "db">,
  categoryId?: Id<"categories">,
) {
  return await ctx.db
    .query("products")
    .withIndex("by_status_and_category", (q) =>
      categoryId === undefined
        ? q.eq("status", "published")
        : q.eq("status", "published").eq("categoryId", categoryId),
    )
    .order("desc")
    .collect();
}

/**
 * A Product's Variants as Customers see them, in option order: a Store Price only while the
 * Product is sold In-stock, and the Stock they can buy now, never below zero.
 */
export async function shelfVariants(ctx: Pick<QueryCtx, "db">, product: Doc<"products">) {
  const variants = inOptionOrder(product.options, await listVariants(ctx, product._id));
  return variants.map((variant) => ({
    _id: variant._id,
    optionValues: variant.optionValues,
    storePrice: product.sellInStock ? variant.storePrice : undefined,
    inStock: Math.max(0, stockCounts(variant).available),
    imageId: variant.imageId,
  }));
}

/** A Product's card on the Storefront's grids, or null if it has no Store Price to show. */
export async function shelfCard(ctx: Pick<QueryCtx, "db" | "storage">, product: Doc<"products">) {
  const variants = await shelfVariants(ctx, product);
  const buyable = variants.filter(buyableNow);
  // Sold out, it shows the price it last sold from.
  const prices = (buyable.length > 0 ? buyable : variants).flatMap((variant) =>
    variant.storePrice === undefined ? [] : [variant.storePrice],
  );
  // Publishing needs a Store Price on every Variant, so this only guards bad data.
  if (prices.length === 0) return null;
  const cover = product.gallery[0];
  return {
    slug: product.slug,
    name: product.name,
    coverUrl: (cover && (await ctx.storage.getUrl(cover))) || undefined,
    fromPrice: Math.min(...prices),
    soldOut: buyable.length === 0,
  };
}

/** The In-stock grid: Published Products sold In-stock, ones with Stock before sold-out ones. */
export async function shelfCards(
  ctx: Pick<QueryCtx, "db" | "storage">,
  categoryId?: Id<"categories">,
) {
  const products = (await listStorefrontProducts(ctx, categoryId)).filter(
    (product) => product.sellInStock,
  );
  const cards = (await Promise.all(products.map((product) => shelfCard(ctx, product)))).filter(
    (card) => card !== null,
  );
  return [...cards.filter((card) => !card.soldOut), ...cards.filter((card) => card.soldOut)];
}

/** A Published Product by its slug; Drafts and archived Products aren't found. */
export async function findStorefrontProduct(ctx: Pick<QueryCtx, "db">, slug: string) {
  const product = await ctx.db
    .query("products")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return product?.status === "published" ? product : null;
}
