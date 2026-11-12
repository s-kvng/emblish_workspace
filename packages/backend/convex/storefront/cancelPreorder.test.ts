import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { paidPreorder, windowRow, withCustomer, withPreorders } from "../test.checkout";
import { refusal, withStaffMember } from "../test.staff";

/**
 * Kofi's Pre-order of 2 × Linen Kaftan M (GHS 400 each) in the open Kaftan window, and Ama
 * (the Owner who opened the windows) signed in.
 */
async function withKaftanPreorder() {
  const shop = await withPreorders();
  const reference = await paidPreorder(shop.t, shop.customerId, shop.kaftanWindow, [
    { variantId: shop.kaftanM, quantity: 2 },
  ]);
  const ama = shop.t.withIdentity({ subject: "auth-window-opener" });
  const card = await cardFor(shop.customer, reference);
  return { ...shop, ama, reference, orderId: card.orderId };
}

type Caller = Awaited<ReturnType<typeof withPreorders>>["customer"];

/** The Customer's My orders card for a reference. */
async function cardFor(customer: Caller, reference: string) {
  const card = (await customer.query(api.storefront.orders.mine, {})).find(
    (c) => c.reference === reference,
  );
  if (!card) throw new Error(`No card for ${reference}`);
  return card;
}

describe("A Customer cancels their own Pre-order", () => {
  test("before Ordered from supplier it's cancelled at once, refund pending, and frees the window", async () => {
    const { t, customer, ama, reference, orderId, kaftanWindow, kaftanM } =
      await withKaftanPreorder();
    expect(await windowRow(t, kaftanWindow, kaftanM)).toMatchObject({ preordered: 2 });
    expect(await cardFor(customer, reference)).toMatchObject({ canCancel: true });

    await customer.mutation(api.storefront.orders.cancelPreorder, { orderId });

    expect(await windowRow(t, kaftanWindow, kaftanM)).toMatchObject({ preordered: 0 });
    const card = await cardFor(customer, reference);
    expect(card).toMatchObject({
      status: "cancelled",
      cancelReason: "customer",
      past: true,
      canCancel: false,
      refunds: [{ amount: 80000, reason: "cancelledPreorder", refunded: false }],
    });
    expect(card.pickupCode).toBeUndefined();
    expect(card.history.map((event) => event.kind)).toEqual(["paid", "cancelled"]);

    const toMake = await ama.query(api.backOffice.refunds.toMake, {});
    expect(toMake.refunds).toEqual([
      expect.objectContaining({
        kind: "cancelledPreorder",
        amount: 80000,
        orderReference: reference,
        customerName: "Kofi Boateng",
        returnToStock: false,
      }),
    ]);
  });

  test("still allowed once the window closes, refused from Ordered from supplier on", async () => {
    const { customer, ama, reference, orderId, kaftanWindow } = await withKaftanPreorder();
    await ama.mutation(api.backOffice.windows.closeNow, { windowId: kaftanWindow });
    expect(await cardFor(customer, reference)).toMatchObject({ canCancel: true });

    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
    });

    expect(await cardFor(customer, reference)).toMatchObject({ canCancel: false });
    expect(
      await refusal(customer.mutation(api.storefront.orders.cancelPreorder, { orderId })),
    ).toBe("ORDERED_FROM_SUPPLIER");
    expect(await cardFor(customer, reference)).toMatchObject({ status: "awaitingArrival" });
  });

  test("a Customer can't cancel someone else's Pre-order, nor one twice", async () => {
    const { t, customer, orderId } = await withKaftanPreorder();
    const { customer: esi } = await withCustomer(t, "Esi Ofori", "+233201234567");

    expect(await refusal(esi.mutation(api.storefront.orders.cancelPreorder, { orderId }))).toBe(
      "NOT_FOUND",
    );

    await customer.mutation(api.storefront.orders.cancelPreorder, { orderId });
    expect(
      await refusal(customer.mutation(api.storefront.orders.cancelPreorder, { orderId })),
    ).toBe("NOT_CANCELLABLE");
  });
});

describe("Staff cancel a Pre-order from order detail", () => {
  test("after Ordered from supplier only Staff can, with a note, and the window is freed", async () => {
    const { t, customer, ama, reference, orderId, kaftanWindow, kaftanM } =
      await withKaftanPreorder();
    const esi = await withStaffMember(t, "Esi Ofori");
    await ama.mutation(api.backOffice.windows.closeNow, { windowId: kaftanWindow });
    await ama.mutation(api.backOffice.windows.advance, {
      windowId: kaftanWindow,
      stage: "orderedFromSupplier",
    });
    expect(await esi.query(api.backOffice.orders.get, { orderId })).toMatchObject({
      canCancelPreorder: true,
      canCancelUnits: false,
    });

    await esi.mutation(api.backOffice.orders.cancelPreorder, {
      orderId,
      note: "Customer travelling, asked on WhatsApp",
    });

    expect(await windowRow(t, kaftanWindow, kaftanM)).toMatchObject({ preordered: 0 });
    const detail = await esi.query(api.backOffice.orders.get, { orderId });
    expect(detail).toMatchObject({
      status: "cancelled",
      cancelReason: "staff",
      canCancelPreorder: false,
      toRefund: 80000,
    });
    expect(detail.lines[0]).toMatchObject({ quantity: 2, refundedQuantity: 2 });
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "cancelled",
      by: "Esi Ofori",
      units: 2,
      amount: 80000,
      note: "Customer travelling, asked on WhatsApp",
    });
    expect(await cardFor(customer, reference)).toMatchObject({
      status: "cancelled",
      cancelReason: "staff",
      refunds: [{ amount: 80000, reason: "cancelledPreorder", refunded: false }],
    });

    // Once the Owner pays it out, the card shows it refunded.
    const [refund] = (await ama.query(api.backOffice.refunds.toMake, {})).refunds;
    await ama.mutation(api.backOffice.refunds.markRefunded, {
      refundId: refund!.refundId,
      method: "mobileMoney",
    });
    expect(await cardFor(customer, reference)).toMatchObject({
      refunds: [{ amount: 80000, reason: "cancelledPreorder", refunded: true }],
    });
  });

  test("a Customer's own cancel shows in Back Office History as by the Customer", async () => {
    const { t, customer, orderId } = await withKaftanPreorder();
    const esi = await withStaffMember(t, "Esi Ofori");
    await customer.mutation(api.storefront.orders.cancelPreorder, { orderId });

    const detail = await esi.query(api.backOffice.orders.get, { orderId });
    expect(detail.cancelReason).toBe("customer");
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "cancelled",
      by: "Customer",
    });
    expect(
      await refusal(esi.mutation(api.backOffice.orders.cancelPreorder, { orderId })),
    ).toBe("NOT_CANCELLABLE");
  });
});
