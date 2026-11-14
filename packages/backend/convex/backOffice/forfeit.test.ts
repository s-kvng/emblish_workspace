import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone } from "../test.checkout";
import { sheaInvoiced } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal, withStaffMember } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();
const DAY = 24 * 60 * 60 * 1000;

/**
 * The Shea window invoiced at GHS 9 a unit, with Kofi's P-0002 (2 units, INV-0002) first issued
 * `days` ago and still unpaid.
 */
async function kofi2UnpaidFor(days: number) {
  const shop = await sheaInvoiced(sms);
  const { t, ama } = shop;
  const { rows } = await ama.query(api.backOffice.invoices.inbox, { filter: "unpaid" });
  const invoiceId = rows.find((row) => row.orderReference === "P-0002")!.invoiceId;
  await t.run((ctx) => ctx.db.patch(invoiceId, { clockStartedAt: Date.now() - days * DAY }));
  const { orderId } = await ama.query(api.backOffice.invoices.sheet, { invoiceId });
  return { ...shop, invoiceId, orderId };
}

describe("Forfeit", () => {
  test("from day 30 the Owner forfeits: order Forfeited, invoice voided, units released to Stock, Customer texted", async () => {
    const { t, ama, sheaJar, invoiceId, orderId } = await kofi2UnpaidFor(30);

    await ama.mutation(api.backOffice.orders.forfeit, { orderId });

    const order = await ama.query(api.backOffice.orders.get, { orderId });
    expect(order.status).toBe("forfeited");
    expect(order.toRefund).toBe(0);
    expect(order.history[order.history.length - 1]).toMatchObject({
      kind: "forfeited",
      by: "Ama Mensah",
      units: 2,
    });
    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });
    expect(sheet).toMatchObject({ status: "void", state: "void", voidReason: "Forfeited" });
    const stock = await ama.query(api.backOffice.stock.variant, { variantId: sheaJar });
    expect(stock.onHand).toBe(2);
    expect(stock.movements[0]).toMatchObject({
      kind: "released",
      quantity: 2,
      staffName: "Ama Mensah",
    });
    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text!.message).toBe(
      "P-0002 has been cancelled because its Shipping Fee was not paid. Your item payment is not refunded.",
    );
  });

  test("on day 29 it's refused, naming the day it can be, and nothing changes", async () => {
    const { ama, invoiceId, orderId } = await kofi2UnpaidFor(29);

    const refused = await ama.mutation(api.backOffice.orders.forfeit, { orderId }).catch((e) => e);

    expect(refused).toBeInstanceOf(ConvexError);
    expect(refused.data).toMatchObject({
      code: "TOO_EARLY",
      message: expect.stringMatching(/^P-0002 can be Forfeited from \d{1,2} [A-Z][a-z]{2}\.$/),
    });
    expect((await ama.query(api.backOffice.orders.get, { orderId })).status).toBe("paymentDue");
    expect((await ama.query(api.backOffice.invoices.sheet, { invoiceId })).status).toBe("unpaid");
  });

  test("Staff who aren't an Owner can't Forfeit", async () => {
    const { t, ama, orderId } = await kofi2UnpaidFor(31);
    const esi = await withStaffMember(t, "Esi Ofori");

    expect(await refusal(esi.mutation(api.backOffice.orders.forfeit, { orderId }))).toBe(
      "FORBIDDEN",
    );
    expect((await ama.query(api.backOffice.orders.get, { orderId })).status).toBe("paymentDue");
  });

  test("a paid Shipping Fee Invoice can't be Forfeited", async () => {
    const { t, ama, orderId, codes } = await kofi2UnpaidFor(31);
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });
    seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code: codes.kofi2 });

    expect(await refusal(ama.mutation(api.backOffice.orders.forfeit, { orderId }))).toBe(
      "NOT_FORFEITABLE",
    );
  });

  test("the SMS links the store's WhatsApp once it's set", async () => {
    const { t, ama, orderId } = await kofi2UnpaidFor(30);
    await ama.mutation(api.backOffice.settings.update, {
      location: "Osu",
      whatsappNumber: "+233 24 111 2222",
      callNumber: "",
    });

    await ama.mutation(api.backOffice.orders.forfeit, { orderId });

    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text!.message).toBe(
      "P-0002 has been cancelled because its Shipping Fee was not paid. Your item payment is not refunded. Questions? wa.me/233241112222",
    );
  });
});

describe("offering Forfeit", () => {
  test("order detail and the invoice sheet offer it from day 30, and not once it's done", async () => {
    const { t, ama, invoiceId, orderId } = await kofi2UnpaidFor(29);
    const offered = async () => [
      (await ama.query(api.backOffice.orders.get, { orderId })).canForfeit,
      (await ama.query(api.backOffice.invoices.sheet, { invoiceId })).canForfeit,
    ];
    expect(await offered()).toEqual([false, false]);

    await t.run((ctx) => ctx.db.patch(invoiceId, { clockStartedAt: Date.now() - 30 * DAY }));
    expect(await offered()).toEqual([true, true]);

    await ama.mutation(api.backOffice.orders.forfeit, { orderId });
    expect(await offered()).toEqual([false, false]);
  });
});
