// Browsing the catalog is open to anyone, so these queries have no guard (ADR 0001). They only
// ever return Published Products, and only what a Customer may see of them.
import { v } from "convex/values";

import { query } from "../_generated/server";
import { listCategories } from "../model/categories";
import { findStorefrontProduct, shelfCards, shelfVariants } from "../model/products";
import { productOption } from "../schema";

const shelfCardValidator = v.object({
  slug: v.string(),
  name: v.string(),
  coverUrl: v.optional(v.string()),
  /** Integer pesewas: the lowest Store Price that can be bought now, or any when sold out. */
  fromPrice: v.number(),
  soldOut: v.boolean(),
});

/** Home: the Category tiles and the "Ready to take home" grid. */
export const home = query({
  args: {},
  returns: v.object({
    categories: v.array(
      v.object({
        _id: v.id("categories"),
        name: v.string(),
        coverUrl: v.optional(v.string()),
      }),
    ),
    inStock: v.array(shelfCardValidator),
  }),
  handler: async (ctx) => {
    const inStock = await shelfCards(ctx);
    // A tile per Category with something to show, wearing its first card's cover.
    const categories = [];
    for (const category of await listCategories(ctx)) {
      const [first] = await shelfCards(ctx, category._id);
      if (first) {
        categories.push({
          _id: category._id,
          name: category.name,
          coverUrl: first.coverUrl,
        });
      }
    }
    return { categories, inStock };
  },
});

/** A Category page: its Products as Home's cards; null when the id isn't a Category. */
export const category = query({
  args: { categoryId: v.string() },
  returns: v.union(v.null(), v.object({ name: v.string(), products: v.array(shelfCardValidator) })),
  handler: async (ctx, args) => {
    // The id comes from a URL, so it may not be a Category's at all.
    const categoryId = ctx.db.normalizeId("categories", args.categoryId);
    const category = categoryId && (await ctx.db.get(categoryId));
    if (!category) return null;
    return {
      name: category.name,
      products: await shelfCards(ctx, category._id),
    };
  },
});

/** A product page: the Published Product with this slug, or null so the page 404s. */
export const product = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      slug: v.string(),
      description: v.string(),
      category: v.union(v.null(), v.object({ _id: v.id("categories"), name: v.string() })),
      /** Ordered photos; the first is the cover. */
      gallery: v.array(v.object({ storageId: v.id("_storage"), url: v.string() })),
      options: v.array(productOption),
      variants: v.array(
        v.object({
          _id: v.id("variants"),
          optionValues: v.array(v.string()),
          /** Integer pesewas; missing when the Variant isn't sold In-stock. */
          storePrice: v.optional(v.number()),
          /** Units a Customer can buy now. */
          inStock: v.number(),
          /** One of the gallery's photos. */
          imageId: v.optional(v.id("_storage")),
        }),
      ),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const product = await findStorefrontProduct(ctx, slug);
    if (!product) return null;
    const category = product.categoryId ? await ctx.db.get(product.categoryId) : null;
    const gallery = [];
    for (const storageId of product.gallery) {
      const url = await ctx.storage.getUrl(storageId);
      if (url) gallery.push({ storageId, url });
    }
    return {
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: category && { _id: category._id, name: category.name },
      gallery,
      options: product.options,
      variants: await shelfVariants(ctx, product),
    };
  },
});
