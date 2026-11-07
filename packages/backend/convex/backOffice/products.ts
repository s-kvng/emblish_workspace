import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import {
  archiveProduct,
  getProduct,
  inOptionOrder,
  listVariants,
  publishProduct,
  restoreProduct,
  saveProductDraft,
} from "../model/products";
import { productOption, productStatus } from "../schema";

const variantFields = {
  optionValues: v.array(v.string()),
  sku: v.optional(v.string()),
  /** Integer pesewas. */
  storePrice: v.optional(v.number()),
  imageId: v.optional(v.id("_storage")),
};

/** Each wizard photo is posted to one of these, then saved into the gallery by its storage id. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** More → Products: every Product, for the wizard's start screen. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("products"),
      name: v.string(),
      status: productStatus,
      categoryName: v.optional(v.string()),
      coverUrl: v.optional(v.string()),
      variantCount: v.number(),
      needsPrices: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const products = await ctx.db.query("products").order("desc").collect();
    return await Promise.all(
      products.map(async (product) => {
        const variants = await listVariants(ctx, product._id);
        const category = product.categoryId ? await ctx.db.get(product.categoryId) : null;
        const cover = product.gallery[0];
        return {
          _id: product._id,
          name: product.name,
          status: product.status,
          categoryName: category?.name,
          coverUrl: (cover && (await ctx.storage.getUrl(cover))) || undefined,
          variantCount: variants.length,
          needsPrices: variants.some((variant) => variant.storePrice === undefined),
        };
      }),
    );
  },
});

/** One Product as the wizard edits it. */
export const get = query({
  args: { productId: v.id("products") },
  returns: v.object({
    _id: v.id("products"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    status: productStatus,
    gallery: v.array(v.object({ storageId: v.id("_storage"), url: v.optional(v.string()) })),
    options: v.array(productOption),
    variants: v.array(v.object({ _id: v.id("variants"), ...variantFields })),
    sellInStock: v.boolean(),
  }),
  handler: async (ctx, { productId }) => {
    await requireStaff(ctx);
    const product = await getProduct(ctx, productId);
    const variants = await listVariants(ctx, productId);
    return {
      _id: product._id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      status: product.status,
      gallery: await Promise.all(
        product.gallery.map(async (storageId) => ({
          storageId,
          url: (await ctx.storage.getUrl(storageId)) ?? undefined,
        })),
      ),
      options: product.options,
      variants: inOptionOrder(product.options, variants).map(
        ({ _id, optionValues, sku, storePrice, imageId }) => ({
          _id,
          optionValues,
          sku,
          storePrice,
          imageId,
        }),
      ),
      sellInStock: product.sellInStock,
    };
  },
});

/** The wizard's Review step: saves the whole Product as a Draft, or publishes it. */
export const save = mutation({
  args: {
    productId: v.optional(v.id("products")),
    name: v.string(),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    gallery: v.array(v.id("_storage")),
    options: v.array(productOption),
    variants: v.array(v.object({ variantId: v.optional(v.id("variants")), ...variantFields })),
    sellInStock: v.boolean(),
    publish: v.boolean(),
  },
  returns: v.object({ productId: v.id("products"), status: productStatus }),
  handler: async (ctx, { publish, ...draft }) => {
    const actor = await requireStaff(ctx);
    const productId = await saveProductDraft(ctx, actor, draft);
    // A refused publish throws, so nothing of this save is kept.
    if (publish) await publishProduct(ctx, productId);
    return {
      productId,
      status: publish ? ("published" as const) : ("draft" as const),
    };
  },
});

/** Archived Products disappear from the Storefront but stay for past orders and Receipts. */
export const archive = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    await requireStaff(ctx);
    await archiveProduct(ctx, productId);
    return null;
  },
});

/** An archived Product comes back as a Draft. */
export const restore = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    await requireStaff(ctx);
    await restoreProduct(ctx, productId);
    return null;
  },
});
