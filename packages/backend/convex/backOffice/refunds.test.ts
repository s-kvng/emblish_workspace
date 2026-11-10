import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { accraDelivery, paidOrder, stockOf, withShop, withZones } from "../test.checkout";
import { refusal, withStaffMember } from "../test.staff";

type Staff = Awaited<ReturnType<typeof withStaffMember>>;

/** Kofi's Ready Pickup order for 2 × Size S (GHS 450 each), Esi (Staff) and Ama (Owner). */
async function refundDesk() {
  const shop = await withShop();
  const esi = await withStaffMember(shop.t, "Esi Ofori");
  const ama = await withStaffMember(shop.t, "Ama Mensah", "owner");
  const order = await paidOrder(shop.t, shop.customerId, [{ variantId: shop.small, quantity: 2 }]);
  const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
  const line = detail.lines[0]!;
  return { ...shop, esi, ama, order, line };
}

/** The newest Stock Movement on a Variant's ledger. */
async function latestMovement(staff: Staff, variantId: Id<"variants">) {
  return (await staff.query(api.backOffice.stock.variant, { variantId })).movements[0];
}

describe("Staff cancelling units before handover", () => {
  test("cancelled units go back to Stock and their price is flagged for the Owner to refund", async () => {
    const { t, esi, ama, order, line, small } = await refundDesk();
    expect(await stockOf(t, small)).toMatchObject({ onHand: 1 });

    await esi.mutation(api.backOffice.orders.cancelUnits, {
      orderId: order.orderId,
      lines: [{ orderLineId: line.orderLineId, quantity: 1 }],
    });

    expect(await stockOf(t, small)).toMatchObject({ onHand: 2 });
    expect(await latestMovement(esi, small)).toMatchObject({
      kind: "cancelled",
      quantity: 1,
      staffName: "Esi Ofori",
    });
    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("ready");
    expect(detail.lines[0]).toMatchObject({ quantity: 2, refundedQuantity: 1 });
    expect(detail.toRefund).toBe(45000);
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "unitsCancelled",
      by: "Esi Ofori",
      units: 1,
      amount: 45000,
    });
    const toMake = await ama.query(api.backOffice.refunds.toMake, {});
    expect(toMake.total).toBe(45000);
    expect(toMake.refunds).toEqual([
      expect.objectContaining({
        kind: "cancelledLine",
        amount: 45000,
        orderReference: order.reference,
        customerName: "Kofi Boateng",
        returnToStock: true,
      }),
    ]);
  });

  test("cancelling every unit cancels the order and flags its paid Delivery Fee too", async () => {
    const { t, esi, ama, customerId, small } = await refundDesk();
    const zones = await withZones(t);
    const order = await paidOrder(
      t,
      customerId,
      [{ variantId: small, quantity: 1 }],
      accraDelivery(zones.accra),
    );
    const [line] = (await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).lines;

    await esi.mutation(api.backOffice.orders.cancelUnits, {
      orderId: order.orderId,
      lines: [{ orderLineId: line!.orderLineId, quantity: 1 }],
    });

    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("cancelled");
    expect(detail.primaryAction).toBeNull();
    expect(detail.history.map((event) => event.kind)).toEqual(["paid", "unitsCancelled", "cancelled"]);
    // GHS 450 for the tote and GHS 30 for the Delivery that won't happen.
    expect(detail.toRefund).toBe(48000);
    expect((await ama.query(api.backOffice.refunds.toMake, {})).total).toBe(48000);
  });

  test("units kept off the shelf, such as damaged ones, are refunded without going back to Stock", async () => {
    const { t, esi, order, line, small } = await refundDesk();

    await esi.mutation(api.backOffice.orders.cancelUnits, {
      orderId: order.orderId,
      lines: [{ orderLineId: line.orderLineId, quantity: 2 }],
      returnToStock: false,
      note: "Torn strap",
    });

    expect(await stockOf(t, small)).toMatchObject({ onHand: 1 });
    const detail = await esi.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("cancelled");
    expect(detail.toRefund).toBe(90000);
  });

  test("only units still on the order, and only before it leaves the shop", async () => {
    const { esi, order, line } = await refundDesk();
    const cancel = (quantity: number) =>
      esi.mutation(api.backOffice.orders.cancelUnits, {
        orderId: order.orderId,
        lines: [{ orderLineId: line.orderLineId, quantity }],
      });

    expect(await refusal(cancel(3))).toBe("TOO_MANY_UNITS");
    expect(await refusal(cancel(0))).toBe("INVALID_QUANTITY");
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });
    expect(await refusal(cancel(1))).toBe("NOT_CANCELLABLE");
  });
});

describe("Refunds to make", () => {
  test("lists every kind still to pay out, settlement's included, with the GH₵ total", async () => {
    const { t, esi, ama, customerId, medium, order, line } = await refundDesk();
    // Only 1 Size M is in Stock, so settlement fills one and flags the other as late-paid.
    await paidOrder(t, customerId, [{ variantId: medium, quantity: 2 }]);
    await esi.mutation(api.backOffice.orders.cancelUnits, {
      orderId: order.orderId,
      lines: [{ orderLineId: line.orderLineId, quantity: 1 }],
    });

    const toMake = await ama.query(api.backOffice.refunds.toMake, {});
    expect(toMake.canRefund).toBe(true);
    expect(toMake.refunds.map((refund) => [refund.kind, refund.amount])).toEqual([
      ["latePaid", 52000],
      ["cancelledLine", 45000],
    ]);
    expect(toMake.total).toBe(97000);
  });
});

/** The desk with 1 unit of Kofi's order cancelled, so a GHS 450 Refund waits for the Owner. */
async function oneRefundToMake() {
  const desk = await refundDesk();
  await desk.esi.mutation(api.backOffice.orders.cancelUnits, {
    orderId: desk.order.orderId,
    lines: [{ orderLineId: desk.line.orderLineId, quantity: 1 }],
  });
  const { refunds } = await desk.ama.query(api.backOffice.refunds.toMake, {});
  return { ...desk, refundId: refunds[0]!.refundId };
}

describe("the Owner paying a Refund out", () => {
  test("paid from the Seev dashboard and marked refunded, it leaves Refunds to make and the Customer sees it refunded", async () => {
    const { ama, customer, order, refundId } = await oneRefundToMake();
    expect(
      (await customer.query(api.storefront.orders.mine, {}))[0]?.refunds,
    ).toEqual([{ amount: 45000, reason: "cancelledLine", refunded: false }]);

    await ama.mutation(api.backOffice.refunds.markRefunded, {
      refundId,
      method: "seevDashboard",
      note: " MoMo txn 5521 ",
    });

    expect(await ama.query(api.backOffice.refunds.toMake, {})).toMatchObject({
      total: 0,
      refunds: [],
    });
    const detail = await ama.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.toRefund).toBe(0);
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "refunded",
      by: "Ama Mensah",
      amount: 45000,
      note: "MoMo txn 5521",
    });
    expect(
      (await customer.query(api.storefront.orders.mine, {}))[0]?.refunds,
    ).toEqual([{ amount: 45000, reason: "cancelledLine", refunded: true }]);
  });

  test("only an Owner can, and only once", async () => {
    const { esi, ama, refundId } = await oneRefundToMake();
    const markRefunded = (who: Staff) =>
      who.mutation(api.backOffice.refunds.markRefunded, { refundId, method: "cash" });

    expect(await refusal(markRefunded(esi))).toBe("FORBIDDEN");
    expect((await esi.query(api.backOffice.refunds.toMake, {})).canRefund).toBe(false);
    await markRefunded(ama);
    expect(await refusal(markRefunded(ama))).toBe("ALREADY_REFUNDED");
  });

  test("a payout by some other way needs a note saying how", async () => {
    const { ama, refundId } = await oneRefundToMake();

    expect(
      await refusal(
        ama.mutation(api.backOffice.refunds.markRefunded, { refundId, method: "other", note: " " }),
      ),
    ).toBe("NOTE_REQUIRED");
  });
});

describe("the Owner refunding after handover", () => {
  /** The desk with Kofi's order handed over at the Counter. */
  async function handedOver() {
    const desk = await refundDesk();
    await desk.esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: desk.order.orderId, code: desk.order.pickupCode }],
    });
    return desk;
  }

  test("goods that came back go into Stock as Returned, and the refund waits to be paid out", async () => {
    const { t, ama, order, line, small } = await handedOver();

    await ama.mutation(api.backOffice.orders.refundAfterHandover, {
      orderId: order.orderId,
      lines: [{ orderLineId: line.orderLineId, quantity: 1 }],
      returnToStock: true,
      note: "Wrong size, brought back unworn",
    });

    expect(await stockOf(t, small)).toMatchObject({ onHand: 2 });
    expect(await latestMovement(ama, small)).toMatchObject({ kind: "returned", quantity: 1 });
    const detail = await ama.query(api.backOffice.orders.get, { orderId: order.orderId });
    expect(detail.status).toBe("collected");
    expect(detail.toRefund).toBe(45000);
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "refundFlagged",
      by: "Ama Mensah",
      units: 1,
      amount: 45000,
    });
    expect((await ama.query(api.backOffice.refunds.toMake, {})).refunds).toEqual([
      expect.objectContaining({
        kind: "afterHandover",
        amount: 45000,
        returnToStock: true,
        note: "Wrong size, brought back unworn",
      }),
    ]);
  });

  test("goods kept by the Customer stay out of Stock", async () => {
    const { t, ama, order, line, small } = await handedOver();

    await ama.mutation(api.backOffice.orders.refundAfterHandover, {
      orderId: order.orderId,
      lines: [{ orderLineId: line.orderLineId, quantity: 2 }],
      note: "Faulty zips",
    });

    expect(await stockOf(t, small)).toMatchObject({ onHand: 1 });
    expect(
      (await ama.query(api.backOffice.orders.get, { orderId: order.orderId })).toRefund,
    ).toBe(90000);
  });

  test("a delivered order's Delivery Fee can be refunded, once", async () => {
    const { t, esi, ama, customerId, medium } = await refundDesk();
    const zones = await withZones(t);
    const order = await paidOrder(
      t,
      customerId,
      [{ variantId: medium, quantity: 1 }],
      accraDelivery(zones.accra),
    );
    await esi.mutation(api.backOffice.orders.dispatch, { orderId: order.orderId, riderName: "Yaw" });
    await esi.mutation(api.backOffice.orders.markDelivered, { orderId: order.orderId });
    const refundFee = () =>
      ama.mutation(api.backOffice.orders.refundAfterHandover, {
        orderId: order.orderId,
        lines: [],
        deliveryFee: true,
        note: "Rider was two days late",
      });

    await refundFee();
    expect(
      (await ama.query(api.backOffice.orders.get, { orderId: order.orderId })).toRefund,
    ).toBe(3000);
    expect(await refusal(refundFee())).toBe("NOTHING_TO_REFUND");
  });

  test("only an Owner, only once it's handed over, and always with a reason", async () => {
    const { esi, ama, order, line } = await refundDesk();
    const refund = (who: Staff, note = "Faulty") =>
      who.mutation(api.backOffice.orders.refundAfterHandover, {
        orderId: order.orderId,
        lines: [{ orderLineId: line.orderLineId, quantity: 1 }],
        note,
      });

    expect(await refusal(refund(ama))).toBe("NOT_HANDED_OVER");
    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });
    expect(await refusal(refund(esi))).toBe("FORBIDDEN");
    expect(await refusal(refund(ama, " "))).toBe("REASON_REQUIRED");
    expect(await refusal(refund(ama))).toBe("allowed");
  });
});
