import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { Fulfilment } from "../model/fulfilment";
import { settlePayment } from "../model/payments";
import { DAY } from "../model/reminderSchedule";
import { accraDelivery, withPreorders, withZones } from "../test.checkout";
import type { TestBackend } from "../test.setup";
import { captureSms } from "../test.sms";
import { refusal, withStaffMember } from "../test.staff";

captureSms();

/** Today, as a UTC day: the Reports period "Today". */
function today() {
  const from = Math.floor(Date.now() / DAY) * DAY;
  return { from, to: from + DAY };
}

/** The shop of `withPreorders`, with its Owner (Ama) signed in to the Back Office. */
async function withOwner() {
  const shop = await withPreorders();
  return { ...shop, ama: shop.t.withIdentity({ subject: "auth-window-opener" }) };
}

/**
 * A Checkout paid through the real settlement path, mixing In-stock and Pre-order lines at the
 * prices given. Returns its payment.
 */
async function payCheckout(
  t: TestBackend,
  customerId: Id<"customers">,
  lines: {
    variantId: Id<"variants">;
    orderWindowId?: Id<"orderWindows">;
    quantity: number;
    unitPrice: number;
  }[],
  fulfilment: Fulfilment = { method: "pickup" },
  deliveryFee = 0,
) {
  return await t.run(async (ctx) => {
    const priced = [];
    for (const line of lines) {
      const variant = await ctx.db.get(line.variantId);
      const product = variant && (await ctx.db.get(variant.productId));
      if (!variant || !product) throw new Error("No such Variant");
      priced.push({
        ...line,
        productName: product.name,
        variantLabel: variant.optionValues.join(" / "),
      });
    }
    const total = priced.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) + deliveryFee;
    const checkoutId = await ctx.db.insert("checkouts", {
      customerId,
      lines: priced,
      fulfilment,
      total,
      status: "pending",
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    const reference = `PAY-${checkoutId}`;
    await ctx.db.insert("paymentSessions", {
      checkoutId,
      reference,
      checkoutUrl: `https://pay.seevplus.com/${reference}`,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    await settlePayment(ctx, { reference, amount: total });
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("seevReference", reference))
      .unique();
    if (!payment) throw new Error("No payment was recorded");
    return payment;
  });
}

/**
 * Kofi's one Checkout: a Kente Weekend Tote S (GHS 450) In-stock and 2 Shea Body Butter
 * (GHS 90 each) on Pre-order, delivered to Accra Central (GHS 30): GHS 660 in all.
 */
async function withMixedCheckout() {
  const shop = await withOwner();
  const { t, customerId, small, sheaJar, sheaWindow } = shop;
  const zones = await withZones(t);
  const payment = await payCheckout(
    t,
    customerId,
    [
      { variantId: small, quantity: 1, unitPrice: 45000 },
      { variantId: sheaJar, orderWindowId: sheaWindow, quantity: 2, unitPrice: 9000 },
    ],
    accraDelivery(zones.accra),
    3000,
  );
  return { ...shop, zones, payment };
}

/**
 * An invoice on the order, paid in full at `/p/` through the real settlement path. Returns its
 * payment.
 */
async function payInvoice(
  t: TestBackend,
  orderReference: string,
  lines: Doc<"invoices">["lines"],
  amount = lines.reduce((sum, line) => sum + line.amount, 0),
) {
  return await t.run(async (ctx) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", orderReference))
      .unique();
    if (!order) throw new Error(`No order ${orderReference}`);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const invoiceId = await ctx.db.insert("invoices", {
      kind: lines.some((line) => line.kind === "shippingFee") ? "shippingFee" : "deliveryFee",
      orderId: order._id,
      number: `INV-${order.reference}`,
      code: `CODE${order.reference.slice(2)}`,
      lines,
      total,
      status: "unpaid",
      clockStartedAt: Date.now(),
    });
    const reference = `PAY-${invoiceId}`;
    await ctx.db.insert("paymentSessions", {
      invoiceId,
      reference,
      checkoutUrl: `https://pay.seevplus.com/${reference}`,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    await settlePayment(ctx, { reference, amount });
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("seevReference", reference))
      .unique();
    if (!payment) throw new Error("No payment was recorded");
    return payment;
  });
}

/** The order with this reference. */
async function orderId(t: TestBackend, reference: string) {
  const order = await t.run((ctx) =>
    ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique(),
  );
  if (!order) throw new Error(`No order ${reference}`);
  return order._id;
}

describe("Reports access", () => {
  test("only an Owner sees Reports or exports them", async () => {
    const { t, ama } = await withOwner();
    const staff = await withStaffMember(t);

    expect(await refusal(staff.query(api.backOffice.reports.summary, today()))).toBe("FORBIDDEN");
    expect(await refusal(staff.query(api.backOffice.reports.exportCsv, today()))).toBe("FORBIDDEN");
    expect(await refusal(ama.query(api.backOffice.reports.summary, today()))).toBe("allowed");
    expect(await refusal(ama.query(api.backOffice.reports.exportCsv, today()))).toBe("allowed");
  });
});

describe("Money in", () => {
  test("a mixed Checkout is split into Store Order items, Item Payments and Delivery Fees", async () => {
    const { ama } = await withMixedCheckout();

    const report = await ama.query(api.backOffice.reports.summary, today());

    expect(report.moneyIn).toEqual({
      storeItems: 45000,
      preorderItems: 18000,
      shippingFees: 0,
      deliveryFees: 3000,
      unmatched: 0,
      total: 66000,
    });
    expect(report.payments).toBe(1);
  });

  test("a Shipping Fee Invoice counts as Shipping Fees and its Delivery Fee line as Delivery Fees", async () => {
    const { t, ama } = await withMixedCheckout();
    await payInvoice(t, "P-0001", [
      { kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 },
      { kind: "deliveryFee", zoneName: "Accra Central", amount: 3000 },
    ]);

    const report = await ama.query(api.backOffice.reports.summary, today());

    expect(report.moneyIn).toEqual({
      storeItems: 45000,
      preorderItems: 18000,
      shippingFees: 1800,
      deliveryFees: 6000,
      unmatched: 0,
      total: 70800,
    });
    expect(report.payments).toBe(2);
  });

  test("a payment that made no order counts as Unmatched, not as what it was meant for", async () => {
    const { t, ama, payment } = await withMixedCheckout();
    // Kofi pays the same Checkout twice, and pays an invoice the wrong amount.
    await t.run(async (ctx) => {
      await ctx.db.insert("paymentSessions", {
        checkoutId: payment.checkoutId,
        reference: "PAY-again",
        checkoutUrl: "https://pay.seevplus.com/PAY-again",
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      await settlePayment(ctx, { reference: "PAY-again", amount: 66000 });
    });
    await payInvoice(
      t,
      "P-0001",
      [{ kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 }],
      1500,
    );

    const report = await ama.query(api.backOffice.reports.summary, today());

    expect(report.moneyIn).toEqual({
      storeItems: 45000,
      preorderItems: 18000,
      shippingFees: 0,
      deliveryFees: 3000,
      unmatched: 67500,
      total: 133500,
    });
  });
});

describe("Refunded and Net", () => {
  test("only Refunds marked refunded count, by kind, and Net is Money in less them", async () => {
    const { t, ama } = await withMixedCheckout();
    // P-0001 is cancelled and its GHS 180 paid back; S-0001's tote is cancelled but not yet paid back.
    await ama.mutation(api.backOffice.orders.cancelPreorder, {
      orderId: await orderId(t, "P-0001"),
    });
    const { refunds } = await ama.query(api.backOffice.refunds.toMake, {});
    await ama.mutation(api.backOffice.refunds.markRefunded, {
      refundId: refunds[0]!.refundId,
      method: "mobileMoney",
    });
    const storeOrderId = await orderId(t, "S-0001");
    const [line] = (await ama.query(api.backOffice.orders.get, { orderId: storeOrderId }))!.lines;
    await ama.mutation(api.backOffice.orders.cancelUnits, {
      orderId: storeOrderId,
      lines: [{ orderLineId: line!.orderLineId, quantity: 1 }],
    });

    const report = await ama.query(api.backOffice.reports.summary, today());

    expect(report.refunded).toEqual({
      total: 18000,
      byKind: [{ kind: "cancelledPreorder", amount: 18000, count: 1 }],
    });
    expect(report.net).toBe(48000);
  });
});

describe("Period", () => {
  test("counts money by when it arrived and Refunds by when they were paid back", async () => {
    const { t, ama, payment } = await withMixedCheckout();
    await ama.mutation(api.backOffice.orders.cancelPreorder, {
      orderId: await orderId(t, "P-0001"),
    });
    const { refunds } = await ama.query(api.backOffice.refunds.toMake, {});
    await ama.mutation(api.backOffice.refunds.markRefunded, {
      refundId: refunds[0]!.refundId,
      method: "cash",
    });
    // The payment came in yesterday; the Refund was paid back today.
    await t.run((ctx) => ctx.db.patch(payment._id, { paidAt: payment.paidAt - DAY }));
    const yesterday = { from: today().from - DAY, to: today().from };

    const todays = await ama.query(api.backOffice.reports.summary, today());
    const yesterdays = await ama.query(api.backOffice.reports.summary, yesterday);

    expect([todays.moneyIn.total, todays.refunded.total, todays.net]).toEqual([0, 18000, -18000]);
    expect([yesterdays.moneyIn.total, yesterdays.refunded.total]).toEqual([66000, 0]);
  });

  test("a period is up to 92 days long and ends after it starts", async () => {
    const { ama } = await withOwner();
    const { from } = today();

    const longest = ama.query(api.backOffice.reports.summary, { from, to: from + 92 * DAY });
    const tooLong = ama.query(api.backOffice.reports.summary, { from, to: from + 93 * DAY });
    const backwards = ama.query(api.backOffice.reports.exportCsv, { from, to: from });

    expect(await refusal(longest)).toBe("allowed");
    expect(await refusal(tooLong)).toBe("INVALID_PERIOD");
    expect(await refusal(backwards)).toBe("INVALID_PERIOD");
  });
});

describe("Best sellers", () => {
  test("units and GH₵ per Product and Variant, net of cancelled units, with Sold offline kept out of GH₵", async () => {
    const { t, ama, customerId, small, medium } = await withMixedCheckout();
    // A second Store Order of 2 totes, one of them cancelled; a walk-in buys the M.
    await payCheckout(t, customerId, [{ variantId: small, quantity: 2, unitPrice: 45000 }]);
    const secondOrderId = await orderId(t, "S-0002");
    const [line] = (await ama.query(api.backOffice.orders.get, { orderId: secondOrderId }))!.lines;
    await ama.mutation(api.backOffice.orders.cancelUnits, {
      orderId: secondOrderId,
      lines: [{ orderLineId: line!.orderLineId, quantity: 1 }],
    });
    await ama.mutation(api.backOffice.stock.sellOffline, { variantId: medium, quantity: 1 });

    const report = await ama.query(api.backOffice.reports.summary, today());

    expect(report.bestSellers).toMatchObject([
      {
        productName: "Kente Weekend Tote",
        store: { units: 2, amount: 90000 },
        preorder: { units: 0, amount: 0 },
        soldOffline: 1,
        variants: [
          { variantLabel: "S", store: { units: 2, amount: 90000 }, soldOffline: 0 },
          { variantLabel: "M", store: { units: 0, amount: 0 }, soldOffline: 1 },
        ],
      },
      {
        productName: "Shea Body Butter",
        store: { units: 0, amount: 0 },
        preorder: { units: 2, amount: 18000 },
        soldOffline: 0,
        variants: [{ variantLabel: "", preorder: { units: 2, amount: 18000 } }],
      },
    ]);
    expect(report.moneyIn.total).toBe(156000);
  });
});

describe("Export CSV", () => {
  test("one row per payment and per Refund paid back, oldest first, Refunds negative", async () => {
    const { t, ama, payment } = await withMixedCheckout();
    const invoicePayment = await payInvoice(t, "P-0001", [
      { kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 },
    ]);
    await ama.mutation(api.backOffice.orders.cancelPreorder, {
      orderId: await orderId(t, "P-0001"),
    });
    const { refunds } = await ama.query(api.backOffice.refunds.toMake, {});
    const refundId = refunds[0]!.refundId;
    await ama.mutation(api.backOffice.refunds.markRefunded, { refundId, method: "mobileMoney" });
    // 1 to 3 November 2026, GMT.
    const nov1 = Date.UTC(2026, 10, 1);
    await t.run(async (ctx) => {
      await ctx.db.patch(payment._id, { paidAt: nov1 + 9 * 60 * 60 * 1000 + 5 * 60 * 1000 });
      await ctx.db.patch(invoicePayment._id, { paidAt: nov1 + DAY + 14 * 60 * 60 * 1000 });
      await ctx.db.patch(refundId, { refundedAt: nov1 + 2 * DAY + 8 * 60 * 60 * 1000 });
    });

    const file = await ama.query(api.backOffice.reports.exportCsv, {
      from: nov1,
      to: nov1 + 3 * DAY,
    });

    expect(file.filename).toBe("emblish-2026-11-01-to-2026-11-03.csv");
    expect(file.csv.split("\r\n")).toEqual([
      "Date (GMT),Receipt or refund,Orders,Kind,Amount (GHS),Method",
      "2026-11-01 09:05,R-0001,S-0001 P-0001,Checkout,660.00,Seev Plus",
      "2026-11-02 14:00,R-0002,P-0001,Shipping Fee Invoice,18.00,Seev Plus",
      `2026-11-03 08:00,${refundId},P-0001,Refund: Cancelled Pre-order,-180.00,Mobile money`,
      "",
    ]);
  });

  test("a one-day period is named for its day", async () => {
    const { ama } = await withOwner();
    const nov15 = Date.UTC(2026, 10, 15);

    const file = await ama.query(api.backOffice.reports.exportCsv, {
      from: nov15,
      to: nov15 + DAY,
    });

    expect(file.filename).toBe("emblish-2026-11-15.csv");
    expect(file.csv).toBe("Date (GMT),Receipt or refund,Orders,Kind,Amount (GHS),Method\r\n");
  });
});
