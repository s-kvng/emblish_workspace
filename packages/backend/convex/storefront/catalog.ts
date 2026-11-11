// Browsing the catalog is open to anyone, so these queries have no guard (ADR 0001). They only
// ever return Published Products, and only what a Customer may see of them.
import { v } from "convex/values";

import { query } from "../_generated/server";
import { listCategories } from "../model/categories";
import { listZones, zoneAsShown } from "../model/deliveryZones";
import {
  closingSoonCards,
  findStorefrontProduct,
  openWindowFor,
  shelfCards,
  shelfVariants,
} from "../model/products";
import { pickupLocation } from "../model/settings";
import { productOption } from "../schema";

const shelfCardValidator = v.object({
  slug: v.string(),
  name: v.string(),
  coverUrl: v.optional(v.string()),
  /** Integer pesewas: the lowest Store Price that can be bought now, or any when sold out. */
  fromPrice: v.number(),
  soldOut: v.boolean(),
  /** It also has an open Order Window: the ALSO PRE-ORDER badge. */
  alsoPreorder: v.boolean(),
});

/** Home: the Category tiles, the "Closing soon" rail and the "Ready to take home" grid. */
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
    /** Open windows, soonest close first. */
    closingSoon: v.array(
      v.object({
        slug: v.string(),
        name: v.string(),
        coverUrl: v.optional(v.string()),
        /** Integer pesewas: the lowest Pre-order price in the window. */
        fromPrice: v.number(),
        closesAt: v.number(),
        /** Every offered Variant has reached its cap. */
        full: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const inStock = await shelfCards(ctx);
    const closingSoon = await closingSoonCards(ctx);
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
    return { categories, inStock, closingSoon };
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
          /** Set while the open window offers it: its Pre-order price and, if capped, units left. */
          preorder: v.optional(v.object({ price: v.number(), left: v.optional(v.number()) })),
        }),
      ),
      /** The open Order Window's facts, or null when the Product isn't on Pre-order. */
      window: v.union(
        v.null(),
        v.object({
          windowId: v.id("orderWindows"),
          closesAt: v.number(),
          minimumOrderQuantity: v.optional(v.number()),
          /** Integer pesewas per unit; missing means it's confirmed on arrival. */
          shippingFeeEstimate: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const product = await findStorefrontProduct(ctx, slug);
    if (!product) return null;
    const category = product.categoryId ? await ctx.db.get(product.categoryId) : null;
    const open = await openWindowFor(ctx, product._id);
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
      window: open && {
        windowId: open.window._id,
        closesAt: open.window.closesAt,
        minimumOrderQuantity: open.window.minimumOrderQuantity,
        shippingFeeEstimate: open.window.shippingFeeEstimate,
      },
    };
  },
});

/**
 * The Bag's lines priced for display, in the order asked: each Variant still sold In-stock
 * on a Published Product, with what can be bought now. Anything else is left out, so the
 * Bag can drop it. Ids are strings because the Bag lives in the browser.
 */
export const bagLines = query({
  args: { variantIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      variantId: v.id("variants"),
      productName: v.string(),
      slug: v.string(),
      variantLabel: v.string(),
      /** Integer pesewas. */
      storePrice: v.number(),
      /** Units a Customer can buy now. */
      inStock: v.number(),
      imageUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { variantIds }) => {
    const lines = [];
    for (const raw of variantIds.slice(0, 50)) {
      const variantId = ctx.db.normalizeId("variants", raw);
      const variant = variantId && (await ctx.db.get(variantId));
      const product = variant && (await ctx.db.get(variant.productId));
      if (!variant || !product || product.status !== "published") continue;
      const shelf = (await shelfVariants(ctx, product)).find((s) => s._id === variant._id);
      if (shelf?.storePrice === undefined) continue;
      const imageId = variant.imageId ?? product.gallery[0];
      lines.push({
        variantId: variant._id,
        productName: product.name,
        slug: product.slug,
        variantLabel: variant.optionValues.join(" / "),
        storePrice: shelf.storePrice,
        inStock: shelf.inStock,
        imageUrl: (imageId && (await ctx.storage.getUrl(imageId))) || undefined,
      });
    }
    return lines;
  },
});

/**
 * The Bag's Pre-order lines priced for display, in the order asked: each Variant its window
 * still offers while the window is open on a Published Product, with the units left under any
 * cap. Anything else is left out, so the Bag can drop it.
 */
export const preorderBagLines = query({
  args: {
    lines: v.array(v.object({ variantId: v.string(), windowId: v.string() })),
  },
  returns: v.array(
    v.object({
      variantId: v.id("variants"),
      windowId: v.id("orderWindows"),
      productName: v.string(),
      slug: v.string(),
      variantLabel: v.string(),
      /** Integer pesewas. */
      preorderPrice: v.number(),
      /** Units left under the cap; missing when it's uncapped. */
      left: v.optional(v.number()),
      closesAt: v.number(),
      /** Fewest units per Pre-order in the window, across its Variants; the Bag checks it. */
      minimumOrderQuantity: v.optional(v.number()),
      imageUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const lines = [];
    for (const raw of args.lines.slice(0, 50)) {
      const variantId = ctx.db.normalizeId("variants", raw.variantId);
      const windowId = ctx.db.normalizeId("orderWindows", raw.windowId);
      const variant = variantId && (await ctx.db.get(variantId));
      const window = windowId && (await ctx.db.get(windowId));
      const product = variant && (await ctx.db.get(variant.productId));
      if (!variant || !window || !product || product.status !== "published") continue;
      if (window.stage !== "open" || window.productId !== product._id) continue;
      const preorder = (await shelfVariants(ctx, product)).find(
        (s) => s._id === variant._id,
      )?.preorder;
      if (!preorder) continue;
      const imageId = variant.imageId ?? product.gallery[0];
      lines.push({
        variantId: variant._id,
        windowId: window._id,
        productName: product.name,
        slug: product.slug,
        variantLabel: variant.optionValues.join(" / "),
        preorderPrice: preorder.price,
        ...(preorder.left === undefined ? {} : { left: preorder.left }),
        closesAt: window.closesAt,
        ...(window.minimumOrderQuantity === undefined
          ? {}
          : { minimumOrderQuantity: window.minimumOrderQuantity }),
        imageUrl: (imageId && (await ctx.storage.getUrl(imageId))) || undefined,
      });
    }
    return lines;
  },
});

/** The pickup point's address and hours, as the Pickup step and Receipt show them. */
export const pickupPoint = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await pickupLocation(ctx),
});

/** The Delivery Zones Checkout offers: active ones only, Elsewhere in Ghana last. */
export const deliveryZones = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("deliveryZones"),
      name: v.string(),
      areas: v.string(),
      /** Integer pesewas per order; missing on Elsewhere in Ghana, which is quoted later. */
      fee: v.optional(v.number()),
      isElsewhere: v.boolean(),
    }),
  ),
  handler: async (ctx) => (await listZones(ctx)).filter((zone) => zone.active).map(zoneAsShown),
});
