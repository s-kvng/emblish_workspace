import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, paidOrder, withCustomer, withShop } from "../test.checkout";
import { refusal, withStaffMember } from "../test.staff";

/** The shop with Kofi's paid Store Order for 2 Size S totes, and Esi on the Counter. */
async function counter() {
  const shop = await withShop();
  const esi = await withStaffMember(shop.t, "Esi Ofori");
  const order = await paidOrder(shop.t, shop.customerId, [{ variantId: shop.small, quantity: 2 }]);
  return { ...shop, esi, order };
}

describe("the Counter finds an order by its Pickup Code", () => {
  test("a matching code opens the handover card for the ready order", async () => {
    const { esi, order } = await counter();

    const card = await esi.query(api.backOffice.orders.findByCode, { code: order.pickupCode });

    expect(card).toMatchObject({
      orderId: order.orderId,
      reference: "S-0001",
      status: "ready",
      customer: { name: "Kofi Boateng", phone: kofiPhone },
      lines: [{ productName: "Kente Weekend Tote", variantLabel: "S", quantity: 2 }],
      alsoReady: [],
    });
  });

  test("a wrong code finds nothing", async () => {
    const { esi, order } = await counter();
    const wrong = order.pickupCode === "000000" ? "111111" : "000000";

    expect(await esi.query(api.backOffice.orders.findByCode, { code: wrong })).toBeNull();
  });

  test("the card lists the Customer's other ready orders", async () => {
    const { t, esi, medium, customerId, order } = await counter();
    const second = await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }]);

    const card = await esi.query(api.backOffice.orders.findByCode, { code: order.pickupCode });

    expect(card?.alsoReady).toEqual([
      expect.objectContaining({ orderId: second.orderId, reference: "S-0002" }),
    ]);
  });

  test("only Staff can look", async () => {
    const { t, order } = await counter();
    const { customer } = await withCustomer(t, "Esi", "+233201234567");

    expect(
      await refusal(customer.query(api.backOffice.orders.findByCode, { code: order.pickupCode })),
    ).toBe("FORBIDDEN");
  });
});

describe("handing over", () => {
  test("with the right code the order is Collected, recorded against the Staff member", async () => {
    const { esi, order } = await counter();

    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("collected");
    expect(detail.history).toEqual([
      expect.objectContaining({ kind: "paid", by: "System" }),
      expect.objectContaining({ kind: "collected", by: "Esi Ofori" }),
    ]);
    expect(
      await esi.query(api.backOffice.orders.findByCode, { code: order.pickupCode }),
    ).toBeNull();
  });

  test("a wrong code is refused and nothing changes", async () => {
    const { esi, order } = await counter();
    const wrong = order.pickupCode === "000000" ? "111111" : "000000";

    const result = await refusal(
      esi.mutation(api.backOffice.orders.handOver, {
        orders: [{ orderId: order.orderId, code: wrong }],
      }),
    );

    expect(result).toBe("WRONG_CODE");
    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("ready");
  });

  test("without a code it needs an override reason, which is recorded", async () => {
    const { esi, order } = await counter();

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.handOver, { orders: [{ orderId: order.orderId }] }),
      ),
    ).toBe("CODE_OR_REASON_REQUIRED");

    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, override: { reason: "phoneDead" } }],
    });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("collected");
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "collected",
      by: "Esi Ofori",
      overrideReason: "phoneDead",
    });
  });

  test("an Other reason needs a note", async () => {
    const { esi, order } = await counter();

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.handOver, {
          orders: [{ orderId: order.orderId, override: { reason: "other", note: "  " } }],
        }),
      ),
    ).toBe("NOTE_REQUIRED");
  });

  test("the Customer's orders are handed over together, all or nothing", async () => {
    const { t, esi, medium, customerId, order } = await counter();
    const second = await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }]);
    const wrong = second.pickupCode === "000000" ? "111111" : "000000";

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.handOver, {
          orders: [
            { orderId: order.orderId, code: order.pickupCode },
            { orderId: second.orderId, code: wrong },
          ],
        }),
      ),
    ).toBe("WRONG_CODE");
    expect((await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).status).toBe(
      "ready",
    );

    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [
        { orderId: order.orderId, code: order.pickupCode },
        { orderId: second.orderId, override: { reason: "lostSms" } },
      ],
    });
    for (const { orderId } of [order, second]) {
      expect((await esi.query(api.backOffice.orders.get, { orderId })).status).toBe("collected");
    }
  });

  test("an order already collected can't be handed over again", async () => {
    const { esi, order } = await counter();
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.handOver, {
          orders: [{ orderId: order.orderId, override: { reason: "lostSms" } }],
        }),
      ),
    ).toBe("NOT_READY");
  });
});

describe("Today", () => {
  test("counts and lists the orders Ready for pickup, longest waiting first", async () => {
    const { t, esi, medium, order } = await counter();
    const { customerId: amaId } = await withCustomer(t, "Ama Owusu", "+233201234567");
    const amas = await paidOrder(t, amaId, [{ variantId: medium, quantity: 1 }]);
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });

    const today = await esi.query(api.backOffice.orders.today, {});

    // Kofi's order was collected, so only Ama's is waiting.
    expect(today.readyForPickup).toBe(1);
    expect(today.ready).toEqual([
      expect.objectContaining({
        orderId: amas.orderId,
        reference: amas.reference,
        customerName: "Ama Owusu",
        units: 1,
      }),
    ]);
  });
});

describe("searching by phone or Pickup Code", () => {
  test("a phone number, however it's typed, finds the Customer and their orders", async () => {
    const { esi, order } = await counter();

    const results = await esi.query(api.backOffice.orders.search, { query: "024 123 4567" });

    expect(results).toEqual([
      {
        name: "Kofi Boateng",
        phone: kofiPhone,
        orders: [expect.objectContaining({ orderId: order.orderId, status: "ready" })],
      },
    ]);
  });

  test("a Pickup Code finds its order's Customer", async () => {
    const { esi, order } = await counter();

    const results = await esi.query(api.backOffice.orders.search, { query: order.pickupCode });

    expect(results.map((r) => r.phone)).toEqual([kofiPhone]);
  });

  test("anything else finds nobody", async () => {
    const { esi } = await counter();

    expect(await esi.query(api.backOffice.orders.search, { query: "+233209999999" })).toEqual([]);
    expect(await esi.query(api.backOffice.orders.search, { query: "kofi" })).toEqual([]);
  });
});

test("the same order twice in one handover is refused", async () => {
  const { esi, order } = await counter();

  expect(
    await refusal(
      esi.mutation(api.backOffice.orders.handOver, {
        orders: [
          { orderId: order.orderId, code: order.pickupCode },
          { orderId: order.orderId, override: { reason: "lostSms" } },
        ],
      }),
    ),
  ).toBe("DUPLICATE_ORDER");
});

test("one handover can't mix two Customers' orders", async () => {
  const { t, esi, medium, order } = await counter();
  const { customerId: amaId } = await withCustomer(t, "Ama Owusu", "+233201234567");
  const amas = await paidOrder(t, amaId, [{ variantId: medium, quantity: 1 }]);

  expect(
    await refusal(
      esi.mutation(api.backOffice.orders.handOver, {
        orders: [
          { orderId: order.orderId, code: order.pickupCode },
          { orderId: amas.orderId, code: amas.pickupCode },
        ],
      }),
    ),
  ).toBe("DIFFERENT_CUSTOMERS");
});
