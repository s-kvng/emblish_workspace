import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { kofiPhone, withShop, withZones } from "../test.checkout";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";

const sms = captureSms();
const seev = fakeSeev();

afterEach(() => {
  vi.useRealTimers();
});

const address = { area: "East Legon", landmark: "Opposite the Shell" };

/** Kofi's Checkout for 2 Size S totes (GHS 900) to a zone, handed to Seev. */
async function deliveryCheckout(zone: "accra" | "elsewhere") {
  const shop = await withShop();
  const zones = await withZones(shop.t);
  const { checkoutId } = await shop.customer.mutation(api.storefront.checkout.start, {
    lines: [{ variantId: shop.small, quantity: 2 }],
    fulfilment: { method: "delivery", zoneId: zones[zone], ...address },
  });
  await shop.customer.action(api.storefront.checkout.pay, { checkoutId });
  const reference = seev.sessions[seev.sessions.length - 1]!.reference;
  return { ...shop, ...zones, checkoutId, reference };
}

async function receiptFor(
  shop: Awaited<ReturnType<typeof deliveryCheckout>>,
  checkoutId: Id<"checkouts">,
) {
  const { receiptCode } = await shop.customer.query(api.storefront.checkout.get, { checkoutId });
  const receipt = await shop.t.query(api.storefront.receipts.get, {
    code: receiptCode!,
  });
  return { receipt, receiptCode: receiptCode! };
}

describe("paying for Delivery to a fixed zone", () => {
  test("Seev charges the Delivery Fee as its own line, and the Receipt shows it", async () => {
    const shop = await deliveryCheckout("accra");
    const { customer, checkoutId, reference } = shop;

    expect(seev.sessions[0]?.body.items).toEqual([
      { name: "Kente Weekend Tote (S)", quantity: 2, price: 45000 },
      { name: "Delivery: Accra Central", quantity: 1, price: 3000 },
    ]);
    seev.setStatus(reference, "completed");
    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { receipt } = await receiptFor(shop, checkoutId);
    expect(receipt).toMatchObject({
      total: 93000,
      orders: [
        {
          reference: "S-0001",
          status: "ready",
          fulfilment: {
            method: "delivery",
            zoneName: "Accra Central",
            deliveryFee: 3000,
            recipientName: "Kofi Boateng",
            ...address,
          },
        },
      ],
    });
  });

  test("the public Receipt carries no Pickup Code for it", async () => {
    const shop = await deliveryCheckout("accra");
    seev.setStatus(shop.reference, "completed");
    await shop.customer.action(api.storefront.checkout.refresh, { checkoutId: shop.checkoutId });

    const { receipt } = await receiptFor(shop, shop.checkoutId);
    expect(receipt?.orders[0]).not.toHaveProperty("pickupCode");
  });

  test("the SMS says it will be delivered, without a Pickup Code", async () => {
    const shop = await deliveryCheckout("accra");
    seev.setStatus(shop.reference, "completed");
    await shop.customer.action(api.storefront.checkout.refresh, {
      checkoutId: shop.checkoutId,
    });

    const { receiptCode } = await receiptFor(shop, shop.checkoutId);
    const texts = (await sms.to(shop.t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(receiptCode),
    );
    expect(texts.map((text) => text.message)).toEqual([
      "Emblish: payment of GHS 930.00 received. Order S-0001 will be delivered to Accra " +
        `Central. We will text you when it is on its way. Receipt: http://localhost:3001/r/${receiptCode}`,
    ]);
  });
});

describe("paying for Delivery Elsewhere in Ghana", () => {
  test("the order is placed with no Delivery Fee yet, waiting on Staff's quote", async () => {
    const shop = await deliveryCheckout("elsewhere");
    expect(seev.sessions[0]?.body.items).toEqual([
      { name: "Kente Weekend Tote (S)", quantity: 2, price: 45000 },
    ]);
    seev.setStatus(shop.reference, "completed");
    await shop.customer.action(api.storefront.checkout.refresh, {
      checkoutId: shop.checkoutId,
    });

    const { receipt, receiptCode } = await receiptFor(shop, shop.checkoutId);
    expect(receipt?.total).toBe(90000);
    expect(receipt?.orders[0]).toMatchObject({
      status: "paymentDue",
      fulfilment: { method: "delivery", zoneName: "Elsewhere in Ghana" },
    });
    expect(receipt?.orders[0]?.fulfilment).not.toHaveProperty("deliveryFee");
    const texts = (await sms.to(shop.t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(receiptCode),
    );
    expect(texts.map((text) => text.message)).toEqual([
      "Emblish: payment of GHS 900.00 received for order S-0001. We will text you the " +
        `delivery fee to Elsewhere in Ghana. Receipt: http://localhost:3001/r/${receiptCode}`,
    ]);
  });
});

describe("a late Delivery payment Stock can't fill", () => {
  test("refunds the Delivery Fee along with the goods", async () => {
    vi.useFakeTimers();
    const shop = await deliveryCheckout("accra");
    vi.advanceTimersByTime(30 * 60 * 1000);
    await shop.t.finishInProgressScheduledFunctions();
    await shop.t.run(async (ctx) => {
      const { recordMovement } = await import("../model/stock");
      await recordMovement(ctx, {
        variantId: shop.small,
        kind: "soldOffline",
        quantity: -3,
      });
    });
    seev.setStatus(shop.reference, "completed");

    await shop.customer.action(api.storefront.checkout.refresh, {
      checkoutId: shop.checkoutId,
    });

    const { receipt } = await receiptFor(shop, shop.checkoutId);
    expect(receipt?.orders).toEqual([]);
    expect(receipt?.toRefund).toBe(93000);
  });
});

describe("My orders for a Delivery order", () => {
  test("shows where it's going and no Pickup Code to show", async () => {
    const shop = await deliveryCheckout("accra");
    seev.setStatus(shop.reference, "completed");
    await shop.customer.action(api.storefront.checkout.refresh, {
      checkoutId: shop.checkoutId,
    });

    const [card] = await shop.customer.query(api.storefront.orders.mine, {});
    expect(card).toMatchObject({
      status: "ready",
      needsAction: false,
      fulfilment: {
        method: "delivery",
        zoneName: "Accra Central",
        deliveryFee: 3000,
        ...address,
      },
    });
    expect(card).not.toHaveProperty("pickupCode");
  });
});
