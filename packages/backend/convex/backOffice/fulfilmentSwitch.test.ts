import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  accraDelivery,
  kofiPhone,
  paidOrder,
  withCustomer,
  withShop,
  withZones,
} from "../test.checkout";
import { payCodeIn, sheaArrived, sheaInvoiced } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal, withStaffMember } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

/** The Customer pays the invoice behind `code` at `/p/`, and Seev confirms it. */
async function payAtP(t: Awaited<ReturnType<typeof withShop>>["t"], code: string) {
  await t.action(api.storefront.invoices.pay, { code });
  seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
  await t.action(api.storefront.invoices.refresh, { code });
}

/** The test's shop with Delivery Zones, and a way to find an order by its reference. */
async function withZonesOn<Shop extends { t: Awaited<ReturnType<typeof withShop>>["t"] }>(
  shop: Shop,
) {
  const zones = await withZones(shop.t);
  const orderIdOf = async (reference: string) =>
    (await shop.t.run((ctx) =>
      ctx.db
        .query("orders")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .unique(),
    ))!._id;
  return { ...shop, ...zones, orderIdOf };
}

/** Kofi's paid Store Order (1 Size S tote) for Delivery to Accra Central (GHS 30), and Esi (Staff). */
async function accraStoreOrder() {
  const shop = await withShop();
  const zones = await withZones(shop.t);
  const esi = await withStaffMember(shop.t, "Esi Ofori");
  const order = await paidOrder(
    shop.t,
    shop.customerId,
    [{ variantId: shop.small, quantity: 1 }],
    accraDelivery(zones.accra),
  );
  // The payment text isn't what's under test.
  await sms.to(shop.t, kofiPhone.slice(1));
  return { ...shop, ...zones, esi, order };
}

describe("Staff switching a Store Order from Delivery to Pickup", () => {
  test("the paid Delivery Fee is flagged for refund, as the preview said, and the Pickup Code is texted", async () => {
    const { t, esi, order } = await accraStoreOrder();

    const options = await esi.query(api.backOffice.orders.switchOptions, {
      orderId: order.orderId,
    });
    const pickup = options.choices.find((choice) => choice.method === "pickup");
    expect(pickup).toMatchObject({
      difference: -3000,
      effects: [{ kind: "refund", amount: 3000 }],
    });

    const applied = await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: { method: "pickup" },
    });
    expect(applied).toEqual(pickup?.effects);

    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail).toMatchObject({
      status: "ready",
      fulfilment: { method: "pickup" },
      toRefund: 3000,
      primaryAction: "handOver",
    });
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "fulfilmentSwitched",
      by: "Esi Ofori",
      note: "Delivery to Accra Central → Pickup",
    });
    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    expect(refunds).toMatchObject([
      {
        kind: "fulfilmentSwitch",
        amount: 3000,
        deliveryFee: 3000,
        status: "toRefund",
      },
    ]);
    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text?.message).toContain(`Pickup code: ${order.pickupCode}`);
  });
});

/** Kumasi, an active zone dearer than Accra Central: GHS 50. */
async function withKumasi(t: Awaited<ReturnType<typeof withShop>>["t"]) {
  return await t.run((ctx) =>
    ctx.db.insert("deliveryZones", {
      name: "Kumasi",
      areas: "Adum, Bantama",
      fee: 5000,
      isElsewhere: false,
      active: true,
    }),
  );
}

/** Kofi's new address in Kumasi, as the switch sheet's address form sends it. */
function kumasiAddress(zoneId: Id<"deliveryZones">) {
  return {
    method: "delivery" as const,
    zoneId,
    area: "Adum",
    landmark: "Behind Kejetia",
  };
}

describe("switching to a dearer zone after the Delivery Fee was paid", () => {
  test("the difference is billed on a Delivery Fee Invoice; the order waits for it, then is Ready", async () => {
    const { t, esi, order } = await accraStoreOrder();
    const kumasi = await withKumasi(t);

    const options = await esi.query(api.backOffice.orders.switchOptions, {
      orderId: order.orderId,
    });
    const choice = options.choices.find((c) => c.method === "delivery" && c.zoneId === kumasi);
    expect(choice).toMatchObject({
      fee: 5000,
      difference: 2000,
      effects: [{ kind: "newInvoice", amount: 2000 }],
    });

    const applied = await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: kumasiAddress(kumasi),
    });
    expect(applied).toEqual(choice?.effects);

    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text?.message).toMatch(/^Delivery Fee for S-0001 to Kumasi: GHS 20\.00\./);
    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail).toMatchObject({
      status: "paymentDue",
      fulfilment: {
        method: "delivery",
        zoneName: "Kumasi",
        deliveryFee: 5000,
        area: "Adum",
      },
      invoices: [{ kind: "deliveryFee", status: "unpaid", total: 2000 }],
      primaryAction: null,
    });

    await payAtP(t, payCodeIn(text!.message));
    expect(await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).toMatchObject({
      status: "ready",
      primaryAction: "dispatch",
    });
  });
});

describe("switching while the fee is unpaid", () => {
  test("an unpaid Shipping Fee Invoice is voided and reissued with the Delivery Fee, due date kept, and back", async () => {
    const { t, ama, accra, orderIdOf, codes } = await withZonesOn(await sheaInvoiced(sms));
    const orderId = await orderIdOf("P-0001");
    const before = await ama.query(api.backOffice.orders.get, { orderId });
    expect(before.invoices).toMatchObject([{ status: "unpaid", total: 900 }]);

    const options = await ama.query(api.backOffice.orders.switchOptions, {
      orderId,
    });
    const toAccra = options.choices.find((c) => c.method === "delivery" && c.zoneId === accra);
    expect(toAccra).toMatchObject({
      difference: 3000,
      effects: [
        {
          kind: "invoiceReissued",
          number: before.invoices[0]!.number,
          total: 3900,
        },
      ],
    });
    const applied = await ama.mutation(api.backOffice.orders.switchFulfilment, {
      orderId,
      to: {
        method: "delivery",
        zoneId: accra,
        area: "Osu",
        landmark: "Near the Total",
      },
    });
    expect(applied).toEqual(toAccra?.effects);

    const [text] = await sms.to(t, kofiPhone.slice(1));
    const reissued = await t.query(api.storefront.invoices.get, {
      code: payCodeIn(text!.message),
    });
    expect(reissued).toMatchObject({
      status: "unpaid",
      lines: [
        { kind: "shippingFee", units: 1, amount: 900 },
        { kind: "deliveryFee", zoneName: "Accra Central", amount: 3000 },
      ],
      total: 3900,
    });
    expect(reissued?.dueAt).toBe(before.invoices[0]!.dueAt);
    expect(codes.kofi1).not.toBe(payCodeIn(text!.message));

    const back = await ama.query(api.backOffice.orders.switchOptions, {
      orderId,
    });
    const toPickup = back.choices.find((c) => c.method === "pickup");
    expect(toPickup).toMatchObject({
      difference: -3000,
      effects: [{ kind: "invoiceReissued", total: 900 }],
    });
    expect(
      await ama.mutation(api.backOffice.orders.switchFulfilment, {
        orderId,
        to: { method: "pickup" },
      }),
    ).toEqual(toPickup?.effects);
    const after = await ama.query(api.backOffice.orders.get, { orderId });
    expect(after).toMatchObject({ status: "paymentDue", toRefund: 0 });
    expect(after.invoices.filter((i) => i.status === "unpaid")).toMatchObject([{ total: 900 }]);
  });

  test("before its Shipping Fee Invoice, a Pre-order's new Delivery Fee waits to go on it", async () => {
    const { t, ama, accra, orderIdOf, sheaWindow } = await withZonesOn(await sheaArrived(sms));
    const orderId = await orderIdOf("P-0001");

    const options = await ama.query(api.backOffice.orders.switchOptions, {
      orderId,
    });
    const toAccra = options.choices.find((c) => c.method === "delivery" && c.zoneId === accra);
    expect(toAccra).toMatchObject({
      effects: [{ kind: "onComingInvoice", amount: 3000 }],
    });
    await ama.mutation(api.backOffice.orders.switchFulfilment, {
      orderId,
      to: {
        method: "delivery",
        zoneId: accra,
        area: "Osu",
        landmark: "Near the Total",
      },
    });
    expect(await sms.to(t, kofiPhone.slice(1))).toEqual([]);

    await ama.mutation(api.backOffice.invoices.confirmFee, {
      windowId: sheaWindow,
      fee: 900,
    });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });
    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text?.message).toMatch(
      /^Shipping Fee for P-0001 \(1 unit\): GHS 9\.00 \+ delivery GHS 30\.00 = GHS 39\.00\./,
    );
  });
});

describe("when a switch is refused", () => {
  test("once the order is Dispatched, nothing can be switched, even by calling the server", async () => {
    const { t, esi, order, customer } = await accraStoreOrder();
    await esi.mutation(api.backOffice.orders.dispatch, {
      orderId: order.orderId,
      riderName: "Yaw",
    });

    expect(
      await esi.query(api.backOffice.orders.switchOptions, {
        orderId: order.orderId,
      }),
    ).toEqual({ switchable: false, choices: [] });
    expect(await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).toMatchObject({
      canSwitch: false,
    });
    const switchTo = {
      orderId: order.orderId,
      to: { method: "pickup" as const },
    };
    expect(await refusal(esi.mutation(api.backOffice.orders.switchFulfilment, switchTo))).toBe(
      "NOT_SWITCHABLE",
    );
    expect(await refusal(customer.mutation(api.storefront.orders.switchFulfilment, switchTo))).toBe(
      "NOT_SWITCHABLE",
    );
    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail.fulfilment).toMatchObject({
      method: "delivery",
      zoneName: "Accra Central",
    });
    expect(await t.run((ctx) => ctx.db.query("refunds").collect())).toEqual([]);
  });

  test("switching to Delivery needs the area and a landmark", async () => {
    const { t, esi, customerId, small, accra } = await accraStoreOrder();
    const pickup = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.switchFulfilment, {
          orderId: pickup.orderId,
          to: { method: "delivery", zoneId: accra, area: "Osu", landmark: " " },
        }),
      ),
    ).toBe("ADDRESS_REQUIRED");
    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.switchFulfilment, {
          orderId: pickup.orderId,
          to: { method: "pickup" },
        }),
      ),
    ).toBe("NO_CHANGE");
  });
});

describe("the Customer switching from My orders", () => {
  test("their card offers the switch; switching to Elsewhere refunds the zone fee and waits for a quote", async () => {
    const { esi, customer, order } = await accraStoreOrder();
    const [card] = await customer.query(api.storefront.orders.mine, {});
    expect(card).toMatchObject({ canSwitch: true });

    const options = await customer.query(api.storefront.orders.switchOptions, {
      orderId: order.orderId,
    });
    const elsewhere = options.choices.find(
      (c) => c.method === "delivery" && c.zoneName === "Elsewhere in Ghana",
    );
    expect(elsewhere).toMatchObject({
      effects: [{ kind: "refund", amount: 3000 }, { kind: "quoteLater" }],
    });
    expect(elsewhere).not.toHaveProperty("fee");
    const applied = await customer.mutation(api.storefront.orders.switchFulfilment, {
      orderId: order.orderId,
      to: {
        method: "delivery",
        zoneId: (elsewhere as { zoneId: Id<"deliveryZones"> }).zoneId,
        area: "Takoradi",
        landmark: "Market Circle",
      },
    });
    expect(applied).toEqual(elsewhere?.effects);

    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail).toMatchObject({
      status: "paymentDue",
      toRefund: 3000,
      canQuoteDeliveryFee: true,
      primaryAction: null,
    });
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "fulfilmentSwitched",
      by: "Customer",
      note: "Delivery to Accra Central → Delivery to Elsewhere in Ghana",
    });
    const [after] = await customer.query(api.storefront.orders.mine, {});
    expect(after?.refunds).toEqual([{ amount: 3000, reason: "fulfilmentSwitch", refunded: false }]);
  });

  test("a quoted, unpaid Delivery Fee Invoice is voided on switching to Pickup, and the order is Ready", async () => {
    const { t, esi, customer, order, elsewhere } = await accraStoreOrder();
    await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: {
        method: "delivery",
        zoneId: elsewhere,
        area: "Takoradi",
        landmark: "Market Circle",
      },
    });
    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 6000,
    });
    await sms.to(t, kofiPhone.slice(1));
    const quoted = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });

    const options = await customer.query(api.storefront.orders.switchOptions, {
      orderId: order.orderId,
    });
    const pickup = options.choices.find((c) => c.method === "pickup");
    expect(pickup).toMatchObject({
      difference: -6000,
      effects: [
        {
          kind: "invoiceVoided",
          number: quoted.invoices[0]!.number,
          amount: 6000,
        },
      ],
    });
    expect(
      await customer.mutation(api.storefront.orders.switchFulfilment, {
        orderId: order.orderId,
        to: { method: "pickup" },
      }),
    ).toEqual(pickup?.effects);

    const [card] = await customer.query(api.storefront.orders.mine, {});
    expect(card).toMatchObject({
      status: "ready",
      invoices: [],
      pickupCode: order.pickupCode,
    });
    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text?.message).toContain(`Pickup code: ${order.pickupCode}`);
  });

  test("a Customer can't see or switch someone else's order", async () => {
    const { t, order } = await accraStoreOrder();
    const { customer: esi } = await withCustomer(t, "Esi Owusu", "+233201234567");
    expect(
      await refusal(
        esi.query(api.storefront.orders.switchOptions, {
          orderId: order.orderId,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await refusal(
        esi.mutation(api.storefront.orders.switchFulfilment, {
          orderId: order.orderId,
          to: { method: "pickup" },
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("switching down after a paid top-up", () => {
  test("each payment's share of the Delivery Fee is refunded against its own Receipt", async () => {
    const { t, esi, order } = await accraStoreOrder();
    const kumasi = await withKumasi(t);
    await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: kumasiAddress(kumasi),
    });
    const [text] = await sms.to(t, kofiPhone.slice(1));
    await payAtP(t, payCodeIn(text!.message));

    expect(
      await esi.mutation(api.backOffice.orders.switchFulfilment, {
        orderId: order.orderId,
        to: { method: "pickup" },
      }),
    ).toEqual([{ kind: "refund", amount: 5000 }]);

    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    const payments = await t.run((ctx) => ctx.db.query("payments").collect());
    expect(
      refunds.map((r) => ({
        amount: r.amount,
        payment: payments.findIndex((p) => p._id === r.paymentId),
      })),
    ).toEqual([
      { amount: 2000, payment: 1 },
      { amount: 3000, payment: 0 },
    ]);
  });
});

describe("switching back before a refund is paid out", () => {
  test("the pending refund is taken back instead of billing the Customer again", async () => {
    const { t, esi, order, accra } = await accraStoreOrder();
    await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: { method: "pickup" },
    });

    const options = await esi.query(api.backOffice.orders.switchOptions, {
      orderId: order.orderId,
    });
    const back = options.choices.find((c) => c.method === "delivery" && c.zoneId === accra);
    expect(back).toMatchObject({
      difference: 3000,
      effects: [{ kind: "refundCancelled", amount: 3000 }],
    });
    expect(
      await esi.mutation(api.backOffice.orders.switchFulfilment, {
        orderId: order.orderId,
        to: { method: "delivery", zoneId: accra, area: "Osu", landmark: "Near the Total" },
      }),
    ).toEqual(back?.effects);

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail).toMatchObject({ status: "ready", invoices: [], toRefund: 0 });
  });
});

describe("a preview gone stale", () => {
  test("the switch is refused when the money effect changed since the sheet showed it", async () => {
    const { esi, order, accra, customer } = await accraStoreOrder();
    const shown = [{ kind: "refund" as const, amount: 3000 }];
    // Staff switch it to Pickup first, so going back to Accra now takes that refund back.
    await esi.mutation(api.backOffice.orders.switchFulfilment, {
      orderId: order.orderId,
      to: { method: "pickup" },
    });
    expect(
      await refusal(
        customer.mutation(api.storefront.orders.switchFulfilment, {
          orderId: order.orderId,
          to: { method: "delivery", zoneId: accra, area: "Osu", landmark: "Near the Total" },
          expected: shown,
        }),
      ),
    ).toBe("MONEY_CHANGED");
  });
});
