import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { withFirstOwner } from "../test.staff";

const DAY = 24 * 60 * 60 * 1000;

/** A store whose Owner lists Size S/M Products and opens windows on them; `t` browses signed out. */
async function store() {
  const { t, owner } = await withFirstOwner();
  const bags = await owner.mutation(api.backOffice.categories.create, {
    name: "Bags",
  });

  async function list(name: string, { storePrice }: { storePrice?: number } = {}) {
    const code = name.toUpperCase().replace(/\W+/g, "-");
    const cover = await t.run((ctx) =>
      ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })),
    );
    const { productId } = await owner.mutation(api.backOffice.products.save, {
      name,
      description: "",
      categoryId: bags,
      gallery: [cover],
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { optionValues: ["S"], sku: `${code}-S`, storePrice },
        { optionValues: ["M"], sku: `${code}-M`, storePrice },
      ],
      sellInStock: storePrice !== undefined,
      publish: storePrice !== undefined,
    });
    const { variants } = await owner.query(api.backOffice.products.get, {
      productId,
    });
    const [small, medium] = variants.map((variant) => variant._id) as [
      Id<"variants">,
      Id<"variants">,
    ];
    return { productId, small, medium };
  }

  async function open(
    product: Awaited<ReturnType<typeof list>>,
    {
      days = 10,
      prices = [38000, 40000],
      cap,
      onlySmall = false,
      draft = false,
    }: {
      days?: number;
      prices?: [number, number];
      cap?: number;
      onlySmall?: boolean;
      draft?: boolean;
    } = {},
  ) {
    const { windowId } = await owner.mutation(api.backOffice.windows.save, {
      productId: product.productId,
      variants: [
        { variantId: product.small, preorderPrice: prices[0], cap },
        ...(onlySmall ? [] : [{ variantId: product.medium, preorderPrice: prices[1] }]),
      ],
      closesAt: Date.now() + days * DAY,
      minimumOrderQuantity: 2,
      shippingFeeEstimate: 4500,
      open: !draft,
    });
    return windowId;
  }

  return { t, owner, list, open };
}

describe("The product page offers Pre-order beside Buy now", () => {
  test("each Variant in the open window carries its price and, when capped, the units left", async () => {
    const { t, list, open } = await store();
    const kaftan = await list("Linen Kaftan", { storePrice: 45000 });
    const windowId = await open(kaftan, { cap: 5, onlySmall: true });
    // Two units paid and one held at Checkout leave 2 under the cap.
    await t.run(async (ctx) => {
      const [row] = await ctx.db
        .query("windowVariants")
        .withIndex("by_window", (q) => q.eq("orderWindowId", windowId))
        .collect();
      await ctx.db.patch(row!._id, { preordered: 2, held: 1 });
    });

    const page = await t.query(api.storefront.catalog.product, {
      slug: "linen-kaftan",
    });

    expect(page?.window).toEqual({
      windowId,
      closesAt: expect.any(Number),
      minimumOrderQuantity: 2,
      shippingFeeEstimate: 4500,
    });
    expect(page?.variants).toEqual([
      expect.objectContaining({
        _id: kaftan.small,
        storePrice: 45000,
        preorder: { price: 38000, left: 2 },
      }),
      expect.not.objectContaining({ preorder: expect.anything() }),
    ]);
  });

  test("a Pre-order-only Product is published by its window; a draft window shows nothing", async () => {
    const { t, list, open } = await store();
    const kaftan = await list("Linen Kaftan");
    expect(await t.query(api.storefront.catalog.product, { slug: "linen-kaftan" })).toBeNull();

    await open(kaftan);
    const page = await t.query(api.storefront.catalog.product, {
      slug: "linen-kaftan",
    });
    expect(page?.variants.map((variant) => variant.preorder)).toEqual([
      { price: 38000 },
      { price: 40000 },
    ]);

    const tote = await list("Kente Tote", { storePrice: 45000 });
    await open(tote, { draft: true });
    const totePage = await t.query(api.storefront.catalog.product, {
      slug: "kente-tote",
    });
    expect(totePage?.window).toBeNull();
    expect(totePage?.variants.some((variant) => variant.preorder)).toBe(false);
  });
});

describe("Home", () => {
  test("Closing soon lists open windows by close date, with the lowest Pre-order price", async () => {
    const { t, owner, list, open } = await store();
    await open(await list("Linen Kaftan"), { days: 12 });
    await open(await list("Shea Body Butter"), {
      days: 3,
      prices: [9000, 7500],
    });
    const closed = await open(await list("Pour-over Set"), { days: 1 });
    await owner.mutation(api.backOffice.windows.closeNow, { windowId: closed });

    const home = await t.query(api.storefront.catalog.home, {});

    expect(home.closingSoon).toEqual([
      expect.objectContaining({
        slug: "shea-body-butter",
        fromPrice: 7500,
        full: false,
      }),
      expect.objectContaining({
        slug: "linen-kaftan",
        fromPrice: 38000,
        full: false,
      }),
    ]);
    expect(home.closingSoon[0]!.closesAt).toBeLessThan(home.closingSoon[1]!.closesAt);
    // Pre-order-only Products aren't In-stock cards.
    expect(home.inStock).toEqual([]);
  });

  test("an In-stock card with an open window is badged ALSO PRE-ORDER; a window with every Variant capped out is full", async () => {
    const { t, list, open } = await store();
    const tote = await list("Kente Tote", { storePrice: 45000 });
    await list("Raffia Basket", { storePrice: 30000 });
    const windowId = await open(tote, { cap: 1, onlySmall: true });
    await t.run(async (ctx) => {
      const [row] = await ctx.db
        .query("windowVariants")
        .withIndex("by_window", (q) => q.eq("orderWindowId", windowId))
        .collect();
      await ctx.db.patch(row!._id, { preordered: 1 });
    });

    const home = await t.query(api.storefront.catalog.home, {});

    expect(home.inStock.map((card) => [card.slug, card.alsoPreorder]).sort()).toEqual([
      ["kente-tote", true],
      ["raffia-basket", false],
    ]);
    expect(home.closingSoon).toEqual([expect.objectContaining({ slug: "kente-tote", full: true })]);
  });
});

describe("The Bag prices its Pre-order lines", () => {
  test("each line in a window still open, with its Pre-order price and units left; others are left out", async () => {
    const { t, owner, list, open } = await store();
    const kaftan = await list("Linen Kaftan");
    const windowId = await open(kaftan, { cap: 4, onlySmall: true });
    const tote = await list("Kente Tote", { storePrice: 45000 });
    const closed = await open(tote);
    await owner.mutation(api.backOffice.windows.closeNow, { windowId: closed });

    const lines = await t.query(api.storefront.catalog.preorderBagLines, {
      lines: [
        { variantId: kaftan.small, windowId },
        { variantId: kaftan.medium, windowId },
        { variantId: tote.small, windowId: closed },
        { variantId: "nope", windowId },
      ],
    });

    expect(lines).toEqual([
      expect.objectContaining({
        variantId: kaftan.small,
        windowId,
        productName: "Linen Kaftan",
        slug: "linen-kaftan",
        variantLabel: "S",
        preorderPrice: 38000,
        left: 4,
        closesAt: expect.any(Number),
        minimumOrderQuantity: 2,
      }),
    ]);
  });
});
