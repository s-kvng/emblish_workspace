import { describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { accraDelivery, kofiPhone, paidOrder, withShop, withZones } from "../test.checkout";
import { esiPhone, payCodeIn, sheaInvoiced } from "../test.invoices";
import { fakeSeev } from "../test.seev";
import type { TestBackend } from "../test.setup";
import { captureSms } from "../test.sms";
import { withStaffMember } from "../test.staff";

const sms = captureSms();
const seev = fakeSeev();

const DAY = 24 * 60 * 60 * 1000;

/** "14 Nov", as SMS copy writes a date in Ghana time (GMT). */
function shortDate(at: number) {
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Runs the daily reminders job at 10:00 UTC, `day` days after the day of `startedAt`. */
async function cronOnDay(t: TestBackend, startedAt: number, day: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Math.floor(startedAt / DAY) * DAY + day * DAY + 10 * 60 * 60 * 1000);
  try {
    await t.mutation(internal.system.reminders.sendDue, {});
  } finally {
    vi.useRealTimers();
  }
}

/** The Shea window invoiced, with when P-0002's invoice clock started. */
async function invoiced() {
  const shop = await sheaInvoiced(sms);
  const invoice = await shop.t.query(api.storefront.invoices.get, {
    code: shop.codes.kofi2,
  });
  return { ...shop, clockStartedAt: invoice!.clockStartedAt };
}

/** Kofi's texts that mention P-0002. */
async function kofi2Texts(t: TestBackend) {
  return (await sms.to(t, kofiPhone.slice(1)))
    .map((s) => s.message)
    .filter((message) => message.includes("P-0002"));
}

describe("The daily reminders job", () => {
  test("runs every day at 10:00 UTC (Ghana time), inside the 08:00 to 20:00 SMS hours", async () => {
    const { default: crons } = await import("../crons");

    expect(Object.values(crons.crons)).toEqual([
      expect.objectContaining({
        name: "system/reminders:sendDue",
        schedule: { type: "daily", hourUTC: 10, minuteUTC: 0 },
      }),
    ]);
  });
});

describe("Invoice reminders", () => {
  test("an unpaid Shipping Fee Invoice is reminded on day 7, not before", async () => {
    const { t, codes, clockStartedAt } = await invoiced();

    await cronOnDay(t, clockStartedAt, 6);
    expect(await kofi2Texts(t)).toEqual([]);

    await cronOnDay(t, clockStartedAt, 7);
    expect(await kofi2Texts(t)).toEqual([
      `Reminder: GHS 18.00 Shipping Fee for P-0002 is due ${shortDate(clockStartedAt + 14 * DAY)}. ` +
        `Pay: http://localhost:3001/p/${codes.kofi2}`,
    ]);
    expect(await sms.to(t, esiPhone.slice(1))).toHaveLength(1);
  });

  test("days 13, 15 and 28 say due tomorrow, then warn of Forfeit by day 30", async () => {
    const { t, codes, clockStartedAt } = await invoiced();
    const pay = `Pay: http://localhost:3001/p/${codes.kofi2}`;
    const texts: Record<number, string[]> = {};
    for (const day of [13, 14, 15, 16, 28, 29, 30]) {
      await cronOnDay(t, clockStartedAt, day);
      texts[day] = await kofi2Texts(t);
    }

    expect(texts).toEqual({
      13: [`GHS 18.00 Shipping Fee for P-0002 is due tomorrow. ${pay}`],
      14: [],
      15: [
        "GHS 18.00 Shipping Fee for P-0002 is overdue. Orders unpaid after 30 days may be " +
          `cancelled. ${pay}`,
      ],
      16: [],
      28: [
        "Final reminder: GHS 18.00 for P-0002 is overdue. If unpaid by " +
          `${shortDate(clockStartedAt + 30 * DAY)} the order may be cancelled and your item ` +
          `payment kept. ${pay}`,
      ],
      29: [],
      30: [],
    });
  });

  test("running twice on a reminder day sends each reminder once", async () => {
    const { t, clockStartedAt } = await invoiced();

    await cronOnDay(t, clockStartedAt, 7);
    await cronOnDay(t, clockStartedAt, 7);

    expect(await kofi2Texts(t)).toHaveLength(1);
  });

  test("a paid invoice gets no more reminders", async () => {
    const { t, codes, clockStartedAt } = await invoiced();
    await t.action(api.storefront.invoices.pay, { code: codes.kofi2 });
    seev.setStatus(seev.sessions[seev.sessions.length - 1]!.reference, "completed");
    await t.action(api.storefront.invoices.refresh, { code: codes.kofi2 });
    await kofi2Texts(t);

    for (const day of [7, 13, 15, 28]) await cronOnDay(t, clockStartedAt, day);

    // Paying made it Ready for Pickup, so it's owed uncollected reminders instead.
    const invoiceReminders = (await kofi2Texts(t)).filter((text) => text.includes("/p/"));
    expect(invoiceReminders).toEqual([]);
  });

  test("Void & reissue keeps the clock: the replacement is reminded, with its own link", async () => {
    const { t, ama, codes, clockStartedAt } = await invoiced();
    const { rows } = await ama.query(api.backOffice.invoices.inbox, {
      filter: "unpaid",
    });
    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId: rows.find((row) => row.orderReference === "P-0002")!.invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });
    const newCode = payCodeIn((await kofi2Texts(t))[0]!);

    await cronOnDay(t, clockStartedAt, 7);

    expect(await kofi2Texts(t)).toEqual([
      `Reminder: GHS 16.00 Shipping Fee for P-0002 is due ${shortDate(clockStartedAt + 14 * DAY)}. ` +
        `Pay: http://localhost:3001/p/${newCode}`,
    ]);
    expect(newCode).not.toBe(codes.kofi2);
  });

  test("the invoice sheet's dots show the reminders sent, across a reissue", async () => {
    const { t, ama, clockStartedAt } = await invoiced();
    const { rows } = await ama.query(api.backOffice.invoices.inbox, {
      filter: "unpaid",
    });
    const invoiceId = rows.find((row) => row.orderReference === "P-0002")!.invoiceId;

    await cronOnDay(t, clockStartedAt, 7);
    // Missed on day 13: a late "due tomorrow" would be wrong, so it isn't sent.
    await cronOnDay(t, clockStartedAt, 14);
    const sentBeforeReissue = await kofi2Texts(t);
    await ama.mutation(api.backOffice.invoices.voidAndReissue, {
      invoiceId,
      unitFee: 800,
      reason: "Wrong fee",
    });
    await kofi2Texts(t); // the corrected invoice
    await cronOnDay(t, clockStartedAt, 15);
    const sentAfterReissue = await kofi2Texts(t);

    expect([...sentBeforeReissue, ...sentAfterReissue].map((text) => text.split(".")[0])).toEqual([
      "Reminder: GHS 18",
      "GHS 16",
    ]);
    const sheet = await ama.query(api.backOffice.invoices.sheet, { invoiceId });
    expect(sheet.reminders).toEqual([
      { day: 7, reached: true },
      { day: 13, reached: false },
      { day: 15, reached: true },
      { day: 28, reached: false },
      { day: 30, reached: false },
    ]);
  });

  test("a Delivery Fee Invoice's reminders never mention Forfeit", async () => {
    const shop = await withShop();
    const { t } = shop;
    const zones = await withZones(t);
    const esi = await withStaffMember(t, "Esi Ofori");
    const { deliveryFee: _fee, ...unpriced } = accraDelivery(zones.elsewhere);
    const order = await paidOrder(t, shop.customerId, [{ variantId: shop.small, quantity: 1 }], {
      ...unpriced,
      zoneName: "Elsewhere in Ghana",
    });
    await esi.mutation(api.backOffice.orders.quoteDeliveryFee, {
      orderId: order.orderId,
      fee: 4500,
    });
    const quoted = await sms.to(t, kofiPhone.slice(1));
    const code = payCodeIn(quoted[quoted.length - 1]!.message);
    const { clockStartedAt } = (await t.query(api.storefront.invoices.get, {
      code,
    }))!;
    const pay = `Pay: http://localhost:3001/p/${code}`;

    const texts: string[] = [];
    for (const day of [7, 13, 15, 28]) {
      await cronOnDay(t, clockStartedAt, day);
      texts.push(...(await sms.to(t, kofiPhone.slice(1))).map((s) => s.message));
    }

    expect(texts).toEqual([
      `Reminder: GHS 45.00 Delivery Fee for S-0001 is due ${shortDate(clockStartedAt + 14 * DAY)}. ${pay}`,
      `GHS 45.00 Delivery Fee for S-0001 is due tomorrow. ${pay}`,
      `GHS 45.00 Delivery Fee for S-0001 is overdue. ${pay}`,
      "Final reminder: GHS 45.00 Delivery Fee for S-0001 is still unpaid. We will deliver once " +
        `it is paid. ${pay}`,
    ]);
  });
});

describe("Uncollected reminders", () => {
  test("a Pickup order waiting at Ready is reminded on days 3, 7, 14 and 28, then they stop", async () => {
    const { t, customerId, small } = await withShop();
    const zones = await withZones(t);
    const pickup = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    // A Delivery order at Ready waits on Staff, not the Customer: it shows in Today instead.
    await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }], accraDelivery(zones.accra));
    await sms.to(t, kofiPhone.slice(1));
    const readyAt = (await t.run((ctx) => ctx.db.get(pickup.orderId)))!.readyAt!;

    const texts: Record<number, string[]> = {};
    for (const day of [2, 3, 7, 14, 28, 35, 56]) {
      await cronOnDay(t, readyAt, day);
      texts[day] = (await sms.to(t, kofiPhone.slice(1))).map((s) => s.message);
    }

    const reminder = `Reminder: S-0001 is waiting for you. Pickup code: ${pickup.pickupCode}. Osu, Oxford Street. Mon-Sat 9am-6pm.`;
    expect(texts).toEqual({
      2: [],
      3: [reminder],
      7: [reminder],
      14: [reminder],
      28: [reminder],
      35: [],
      56: [],
    });
  });
});

describe("Uncollected reminders stop", () => {
  test("once the order is collected", async () => {
    const { t, customerId, small } = await withShop();
    const esi = await withStaffMember(t, "Esi Ofori");
    const order = await paidOrder(t, customerId, [{ variantId: small, quantity: 1 }]);
    await sms.to(t, kofiPhone.slice(1));
    const readyAt = (await t.run((ctx) => ctx.db.get(order.orderId)))!.readyAt!;
    await cronOnDay(t, readyAt, 3);
    await sms.to(t, kofiPhone.slice(1));

    await esi.mutation(api.backOffice.orders.handOver, {
      orders: [{ orderId: order.orderId, code: order.pickupCode }],
    });
    await cronOnDay(t, readyAt, 7);

    expect(await sms.to(t, kofiPhone.slice(1))).toEqual([]);
  });
});
