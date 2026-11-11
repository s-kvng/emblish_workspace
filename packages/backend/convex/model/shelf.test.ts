import { describe, expect, test } from "vitest";

import { buyableNow, defaultOffer, preorderable, startingPicks, valueAvailability } from "./shelf";

describe("A Variant can be bought now", () => {
  test("when it has a Store Price and Stock", () => {
    expect(buyableNow({ storePrice: 45000, inStock: 3 })).toBe(true);
  });

  test("not when it's sold out", () => {
    expect(buyableNow({ storePrice: 45000, inStock: 0 })).toBe(false);
  });

  test("not when it isn't sold in store", () => {
    expect(buyableNow({ inStock: 3 })).toBe(false);
  });
});

const tote = [
  { optionValues: ["Red", "S"], storePrice: 45000, inStock: 0 },
  { optionValues: ["Red", "M"], storePrice: 45000, inStock: 2 },
  { optionValues: ["Blue", "S"], storePrice: 45000, inStock: 5 },
  { optionValues: ["Blue", "M"], inStock: 0 },
];

describe("The product page opens on a Variant", () => {
  test("the first one that can be bought now", () => {
    expect(startingPicks(tote)).toEqual(["Red", "M"]);
  });

  test("the first one when none can be bought", () => {
    expect(startingPicks(tote.map((variant) => ({ ...variant, inStock: 0 })))).toEqual([
      "Red",
      "S",
    ]);
  });
});

describe("Each option value shows whether it can be bought with the other picks", () => {
  test("in stock when that Variant has Stock", () => {
    expect(valueAvailability(tote, ["Red", "S"], 1, "M")).toBe("inStock");
    expect(valueAvailability(tote, ["Red", "S"], 0, "Blue")).toBe("inStock");
  });

  test("unavailable when that Variant is sold out or not sold in store", () => {
    expect(valueAvailability(tote, ["Red", "M"], 1, "S")).toBe("unavailable");
    expect(valueAvailability(tote, ["Red", "M"], 0, "Blue")).toBe("unavailable");
  });
});

describe("A Variant can be pre-ordered", () => {
  test("when the open window offers it and it isn't capped", () => {
    expect(preorderable({ inStock: 0, preorder: { price: 38000 } })).toBe(true);
  });

  test("while its cap has units left", () => {
    expect(preorderable({ inStock: 0, preorder: { price: 38000, left: 1 } })).toBe(true);
    expect(preorderable({ inStock: 0, preorder: { price: 38000, left: 0 } })).toBe(false);
  });

  test("not when it isn't in the window", () => {
    expect(preorderable({ storePrice: 45000, inStock: 2 })).toBe(false);
  });
});

const kaftan = [
  {
    optionValues: ["S"],
    storePrice: 45000,
    inStock: 0,
    preorder: { price: 38000, left: 0 },
  },
  { optionValues: ["M"], inStock: 0, preorder: { price: 40000 } },
  {
    optionValues: ["L"],
    storePrice: 45000,
    inStock: 2,
    preorder: { price: 40000 },
  },
  { optionValues: ["XL"], inStock: 0 },
];

describe("Pre-order on the product page", () => {
  test("a value only pre-orderable is marked Pre-order; In stock wins when it's both", () => {
    expect(valueAvailability(kaftan, ["S"], 0, "M")).toBe("preorder");
    expect(valueAvailability(kaftan, ["S"], 0, "L")).toBe("inStock");
    expect(valueAvailability(kaftan, ["M"], 0, "S")).toBe("unavailable");
    expect(valueAvailability(kaftan, ["M"], 0, "XL")).toBe("unavailable");
  });

  test("it opens on a Variant that can be bought now, else one that can be pre-ordered", () => {
    expect(startingPicks(kaftan)).toEqual(["L"]);
    expect(startingPicks(kaftan.filter((variant) => variant.optionValues[0] !== "L"))).toEqual([
      "M",
    ]);
  });

  test("the offer card defaults to Buy now when it's available, else Pre-order", () => {
    expect(kaftan.map(defaultOffer)).toEqual(["none", "preorder", "buyNow", "none"]);
  });
});
