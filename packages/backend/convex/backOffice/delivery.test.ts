import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { accraDelivery, paidOrder, withShop, withZones } from "../test.checkout";
import { refusal, withStaffMember } from "../test.staff";

/** The shop with Kofi's paid Delivery order to Accra Central, and Esi in the Back Office. */
async function dispatchDesk() {
  const shop = await withShop();
  const zones = await withZones(shop.t);
  const esi = await withStaffMember(shop.t, "Esi Ofori");
  const order = await paidOrder(
    shop.t,
    shop.customerId,
    [{ variantId: shop.small, quantity: 1 }],
    accraDelivery(zones.accra),
  );
  return { ...shop, ...zones, esi, order };
}

describe("dispatching a Delivery order", () => {
  test("a Ready Delivery order goes out with its rider, recorded against the Staff member", async () => {
    const { esi, order } = await dispatchDesk();

    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "  Yaw Mensah ",
    });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("dispatched");
    expect(detail.history).toEqual([
      expect.objectContaining({ kind: "paid", by: "System" }),
      expect.objectContaining({ kind: "dispatched", by: "Esi Ofori", riderName: "Yaw Mensah" }),
    ]);
  });

  test("the rider's name is required", async () => {
    const { esi, order } = await dispatchDesk();

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.dispatch, { orderId: order.orderId, riderName: " " }),
      ),
    ).toBe("RIDER_REQUIRED");
    expect((await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).status).toBe(
      "ready",
    );
  });

  test("a Pickup order can't be dispatched", async () => {
    const { t, esi, customerId, medium } = await dispatchDesk();
    const pickup = await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }]);

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.dispatch, { orderId: pickup.orderId, riderName: "Yaw" }),
      ),
    ).toBe("NOT_DISPATCHABLE");
  });

  test("it needs every invoice on the order paid: an Elsewhere fee still to quote holds it", async () => {
    const { t, esi, customerId, medium, elsewhere } = await dispatchDesk();
    const { deliveryFee: _fee, ...unpriced } = accraDelivery(elsewhere);
    const unquoted = await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }], {
      ...unpriced,
      zoneName: "Elsewhere in Ghana",
    });
    // Even if it were somehow Ready, the unpaid fee keeps the rider waiting.
    await t.run((ctx) => ctx.db.patch(unquoted.orderId, { status: "ready" }));

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.dispatch, {
          orderId: unquoted.orderId,
          riderName: "Yaw",
        }),
      ),
    ).toBe("NOT_DISPATCHABLE");
  });

  test("an order already out can't be dispatched again", async () => {
    const { esi, order } = await dispatchDesk();
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.dispatch, {
          orderId: order.orderId,
          riderName: "Kwesi",
        }),
      ),
    ).toBe("NOT_DISPATCHABLE");
  });

  test("only Staff can dispatch", async () => {
    const { customer, order } = await dispatchDesk();

    expect(
      await refusal(
        customer.mutation(api.backOffice.orders.dispatch, {
          orderId: order.orderId,
          riderName: "Yaw",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("after the rider sets off", () => {
  test("a Dispatched order is marked Delivered, recorded against the Staff member", async () => {
    const { esi, order } = await dispatchDesk();
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });

    await esi.mutation(api.backOffice.orders.markDelivered, { orderId: order.orderId });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("delivered");
    expect(detail.history.map((event) => [event.kind, event.by])).toEqual([
      ["paid", "System"],
      ["dispatched", "Esi Ofori"],
      ["delivered", "Esi Ofori"],
    ]);
  });

  test("only a Dispatched order can be marked Delivered", async () => {
    const { esi, order } = await dispatchDesk();

    expect(
      await refusal(esi.mutation(api.backOffice.orders.markDelivered, { orderId: order.orderId })),
    ).toBe("NOT_OUT_FOR_DELIVERY");
  });

  test("a failed attempt records the reason and returns the order to Ready with no new fee", async () => {
    const { esi, order } = await dispatchDesk();
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });

    await esi.mutation(api.backOffice.orders.deliveryFailed, {
      orderId: order.orderId,
      reason: "customerNotReachable",
      note: " Phone off all afternoon ",
    });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("ready");
    expect(detail.fulfilment).toMatchObject({ method: "delivery", deliveryFee: 3000 });
    expect(detail.payments).toHaveLength(1);
    expect(detail.toRefund).toBe(0);
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "deliveryFailed",
      by: "Esi Ofori",
      failureReason: "customerNotReachable",
      note: "Phone off all afternoon",
    });

    // It can go out again on a second attempt.
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Kwesi",
    });
    expect((await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).status).toBe(
      "dispatched",
    );
  });

  test("only a Dispatched order can fail delivery", async () => {
    const { esi, order } = await dispatchDesk();

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.deliveryFailed, {
          orderId: order.orderId,
          reason: "wrongAddress",
        }),
      ),
    ).toBe("NOT_OUT_FOR_DELIVERY");
  });
});

test("order detail offers the next step: Dispatch when Ready, then Mark delivered", async () => {
  const { esi, order } = await dispatchDesk();
  const action = async () =>
    (await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).primaryAction;

  expect(await action()).toBe("dispatch");
  await esi.mutation(api.backOffice.orders.dispatch, { orderId: order.orderId, riderName: "Yaw" });
  expect(await action()).toBe("markDelivered");
  await esi.mutation(api.backOffice.orders.markDelivered, { orderId: order.orderId });
  expect(await action()).toBeNull();
});

describe("Today's delivery queues", () => {
  test("Ready Delivery orders wait under To dispatch, then move to Out for delivery", async () => {
    const { t, esi, customerId, medium, order } = await dispatchDesk();
    // A Pickup order stays in the Pickup queue only.
    await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }]);

    const before = await esi.query(api.backOffice.orders.today, {});
    expect(before.readyForPickup).toBe(1);
    expect(before.toDispatch).toEqual([
      expect.objectContaining({
        orderId: order.orderId,
        reference: order.reference,
        customerName: "Kofi Boateng",
        zoneName: "Accra Central",
        area: "East Legon",
        units: 1,
      }),
    ]);
    expect(before.outForDelivery).toEqual([]);

    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });

    const after = await esi.query(api.backOffice.orders.today, {});
    expect(after.toDispatch).toEqual([]);
    expect(after.outForDelivery).toEqual([
      expect.objectContaining({ orderId: order.orderId, riderName: "Yaw" }),
    ]);
  });

  test("a failed attempt puts the order back under To dispatch", async () => {
    const { esi, order } = await dispatchDesk();
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });
    await esi.mutation(api.backOffice.orders.deliveryFailed, {
      orderId: order.orderId,
      reason: "riderIssue",
    });

    const today = await esi.query(api.backOffice.orders.today, {});
    expect(today.toDispatch.map((row) => row.orderId)).toEqual([order.orderId]);
    expect(today.outForDelivery).toEqual([]);
  });
});
