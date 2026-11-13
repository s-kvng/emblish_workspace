import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, paidPreorder, stockOf, withCustomer, withPreorders } from "../test.checkout";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const esiPhone = "+233201234567";

/**
 * The Shea window (one Variant at GHS 90), ordered from the supplier with a Store Quantity of
 * 2: Kofi pre-ordered 1 (P-0001) then 2 (P-0002), and Esi 1 (P-0003). 6 units are expected.
 */
async function sheaOrdered() {
  const shop = await withPreorders();
  const { t, customerId, sheaWindow, sheaJar } = shop;
  const ama = t.withIdentity({ subject: "auth-window-opener" });
  const esi = await withCustomer(t, "Esi Owusu", esiPhone);
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 2 }]);
  await paidPreorder(t, esi.customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  await ama.mutation(api.backOffice.windows.closeNow, { windowId: sheaWindow });
  await ama.mutation(api.backOffice.windows.advance, {
    windowId: sheaWindow,
    stage: "orderedFromSupplier",
    storeQuantities: [{ variantId: sheaJar, quantity: 2 }],
  });
  // Payment and stage texts aren't what's under test.
  await sms.to(t, kofiPhone.slice(1));
  await sms.to(t, esiPhone.slice(1));
  return { ...shop, ama, esi };
}

/** The Refunds still to make, as `kind reference amount`. */
async function refundsFlagged(ama: Awaited<ReturnType<typeof sheaOrdered>>["ama"]) {
  const { refunds } = await ama.query(api.backOffice.refunds.toMake, {});
  return refunds.map((r) => `${r.kind} ${r.orderReference} ${r.amount}`);
}

describe("Lock arrival", () => {
  test("units fill Pre-orders, then Store Quantity, and the rest is Surplus into Stock", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 7 }],
    });

    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
    });
    expect(allocation?.locked).toBe(true);
    expect(allocation?.variants).toEqual([
      expect.objectContaining({
        variantId: sheaJar,
        arrived: 7,
        toPreorders: 4,
        toStore: 2,
        surplus: 1,
        shortfall: 0,
      }),
    ]);
    expect(allocation?.preorders.map((p) => [p.reference, p.got, p.ordered, p.refund])).toEqual([
      ["P-0001", 1, 1, 0],
      ["P-0002", 2, 2, 0],
      ["P-0003", 1, 1, 0],
    ]);
    // Store Quantity and Surplus enter Stock as one arrival movement.
    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 3,
      held: 0,
      available: 3,
    });
    const { movements } = await ama.query(api.backOffice.stock.variant, {
      variantId: sheaJar,
    });
    expect(movements.map((m) => [m.kind, m.quantity, m.staffName])).toEqual([
      ["arrival", 3, "Ama Mensah"],
    ]);
    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(window.stage).toBe("arrived");
    expect(await refundsFlagged(ama)).toEqual([]);
  });

  test("a Shortfall fills the earliest Pre-orders and refunds the rest on their Item Payments", async () => {
    const { t, ama, customer, sheaWindow, sheaJar } = await sheaOrdered();

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 2 }],
    });

    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
    });
    expect(allocation?.variants).toEqual([
      expect.objectContaining({
        arrived: 2,
        toPreorders: 2,
        toStore: 0,
        surplus: 0,
        shortfall: 2,
      }),
    ]);
    expect(allocation?.preorders.map((p) => [p.reference, p.got, p.ordered, p.refund])).toEqual([
      ["P-0001", 1, 1, 0],
      ["P-0002", 1, 2, 9000],
      ["P-0003", 0, 1, 9000],
    ]);
    // Nothing is left for the Store Quantity, so nothing enters Stock.
    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 0,
      held: 0,
      available: 0,
    });
    expect(await refundsFlagged(ama)).toEqual(["shortfall P-0002 9000", "shortfall P-0003 9000"]);
    // Each refund comes from the payment that paid for its Pre-order.
    const linked = await t.run(async (ctx) => {
      const refunds = await ctx.db.query("refunds").collect();
      return Promise.all(
        refunds.map(async (r) => (await ctx.db.get(r.orderId!))?.paymentId === r.paymentId),
      );
    });
    expect(linked).toEqual([true, true]);
    // Esi got nothing, so her Pre-order ends cancelled; Kofi's partly-filled one goes on.
    const statuses = await t.run(async (ctx) =>
      (await ctx.db.query("orders").collect()).map((o) => [
        o.reference,
        o.status,
        o.cancelReason ?? null,
      ]),
    );
    expect(statuses).toEqual([
      ["P-0001", "awaitingArrival", null],
      ["P-0002", "awaitingArrival", null],
      ["P-0003", "cancelled", "nothingArrived"],
    ]);
    const kofisCards = await customer.query(api.storefront.orders.mine, {});
    expect(kofisCards.map((card) => card.reference).sort()).toEqual(["P-0001", "P-0002"]);
  });

  test("a Shortfall eats into Store Quantity before any Pre-order loses a unit", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 5 }],
    });

    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
    });
    expect(allocation?.variants).toEqual([
      expect.objectContaining({
        arrived: 5,
        toPreorders: 4,
        toStore: 1,
        surplus: 0,
        shortfall: 0,
      }),
    ]);
    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 1,
      held: 0,
      available: 1,
    });
    expect(await refundsFlagged(ama)).toEqual([]);
  });

  test("allocation is per Variant, and a later Pre-order can be filled where an earlier one is short", async () => {
    const { t, customerId, kaftanWindow, kaftanS, kaftanM } = await withPreorders();
    const esi = await withCustomer(t, "Esi Owusu", esiPhone);
    const ama = t.withIdentity({ subject: "auth-window-opener" });
    // P-0001 Kofi 1 S + 1 M, P-0002 Esi 2 M, P-0003 Kofi 2 S.
    await paidPreorder(t, customerId, kaftanWindow, [
      { variantId: kaftanS, quantity: 1 },
      { variantId: kaftanM, quantity: 1 },
    ]);
    await paidPreorder(t, esi.customerId, kaftanWindow, [{ variantId: kaftanM, quantity: 2 }]);
    await paidPreorder(t, customerId, kaftanWindow, [{ variantId: kaftanS, quantity: 2 }]);
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: kaftanWindow,
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
    });

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: kaftanWindow,
      counts: [
        { variantId: kaftanS, arrived: 3 },
        { variantId: kaftanM, arrived: 2 },
      ],
    });

    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: kaftanWindow,
    });
    expect(allocation?.preorders.map((p) => [p.reference, p.got, p.ordered, p.refund])).toEqual([
      ["P-0001", 2, 2, 0],
      ["P-0002", 1, 2, 40000],
      ["P-0003", 2, 2, 0],
    ]);
    expect(allocation?.variants.map((v) => [v.label, v.toPreorders, v.shortfall])).toEqual([
      ["S", 3, 0],
      ["M", 2, 1],
    ]);
  });
});

describe("Text Customers on lock", () => {
  test("each Customer gets one Arrived SMS with their units and any refund", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();

    const { texted } = await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 2 }],
    });

    expect(texted).toBe(2);
    expect((await sms.to(t, kofiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0001 and P-0002 (Shea Body Butter) have arrived: 2 of 3 units. We will refund " +
        "GHS 90.00 for the missing unit. Shipping Fee invoice to follow. " +
        "http://localhost:3001/orders",
    ]);
    expect((await sms.to(t, esiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0003 (Shea Body Butter): sorry, your unit did not arrive. We will refund " +
        "GHS 90.00. http://localhost:3001/orders",
    ]);
    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(window.events[window.events.length - 1]).toEqual(
      expect.objectContaining({
        stage: "arrived",
        staffName: "Ama Mensah",
        texted: 2,
      }),
    );
  });

  test("a full arrival says the Shipping Fee invoice will follow", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 6 }],
    });

    expect((await sms.to(t, esiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0003 (Shea Body Butter) has arrived in Ghana: 1 of 1 unit. Your Shipping Fee " +
        "invoice will follow. http://localhost:3001/orders",
    ]);
  });
});

describe("Arrived units are locked once entered", () => {
  test("a second lock, and dates changed after it, are refused", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 6 }],
    });

    expect(
      await refusal(
        ama.mutation(api.backOffice.arrivals.lock, {
          windowId: sheaWindow,
          counts: [{ variantId: sheaJar, arrived: 9 }],
        }),
      ),
    ).toBe("ALREADY_ARRIVED");
    expect(
      await refusal(ama.mutation(api.backOffice.windows.change, { windowId: sheaWindow })),
    ).toBe("NOT_CHANGEABLE");
    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
    });
    expect(allocation?.variants.map((v) => v.arrived)).toEqual([6]);
    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 2,
      held: 0,
      available: 2,
    });
  });

  test("every offered Variant needs a whole count, and the window must be ordered first", async () => {
    const shop = await withPreorders();
    const { t, kaftanWindow, kaftanS, kaftanM, sheaJar } = shop;
    const ama = t.withIdentity({ subject: "auth-window-opener" });
    const lock = (counts: { variantId: typeof kaftanS; arrived: number }[]) =>
      refusal(
        ama.mutation(api.backOffice.arrivals.lock, {
          windowId: kaftanWindow,
          counts,
        }),
      );
    const both = (s: number, m: number) => [
      { variantId: kaftanS, arrived: s },
      { variantId: kaftanM, arrived: m },
    ];

    expect(await lock(both(1, 1))).toBe("NOT_ORDERED");
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: kaftanWindow,
    });
    expect(await lock(both(1, 1))).toBe("NOT_ORDERED");
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
    });

    expect(await lock([{ variantId: kaftanS, arrived: 1 }])).toBe("COUNT_MISSING");
    expect(await lock(both(-1, 1))).toBe("INVALID_COUNT");
    expect(await lock(both(1.5, 1))).toBe("INVALID_COUNT");
    expect(await lock([...both(1, 1), { variantId: sheaJar, arrived: 1 }])).toBe(
      "INVALID_VARIANTS",
    );
    expect(await lock([...both(1, 1), { variantId: kaftanS, arrived: 1 }])).toBe(
      "INVALID_VARIANTS",
    );
    // Nothing at all may arrive; it's still a count.
    expect(await lock(both(0, 0))).toBe("allowed");
  });

  test("Staff can't cancel a Pre-order once its window has arrived", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 6 }],
    });
    const orderId = await t.run(async (ctx) => {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_reference", (q) => q.eq("reference", "P-0001"))
        .unique();
      return order!._id;
    });

    expect(await refusal(ama.mutation(api.backOffice.orders.cancelPreorder, { orderId }))).toBe(
      "ARRIVED",
    );
  });
});

describe("Who gets what", () => {
  test("previews the counts before the lock, changing nothing", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();

    expect(
      await ama.query(api.backOffice.arrivals.allocation, {
        windowId: sheaWindow,
      }),
    ).toBe(null);
    const preview = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 3 }],
    });

    expect(preview).toEqual({
      locked: false,
      customers: 2,
      variants: [
        {
          variantId: sheaJar,
          label: "",
          arrived: 3,
          toPreorders: 3,
          toStore: 0,
          surplus: 0,
          shortfall: 1,
        },
      ],
      preorders: [
        expect.objectContaining({
          reference: "P-0001",
          customerName: "Kofi Boateng",
          got: 1,
        }),
        expect.objectContaining({ reference: "P-0002", got: 2, refund: 0 }),
        expect.objectContaining({
          reference: "P-0003",
          customerName: "Esi Owusu",
          refund: 9000,
        }),
      ],
    });
    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 0,
      held: 0,
      available: 0,
    });
    expect(await refundsFlagged(ama)).toEqual([]);
  });
});

describe("Late arrivals", () => {
  test("units that turn up after the lock go into Stock as a lateArrival", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();
    const late = (quantity: number) =>
      refusal(
        ama.mutation(api.backOffice.arrivals.lateArrival, {
          windowId: sheaWindow,
          variantId: sheaJar,
          quantity,
          note: "Second box from the courier",
        }),
      );

    expect(await late(2)).toBe("NOT_ARRIVED");
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 2 }],
    });
    expect(await late(0)).toBe("INVALID_QUANTITY");
    expect(await late(1.5)).toBe("INVALID_QUANTITY");
    expect(await late(2)).toBe("allowed");

    expect(await stockOf(t, sheaJar)).toEqual({
      onHand: 2,
      held: 0,
      available: 2,
    });
    const { movements } = await ama.query(api.backOffice.stock.variant, {
      variantId: sheaJar,
    });
    expect(movements.map((m) => [m.kind, m.quantity, m.note])).toEqual([
      ["lateArrival", 2, "Second box from the courier"],
    ]);
    // The Shortfall was settled at the lock: late units don't fill Pre-orders.
    expect(await refundsFlagged(ama)).toEqual(["shortfall P-0002 9000", "shortfall P-0003 9000"]);
  });
});

describe("Arrivals to-do", () => {
  test("lists windows waiting for their arrival, then arrived ones", async () => {
    const { ama, sheaWindow, sheaJar, kaftanWindow } = await sheaOrdered();

    expect(
      (await ama.query(api.backOffice.arrivals.toDo, {})).map((row) => [
        row.productName,
        row.stage,
        row.expected,
      ]),
    ).toEqual([["Shea Body Butter", "orderedFromSupplier", 6]]);
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: kaftanWindow,
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
    });
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 5 }],
    });

    expect(
      (await ama.query(api.backOffice.arrivals.toDo, {})).map((row) => [
        row.productName,
        row.stage,
        row.arrived,
      ]),
    ).toEqual([
      ["Linen Kaftan", "orderedFromSupplier", undefined],
      ["Shea Body Butter", "arrived", 5],
    ]);
  });
});

describe("Deterministic allocation", () => {
  test("Pre-orders placed in the same moment fill in reference order", async () => {
    const { t, ama, sheaWindow, sheaJar } = await sheaOrdered();
    // All three placed at once: the reference breaks the tie, whatever order they're stored in.
    await t.run(async (ctx) => {
      for (const order of await ctx.db.query("orders").collect()) {
        await ctx.db.patch(order._id, { placedAt: 1_000 });
      }
    });

    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 1 }],
    });

    const allocation = await ama.query(api.backOffice.arrivals.allocation, {
      windowId: sheaWindow,
    });
    expect(allocation?.preorders.map((p) => [p.reference, p.got])).toEqual([
      ["P-0001", 1],
      ["P-0002", 0],
      ["P-0003", 0],
    ]);
  });
});
