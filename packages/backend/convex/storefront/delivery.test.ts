import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, withShop, withZones } from "../test.checkout";
import { refusal } from "../test.staff";

describe("Delivery Zones at Checkout", () => {
  test("only active zones are offered, Elsewhere in Ghana last and without a fee", async () => {
    const { t } = await withShop();
    await withZones(t);

    expect(await t.query(api.storefront.catalog.deliveryZones, {})).toEqual([
      expect.objectContaining({
        name: "Accra Central",
        areas: "Osu, Labone, Cantonments",
        fee: 3000,
      }),
      expect.objectContaining({
        name: "Elsewhere in Ghana",
        isElsewhere: true,
      }),
    ]);
    const [, elsewhere] = await t.query(api.storefront.catalog.deliveryZones, {});
    expect(elsewhere).not.toHaveProperty("fee");
  });
});

const address = {
  area: "East Legon",
  street: "12 Boundary Rd",
  landmark: "Opposite the Shell",
};

describe("Pay with Delivery", () => {
  test("a fixed zone's fee is added once per order and frozen with the address", async () => {
    const { t, small, customer } = await withShop();
    const { accra } = await withZones(t);

    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 2 }],
      fulfilment: {
        method: "delivery",
        zoneId: accra,
        ...address,
        ghanaPostGps: " GA-123-4567 ",
      },
    });
    await t.run((ctx) => ctx.db.patch(accra, { fee: 9900 }));

    expect(await customer.query(api.storefront.checkout.get, { checkoutId })).toMatchObject({
      total: 2 * 45000 + 3000,
      fulfilment: {
        method: "delivery",
        zoneName: "Accra Central",
        deliveryFee: 3000,
        recipientName: "Kofi Boateng",
        recipientPhone: kofiPhone,
        ...address,
        ghanaPostGps: "GA-123-4567",
      },
    });
  });

  test("a gift goes to the recipient given, their number in +233 form", async () => {
    const { t, small, customer } = await withShop();
    const { accra } = await withZones(t);

    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 1 }],
      fulfilment: {
        method: "delivery",
        zoneId: accra,
        ...address,
        recipientName: "Esi Owusu",
        recipientPhone: "020 123 4567",
      },
    });

    const { fulfilment } = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(fulfilment).toMatchObject({
      recipientName: "Esi Owusu",
      recipientPhone: "+233201234567",
    });
  });

  test("Elsewhere in Ghana is chosen without a fee, which is quoted later", async () => {
    const { t, small, customer } = await withShop();
    const { elsewhere } = await withZones(t);

    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 1 }],
      fulfilment: { method: "delivery", zoneId: elsewhere, ...address },
    });

    const checkout = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(checkout.total).toBe(45000);
    expect(checkout.fulfilment).toMatchObject({
      zoneName: "Elsewhere in Ghana",
    });
    expect(checkout.fulfilment).not.toHaveProperty("deliveryFee");
  });

  test("is refused for a disabled zone, without a landmark, or to a number that isn't Ghanaian", async () => {
    const { t, small, customer } = await withShop();
    const { accra, tema } = await withZones(t);
    const start = (fulfilment: Record<string, unknown>) =>
      refusal(
        customer.mutation(api.storefront.checkout.start, {
          lines: [{ variantId: small, quantity: 1 }],
          fulfilment: {
            method: "delivery",
            zoneId: accra,
            ...address,
            ...fulfilment,
          } as never,
        }),
      );

    expect(await start({ zoneId: tema })).toBe("ZONE_UNAVAILABLE");
    expect(await start({ landmark: "  " })).toBe("ADDRESS_REQUIRED");
    expect(await start({ area: "" })).toBe("ADDRESS_REQUIRED");
    expect(await start({ recipientPhone: "12345" })).toBe("INVALID_PHONE");
  });
});
