import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { withFirstOwner } from "../test.staff";

/** A store with a Bags Category; `t` is a Customer browsing without signing in. */
async function store() {
  const { t, owner } = await withFirstOwner();
  const bags = await owner.mutation(api.backOffice.categories.create, {
    name: "Bags",
  });

  /** The Owner lists a Product with Size S and M Variants, published unless told otherwise. */
  async function list(
    name: string,
    {
      price = 45000,
      publish = true,
      categoryId = bags,
    }: {
      price?: number;
      publish?: boolean;
      categoryId?: Id<"categories">;
    } = {},
  ) {
    const code = name.toUpperCase().replace(/\W+/g, "-");
    const cover = await t.run((ctx) =>
      ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })),
    );
    const { productId } = await owner.mutation(api.backOffice.products.save, {
      name,
      description: `${name}, made with care.`,
      categoryId,
      gallery: [cover],
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { optionValues: ["S"], sku: `${code}-S`, storePrice: price },
        { optionValues: ["M"], sku: `${code}-M`, storePrice: price + 5000 },
      ],
      sellInStock: true,
      publish,
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

  async function restock(variantId: Id<"variants">, quantity: number) {
    await owner.mutation(api.backOffice.stock.adjust, {
      variantId,
      quantity,
      reason: "found",
    });
  }

  return { t, owner, bags, list, restock };
}

describe("Storefront Home", () => {
  test("lists Published In-stock Products, sold-out ones marked, Drafts left out", async () => {
    const { t, list, restock, bags } = await store();
    const tote = await list("Kente Weekend Tote");
    await restock(tote.medium, 3);
    await list("Raffia Basket", { price: 30000 });
    await list("Draft Clutch", { publish: false });

    const home = await t.query(api.storefront.catalog.home, {});

    expect(home.inStock).toEqual([
      expect.objectContaining({
        slug: "kente-weekend-tote",
        name: "Kente Weekend Tote",
        fromPrice: 50000,
        soldOut: false,
      }),
      expect.objectContaining({
        slug: "raffia-basket",
        fromPrice: 30000,
        soldOut: true,
      }),
    ]);
    expect(home.categories).toEqual([expect.objectContaining({ _id: bags, name: "Bags" })]);
  });
});

describe("A Category page", () => {
  test("lists that Category's Published Products only", async () => {
    const { t, owner, list } = await store();
    const home = await owner.mutation(api.backOffice.categories.create, {
      name: "Home",
    });
    await list("Kente Weekend Tote");
    await list("Pour-over Set", { categoryId: home });
    await list("Clay Vase", { categoryId: home, publish: false });

    const page = await t.query(api.storefront.catalog.category, {
      categoryId: home,
    });

    expect(page?.name).toBe("Home");
    expect(page?.products.map((card) => card.slug)).toEqual(["pour-over-set"]);
  });

  test("isn't found for an id that isn't a Category", async () => {
    const { t } = await store();

    expect(await t.query(api.storefront.catalog.category, { categoryId: "nope" })).toBeNull();
  });
});

describe("A product page", () => {
  test("resolves a Published Product by slug, with each Variant's price and Stock", async () => {
    const { t, list, restock } = await store();
    const tote = await list("Kente Weekend Tote");
    await restock(tote.small, 4);

    const page = await t.query(api.storefront.catalog.product, {
      slug: "kente-weekend-tote",
    });

    expect(page).toMatchObject({
      name: "Kente Weekend Tote",
      description: "Kente Weekend Tote, made with care.",
      category: { name: "Bags" },
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { _id: tote.small, optionValues: ["S"], storePrice: 45000, inStock: 4 },
        {
          _id: tote.medium,
          optionValues: ["M"],
          storePrice: 50000,
          inStock: 0,
        },
      ],
    });
    expect(page?.gallery).toHaveLength(1);
  });

  test("Draft and archived Products aren't found", async () => {
    const { t, owner, list } = await store();
    await list("Draft Clutch", { publish: false });
    const basket = await list("Raffia Basket");
    await owner.mutation(api.backOffice.products.archive, {
      productId: basket.productId,
    });

    for (const slug of ["draft-clutch", "raffia-basket", "no-such-thing"]) {
      expect(await t.query(api.storefront.catalog.product, { slug })).toBeNull();
    }
  });

  test("Stock under Stock Holds can't be bought", async () => {
    const { t, list, restock } = await store();
    const tote = await list("Kente Weekend Tote");
    await restock(tote.small, 4);
    await t.run((ctx) => ctx.db.patch(tote.small, { stockHeld: 6 }));

    const page = await t.query(api.storefront.catalog.product, {
      slug: "kente-weekend-tote",
    });

    expect(page?.variants[0]).toMatchObject({ inStock: 0 });
  });
});
