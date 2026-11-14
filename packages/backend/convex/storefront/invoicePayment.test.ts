import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { accraDelivery, kofiPhone, withZones } from "../test.checkout";
import { sheaArrived, sheaInvoiced, payCodeIn } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

/** Kofi opens P-0002's invoice link and pays it on Seev's hosted page; nobody signs in. */
async function paidAtP() {
  const shop = await sheaInvoiced(sms);
  const code = shop.codes.kofi2;
  await shop.t.action(api.storefront.invoices.pay, { code });
  const reference = seev.sessions[seev.sessions.length - 1]!.reference;
  seev.setStatus(reference, "completed");
  await shop.t.action(api.storefront.invoices.refresh, { code });
  return { ...shop, code, reference };
}

describe("The /p/ page", () => {
  test("anyone with the link sees the invoice, due 14 days after issue", async () => {
    const { t, codes } = await sheaInvoiced(sms);

    const invoice = await t.query(api.storefront.invoices.get, { code: codes.kofi2 });

    expect(invoice).toMatchObject({
      kind: "shippingFee",
      status: "unpaid",
      orderReference: "P-0002",
      customerName: "Kofi Boateng",
      fulfilment: { method: "pickup" },
      items: [{ productName: "Shea Body Butter", arrived: 2, missing: 0 }],
      lines: [{ kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 }],
      total: 1800,
      itemReceiptNumber: "R-0002",
    });
    expect(invoice?.paid).toBeUndefined();
  });

  test("a Shortfall shows the units that didn't arrive", async () => {
    const { t, ama, sheaWindow } = await sheaArrived(sms, 2);
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });
    const [, second] = await sms.to(t, kofiPhone.slice(1));

    const invoice = await t.query(api.storefront.invoices.get, {
      code: payCodeIn(second!.message),
    });

    expect(invoice).toMatchObject({
      orderReference: "P-0002",
      items: [{ arrived: 1, missing: 1 }],
      total: 900,
    });
  });
});

describe("Pay at /p/", () => {
  test("Pay opens Seev for the invoice's total, without sign-in, naming the invoice", async () => {
    const { t, codes } = await sheaInvoiced(sms);

    const { checkoutUrl } = await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });

    expect(checkoutUrl).toBe("https://pay.seevplus.com/PAY-1");
    const invoiceId = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("invoices")
            .withIndex("by_code", (q) => q.eq("code", codes.kofi2))
            .unique()
        )?._id,
    );
    expect(seev.sessions[0]?.body).toEqual({
      type: "checkout",
      recipient: { name: "Kofi Boateng", phone: kofiPhone },
      items: [{ name: "Shipping Fee for P-0002 (2 units)", quantity: 2, price: 900 }],
      currency: "GHS",
      redirect_url: `http://localhost:3001/p/${codes.kofi2}?from=seev`,
      meta: { invoiceId },
    });
  });

  test("a verified payment marks it paid with a Receipt, and the Pre-order is Ready", async () => {
    const { t, code, reference } = await paidAtP();

    const invoice = await t.query(api.storefront.invoices.get, { code });
    expect(invoice?.status).toBe("paid");
    expect(invoice?.paid?.receiptNumber).toBe("R-0004");
    const receipt = await t.query(api.storefront.receipts.get, {
      code: invoice!.paid!.receiptCode,
    });
    expect(receipt).toMatchObject({
      receiptNumber: "R-0004",
      total: 1800,
      seevReference: reference,
      invoice: {
        number: "INV-0002",
        kind: "shippingFee",
        orderReference: "P-0002",
        lines: [{ kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 }],
      },
      toRefund: 0,
    });
    const orders = await t.run(async (ctx) =>
      (await ctx.db.query("orders").collect()).map((o) => [o.reference, o.status]),
    );
    expect(orders).toEqual([
      ["P-0001", "paymentDue"],
      ["P-0002", "ready"],
      ["P-0003", "paymentDue"],
    ]);
  });

  test("the payment SMS carries the Pickup Code and the Receipt link", async () => {
    const { t, code } = await paidAtP();

    const texts = await sms.to(t, kofiPhone.slice(1));

    const invoice = await t.query(api.storefront.invoices.get, { code });
    const pickupCode = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("orders")
            .withIndex("by_reference", (q) => q.eq("reference", "P-0002"))
            .unique()
        )?.pickupCode,
    );
    expect(texts.map((s) => s.message)).toEqual([
      `Payment of GHS 18.00 received for P-0002. Pickup code for P-0002: ${pickupCode}. Osu, Oxford ` +
        `Street. Mon-Sat 9am-6pm. Receipt: http://localhost:3001/r/${invoice?.paid?.receiptCode}`,
    ]);
  });

  test("a paid invoice can't be paid again, and settling twice records one payment", async () => {
    const { t, code, reference } = await paidAtP();

    expect(await refusal(t.action(api.storefront.invoices.pay, { code }))).toBe("INVOICE_PAID");
    await t.action(api.storefront.invoices.refresh, { code });
    const payments = await t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_reference", (q) => q.eq("seevReference", reference))
        .collect(),
    );
    expect(payments).toHaveLength(1);
    expect(await refusal(t.action(api.storefront.invoices.pay, { code: "ZZZZZZZZ" }))).toBe(
      "NOT_FOUND",
    );
  });

  test("a Delivery Fee on the invoice is paid with it, and the order is ready to go out", async () => {
    const shop = await sheaArrived(sms);
    const { t, ama, sheaWindow } = shop;
    const zones = await withZones(t);
    await t.run(async (ctx) => {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_reference", (q) => q.eq("reference", "P-0002"))
        .unique();
      await ctx.db.patch(order!._id, { fulfilment: accraDelivery(zones.accra) });
    });
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });
    const [, invoiceSms] = await sms.to(t, kofiPhone.slice(1));
    expect(invoiceSms?.message).toMatch(
      /^Shipping Fee for P-0002 \(2 units\): GHS 18\.00 \+ delivery GHS 30\.00 = GHS 48\.00\. Due /,
    );
    const code = payCodeIn(invoiceSms!.message);

    await t.action(api.storefront.invoices.pay, { code });
    expect(seev.sessions[0]?.body.items).toEqual([
      { name: "Shipping Fee for P-0002 (2 units)", quantity: 2, price: 900 },
      { name: "Delivery: Accra Central", quantity: 1, price: 3000 },
    ]);
    seev.setStatus(seev.sessions[0]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code });

    const { toDispatch } = await ama.query(api.backOffice.orders.today, {});
    expect(toDispatch.map((row) => row.reference)).toEqual(["P-0002"]);
    const [paid] = await sms.to(t, kofiPhone.slice(1));
    expect(paid?.message).toMatch(
      /^Payment of GHS 48\.00 received for P-0002\. We will text you when it is on its way\. Receipt: /,
    );
  });
});

describe("Hand over a Ready Pre-order", () => {
  test("Staff find it by its Pickup Code at the Counter and hand it over", async () => {
    const { t, ama } = await paidAtP();
    const pickupCode = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("orders")
            .withIndex("by_reference", (q) => q.eq("reference", "P-0002"))
            .unique()
        )!.pickupCode,
    );

    const card = await ama.query(api.backOffice.orders.findByCode, { code: pickupCode });
    expect(card).toMatchObject({ reference: "P-0002", status: "ready" });
    await ama.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: card!.orderId, code: pickupCode }],
    });

    const order = await ama.query(api.backOffice.orders.get, { orderId: card!.orderId });
    expect(order.status).toBe("collected");
  });

  test("a Pre-order with its Shipping Fee unpaid isn't at the Counter", async () => {
    const { t, ama } = await sheaInvoiced(sms);
    const pickupCode = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("orders")
            .withIndex("by_reference", (q) => q.eq("reference", "P-0001"))
            .unique()
        )!.pickupCode,
    );
    const card = await ama.query(api.backOffice.orders.findByCode, { code: pickupCode });

    expect(
      await refusal(
        ama.mutation(api.backOffice.orders.handOver, {
          orders: [{ orderId: card!.orderId, code: pickupCode }],
        }),
      ),
    ).toBe("NOT_READY");
  });
});

describe("My orders and order detail", () => {
  test("an unpaid invoice puts the Pre-order at the top of My orders with its Pay link", async () => {
    const { t, codes } = await sheaInvoiced(sms);
    const kofi = t.withIdentity({ subject: `auth-${kofiPhone}` });

    const cards = await kofi.query(api.storefront.orders.mine, {});

    const p2 = cards.find((card) => card.reference === "P-0002");
    expect(p2).toMatchObject({
      needsAction: true,
      invoices: [{ kind: "shippingFee", code: codes.kofi2, total: 1800 }],
    });
  });

  test("order detail lists the Shipping Fee payment under the Item Payment", async () => {
    const { t, ama, code } = await paidAtP();
    const orderId = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("orders")
            .withIndex("by_reference", (q) => q.eq("reference", "P-0002"))
            .unique()
        )!._id,
    );

    const order = await ama.query(api.backOffice.orders.get, { orderId });

    expect(order.payments.map((p) => [p.receiptNumber, p.amount])).toEqual([
      ["R-0002", 18000],
      ["R-0004", 1800],
    ]);
    expect(order.invoices).toEqual([
      expect.objectContaining({ number: "INV-0002", code, status: "paid", total: 1800 }),
    ]);
  });
});
