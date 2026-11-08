import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, stockOf, withShop } from "../test.checkout";
import { fakeSeev, paymentSucceeded, postSeevWebhook } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

afterEach(() => {
  vi.useRealTimers();
});

/** The shop, with Kofi's Checkout for 2 Size S totes (GHS 900) started at Pay. */
async function startedCheckout() {
  const shop = await withShop();
  const { checkoutId } = await shop.customer.mutation(api.storefront.checkout.start, {
    lines: [{ variantId: shop.small, quantity: 2 }],
  });
  return { ...shop, checkoutId };
}

describe("Pay hands the Checkout to Seev", () => {
  test("it creates a hosted checkout for the lines, named for the Customer, and returns its URL", async () => {
    const { customer, checkoutId } = await startedCheckout();

    const { checkoutUrl } = await customer.action(api.storefront.checkout.pay, { checkoutId });

    expect(checkoutUrl).toBe("https://pay.seevplus.com/PAY-1");
    expect(seev.sessions).toHaveLength(1);
    const [session] = seev.sessions;
    expect(session?.apiKey).toBe("Bearer seev-test-checkout-key");
    expect(session?.body).toEqual({
      type: "checkout",
      recipient: { name: "Kofi Boateng", phone: kofiPhone },
      items: [{ name: "Kente Weekend Tote (S)", quantity: 2, price: 45000 }],
      currency: "GHS",
      redirect_url: `http://localhost:3001/checkout?checkout=${checkoutId}`,
      meta: { checkoutId },
    });
  });

  test("each try gets its own idempotency key, so a retry is a fresh session", async () => {
    const { customer, checkoutId } = await startedCheckout();

    await customer.action(api.storefront.checkout.pay, { checkoutId });
    const retry = await customer.action(api.storefront.checkout.pay, { checkoutId });

    expect(retry.checkoutUrl).toBe("https://pay.seevplus.com/PAY-2");
    const [first, second] = seev.sessions;
    expect(first?.idempotencyKey).not.toBe(second?.idempotencyKey);
  });

  test("an expired Checkout can't be paid", async () => {
    vi.useFakeTimers();
    const { t, customer, checkoutId } = await startedCheckout();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await refusal(customer.action(api.storefront.checkout.pay, { checkoutId }))).toBe(
      "CHECKOUT_CLOSED",
    );
    expect(seev.sessions).toHaveLength(0);
  });

  test("Seev being down is a retryable refusal", async () => {
    const { customer, checkoutId } = await startedCheckout();
    seev.goDown();

    expect(await refusal(customer.action(api.storefront.checkout.pay, { checkoutId }))).toBe(
      "PAYMENT_UNAVAILABLE",
    );
  });
});

/** A started Checkout handed to Seev; returns the Seev reference too. */
async function handedToSeev() {
  const shop = await startedCheckout();
  await shop.customer.action(api.storefront.checkout.pay, { checkoutId: shop.checkoutId });
  return { ...shop, reference: seev.sessions[seev.sessions.length - 1]!.reference };
}

describe("a verified payment settles the Checkout", () => {
  test("coming back paid creates the payment, a ready Store Order with a Pickup Code, and its Receipt", async () => {
    const { t, small, customer, checkoutId, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout.status).toBe("paid");
    expect(checkout.receiptCode).toMatch(/^[A-Z2-9]{8}$/);
    const receipt = await t.query(api.storefront.receipts.get, { code: checkout.receiptCode! });
    expect(receipt).toMatchObject({
      receiptNumber: "R-0001",
      phone: kofiPhone,
      customerName: "Kofi Boateng",
      total: 90000,
      seevReference: reference,
      pickupLocation: "Osu, Oxford Street. Mon-Sat 9am-6pm",
      orders: [
        {
          reference: "S-0001",
          status: "ready",
          lines: [
            { productName: "Kente Weekend Tote", variantLabel: "S", quantity: 2, unitPrice: 45000 },
          ],
        },
      ],
      toRefund: 0,
    });
    expect(receipt?.orders[0]?.pickupCode).toMatch(/^\d{6}$/);
    expect(await stockOf(t, small)).toEqual({ onHand: 1, held: 0, available: 1 });
  });

  test("it sends one payment-confirmed SMS with the Pickup Code and Receipt link", async () => {
    const { t, customer, checkoutId, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });
    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { receiptCode } = await customer.query(api.storefront.checkout.get, { checkoutId });
    const receipt = await t.query(api.storefront.receipts.get, { code: receiptCode! });
    // An earlier test's backend may still be sending to the same number, so only this charge's count.
    const texts = (await sms.to(t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(receiptCode!),
    );
    expect(texts.map((text) => text.message)).toEqual([
      "Emblish: payment of GHS 900.00 received. Order S-0001 is ready for pickup. " +
        `Pickup Code ${receipt?.orders[0]?.pickupCode}. Receipt: http://localhost:3001/r/${receiptCode}`,
    ]);
  });

  test("coming back unpaid keeps the Checkout and its holds", async () => {
    const { t, small, customer, checkoutId } = await handedToSeev();

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout.status).toBe("pending");
    expect(await stockOf(t, small)).toMatchObject({ held: 2 });
  });
});

/** Every payment row, straight from the table. */
function paymentsIn(t: Awaited<ReturnType<typeof withShop>>["t"]) {
  return t.run((ctx) => ctx.db.query("payments").collect());
}

describe("we notice a payment without the Customer coming back", () => {
  test("polling settles a session paid after the Customer closed the tab", async () => {
    vi.useFakeTimers();
    const { t, customer, checkoutId, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    vi.advanceTimersByTime(60 * 1000);
    await t.finishInProgressScheduledFunctions();
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1000));

    const checkout = await customer.query(api.storefront.checkout.get, { checkoutId });
    expect(checkout.status).toBe("paid");
  });

  test("polling stops a few minutes after the session expires", async () => {
    vi.useFakeTimers();
    const { t, checkoutId } = await handedToSeev();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Only the expiry ran its course; nothing is left scheduled and nothing settled.
    expect(await paymentsIn(t)).toEqual([]);
    const checkout = await t.run((ctx) => ctx.db.get(checkoutId));
    expect(checkout?.status).toBe("expired");
  });

  test("a signed payment.succeeded webhook settles it, once however often it's delivered", async () => {
    const { t, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    const first = await postSeevWebhook(t, paymentSucceeded(reference));
    const again = await postSeevWebhook(t, paymentSucceeded(reference));
    await t.finishInProgressScheduledFunctions();

    expect([first.status, again.status]).toEqual([200, 200]);
    const payments = await paymentsIn(t);
    expect(payments).toHaveLength(1);
    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    expect(orders).toHaveLength(1);
    const texts = (await sms.to(t, kofiPhone.slice(1))).filter((text) =>
      text.message.includes(payments[0]!.receiptCode),
    );
    expect(texts).toHaveLength(1);
  });

  test("the webhook is only a nudge: a session Seev says is unpaid isn't settled", async () => {
    const { t, reference } = await handedToSeev();

    const response = await postSeevWebhook(t, paymentSucceeded(reference));
    await t.finishInProgressScheduledFunctions();

    expect(response.status).toBe(200);
    expect(await paymentsIn(t)).toEqual([]);
  });

  test("a webhook with a bad or stale signature is refused", async () => {
    const { t, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    const forged = await postSeevWebhook(t, paymentSucceeded(reference), {
      signature: `v1=${"0".repeat(64)}`,
    });
    const stale = await postSeevWebhook(t, paymentSucceeded(reference), {
      timestamp: Math.floor(Date.now() / 1000) - 10 * 60,
    });
    await t.finishInProgressScheduledFunctions();

    expect([forged.status, stale.status]).toEqual([401, 401]);
    expect(await paymentsIn(t)).toEqual([]);
  });
});

describe("a late payment", () => {
  test("Stock fills what it can, earliest line first, and the rest is a latePaid Refund", async () => {
    vi.useFakeTimers();
    const shop = await withShop();
    const { t, small, medium, customer } = shop;
    const { checkoutId } = await customer.mutation(api.storefront.checkout.start, {
      lines: [
        { variantId: small, quantity: 2 },
        { variantId: medium, quantity: 1 },
      ],
    });
    await customer.action(api.storefront.checkout.pay, { checkoutId });
    const reference = seev.sessions[0]!.reference;
    // The Checkout expires, and someone else buys the last Size M meanwhile.
    vi.advanceTimersByTime(30 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    await t.run(async (ctx) => {
      const { recordMovement } = await import("../model/stock");
      await recordMovement(ctx, { variantId: medium, kind: "soldOffline", quantity: -1 });
    });
    seev.setStatus(reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    const { receiptCode, status } = await customer.query(api.storefront.checkout.get, {
      checkoutId,
    });
    expect(status).toBe("paid");
    const receipt = await t.query(api.storefront.receipts.get, { code: receiptCode! });
    expect(receipt?.total).toBe(142000);
    expect(receipt?.orders[0]?.lines).toEqual([
      { productName: "Kente Weekend Tote", variantLabel: "S", quantity: 2, unitPrice: 45000 },
    ]);
    expect(receipt?.toRefund).toBe(52000);
    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    expect(refunds).toEqual([
      expect.objectContaining({ kind: "latePaid", amount: 52000, status: "toRefund" }),
    ]);
    expect(await stockOf(t, small)).toEqual({ onHand: 1, held: 0, available: 1 });
  });
});

describe("settling is idempotent", () => {
  test("the return page, a poll and the webhook all reporting one payment settle it once", async () => {
    vi.useFakeTimers();
    const { t, customer, checkoutId, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");

    await Promise.all([
      customer.action(api.storefront.checkout.refresh, { checkoutId }),
      postSeevWebhook(t, paymentSucceeded(reference)),
      t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(60 * 1000)),
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await paymentsIn(t)).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("orders").collect())).toHaveLength(1);
  });

  test("a second paid try on the same Checkout makes no second order and is refunded in full", async () => {
    const { t, small, customer, checkoutId } = await startedCheckout();
    await customer.action(api.storefront.checkout.pay, { checkoutId });
    await customer.action(api.storefront.checkout.pay, { checkoutId });
    const [first, second] = seev.sessions;
    seev.setStatus(first!.reference, "completed");
    seev.setStatus(second!.reference, "completed");

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    expect(await paymentsIn(t)).toHaveLength(2);
    expect(await t.run((ctx) => ctx.db.query("orders").collect())).toHaveLength(1);
    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    expect(refunds).toEqual([
      expect.objectContaining({ kind: "discretionary", amount: 90000, status: "toRefund" }),
    ]);
    expect(await stockOf(t, small)).toEqual({ onHand: 1, held: 0, available: 1 });
  });

  test("an amount that doesn't match the Checkout is recorded and refunded, not filled", async () => {
    const { t, small, customer, checkoutId, reference } = await handedToSeev();
    seev.setStatus(reference, "completed");
    seev.setAmount(reference, 100);

    await customer.action(api.storefront.checkout.refresh, { checkoutId });

    expect(await paymentsIn(t)).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(await t.run((ctx) => ctx.db.query("orders").collect())).toEqual([]);
    const refunds = await t.run((ctx) => ctx.db.query("refunds").collect());
    expect(refunds).toEqual([expect.objectContaining({ amount: 100, status: "toRefund" })]);
    // The holds are untouched, so the Checkout still expires and frees its Stock as usual.
    expect(await stockOf(t, small)).toMatchObject({ held: 2 });
  });
});
