import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { listStorefrontProducts } from "../model/products";
import type { TestBackend } from "../test.setup";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

/** A stored photo, as if the wizard had uploaded it. */
async function photo(t: TestBackend) {
  return await t.run((ctx) => ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })));
}

/** The Owner, a Staff member, a Category and a photo, ready for the wizard. */
async function catalog() {
  const { t, owner } = await withFirstOwner();
  const kofi = await withStaffMember(t);
  const bags = await owner.mutation(api.backOffice.categories.create, {
    name: "Bags",
  });
  const cover = await photo(t);
  return { t, owner, kofi, bags, cover };
}

/** The wizard's save for a Product with no options, overridable field by field. */
function tote(fields: Partial<typeof api.backOffice.products.save._args> = {}) {
  return {
    name: "Kente Weekend Tote",
    description: "Hand-woven, lined.",
    gallery: [],
    options: [],
    variants: [{ optionValues: [] }],
    sellInStock: true,
    publish: false,
    ...fields,
  } as typeof api.backOffice.products.save._args;
}

describe("Staff create Products with the wizard", () => {
  test("a Product saved with no options is a Draft with one default Variant", async () => {
    const { kofi, bags } = await catalog();

    const { productId, status } = await kofi.mutation(
      api.backOffice.products.save,
      tote({
        categoryId: bags,
        variants: [{ optionValues: [], sku: "kwt-std " }],
      }),
    );

    expect(status).toBe("draft");
    expect(await kofi.query(api.backOffice.products.list, {})).toEqual([
      expect.objectContaining({
        _id: productId,
        name: "Kente Weekend Tote",
        status: "draft",
        categoryName: "Bags",
        variantCount: 1,
        needsPrices: true,
      }),
    ]);
    const saved = await kofi.query(api.backOffice.products.get, { productId });
    expect(saved.slug).toBe("kente-weekend-tote");
    expect(saved.variants).toEqual([{ _id: expect.any(String), optionValues: [], sku: "KWT-STD" }]);
  });

  test("each combination of up to 3 options is a Variant, and the Variants must match them", async () => {
    const { kofi } = await catalog();
    const options = [
      { name: "Size", values: ["S", "M"] },
      { name: "Colour", values: ["Red", "Blue"] },
    ];
    const { productId } = await kofi.mutation(
      api.backOffice.products.save,
      tote({
        options,
        variants: [
          ["S", "Red"],
          ["S", "Blue"],
          ["M", "Red"],
          ["M", "Blue"],
        ].map((optionValues) => ({
          optionValues,
        })),
      }),
    );
    const saved = await kofi.query(api.backOffice.products.get, { productId });
    expect(saved.variants.map((variant) => variant.optionValues.join("/"))).toEqual([
      "S/Red",
      "S/Blue",
      "M/Red",
      "M/Blue",
    ]);

    const missingOne = tote({
      options,
      variants: [
        ["S", "Red"],
        ["S", "Blue"],
        ["M", "Red"],
      ].map((optionValues) => ({ optionValues })),
    });
    const fourOptions = tote({
      options: ["A", "B", "C", "D"].map((name) => ({ name, values: ["x"] })),
      variants: [{ optionValues: ["x", "x", "x", "x"] }],
    });
    const emptyOption = tote({
      options: [{ name: "Size", values: [] }],
      variants: [],
    });
    expect(await refusal(kofi.mutation(api.backOffice.products.save, missingOne))).toBe(
      "INVALID_VARIANTS",
    );
    expect(await refusal(kofi.mutation(api.backOffice.products.save, fourOptions))).toBe(
      "INVALID_OPTIONS",
    );
    expect(await refusal(kofi.mutation(api.backOffice.products.save, emptyOption))).toBe(
      "INVALID_OPTIONS",
    );
  });

  test("editing keeps the Variants it names and drops combinations that are gone", async () => {
    const { kofi } = await catalog();
    const { productId } = await kofi.mutation(
      api.backOffice.products.save,
      tote({
        options: [{ name: "Colour", values: ["Red", "Blue"] }],
        variants: [
          { optionValues: ["Red"], sku: "KWT-RED" },
          { optionValues: ["Blue"], sku: "KWT-BLU" },
        ],
      }),
    );
    const [red] = (await kofi.query(api.backOffice.products.get, { productId })).variants;

    await kofi.mutation(
      api.backOffice.products.save,
      tote({
        productId,
        options: [{ name: "Colour", values: ["Red", "Gold"] }],
        variants: [
          { variantId: red._id, optionValues: ["Red"], sku: "KWT-RED" },
          { optionValues: ["Gold"], sku: "KWT-GOL" },
        ],
      }),
    );

    const { variants } = await kofi.query(api.backOffice.products.get, {
      productId,
    });
    expect(variants.map((variant) => variant.sku)).toEqual(["KWT-RED", "KWT-GOL"]);
    expect(variants[0]._id).toBe(red._id);
  });

  test("slugs and SKUs are unique across the store", async () => {
    const { kofi } = await catalog();
    const first = await kofi.mutation(
      api.backOffice.products.save,
      tote({ variants: [{ optionValues: [], sku: "KWT-STD" }] }),
    );
    const second = await kofi.mutation(api.backOffice.products.save, tote());

    const slugs = await Promise.all(
      [first, second].map(async ({ productId }) => {
        return (await kofi.query(api.backOffice.products.get, { productId })).slug;
      }),
    );
    expect(slugs).toEqual(["kente-weekend-tote", "kente-weekend-tote-2"]);

    expect(
      await refusal(
        kofi.mutation(
          api.backOffice.products.save,
          tote({
            productId: second.productId,
            variants: [{ optionValues: [], sku: "kwt-std" }],
          }),
        ),
      ),
    ).toBe("DUPLICATE_SKU");
    expect(
      await refusal(
        kofi.mutation(
          api.backOffice.products.save,
          tote({
            options: [{ name: "Colour", values: ["Red", "Blue"] }],
            variants: [
              { optionValues: ["Red"], sku: "SAME" },
              { optionValues: ["Blue"], sku: "SAME" },
            ],
          }),
        ),
      ),
    ).toBe("DUPLICATE_SKU");
    // A Product may keep its own SKUs when saved again.
    expect(
      await refusal(
        kofi.mutation(
          api.backOffice.products.save,
          tote({
            productId: first.productId,
            variants: [
              {
                variantId: (
                  await kofi.query(api.backOffice.products.get, {
                    productId: first.productId,
                  })
                ).variants[0]._id,
                optionValues: [],
                sku: "KWT-STD",
              },
            ],
          }),
        ),
      ),
    ).toBe("allowed");
  });
});

describe("Only the Owner sets Store Prices", () => {
  test("Staff can't set a Store Price, on a new Variant or an existing one", async () => {
    const { owner, kofi } = await catalog();

    expect(
      await refusal(
        kofi.mutation(
          api.backOffice.products.save,
          tote({ variants: [{ optionValues: [], storePrice: 45000 }] }),
        ),
      ),
    ).toBe("FORBIDDEN");

    const { productId } = await kofi.mutation(api.backOffice.products.save, tote());
    const [variant] = (await kofi.query(api.backOffice.products.get, { productId })).variants;
    const priced = (storePrice?: number) =>
      tote({
        productId,
        variants: [{ variantId: variant._id, optionValues: [], storePrice }],
      });

    expect(await refusal(kofi.mutation(api.backOffice.products.save, priced(45000)))).toBe(
      "FORBIDDEN",
    );
    expect(await refusal(owner.mutation(api.backOffice.products.save, priced(45000)))).toBe(
      "allowed",
    );
    // Staff may save the Product again with the Owner's price left as it is, but not change or clear it.
    expect(await refusal(kofi.mutation(api.backOffice.products.save, priced(45000)))).toBe(
      "allowed",
    );
    expect(await refusal(kofi.mutation(api.backOffice.products.save, priced(40000)))).toBe(
      "FORBIDDEN",
    );
    expect(await refusal(kofi.mutation(api.backOffice.products.save, priced(undefined)))).toBe(
      "FORBIDDEN",
    );
    const [saved] = (await kofi.query(api.backOffice.products.get, { productId })).variants;
    expect(saved.storePrice).toBe(45000);
  });

  test("a Store Price is a whole number of pesewas above zero", async () => {
    const { owner } = await catalog();
    for (const storePrice of [0, -100, 450.5]) {
      expect(
        await refusal(
          owner.mutation(
            api.backOffice.products.save,
            tote({ variants: [{ optionValues: [], storePrice }] }),
          ),
        ),
      ).toBe("INVALID_PRICE");
    }
  });
});

/** The ConvexError data a refused call carried. */
async function refusalData(promise: Promise<unknown>) {
  return promise.then(
    () => "allowed",
    (error) => error.data,
  );
}

describe("Publishing", () => {
  test("is blocked until the checklist is clear, saying what's missing", async () => {
    const { kofi } = await catalog();

    expect(
      await refusalData(kofi.mutation(api.backOffice.products.save, tote({ publish: true }))),
    ).toEqual(
      expect.objectContaining({
        code: "PUBLISH_BLOCKED",
        missing: [
          "Category",
          "At least one photo",
          "Every Variant has a SKU",
          "Every Variant has a Store Price (Owner)",
        ],
      }),
    );
    // A refused publish saves nothing.
    expect(await kofi.query(api.backOffice.products.list, {})).toEqual([]);
  });

  test("Staff save a Draft for the Owner to price, then anyone can publish it", async () => {
    const { owner, kofi, bags, cover } = await catalog();
    const draft = tote({
      categoryId: bags,
      gallery: [cover],
      variants: [{ optionValues: [], sku: "KWT-STD" }],
    });
    const { productId } = await kofi.mutation(api.backOffice.products.save, draft);
    const [variant] = (await kofi.query(api.backOffice.products.get, { productId })).variants;
    const priced = {
      ...draft,
      productId,
      variants: [
        {
          variantId: variant._id,
          optionValues: [],
          sku: "KWT-STD",
          storePrice: 45000,
        },
      ],
    };

    await owner.mutation(api.backOffice.products.save, priced);
    const published = await kofi.mutation(api.backOffice.products.save, {
      ...priced,
      publish: true,
    });

    expect(published.status).toBe("published");
    expect((await kofi.query(api.backOffice.products.get, { productId })).status).toBe("published");
    // Saving without publishing takes it back to a Draft.
    await kofi.mutation(api.backOffice.products.save, priced);
    expect((await kofi.query(api.backOffice.products.get, { productId })).status).toBe("draft");
  });
});

describe("Archiving", () => {
  test("archived Products leave the Storefront, and can be restored as Drafts", async () => {
    const { t, owner, bags, cover } = await catalog();
    const ready = tote({
      categoryId: bags,
      gallery: [cover],
      variants: [{ optionValues: [], sku: "KWT-STD", storePrice: 45000 }],
      publish: true,
    });
    const { productId } = await owner.mutation(api.backOffice.products.save, ready);
    await owner.mutation(api.backOffice.products.save, {
      ...ready,
      name: "Unfinished Wig",
      gallery: [await photo(t)],
      variants: [{ optionValues: [], sku: "WIG-STD" }],
      publish: false,
    });
    const onStorefront = () =>
      t.run(async (ctx) => (await listStorefrontProducts(ctx)).map((product) => product.name));
    expect(await onStorefront()).toEqual(["Kente Weekend Tote"]);

    await owner.mutation(api.backOffice.products.archive, { productId });

    expect(await onStorefront()).toEqual([]);
    expect((await owner.query(api.backOffice.products.get, { productId })).status).toBe("archived");
    expect(
      await refusal(owner.mutation(api.backOffice.products.save, { ...ready, productId })),
    ).toBe("ARCHIVED");

    await owner.mutation(api.backOffice.products.restore, { productId });
    expect((await owner.query(api.backOffice.products.get, { productId })).status).toBe("draft");
  });
});

describe("The photo gallery", () => {
  test("Staff get an upload URL for each photo", async () => {
    const { t, kofi } = await catalog();
    expect(await kofi.mutation(api.backOffice.products.generateUploadUrl, {})).toMatch(/^https?:/);
    expect(await refusal(t.mutation(api.backOffice.products.generateUploadUrl, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });

  test("photos keep the order they're saved in, and removed ones are deleted", async () => {
    const { t, kofi, cover } = await catalog();
    const [second, third] = [await photo(t), await photo(t)];
    const { productId } = await kofi.mutation(
      api.backOffice.products.save,
      tote({ gallery: [cover, second, third] }),
    );

    // "Make cover" on the third photo, and "Remove" on the second.
    await kofi.mutation(api.backOffice.products.save, tote({ productId, gallery: [third, cover] }));

    const { gallery } = await kofi.query(api.backOffice.products.get, {
      productId,
    });
    expect(gallery.map((image) => image.storageId)).toEqual([third, cover]);
    expect(gallery.every((image) => image.url)).toBe(true);
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).toBeNull();
    expect((await kofi.query(api.backOffice.products.list, {}))[0].coverUrl).toBe(gallery[0].url);
  });

  test("a Variant's photo is one of the Product's gallery photos", async () => {
    const { t, kofi, cover } = await catalog();
    const stranger = await photo(t);
    const withPhoto = (imageId: Id<"_storage">) =>
      tote({ gallery: [cover], variants: [{ optionValues: [], imageId }] });

    expect(await refusal(kofi.mutation(api.backOffice.products.save, withPhoto(cover)))).toBe(
      "allowed",
    );
    expect(await refusal(kofi.mutation(api.backOffice.products.save, withPhoto(stranger)))).toBe(
      "INVALID_PHOTO",
    );
  });
});

describe("Review fixes", () => {
  test("a SKU can move from a Variant that's going away to a new one", async () => {
    const { kofi } = await catalog();
    const { productId } = await kofi.mutation(
      api.backOffice.products.save,
      tote({
        options: [{ name: "Colour", values: ["Red"] }],
        variants: [{ optionValues: ["Red"], sku: "KWT-1" }],
      }),
    );

    expect(
      await refusal(
        kofi.mutation(
          api.backOffice.products.save,
          tote({
            productId,
            options: [{ name: "Colour", values: ["Gold"] }],
            variants: [{ optionValues: ["Gold"], sku: "KWT-1" }],
          }),
        ),
      ),
    ).toBe("allowed");
  });

  test("another Product's photo can't be put in a gallery, so it can't be deleted from there", async () => {
    const { t, kofi, cover } = await catalog();
    await kofi.mutation(api.backOffice.products.save, tote({ gallery: [cover] }));

    expect(
      await refusal(
        kofi.mutation(api.backOffice.products.save, tote({ name: "Wig", gallery: [cover] })),
      ),
    ).toBe("INVALID_PHOTO");
    expect(await t.run((ctx) => ctx.storage.getUrl(cover))).not.toBeNull();
  });
});
