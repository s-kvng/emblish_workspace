import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { kofiPhone, stockOf, windowRow, withPreorders } from "../test.checkout";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

afterEach(() => {
  vi.useRealTimers();
});

describe("Pay checks each window's Minimum Order Quantity across its Variants", () => {
  test("a Pre-order below the minimum is refused; any mix of Variants that meets it is taken", async () => {
    const { customer, kaftanS, kaftanM, kaftanWindow } = await withPreorders();

    const below = await refusal(
      customer.mutation(api.storefront.checkout.start, {
        lines: [{ variantId: kaftanS, quantity: 1, windowId: kaftanWindow }],
      }),
    );
    expect(below).toBe("BELOW_MINIMUM");

    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [
        { variantId: kaftanS, quantity: 1, windowId: kaftanWindow },
        { variantId: kaftanM, quantity: 1, windowId: kaftanWindow },
      ],
    });
    const checkout = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(checkout).toMatchObject({
      status: "pending",
      total: 38000 + 40000,
      orderCount: 1,
      lines: [
        {
          productName: "Linen Kaftan",
          variantLabel: "S",
          quantity: 1,
          unitPrice: 38000,
          orderWindowId: kaftanWindow,
        },
        {
          productName: "Linen Kaftan",
          variantLabel: "M",
          quantity: 1,
          unitPrice: 40000,
          orderWindowId: kaftanWindow,
        },
      ],
    });
  });
});

/** Kofi's mixed Bag: 2 In-stock totes (S), 2 capped Kaftans (S), 1 uncapped Kaftan (M), 3 Shea jars. */
async function mixedCheckout() {
  const shop = await withPreorders();
  const { customer, small, kaftanS, kaftanM, kaftanWindow, sheaJar, sheaWindow } = shop;
  const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
    lines: [
      { variantId: small, quantity: 2 },
      { variantId: kaftanS, quantity: 2, windowId: kaftanWindow },
      { variantId: kaftanM, quantity: 1, windowId: kaftanWindow },
      { variantId: sheaJar, quantity: 3, windowId: sheaWindow },
    ],
  });
  return { ...shop, checkoutId };
}

describe("a mixed Checkout holds Stock and window caps together", () => {
  test("Pay holds the In-stock units and the capped Pre-order units; uncapped lines hold nothing", async () => {
    const { t, customer, checkoutId, small, kaftanS, kaftanM, kaftanWindow, sheaJar, sheaWindow } =
      await mixedCheckout();

    const checkout = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(checkout).toMatchObject({
      total: 2 * 45000 + 2 * 38000 + 40000 + 3 * 9000,
      orderCount: 3,
    });
    expect(await stockOf(t, small)).toMatchObject({ held: 2 });
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
      preordered: 0,
      held: 2,
    });
    expect(await windowRow(t, kaftanWindow, kaftanM)).toEqual({
      preordered: 0,
      held: 0,
    });
    expect(await windowRow(t, sheaWindow, sheaJar)).toEqual({
      preordered: 0,
      held: 0,
    });
    // Pre-order units never touch Stock.
    expect(await stockOf(t, kaftanS)).toEqual({
      onHand: 0,
      held: 0,
      available: 0,
    });
  });

  test("another Customer can't pre-order past the cap while those units are held", async () => {
    const { t, kaftanS, kaftanM, kaftanWindow } = await mixedCheckout();
    const { withCustomer } = await import("../test.checkout");
    const { customer: esi } = await withCustomer(t, "Esi", "+233201234567");

    const result = await refusal(
      esi.mutation(api.storefront.checkout.start, {
        lines: [
          { variantId: kaftanS, quantity: 2, windowId: kaftanWindow },
          { variantId: kaftanM, quantity: 1, windowId: kaftanWindow },
        ],
      }),
    );
    expect(result).toBe("WINDOW_FULL");
  });

  test("changing the Bag releases both kinds of hold", async () => {
    const { t, customer, checkoutId, small, kaftanS, kaftanWindow } = await mixedCheckout();

    await customer.mutation(api.storefront.checkout.release, { checkoutId });

    expect(await stockOf(t, small)).toMatchObject({ held: 0 });
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
      preordered: 0,
      held: 0,
    });
  });

  test("after 30 minutes both kinds lapse together", async () => {
    vi.useFakeTimers();
    const { t, small, kaftanS, kaftanWindow } = await mixedCheckout();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await stockOf(t, small)).toMatchObject({ held: 0 });
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
      preordered: 0,
      held: 0,
    });
  });
});

/** The mixed Checkout handed to Seev; returns its Seev reference. */
async function mixedHandedToSeev() {
  const shop = await mixedCheckout();
  await shop.customer.action(api.storefront.checkout.pay, {
    checkoutId: shop.checkoutId,
  });
  return {
    ...shop,
    reference: seev.sessions[seev.sessions.length - 1]!.reference,
  };
}

describe("a paid mixed Checkout", () => {
  test("becomes one Store Order and one Pre-order per window, on one Receipt with a sub-heading each", async () => {
    const { t, customer, checkoutId, reference, kaftanWindow, sheaWindow } =
      await mixedHandedToSeev();
    // The Owner reprices after Pay: the Checkout keeps the prices it was paid at.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("windowVariants").collect()) {
        await ctx.db.patch(row._id, { preorderPrice: 99900 });
      }
    });
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { status, receiptCode } = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(status).toBe("paid");
    const receipt = await t.query(api.storefront.receipts.get, {
      code: receiptCode!,
    });
    expect(receipt).toMatchObject({
      total: 2 * 45000 + 2 * 38000 + 40000 + 3 * 9000,
      toRefund: 0,
      orders: [
        {
          kind: "store",
          reference: "S-0001",
          status: "ready",
          amount: 90000,
          lines: [
            {
              productName: "Kente Weekend Tote",
              quantity: 2,
              unitPrice: 45000,
            },
          ],
        },
        {
          kind: "preorder",
          reference: "P-0001",
          status: "awaitingArrival",
          amount: 2 * 38000 + 40000,
          lines: [
            {
              productName: "Linen Kaftan",
              variantLabel: "S",
              quantity: 2,
              unitPrice: 38000,
            },
            {
              productName: "Linen Kaftan",
              variantLabel: "M",
              quantity: 1,
              unitPrice: 40000,
            },
          ],
        },
        {
          kind: "preorder",
          reference: "P-0002",
          status: "awaitingArrival",
          amount: 27000,
          lines: [{ productName: "Shea Body Butter", quantity: 3, unitPrice: 9000 }],
        },
      ],
    });
    // A Pre-order's goods haven't arrived, so the Receipt gives no Pickup Code for it yet.
    expect(receipt?.orders[0]?.pickupCode).toMatch(/^\d{6}$/);
    expect(receipt?.orders[1]?.pickupCode).toBeUndefined();

    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    const payment = await t.run((ctx) => ctx.db.query("payments").first());
    expect(orders.map((o) => [o.reference, o.orderWindowId, o.itemPayment])).toEqual([
      ["S-0001", undefined, undefined],
      ["P-0001", kaftanWindow, 116000],
      ["P-0002", sheaWindow, 27000],
    ]);
    expect(orders.every((o) => o.placedAt === payment?.paidAt)).toBe(true);
  });

  test("converts the holds: window places become Pre-ordered units and Stock is Sold", async () => {
    const {
      t,
      customer,
      checkoutId,
      reference,
      small,
      kaftanS,
      kaftanM,
      kaftanWindow,
      sheaJar,
      sheaWindow,
    } = await mixedHandedToSeev();
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    expect(await stockOf(t, small)).toEqual({
      onHand: 1,
      held: 0,
      available: 1,
    });
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
      preordered: 2,
      held: 0,
    });
    expect(await windowRow(t, kaftanWindow, kaftanM)).toEqual({
      preordered: 1,
      held: 0,
    });
    expect(await windowRow(t, sheaWindow, sheaJar)).toEqual({
      preordered: 3,
      held: 0,
    });
  });

  test("its Pre-orders wait for arrival in My orders, and one SMS covers every order", async () => {
    const { t, customer, checkoutId, reference } = await mixedHandedToSeev();
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const mine = await customer.query(api.storefront.orders.mine, {});
    expect(mine.map((card) => [card.reference, card.kind, card.status, card.past])).toEqual([
      ["S-0001", "store", "ready", false],
      ["P-0002", "preorder", "awaitingArrival", false],
      ["P-0001", "preorder", "awaitingArrival", false],
    ]);
    expect(mine.find((card) => card.kind === "preorder")?.pickupCode).toBeUndefined();

    const { receiptCode } = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    const texts = (await sms.to(t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(receiptCode!),
    );
    expect(texts).toHaveLength(1);
    expect(texts[0]?.message).toContain("Order S-0001 is ready for pickup");
    expect(texts[0]?.message).toContain("Pre-orders P-0001, P-0002 placed");
  });

  test("a Pre-order-only Checkout texts its Pre-order and asks for no Delivery Fee yet", async () => {
    const { t, customer, sheaJar, sheaWindow } = await withPreorders();
    const { withZones } = await import("../test.checkout");
    const { accra } = await withZones(t);
    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: sheaJar, quantity: 2, windowId: sheaWindow }],
      fulfilment: {
        method: "delivery",
        zoneId: accra,
        area: "East Legon",
        landmark: "Shell",
      },
    });
    const checkout = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    // Each Pre-order pays its Delivery Fee on its Shipping Fee Invoice, not today.
    expect(checkout).toMatchObject({ total: 18000, orderCount: 1 });
    await customer.action(api.storefront.checkout.pay, { checkoutId });
    const session = seev.sessions[seev.sessions.length - 1]!;
    expect(session.body.items).toEqual([
      { name: "Pre-order: Shea Body Butter", quantity: 2, price: 9000 },
    ]);
    seev.setStatus(session.reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { receiptCode } = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    const texts = (await sms.to(t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(receiptCode!),
    );
    expect(texts.map((text) => text.message)).toEqual([
      "Emblish: payment of GHS 180.00 received. Pre-order P-0001 placed. We will text you " +
        `when it arrives. Receipt: http://localhost:3001/r/${receiptCode}`,
    ]);
  });
});

describe("a late payment, after the Checkout's holds lapsed", () => {
  /** The mixed Checkout handed to Seev, expired, then its Kaftan window moved to `stage`. */
  async function paidLate(stage: "open" | "closed" | "orderedFromSupplier") {
    const shop = await mixedHandedToSeev();
    const { t, kaftanWindow, kaftanS } = shop;
    // Its 30 minutes run out: the expiry job lapses every hold.
    await t.mutation(internal.system.checkout.expire, { checkoutId: shop.checkoutId });
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({ preordered: 0, held: 0 });
    // Meanwhile others fill the Size S cap, and the window moves on.
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("windowVariants")
        .withIndex("by_window", (q) => q.eq("orderWindowId", kaftanWindow))
        .collect();
      const small = rows.find((row) => row.variantId === kaftanS)!;
      await ctx.db.patch(small._id, { preordered: 3 });
      await ctx.db.patch(kaftanWindow, { stage });
    });
    seev.setStatus(shop.reference, "completed");
    await shop.customer.action(api.storefront.checkout.refresh, {
      checkoutId: shop.checkoutId,
    });
    const { receiptCode } = await shop.customer.query(api.storefront.checkout.get, {
      checkoutId: shop.checkoutId,
    });
    const receipt = await t.query(api.storefront.receipts.get, {
      code: receiptCode!,
    });
    return { ...shop, receipt };
  }

  test.each(["open", "closed"] as const)(
    "while the window is %s, the Pre-order is placed even over the cap",
    async (stage) => {
      const { t, receipt, kaftanWindow, kaftanS } = await paidLate(stage);

      expect(receipt?.orders.map((order) => [order.reference, order.status])).toEqual([
        ["S-0001", "ready"],
        ["P-0001", "awaitingArrival"],
        ["P-0002", "awaitingArrival"],
      ]);
      expect(receipt?.toRefund).toBe(0);
      expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
        preordered: 5,
        held: 0,
      });
    },
  );

  test("once it's ordered from the supplier, no Pre-order is placed and its Item Payment share is a latePaid Refund", async () => {
    const { t, receipt, kaftanWindow, kaftanS } = await paidLate("orderedFromSupplier");

    expect(receipt?.orders.map((order) => [order.reference, order.kind])).toEqual([
      ["S-0001", "store"],
      ["P-0001", "preorder"],
    ]);
    expect(receipt?.orders[1]?.lines).toEqual([
      expect.objectContaining({ productName: "Shea Body Butter" }),
    ]);
    expect(receipt?.toRefund).toBe(2 * 38000 + 40000);
    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    expect(refunds).toEqual([
      expect.objectContaining({
        kind: "latePaid",
        amount: 116000,
        status: "toRefund",
      }),
    ]);
    // No Pre-order was placed, so it's linked only to the payment.
    expect(refunds[0]?.orderId).toBeUndefined();
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({
      preordered: 3,
      held: 0,
    });
  });
});

describe("window timing at Pay and payment", () => {
  test("Pay is refused once the window's close time has passed, even before the auto-close runs", async () => {
    const { t, customer, sheaJar, sheaWindow } = await withPreorders();
    await t.run((ctx) => ctx.db.patch(sheaWindow, { closesAt: Date.now() - 1000 }));

    const result = await refusal(
      customer.mutation(api.storefront.checkout.start, {
        lines: [{ variantId: sheaJar, quantity: 1, windowId: sheaWindow }],
      }),
    );
    expect(result).toBe("PREORDER_CLOSED");
  });

  test("paid on time, held places are kept even if the window moved on meanwhile", async () => {
    const { t, customer, checkoutId, reference, kaftanWindow, kaftanS } = await mixedHandedToSeev();
    await t.run((ctx) => ctx.db.patch(kaftanWindow, { stage: "orderedFromSupplier" }));
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { receiptCode } = await customer.query(api.storefront.checkout.get, { checkoutId });
    const receipt = await t.query(api.storefront.receipts.get, { code: receiptCode! });
    expect(receipt?.orders.map((order) => order.reference)).toEqual(["S-0001", "P-0001", "P-0002"]);
    expect(receipt?.toRefund).toBe(0);
    expect(await windowRow(t, kaftanWindow, kaftanS)).toEqual({ preordered: 2, held: 0 });
  });
});
