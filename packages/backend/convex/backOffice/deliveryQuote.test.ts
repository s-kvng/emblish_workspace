import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { Fulfilment } from "../model/fulfilment";
import {
  accraDelivery,
  kofiPhone,
  paidOrder,
  paidPreorder,
  withPreorders,
  withShop,
  withZones,
} from "../test.checkout";
import { payCodeIn } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal, withStaffMember } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

/** Delivery to Kofi Elsewhere in Ghana, frozen as Checkout would: no fee until quoted. */
function elsewhereDelivery(zoneId: Id<"deliveryZones">): Fulfilment {
  const { deliveryFee: _fee, ...unpriced } = accraDelivery(zoneId);
  return { ...unpriced, zoneName: "Elsewhere in Ghana" };
}

/** Kofi's paid Store Order (1 Size S tote) for Delivery Elsewhere, and Esi (Staff) at the desk. */
async function elsewhereStoreOrder() {
  const shop = await withShop();
  const zones = await withZones(shop.t);
  const esi = await withStaffMember(shop.t, "Esi Ofori");
  const order = await paidOrder(
    shop.t,
    shop.customerId,
    [{ variantId: shop.small, quantity: 1 }],
    elsewhereDelivery(zones.elsewhere),
  );
  // The payment text isn't what's under test.
  await sms.to(shop.t, kofiPhone.slice(1));
  return { ...shop, ...zones, esi, order };
}

describe("quoting an Elsewhere Delivery Fee on a Store Order", () => {
  test("any Staff member's quote issues a Delivery Fee Invoice, texted with its /p/ link", async () => {
    const { t, esi, order } = await elsewhereStoreOrder();

    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 4500,
    });

    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text?.message.replace(/\/p\/[A-Z2-9]{8}/, "/p/CODE")).toMatch(
      /^Delivery Fee for S-0001 to Elsewhere in Ghana: GHS 45\.00\. Due \d{1,2} [A-Z][a-z]{2}\. Pay: http:\/\/localhost:3001\/p\/CODE$/,
    );
    const invoice = await t.query(api.storefront.invoices.get, {
      code: payCodeIn(text!.message),
    });
    expect(invoice).toMatchObject({
      kind: "deliveryFee",
      status: "unpaid",
      orderReference: "S-0001",
      items: [{ productName: "Kente Weekend Tote", arrived: 1, missing: 0 }],
      lines: [{ kind: "deliveryFee", zoneName: "Elsewhere in Ghana", amount: 4500 }],
      total: 4500,
    });

    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail).toMatchObject({
      status: "paymentDue",
      fulfilment: { method: "delivery", quotedFee: 4500 },
      invoices: [{ kind: "deliveryFee", status: "unpaid", total: 4500 }],
      canQuoteDeliveryFee: false,
      primaryAction: null,
    });
    expect(detail.history[detail.history.length - 1]).toMatchObject({
      kind: "invoiced",
      by: "Esi Ofori",
      amount: 4500,
    });
  });
});

/** The Customer pays the invoice behind `code` at `/p/`, and Seev confirms it. */
async function payAtP(t: Awaited<ReturnType<typeof withShop>>["t"], code: string) {
  await t.action(api.storefront.invoices.pay, { code });
  seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
  await t.action(api.storefront.invoices.refresh, { code });
}

describe("paying a Delivery Fee Invoice", () => {
  test("paying it at /p/ makes the order Ready, on Today's dispatch queue", async () => {
    const { t, esi, order } = await elsewhereStoreOrder();
    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 4500,
    });
    const [quote] = await sms.to(t, kofiPhone.slice(1));

    await payAtP(t, payCodeIn(quote!.message));

    const detail = await esi.query(api.backOffice.orders.get, {
      orderId: order.orderId,
    });
    expect(detail).toMatchObject({
      status: "ready",
      invoices: [{ kind: "deliveryFee", status: "paid" }],
      primaryAction: "dispatch",
    });
    const today = await esi.query(api.backOffice.orders.today, {});
    expect(today.toDispatch.map((row) => row.reference)).toEqual(["S-0001"]);
  });
});

/**
 * Kofi's Pre-order of 2 Shea jars (P-0001) for Delivery Elsewhere, its window ordered from the
 * supplier. With `arrive`, both units arrive at a GHS 9 Shipping Fee and the invoices are issued.
 */
async function elsewherePreorder({ arrive }: { arrive: boolean }) {
  const shop = await withPreorders();
  const { t, customerId, sheaWindow, sheaJar } = shop;
  const zones = await withZones(t);
  const ama = t.withIdentity({ subject: "auth-window-opener" });
  await paidPreorder(
    t,
    customerId,
    sheaWindow,
    [{ variantId: sheaJar, quantity: 2 }],
    elsewhereDelivery(zones.elsewhere),
  );
  const orderId = (await t.run((ctx) => ctx.db.query("orders").first()))!._id;
  await ama.mutation(api.backOffice.windows.closeNow, { windowId: sheaWindow });
  await ama.mutation(api.backOffice.windows.advance, {
    windowId: sheaWindow,
    stage: "orderedFromSupplier",
    storeQuantities: [{ variantId: sheaJar, quantity: 0 }],
  });
  const issue = async () => {
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 2 }],
    });
    await ama.mutation(api.backOffice.invoices.confirmFee, {
      windowId: sheaWindow,
      fee: 900,
    });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });
  };
  if (arrive) await issue();
  await sms.to(t, kofiPhone.slice(1));
  return { ...shop, ama, orderId, issue };
}

describe("quoting an Elsewhere Delivery Fee on a Pre-order", () => {
  test("after its Shipping Fee Invoice, the fee comes on its own invoice; it's Ready once both are paid", async () => {
    const { t, ama, orderId } = await elsewherePreorder({ arrive: true });
    const shipping = await ama.query(api.backOffice.orders.get, { orderId });
    expect(shipping.invoices).toMatchObject([{ kind: "shippingFee", total: 1800 }]);

    await ama.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId,
      fee: 6000,
    });
    const [quote] = await sms.to(t, kofiPhone.slice(1));
    await payAtP(t, payCodeIn(quote!.message));

    // The Shipping Fee is still unpaid, so it can't go out yet.
    const halfPaid = await ama.query(api.backOffice.orders.get, { orderId });
    expect(halfPaid).toMatchObject({
      status: "paymentDue",
      invoices: [
        { kind: "shippingFee", status: "unpaid" },
        { kind: "deliveryFee", status: "paid", total: 6000 },
      ],
      primaryAction: null,
    });

    await payAtP(t, shipping.invoices[0]!.code);
    expect(await ama.query(api.backOffice.orders.get, { orderId })).toMatchObject({
      status: "ready",
      primaryAction: "dispatch",
    });
  });

  test("before its Shipping Fee Invoice, the fee waits to go on it as a line", async () => {
    const { t, ama, orderId, issue } = await elsewherePreorder({
      arrive: false,
    });

    await ama.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId,
      fee: 6000,
    });

    expect(await sms.to(t, kofiPhone.slice(1))).toEqual([]);
    const quoted = await ama.query(api.backOffice.orders.get, { orderId });
    expect(quoted).toMatchObject({
      status: "awaitingArrival",
      fulfilment: { quotedFee: 6000 },
      invoices: [],
      canQuoteDeliveryFee: false,
    });
    expect(quoted.history[quoted.history.length - 1]).toMatchObject({
      kind: "deliveryQuoted",
      amount: 6000,
    });

    await issue();

    const text = (await sms.to(t, kofiPhone.slice(1))).find((s) => s.message.includes("/p/"));
    expect(text?.message).toMatch(
      /^Shipping Fee for P-0001 \(2 units\): GHS 18\.00 \+ delivery GHS 60\.00 = GHS 78\.00\./,
    );
    const invoice = await t.query(api.storefront.invoices.get, {
      code: payCodeIn(text!.message),
    });
    expect(invoice).toMatchObject({
      kind: "shippingFee",
      lines: [
        { kind: "shippingFee", units: 2, amount: 1800 },
        { kind: "deliveryFee", zoneName: "Elsewhere in Ghana", amount: 6000 },
      ],
      total: 7800,
    });
  });
});

describe("what a quote needs", () => {
  test("only an open Elsewhere order with no fee yet, at a whole, positive number of pesewas", async () => {
    const { t, esi, order, customerId, medium, accra } = await elsewhereStoreOrder();
    const quote = (orderId: Id<"orders">, fee: number) =>
      refusal(esi.mutation(api.backOffice.orders.quoteDeliveryFee, { orderId, fee }));

    expect(await quote(order.orderId, 0)).toBe("INVALID_FEE");
    expect(await quote(order.orderId, 45.5)).toBe("INVALID_FEE");

    const pickup = await paidOrder(t, customerId, [{ variantId: medium, quantity: 1 }]);
    expect(await quote(pickup.orderId, 4500)).toBe("NOT_ELSEWHERE");
    const fixedZone = await paidOrder(
      t,
      customerId,
      [{ variantId: medium, quantity: 1 }],
      accraDelivery(accra),
    );
    expect(await quote(fixedZone.orderId, 4500)).toBe("NOT_ELSEWHERE");

    expect(await quote(order.orderId, 4500)).toBe("allowed");
    expect(await quote(order.orderId, 5000)).toBe("ALREADY_QUOTED");
    const invoices = (await esi.query(api.backOffice.orders.get, { orderId: order.orderId }))
      .invoices;
    expect(invoices).toHaveLength(1);
  });

  test("a cancelled order can't be quoted", async () => {
    const { t, esi, order } = await elsewhereStoreOrder();
    await t.run((ctx) => ctx.db.patch(order.orderId, { status: "cancelled" }));

    expect(
      await refusal(
        esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
          orderId: order.orderId,
          fee: 4500,
        }),
      ),
    ).toBe("NOT_QUOTABLE");
    expect(
      (await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).canQuoteDeliveryFee,
    ).toBe(false);
  });
});

describe("a Delivery Fee Invoice and Forfeit", () => {
  test("left unpaid past day 30 it is Overdue, never Eligible for Forfeit", async () => {
    const { t, esi, order } = await elsewhereStoreOrder();
    expect(
      (await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).canQuoteDeliveryFee,
    ).toBe(true);
    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 4500,
    });
    await t.run(async (ctx) => {
      const invoice = (await ctx.db.query("invoices").first())!;
      await ctx.db.patch(invoice._id, {
        clockStartedAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
      });
    });

    const overdue = await esi.query(api.backOffice.invoices.inbox, {
      filter: "overdue",
    });
    expect(overdue.rows).toMatchObject([
      {
        kind: "deliveryFee",
        orderReference: "S-0001",
        state: "overdue",
        day: 45,
      },
    ]);
    const eligible = await esi.query(api.backOffice.invoices.inbox, {
      filter: "eligible",
    });
    expect(eligible).toMatchObject({
      counts: { eligible: { count: 0, total: 0 } },
      rows: [],
    });
  });
});

describe("correcting a quote", () => {
  test("Void & reissue with a new Delivery Fee updates the quote on the order", async () => {
    const { esi, order } = await elsewhereStoreOrder();
    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 4500,
    });
    const [first] = await esi.run(async (ctx) => await ctx.db.query("invoices").collect());

    await esi.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId: first!._id,
      reason: "Wrong fee",
      deliveryFee: 5500,
    });

    expect(await esi.query(api.backOffice.orders.get, { orderId: order.orderId })).toMatchObject({
      fulfilment: { quotedFee: 5500 },
      invoices: [
        { kind: "deliveryFee", status: "void", total: 4500 },
        { kind: "deliveryFee", status: "unpaid", total: 5500 },
      ],
    });
  });
});

describe("a quote with no Shipping Fee to go with it", () => {
  test("a GH₵0 Shipping Fee leaves the quote on its own Delivery Fee Invoice, never Forfeited", async () => {
    const { t, ama, orderId, sheaWindow, sheaJar } = await elsewherePreorder({ arrive: false });
    await ama.mutation(api.backOffice.orders.quoteDeliveryFee, { orderId, fee: 6000 });
    await ama.mutation(api.backOffice.arrivals.lock, {
      windowId: sheaWindow,
      counts: [{ variantId: sheaJar, arrived: 2 }],
    });
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 0 });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });

    const text = (await sms.to(t, kofiPhone.slice(1))).find((s) => s.message.includes("/p/"));
    expect(text?.message).toMatch(/^Delivery Fee for P-0001 to Elsewhere in Ghana: GHS 60\.00\./);
    expect(await ama.query(api.backOffice.orders.get, { orderId })).toMatchObject({
      status: "paymentDue",
      invoices: [
        {
          kind: "deliveryFee",
          total: 6000,
        },
      ],
    });
  });
});

describe("correcting a Shipping Fee Invoice beside a Delivery Fee Invoice", () => {
  test("the Delivery Fee can't be added to it as well", async () => {
    const { ama, orderId } = await elsewherePreorder({ arrive: true });
    await ama.mutation(api.backOffice.orders.quoteDeliveryFee, { orderId, fee: 6000 });
    const shippingId = await ama.run(
      async (ctx) =>
        (await ctx.db.query("invoices").collect()).find((i) => i.kind === "shippingFee")!._id,
    );

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.voidAndReissue, {
          invoiceId: shippingId,
          reason: "Wrong Delivery Zone",
          deliveryFee: 6000,
        }),
      ),
    ).toBe("DELIVERY_FEE_INVOICED");
  });
});
