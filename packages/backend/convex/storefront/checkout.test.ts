import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import { stockOf, withCustomer, withShop } from "../test.checkout";
import { refusal } from "../test.staff";

afterEach(() => {
  vi.useRealTimers();
});

describe("Pay starts a Checkout", () => {
  test("it holds the Bag's Stock for 30 minutes at the Store Prices", async () => {
    const { t, small, medium, customer } = await withShop();
    const before = Date.now();

    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [
        { variantId: small, quantity: 2 },
        { variantId: medium, quantity: 1 },
      ],
    });

    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout).toMatchObject({
      status: "pending",
      total: 2 * 45000 + 52000,
      lines: [
        { productName: "Kente Weekend Tote", variantLabel: "S", quantity: 2, unitPrice: 45000 },
        { productName: "Kente Weekend Tote", variantLabel: "M", quantity: 1, unitPrice: 52000 },
      ],
    });
    expect(checkout?.expiresAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
    expect(await stockOf(t, small)).toEqual({ onHand: 3, held: 2, available: 1 });
    expect(await stockOf(t, medium)).toEqual({ onHand: 1, held: 1, available: 0 });
  });
});

describe("an unpaid Checkout ends as a whole", () => {
  test("after 30 minutes it expires and its Stock is back on sale", async () => {
    vi.useFakeTimers();
    const { t, small, customer } = await withShop();
    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 2 }],
    });

    vi.advanceTimersByTime(29 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    expect(await stockOf(t, small)).toMatchObject({ held: 2 });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout.status).toBe("expired");
    expect(await stockOf(t, small)).toEqual({ onHand: 3, held: 0, available: 3 });
  });

  test("changing the Bag releases it", async () => {
    const { t, small, customer } = await withShop();
    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 2 }],
    });

    await customer.mutation(api.storefront.checkout.release, { checkoutId });

    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout.status).toBe("released");
    expect(await stockOf(t, small)).toMatchObject({ held: 0, available: 3 });
  });

  test("paying the Bag again replaces the earlier Checkout instead of holding twice", async () => {
    const { t, small, customer } = await withShop();
    const first = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 2 }],
    });

    await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 3 }],
    });

    const earlier = await customer.query(api.storefront.checkout.get, first);
    expect(earlier.status).toBe("released");
    expect(await stockOf(t, small)).toMatchObject({ held: 3, available: 0 });
  });
});

describe("Pay is refused", () => {
  test("when Stock no longer covers a line, holding nothing", async () => {
    const { t, small, medium, customer } = await withShop();

    const result = await refusal(
      customer.mutation(api.storefront.checkout.start, {
        lines: [
          { variantId: small, quantity: 1 },
          { variantId: medium, quantity: 2 },
        ],
      }),
    );

    expect(result).toBe("NOT_ENOUGH_STOCK");
    expect(await stockOf(t, small)).toMatchObject({ held: 0 });
  });

  test("on a first Checkout without the Customer's name, which is then kept", async () => {
    const { small, customer } = await withShop(null);

    expect(
      await refusal(
        customer.mutation(api.storefront.checkout.start, {
          lines: [{ variantId: small, quantity: 1 }],
        }),
      ),
    ).toBe("NAME_REQUIRED");

    await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 1 }],
      name: "  Ama Owusu ",
    });
    expect(await customer.query(api.storefront.customer.me, {})).toMatchObject({
      name: "Ama Owusu",
    });
  });

  test("for someone else's Checkout", async () => {
    const { t, small, customer } = await withShop();
    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [{ variantId: small, quantity: 1 }],
    });
    const { customer: stranger } = await withCustomer(t, "Esi", "+233201234567");

    expect(await refusal(stranger.query(api.storefront.checkout.get, { checkoutId }))).toBe(
      "NOT_FOUND",
    );
    expect(await refusal(stranger.mutation(api.storefront.checkout.release, { checkoutId }))).toBe(
      "NOT_FOUND",
    );
  });
});
