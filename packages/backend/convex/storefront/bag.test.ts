import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { withShop } from "../test.checkout";

describe("the Bag prices its lines for anyone", () => {
  test("each Variant comes back with its name, Store Price and what can be bought now", async () => {
    const { t, small, medium } = await withShop();
    await t.run((ctx) => ctx.db.patch(medium, { stockHeld: 1 }));

    const lines = await t.query(api.storefront.catalog.bagLines, {
      variantIds: [small, medium],
    });

    expect(lines).toEqual([
      expect.objectContaining({
        variantId: small,
        productName: "Kente Weekend Tote",
        slug: "kente-weekend-tote",
        variantLabel: "S",
        storePrice: 45000,
        inStock: 3,
      }),
      expect.objectContaining({ variantId: medium, variantLabel: "M", inStock: 0 }),
    ]);
  });

  test("a Variant no longer for sale, or not a Variant at all, is left out", async () => {
    const { t, small } = await withShop();
    await t.run(async (ctx) => {
      const variant = await ctx.db.get(small);
      await ctx.db.patch(variant!.productId, { status: "archived" });
    });

    const lines = await t.query(api.storefront.catalog.bagLines, {
      variantIds: [small, "not-a-variant"],
    });

    expect(lines).toEqual([]);
  });
});

test("the Pickup step shows the pickup point's address and hours", async () => {
  const { t } = await withShop();

  expect(await t.query(api.storefront.catalog.pickupPoint, {})).toBe(
    "Osu, Oxford Street. Mon-Sat 9am-6pm",
  );
});
