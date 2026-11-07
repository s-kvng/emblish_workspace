import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

/** The Owner, a Staff member, and a saved Product with Size S and M Variants. */
async function stockroom() {
  const { t, owner } = await withFirstOwner();
  const kofi = await withStaffMember(t);
  const { productId } = await owner.mutation(api.backOffice.products.save, {
    name: "Kente Weekend Tote",
    description: "",
    gallery: [],
    options: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      { optionValues: ["S"], sku: "KWT-S" },
      { optionValues: ["M"], sku: "KWT-M" },
    ],
    sellInStock: true,
    publish: false,
  });
  const { variants } = await owner.query(api.backOffice.products.get, {
    productId,
  });
  const [small, medium] = variants.map((variant) => variant._id) as [
    Id<"variants">,
    Id<"variants">,
  ];
  return { t, owner, kofi, productId, small, medium };
}

describe("Staff adjust Stock", () => {
  test("an Adjustment is a Stock Movement and moves the Variant's on-hand count", async () => {
    const { kofi, small } = await stockroom();

    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 5,
      reason: "found",
      note: "Box in the back room",
    });

    const history = await kofi.query(api.backOffice.stock.variant, {
      variantId: small,
    });
    expect(history).toMatchObject({ onHand: 5, held: 0, available: 5 });
    expect(history.movements).toEqual([
      expect.objectContaining({
        kind: "adjustment",
        quantity: 5,
        reason: "found",
        note: "Box in the back room",
        staffName: "Kofi Boateng",
        balance: 5,
      }),
    ]);
  });
});

describe("Stock can't go negative", () => {
  test("an Adjustment taking out more than is on hand is refused and records nothing", async () => {
    const { kofi, small } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 2,
      reason: "recount",
    });

    const result = await refusal(
      kofi.mutation(api.backOffice.stock.adjust, {
        variantId: small,
        quantity: -3,
        reason: "damaged",
      }),
    );

    expect(result).toBe("NOT_ENOUGH_STOCK");
    const history = await kofi.query(api.backOffice.stock.variant, {
      variantId: small,
    });
    expect(history.onHand).toBe(2);
    expect(history.movements).toHaveLength(1);
  });

  test("quantities are whole units, and an Adjustment of zero is refused", async () => {
    const { kofi, small } = await stockroom();

    for (const quantity of [0, 1.5, Number.NaN]) {
      const result = await refusal(
        kofi.mutation(api.backOffice.stock.adjust, {
          variantId: small,
          quantity,
          reason: "other",
        }),
      );
      expect(result).toBe("INVALID_QUANTITY");
    }
  });
});

describe("Staff record Sold offline", () => {
  test("Sold offline takes units out of Stock with a note and no price", async () => {
    const { owner, kofi, small } = await stockroom();
    await owner.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 4,
      reason: "recount",
    });

    await kofi.mutation(api.backOffice.stock.sellOffline, {
      variantId: small,
      quantity: 3,
      note: "  Walk-in, cash ",
    });

    const history = await kofi.query(api.backOffice.stock.variant, {
      variantId: small,
    });
    expect(history).toMatchObject({ onHand: 1, available: 1 });
    expect(history.movements[0]).toEqual({
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "soldOffline",
      quantity: -3,
      note: "Walk-in, cash",
      staffName: "Kofi Boateng",
      balance: 1,
    });
    expect(history.movements[1]).toMatchObject({
      staffName: "Ama Mensah",
      balance: 4,
    });
  });

  test("selling more than is on hand, or a negative quantity, is refused", async () => {
    const { kofi, small } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 1,
      reason: "found",
    });

    expect(
      await refusal(
        kofi.mutation(api.backOffice.stock.sellOffline, {
          variantId: small,
          quantity: 2,
        }),
      ),
    ).toBe("NOT_ENOUGH_STOCK");
    expect(
      await refusal(
        kofi.mutation(api.backOffice.stock.sellOffline, {
          variantId: small,
          quantity: -1,
        }),
      ),
    ).toBe("INVALID_QUANTITY");
  });
});

describe("More → Stock lists Variants with their counts", () => {
  test("each Product lists its Variants with on-hand, held and available", async () => {
    const { kofi, productId, small, medium } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: medium,
      quantity: 7,
      reason: "recount",
    });

    expect(await kofi.query(api.backOffice.stock.list, {})).toEqual([
      {
        _id: productId,
        name: "Kente Weekend Tote",
        status: "draft",
        variants: [
          {
            _id: small,
            optionValues: ["S"],
            sku: "KWT-S",
            onHand: 0,
            held: 0,
            available: 0,
          },
          {
            _id: medium,
            optionValues: ["M"],
            sku: "KWT-M",
            onHand: 7,
            held: 0,
            available: 7,
          },
        ],
      },
    ]);
  });

  test("only signed-in, active Staff see or change Stock", async () => {
    const { t, small } = await stockroom();

    expect(await refusal(t.query(api.backOffice.stock.list, {}))).toBe("UNAUTHENTICATED");
    expect(
      await refusal(
        t.mutation(api.backOffice.stock.adjust, {
          variantId: small,
          quantity: 1,
          reason: "found",
        }),
      ),
    ).toBe("UNAUTHENTICATED");
  });
});

describe("Variants saved before Stock existed", () => {
  test("a Variant with no counters reads as empty and takes its first Adjustment", async () => {
    const { t, kofi, small } = await stockroom();
    await t.run((ctx) => ctx.db.patch(small, { stockOnHand: undefined, stockHeld: undefined }));

    expect(await kofi.query(api.backOffice.stock.variant, { variantId: small })).toMatchObject({
      onHand: 0,
      held: 0,
      available: 0,
    });
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 2,
      reason: "recount",
    });

    expect(await kofi.query(api.backOffice.stock.variant, { variantId: small })).toMatchObject({
      onHand: 2,
      available: 2,
    });
    expect(await t.query(internal.system.stock.checkConsistency, {})).toEqual([]);
  });
});

describe("Variant counters always equal the ledger", () => {
  test("after a run of movements, on-hand is the ledger's sum and the check finds no drift", async () => {
    const { t, owner, kofi, small, medium } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 10,
      reason: "recount",
    });
    await kofi.mutation(api.backOffice.stock.sellOffline, {
      variantId: small,
      quantity: 4,
    });
    await owner.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: -1,
      reason: "damaged",
    });
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: medium,
      quantity: 2,
      reason: "found",
    });
    await refusal(
      kofi.mutation(api.backOffice.stock.sellOffline, {
        variantId: medium,
        quantity: 3,
      }),
    );

    const history = await kofi.query(api.backOffice.stock.variant, {
      variantId: small,
    });
    expect(history.onHand).toBe(5);
    expect(history.movements.map((movement) => movement.balance)).toEqual([5, 6, 10]);
    expect(await t.query(internal.system.stock.checkConsistency, {})).toEqual([]);
  });

  test("the consistency check reports a Variant whose counter has drifted from its ledger", async () => {
    const { t, kofi, small } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: small,
      quantity: 3,
      reason: "recount",
    });
    await t.run((ctx) => ctx.db.patch(small, { stockOnHand: 8 }));

    expect(await t.query(internal.system.stock.checkConsistency, {})).toEqual([
      { variantId: small, stockOnHand: 8, ledger: 3 },
    ]);
  });
});

describe("Variants with Stock history are kept", () => {
  test("a Product save that would remove a Variant with Stock Movements is refused", async () => {
    const { owner, kofi, productId, small, medium } = await stockroom();
    await kofi.mutation(api.backOffice.stock.adjust, {
      variantId: medium,
      quantity: 1,
      reason: "found",
    });

    const result = await refusal(
      owner.mutation(api.backOffice.products.save, {
        productId,
        name: "Kente Weekend Tote",
        description: "",
        gallery: [],
        options: [{ name: "Size", values: ["S"] }],
        variants: [{ variantId: small, optionValues: ["S"], sku: "KWT-S" }],
        sellInStock: true,
        publish: false,
      }),
    );

    expect(result).toBe("VARIANT_HAS_STOCK");
  });
});
