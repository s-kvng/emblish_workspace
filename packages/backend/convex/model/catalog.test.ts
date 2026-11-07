import { describe, expect, test } from "vitest";

import {
  onlyPricesMissing,
  publishChecklist,
  slugFor,
  suggestSku,
  variantCombinations,
} from "./catalog";

describe("Options make Variants", () => {
  test("a Product with no options has one default Variant", () => {
    expect(variantCombinations([])).toEqual([[]]);
  });

  test("each combination of option values is a Variant, in option order", () => {
    expect(
      variantCombinations([
        { name: "Size", values: ["S", "M"] },
        { name: "Colour", values: ["Red", "Blue"] },
      ]),
    ).toEqual([
      ["S", "Red"],
      ["S", "Blue"],
      ["M", "Red"],
      ["M", "Blue"],
    ]);
  });
});

const ready = {
  name: "Kente Weekend Tote",
  categoryId: "category",
  photoCount: 1,
  sellInStock: true,
  variants: [
    { sku: "KWT-RED", storePrice: 45000 },
    { sku: "KWT-BLU", storePrice: 45000 },
  ],
};

function failing(product: Parameters<typeof publishChecklist>[0]) {
  return publishChecklist(product)
    .filter((check) => !check.ok)
    .map((check) => check.key);
}

describe("The publish checklist", () => {
  test("a named, categorised, photographed Product with priced SKUs is ready", () => {
    expect(failing(ready)).toEqual([]);
    expect(publishChecklist(ready).map((check) => check.key)).toEqual([
      "name",
      "category",
      "photo",
      "sku",
      "sellInStock",
      "storePrice",
    ]);
  });

  test("shows each missing piece", () => {
    expect(
      failing({
        name: "  ",
        categoryId: undefined,
        photoCount: 0,
        sellInStock: true,
        variants: [{ sku: "KWT-RED" }, { sku: undefined, storePrice: 100 }],
      }),
    ).toEqual(["name", "category", "photo", "sku", "storePrice"]);
  });

  test("a Pre-order-only Product isn't published from here, and doesn't need Store Prices", () => {
    const preorderOnly = {
      ...ready,
      sellInStock: false,
      variants: [{ sku: "KWT-RED" }],
    };
    expect(failing(preorderOnly)).toEqual(["sellInStock"]);
    expect(publishChecklist(preorderOnly).some((check) => check.key === "storePrice")).toBe(false);
  });

  test("Staff whose only blockers are prices are waiting for the Owner", () => {
    expect(onlyPricesMissing({ ...ready, variants: [{ sku: "KWT-RED" }] })).toBe(true);
    expect(onlyPricesMissing({ ...ready, name: "", variants: [{ sku: "KWT-RED" }] })).toBe(false);
    expect(onlyPricesMissing(ready)).toBe(false);
  });
});

describe("Slugs and SKU suggestions", () => {
  test("a slug is the name in lower-case words joined by dashes", () => {
    expect(slugFor("  Kente Weekend Tote! (Large) ")).toBe("kente-weekend-tote-large");
    expect(slugFor("Crème brûlée & co")).toBe("creme-brulee-co");
    expect(slugFor("!!!")).toBe("product");
  });

  test("a suggested SKU is the name's initials plus each option value's start", () => {
    expect(suggestSku("Kente Weekend Tote", ["Red", "Extra large"])).toBe("KWT-RED-EXT");
    expect(suggestSku("Silk Wig", [])).toBe("SW-STD");
  });
});
