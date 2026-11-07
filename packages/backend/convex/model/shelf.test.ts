import { describe, expect, test } from "vitest";

import { buyableNow, startingPicks, valueAvailability } from "./shelf";

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
