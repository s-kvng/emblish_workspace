import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone } from "../test.checkout";
import { payCodeIn, sheaInvoiced } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

/** The Shea window invoiced at GHS 9 a unit, and the inbox row for Kofi's P-0002 (2 units). */
async function kofi2Invoiced() {
  const shop = await sheaInvoiced(sms);
  const { rows } = await shop.ama.query(api.backOffice.invoices.inbox, {
    filter: "unpaid",
  });
  const invoiceId = rows.find((row) => row.orderReference === "P-0002")!.invoiceId;
  return { ...shop, invoiceId };
}

describe("Void & reissue", () => {
  test("the replacement gets its own /p/ code and keeps the first issue date", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    const before = await t.query(api.storefront.invoices.get, {
      code: codes.kofi2,
    });

    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });

    const [text] = await sms.to(t, kofiPhone.slice(1));
    expect(text!.message).toMatch(
      /^Your invoice for P-0002 has been corrected\. New total GHS 16\.00, still due \d{1,2} [A-Z][a-z]{2}\. Pay: http:\/\/localhost:3001\/p\/[A-Z2-9]{8}$/,
    );
    const newCode = payCodeIn(text!.message);
    expect(newCode).not.toBe(codes.kofi2);
    const replacement = await t.query(api.storefront.invoices.get, {
      code: newCode,
    });
    expect(replacement).toMatchObject({
      number: "INV-0004",
      status: "unpaid",
      orderReference: "P-0002",
      lines: [{ kind: "shippingFee", units: 2, unitFee: 800, amount: 1600 }],
      total: 1600,
      clockStartedAt: before!.clockStartedAt,
      dueAt: before!.dueAt,
    });
    const voided = await t.query(api.storefront.invoices.get, {
      code: codes.kofi2,
    });
    expect(voided).toMatchObject({
      status: "void",
      voidReason: "Wrong fee",
      replacedByCode: newCode,
    });
  });

  test("a voided invoice's page points at the live end of its chain", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });
    const second = (await ama.query(api.backOffice.invoices.inbox, { filter: "unpaid" })).rows.find(
      (row) => row.orderReference === "P-0002",
    )!;
    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId: second.invoiceId,
      unitFee: 700,
      reason: "Wrong fee",
    });
    const texts = await sms.to(t, kofiPhone.slice(1));
    const liveCode = payCodeIn(texts[texts.length - 1]!.message);

    const first = await t.query(api.storefront.invoices.get, {
      code: codes.kofi2,
    });

    expect(first).toMatchObject({ status: "void", replacedByCode: liveCode });
  });

  test("it needs a reason", async () => {
    const { ama, invoiceId } = await kofi2Invoiced();

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.voidAndReissue, {
          invoiceId,
          unitFee: 800,
          reason: "  ",
        }),
      ),
    ).toBe("VOID_REASON_REQUIRED");
  });

  test("only an unpaid invoice can be voided", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });
    seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code: codes.kofi2 });

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.voidAndReissue, {
          invoiceId,
          unitFee: 800,
          reason: "Wrong fee",
        }),
      ),
    ).toBe("NOT_UNPAID");
  });

  test("the voided invoice moves to the Void filter and the replacement stays unpaid", async () => {
    const { ama, invoiceId } = await kofi2Invoiced();

    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });

    const inbox = await ama.query(api.backOffice.invoices.inbox, {
      filter: "void",
    });
    expect(inbox.counts.unpaid).toEqual({ count: 3, total: 900 + 1600 + 900 });
    expect(inbox.counts.void).toEqual({ count: 1, total: 1800 });
    expect(inbox.rows.map((row) => [row.number, row.state])).toEqual([["INV-0002", "void"]]);
  });
});

describe("The invoice sheet", () => {
  test("a reissued invoice's sheet follows to the replacement and lists the voided version", async () => {
    const { ama, invoiceId } = await kofi2Invoiced();
    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });

    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });

    expect(sheet).toMatchObject({
      number: "INV-0004",
      status: "unpaid",
      state: "due",
      day: 0,
      orderReference: "P-0002",
      customerName: "Kofi Boateng",
      windowNumber: 1,
      productName: "Shea Body Butter",
      lines: [{ kind: "shippingFee", units: 2, unitFee: 800, amount: 1600 }],
      total: 1600,
      voidedVersions: [{ number: "INV-0002", total: 1800, voidReason: "Wrong fee" }],
    });
    expect(sheet.dueAt - sheet.clockStartedAt).toBe(14 * 24 * 60 * 60 * 1000);
  });

  test("reminder dots light up as the clock passes days 7, 13, 15 and 28, then 30 can Forfeit", async () => {
    const { t, ama, invoiceId } = await kofi2Invoiced();
    await t.run((ctx) =>
      ctx.db.patch(invoiceId, {
        clockStartedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      }),
    );

    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });

    expect(sheet.reminders).toEqual([
      { day: 7, reached: true },
      { day: 13, reached: true },
      { day: 15, reached: false },
      { day: 28, reached: false },
      { day: 30, reached: false },
    ]);
    expect(sheet.state).toBe("due");
  });

  test("a paid invoice shows its payment", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });
    seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code: codes.kofi2 });

    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });

    expect(sheet).toMatchObject({
      status: "paid",
      state: "paid",
      paid: { receiptNumber: expect.stringMatching(/^R-\d{4}$/) },
    });
  });
});

describe("Void & reissue, what it won't do", () => {
  test("it waits while the Customer is paying the invoice on Seev", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.voidAndReissue, {
          invoiceId,
          unitFee: 800,
          reason: "Wrong fee",
        }),
      ),
    ).toBe("PAYMENT_IN_PROGRESS");
  });

  test("a Pickup order can't be given a Delivery Fee", async () => {
    const { ama, invoiceId } = await kofi2Invoiced();

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.voidAndReissue, {
          invoiceId,
          deliveryFee: 3000,
          reason: "Wrong Delivery Zone",
        }),
      ),
    ).toBe("NOT_DELIVERY");
  });
});

describe("The invoice sheet once paid", () => {
  test("reminder dots stop at the day it was paid", async () => {
    const { t, ama, codes, invoiceId } = await kofi2Invoiced();
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });
    seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code: codes.kofi2 });
    const DAY = 24 * 60 * 60 * 1000;
    // Paid on day 10, and it's now day 40.
    await t.run((ctx) =>
      ctx.db.patch(invoiceId, {
        clockStartedAt: Date.now() - 40 * DAY,
        paidAt: Date.now() - 30 * DAY,
      }),
    );

    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });

    expect(sheet.reminders.filter((dot) => dot.reached).map((dot) => dot.day)).toEqual([7]);
  });
});
