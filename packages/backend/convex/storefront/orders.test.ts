import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { paidOrder, withCustomer, withShop } from "../test.checkout";
import { refusal, withStaffMember } from "../test.staff";

describe("My orders needs a signed-in Customer", () => {
  test("signed out, the feed is refused", async () => {
    const { t } = await withShop();

    expect(await refusal(t.query(api.storefront.orders.mine, {}))).toBe("UNAUTHENTICATED");
  });

  test("Staff aren't Customers, so they can't open it", async () => {
    const { t } = await withShop();
    const esi = await withStaffMember(t, "Esi Ofori");

    expect(await refusal(esi.query(api.storefront.orders.mine, {}))).toBe("FORBIDDEN");
  });
});

describe("a Customer only ever sees their own orders", () => {
  test("another Customer's orders never appear in the feed", async () => {
    const { t, small, medium, customerId, customer } = await withShop();
    const ama = await withCustomer(t, "Ama Owusu", "+233201234567");
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    await paidOrder(t, ama.customerId, [{ variantId: medium, quantity: 1 }]);

    const kofisFeed = await customer.query(api.storefront.orders.mine, {});
    const amasFeed = await ama.customer.query(api.storefront.orders.mine, {});

    expect(kofisFeed.map((card) => card.reference)).toEqual(["S-0001"]);
    expect(amasFeed.map((card) => card.reference)).toEqual(["S-0002"]);
  });

  test("a new Customer has an empty feed", async () => {
    const { t, small, customerId } = await withShop();
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    const newcomer = await withCustomer(t, undefined, "+233501234567");

    expect(await newcomer.customer.query(api.storefront.orders.mine, {})).toEqual([]);
  });
});

describe("a card", () => {
  test("a Ready order shows its reference, Pickup Code, lines and Receipt, and needs action", async () => {
    const { t, small, medium, customerId, customer } = await withShop();
    const order = await paidOrder(t, customerId, [
      { variantId: small, quantity: 2 },
      { variantId: medium, quantity: 1 },
    ]);

    const [card] = await customer.query(api.storefront.orders.mine, {});

    expect(card).toMatchObject({
      orderId: order.orderId,
      reference: "S-0001",
      kind: "store",
      status: "ready",
      needsAction: true,
      past: false,
      pickupCode: order.pickupCode,
      lines: [
        { productName: "Kente Weekend Tote", variantLabel: "S", quantity: 2, unitPrice: 45000 },
        { productName: "Kente Weekend Tote", variantLabel: "M", quantity: 1, unitPrice: 52000 },
      ],
      payment: { amount: 142000, receiptNumber: "R-0001" },
      fulfilment: { method: "pickup", location: "Osu, Oxford Street. Mon-Sat 9am-6pm" },
    });
    expect(card?.payment.receiptCode).toMatch(/^\w{8}$/);
  });
});

describe("the feed's order", () => {
  test("a Collected order is past, with no Pickup Code and nothing to do", async () => {
    const { t, small, customerId, customer } = await withShop();
    const order = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    const esi = await withStaffMember(t, "Esi Ofori");
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });

    const [card] = await customer.query(api.storefront.orders.mine, {});

    expect(card).toMatchObject({ status: "collected", needsAction: false, past: true });
    expect(card).not.toHaveProperty("pickupCode");
  });

  test("orders needing action come first, newest first, and past orders last", async () => {
    const { t, small, customerId, customer } = await withShop();
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    const newest = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    const esi = await withStaffMember(t, "Esi Ofori");
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: newest.orderId, code: newest.pickupCode }],
    });

    const feed = await customer.query(api.storefront.orders.mine, {});

    expect(feed.map((card) => card.reference)).toEqual(["S-0002", "S-0001", "S-0003"]);
  });
});

describe("an expanded card's History", () => {
  test("lists the order's events oldest first, without naming Staff", async () => {
    const { t, small, customerId, customer } = await withShop();
    const order = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    const esi = await withStaffMember(t, "Esi Ofori");
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, override: { reason: "other", note: "Brother collected" } }],
    });

    const [card] = await customer.query(api.storefront.orders.mine, {});

    expect(card?.history).toEqual([
      { kind: "paid", at: expect.any(Number) },
      { kind: "collected", at: expect.any(Number) },
    ]);
  });
});

describe("an expanded card's refunds", () => {
  test("shows each refund on the order as pending until it's refunded", async () => {
    const { t, small, customerId, customer } = await withShop();
    const order = await paidOrder(t, customerId, [{ variantId: small, quantity: 2 }]);
    // Refunds are flagged by settlement or Staff; their own actions arrive with the refunds ticket.
    await t.run(async (ctx) => {
      const placed = await ctx.db.get(order.orderId);
      if (!placed) throw new Error("No order");
      for (const [amount, status] of [
        [45000, "toRefund"],
        [2000, "refunded"],
      ] as const) {
        await ctx.db.insert("refunds", {
          paymentId: placed.paymentId,
          orderId: order.orderId,
          kind: "discretionary",
          amount,
          status,
        });
      }
    });

    const [card] = await customer.query(api.storefront.orders.mine, {});

    expect(card?.refunds).toEqual([
      { amount: 45000, reason: "discretionary", refunded: false },
      { amount: 2000, reason: "discretionary", refunded: true },
    ]);
  });
});

describe("a card's image strip", () => {
  test("each line shows its Variant's photo, else the Product's cover", async () => {
    const { t, small, medium, customerId, customer } = await withShop();
    await t.run(async (ctx) => {
      const cover = await ctx.storage.store(new Blob(["cover"]));
      const red = await ctx.storage.store(new Blob(["red"]));
      const variant = await ctx.db.get(small);
      if (!variant) throw new Error("No Variant");
      await ctx.db.patch(variant.productId, { gallery: [cover, red] });
      await ctx.db.patch(medium, { imageId: red });
    });
    await paidOrder(t, customerId, [
      { variantId: small, quantity: 1 },
      { variantId: medium, quantity: 1 },
    ]);

    const [card] = await customer.query(api.storefront.orders.mine, {});
    const [smallLine, mediumLine] = card?.lines ?? [];

    expect(smallLine?.imageUrl).toEqual(expect.any(String));
    expect(mediumLine?.imageUrl).toEqual(expect.any(String));
    expect(smallLine?.imageUrl).not.toBe(mediumLine?.imageUrl);
  });
});
