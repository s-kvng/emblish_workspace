import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, paidOrder, paidPreorder, withCustomer, withPreorders } from "../test.checkout";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const esiPhone = "+233201234567";

const DAY = 24 * 60 * 60 * 1000;
/** 2 Dec 2026 and 9 Dec 2026, midday in Ghana (GMT). */
const dec2 = Date.UTC(2026, 11, 2, 12);
const dec9 = Date.UTC(2026, 11, 9, 12);

function last<T>(items: T[]) {
  return items[items.length - 1];
}

/** The shop with its two open windows, and the Owner who opened them signed in. */
async function withWindows() {
  const shop = await withPreorders();
  const ama = shop.t.withIdentity({ subject: "auth-window-opener" });
  return { ...shop, ama };
}

describe("Staff move a window along its stages", () => {
  test("stages advance in order only, each writing a stage event with who did it", async () => {
    const { ama, sheaWindow } = await withWindows();

    // An open window must close first.
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.advance, {
          windowId: sheaWindow,
          stage: "orderedFromSupplier",
        }),
      ),
    ).toBe("OUT_OF_ORDER");
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: sheaWindow,
    });
    // No skipping ahead to In transit.
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.advance, {
          windowId: sheaWindow,
          stage: "inTransit",
        }),
      ),
    ).toBe("OUT_OF_ORDER");

    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
      expectedFrom: dec2,
      expectedTo: dec9,
      note: "Shipping by sea this time.",
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "inTransit",
    });
    // Arrived is the arrival ticket's, and nothing goes backwards.
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.advance, {
          windowId: sheaWindow,
          stage: "inTransit",
        }),
      ),
    ).toBe("OUT_OF_ORDER");

    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(window.stage).toBe("inTransit");
    expect(window.events).toEqual([
      expect.objectContaining({ stage: "closed", staffName: "Ama Mensah" }),
      expect.objectContaining({
        stage: "orderedFromSupplier",
        staffName: "Ama Mensah",
        expectedFrom: dec2,
        expectedTo: dec9,
        note: "Shipping by sea this time.",
      }),
      expect.objectContaining({ stage: "inTransit", staffName: "Ama Mensah" }),
    ]);
  });

  test("Store Quantity is set per Variant when it's ordered from the supplier", async () => {
    const { ama, kaftanWindow, kaftanS, kaftanM, sheaJar } = await withWindows();
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: kaftanWindow,
    });

    for (const [storeQuantities, code] of [
      [[{ variantId: kaftanS, quantity: -1 }], "INVALID_STORE_QUANTITY"],
      [[{ variantId: kaftanS, quantity: 1.5 }], "INVALID_STORE_QUANTITY"],
      [[{ variantId: sheaJar, quantity: 2 }], "INVALID_VARIANTS"],
    ] as const) {
      expect(
        await refusal(
          ama.mutation(api.backOffice.windows.advance, {
            windowId: kaftanWindow,
            stage: "orderedFromSupplier",
            storeQuantities: [...storeQuantities],
          }),
        ),
      ).toBe(code);
    }
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
      storeQuantities: [{ variantId: kaftanS, quantity: 4 }],
    });

    const window = await ama.query(api.backOffice.windows.get, {
      windowId: kaftanWindow,
    });
    expect(window.variants.map((row) => [row.label, row.storeQuantity])).toEqual([
      ["S", 4],
      ["M", 0],
    ]);
    // It's only entered at "Ordered from supplier".
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.advance, {
          windowId: kaftanWindow,
          stage: "inTransit",
          storeQuantities: [{ variantId: kaftanM, quantity: 1 }],
        }),
      ),
    ).toBe("INVALID_STORE_QUANTITY");
  });
});

/** Kofi holds two Shea Pre-orders, Esi one, and Yaw cancelled his; the window has closed. */
async function closedWithHolders() {
  const shop = await withWindows();
  const { t, ama, customerId, sheaWindow, sheaJar } = shop;
  const esi = await withCustomer(t, "Esi Owusu", esiPhone);
  const yaw = await withCustomer(t, "Yaw Darko", "+233551234567");
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 2 }]);
  await paidPreorder(t, esi.customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  const yawsRef = await paidPreorder(t, yaw.customerId, sheaWindow, [
    { variantId: sheaJar, quantity: 1 },
  ]);
  await t.run(async (ctx) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", yawsRef))
      .unique();
    await ctx.db.patch(order!._id, { status: "cancelled" });
  });
  await ama.mutation(api.backOffice.windows.closeNow, {
    windowId: sheaWindow,
  });
  // Payment confirmations aren't what's under test.
  await sms.to(t, kofiPhone.slice(1));
  await sms.to(t, esiPhone.slice(1));
  await sms.to(t, "233551234567");
  return shop;
}

describe("Text N Customers", () => {
  test("the sheet counts the Customers and previews their SMS", async () => {
    const { ama, sheaWindow } = await closedWithHolders();

    const sheet = await ama.query(api.backOffice.windows.stageSheet, {
      windowId: sheaWindow,
      expectedFrom: dec2,
      expectedTo: dec9,
    });

    expect(sheet).toEqual({
      next: "orderedFromSupplier",
      customers: 2,
      preview:
        "P-0001 and P-0002 (Shea Body Butter): ordered from our supplier. Expected in Ghana " +
        "2 to 9 Dec. http://localhost:3001/orders",
    });
  });

  test("marking a stage queues one stage SMS per Pre-order holder through the outbox", async () => {
    const { t, ama, sheaWindow } = await closedWithHolders();

    const { texted } = await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
      expectedFrom: dec2,
      expectedTo: dec9,
    });
    expect(texted).toBe(2);

    expect((await sms.to(t, kofiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0001 and P-0002 (Shea Body Butter): ordered from our supplier. Expected in Ghana " +
        "2 to 9 Dec. http://localhost:3001/orders",
    ]);
    expect((await sms.to(t, esiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0003 (Shea Body Butter): ordered from our supplier. Expected in Ghana 2 to 9 Dec. " +
        "http://localhost:3001/orders",
    ]);
    expect(await sms.to(t, "233551234567")).toEqual([]);

    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "inTransit",
      expectedFrom: dec9,
      expectedTo: dec9 + 7 * DAY,
    });
    expect((await sms.to(t, esiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0003 (Shea Body Butter) is on its way to Ghana. Expected 9 to 16 Dec. " +
        "http://localhost:3001/orders",
    ]);
    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(window.events.map((event) => [event.stage, event.texted])).toEqual([
      ["closed", undefined],
      ["orderedFromSupplier", 2],
      ["inTransit", 2],
    ]);
  });

  test("after Ordered from supplier, the window takes no new Pre-orders", async () => {
    const { customer, ama, sheaWindow, sheaJar } = await closedWithHolders();
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
    });

    expect(
      await refusal(
        customer.mutation(api.storefront.checkout.start, {
          lines: [{ variantId: sheaJar, quantity: 1, windowId: sheaWindow }],
        }),
      ),
    ).toBe("PREORDER_CLOSED");
  });
});

describe("Customer tracking", () => {
  test("a Pre-order card shows its window's timeline from the stage events", async () => {
    const { t, ama, customer, customerId, small, sheaWindow, sheaJar } = await withWindows();
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 2 }]);
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: sheaWindow,
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
      expectedFrom: dec2,
      expectedTo: dec9,
      note: "Shipping by sea this time.",
    });

    const cards = await customer.query(api.storefront.orders.mine, {});
    const preorder = cards.find((card) => card.kind === "preorder");
    const store = cards.find((card) => card.kind === "store");

    expect(store?.window).toBeUndefined();
    expect(preorder?.window).toEqual({
      number: 1,
      stage: "orderedFromSupplier",
      timeline: [
        { stage: "closed", at: expect.any(Number) },
        {
          stage: "orderedFromSupplier",
          at: expect.any(Number),
          expectedFrom: dec2,
          expectedTo: dec9,
          note: "Shipping by sea this time.",
        },
      ],
    });
  });
});

describe("Change expected dates or note", () => {
  /** The Shea window, ordered from the supplier for 2 to 9 Dec with a note, texting Kofi and Esi. */
  async function orderedWithHolders() {
    const shop = await closedWithHolders();
    const { t, ama, sheaWindow } = shop;
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
      expectedFrom: dec2,
      expectedTo: dec9,
      note: "Shipping by sea this time.",
    });
    await sms.to(t, kofiPhone.slice(1));
    await sms.to(t, esiPhone.slice(1));
    return shop;
  }

  test("new dates text every Pre-order holder that the arrival moved", async () => {
    const { t, ama, sheaWindow } = await orderedWithHolders();

    const { texted } = await ama.mutation(api.backOffice.windows.change, {
      windowId: sheaWindow,
      expectedFrom: dec9,
      expectedTo: dec9 + 7 * DAY,
      note: "Shipping by sea this time.",
    });

    expect(texted).toBe(2);
    expect((await sms.to(t, kofiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0001 and P-0002 (Shea Body Butter): new expected arrival 9 to 16 Dec. Sorry for the " +
        "wait. http://localhost:3001/orders",
    ]);
    expect((await sms.to(t, esiPhone.slice(1))).map((text) => text.message)).toEqual([
      "P-0003 (Shea Body Butter): new expected arrival 9 to 16 Dec. Sorry for the wait. " +
        "http://localhost:3001/orders",
    ]);
    expect(await sms.to(t, "233551234567")).toEqual([]);
  });

  test("a change to the note alone saves without an SMS", async () => {
    const { t, ama, sheaWindow } = await orderedWithHolders();

    const { texted } = await ama.mutation(api.backOffice.windows.change, {
      windowId: sheaWindow,
      expectedFrom: dec2,
      expectedTo: dec9,
      note: "Flown in after all.",
    });

    expect(texted).toBe(0);
    expect(await sms.to(t, kofiPhone.slice(1))).toEqual([]);
    expect(await sms.to(t, esiPhone.slice(1))).toEqual([]);
  });

  test("the sheet previews the new-dates SMS for the current stage", async () => {
    const { ama, sheaWindow } = await orderedWithHolders();

    expect(
      await ama.query(api.backOffice.windows.changeSheet, {
        windowId: sheaWindow,
        expectedFrom: dec9,
        expectedTo: dec9 + 7 * DAY,
      }),
    ).toEqual({
      stage: "orderedFromSupplier",
      customers: 2,
      preview:
        "P-0001 and P-0002 (Shea Body Butter): new expected arrival 9 to 16 Dec. Sorry for the " +
        "wait. http://localhost:3001/orders",
    });
  });

  test("both timelines show the latest dates and note, and who changed them", async () => {
    const { ama, customer, sheaWindow } = await orderedWithHolders();
    await ama.mutation(api.backOffice.windows.change, {
      windowId: sheaWindow,
      expectedFrom: dec9,
      expectedTo: dec9 + 7 * DAY,
      note: "The ship is running late.",
    });

    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(last(window.events)).toEqual(
      expect.objectContaining({
        stage: "orderedFromSupplier",
        staffName: "Ama Mensah",
        expectedFrom: dec9,
        expectedTo: dec9 + 7 * DAY,
        note: "The ship is running late.",
        texted: 2,
        changedAt: expect.any(Number),
        changedByName: "Ama Mensah",
      }),
    );

    const cards = await customer.query(api.storefront.orders.mine, {});
    const preorder = cards.find((card) => card.kind === "preorder");
    expect(last(preorder?.window?.timeline ?? [])).toEqual({
      stage: "orderedFromSupplier",
      at: expect.any(Number),
      expectedFrom: dec9,
      expectedTo: dec9 + 7 * DAY,
      note: "The ship is running late.",
    });

    // Clearing the note takes it off both.
    await ama.mutation(api.backOffice.windows.change, {
      windowId: sheaWindow,
      expectedFrom: dec9,
      expectedTo: dec9 + 7 * DAY,
    });
    const again = await customer.query(api.storefront.orders.mine, {});
    expect(last(again.find((card) => card.kind === "preorder")?.window?.timeline ?? [])?.note).toBe(
      undefined,
    );
  });

  test("it changes the current stage, In transit included, and only once one is marked", async () => {
    const { t, ama, sheaWindow } = await closedWithHolders();
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.change, {
          windowId: sheaWindow,
          expectedFrom: dec2,
          expectedTo: dec9,
        }),
      ),
    ).toBe("NOT_CHANGEABLE");
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "orderedFromSupplier",
      expectedFrom: dec2,
      expectedTo: dec9,
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: sheaWindow,
      stage: "inTransit",
      expectedFrom: dec9,
      expectedTo: dec9,
    });
    for (const [dates, code] of [
      [{ expectedFrom: dec9 }, "INVALID_DATES"],
      [{ expectedFrom: dec9, expectedTo: dec2 }, "INVALID_DATES"],
    ] as const) {
      expect(
        await refusal(ama.mutation(api.backOffice.windows.change, { windowId: sheaWindow, ...dates })),
      ).toBe(code);
    }

    await ama.mutation(api.backOffice.windows.change, {
      windowId: sheaWindow,
      expectedFrom: dec9 + DAY,
      expectedTo: dec9 + DAY,
    });
    const window = await ama.query(api.backOffice.windows.get, {
      windowId: sheaWindow,
    });
    expect(window.events.map((event) => [event.stage, event.expectedFrom])).toEqual([
      ["closed", undefined],
      ["orderedFromSupplier", dec2],
      ["inTransit", dec9 + DAY],
    ]);

    await t.run((ctx) => ctx.db.patch(sheaWindow, { stage: "arrived" }));
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.change, {
          windowId: sheaWindow,
          expectedFrom: dec9,
          expectedTo: dec9,
        }),
      ),
    ).toBe("NOT_CHANGEABLE");
  });
});

describe("Store Quantity until arrival", () => {
  test("it can be changed in either later stage, texting no one, but not once arrived", async () => {
    const { t, ama, kaftanWindow, kaftanS, kaftanM, sheaJar } = await withWindows();
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: kaftanWindow,
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
      storeQuantities: [{ variantId: kaftanS, quantity: 4 }],
    });

    for (const [storeQuantities, code] of [
      [[{ variantId: kaftanS, quantity: -1 }], "INVALID_STORE_QUANTITY"],
      [[{ variantId: kaftanS, quantity: 1.5 }], "INVALID_STORE_QUANTITY"],
      [[{ variantId: sheaJar, quantity: 2 }], "INVALID_VARIANTS"],
      [
        [
          { variantId: kaftanS, quantity: 1 },
          { variantId: kaftanS, quantity: 2 },
        ],
        "INVALID_VARIANTS",
      ],
    ] as const) {
      expect(
        await refusal(
          ama.mutation(api.backOffice.windows.change, {
            windowId: kaftanWindow,
            storeQuantities: [...storeQuantities],
          }),
        ),
      ).toBe(code);
    }

    await ama.mutation(api.backOffice.windows.change, {
      windowId: kaftanWindow,
      storeQuantities: [{ variantId: kaftanM, quantity: 2 }],
    });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "inTransit",
    });
    const { texted } = await ama.mutation(api.backOffice.windows.change, {
      windowId: kaftanWindow,
      storeQuantities: [{ variantId: kaftanS, quantity: 6 }],
    });
    expect(texted).toBe(0);

    const window = await ama.query(api.backOffice.windows.get, {
      windowId: kaftanWindow,
    });
    expect(window.variants.map((row) => [row.label, row.storeQuantity])).toEqual([
      ["S", 6],
      ["M", 2],
    ]);

    await t.run((ctx) => ctx.db.patch(kaftanWindow, { stage: "arrived" }));
    expect(
      await refusal(
        ama.mutation(api.backOffice.windows.change, {
          windowId: kaftanWindow,
          storeQuantities: [{ variantId: kaftanS, quantity: 1 }],
        }),
      ),
    ).toBe("NOT_CHANGEABLE");
  });
});
