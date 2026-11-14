import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { kofiPhone, withPreorders } from "../test.checkout";
import { sheaArrived as arrivedShea, esiPhone, payCodeIn } from "../test.invoices";
import { captureSms } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
/** The Shea window with `arrived` of its 4 Pre-ordered units locked in. */
function sheaArrived(arrived = 4) {
  return arrivedShea(sms, arrived);
}

describe("Confirm the Shipping Fee", () => {
  test("it records the per-unit fee for the window", async () => {
    const { ama, sheaWindow } = await sheaArrived();

    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });

    const preview = await ama.query(api.backOffice.invoices.preview, { windowId: sheaWindow });
    expect(preview).toMatchObject({
      estimate: 800,
      confirmedFee: 900,
      overEstimateAcknowledged: false,
    });
  });

  test("more than 20% over the estimate needs the supplier's bill checked", async () => {
    const { ama, sheaWindow } = await sheaArrived();

    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 961 }),
      ),
    ).toBe("OVER_ESTIMATE");
    // Exactly 20% over needs nothing.
    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 960 }),
      ),
    ).toBe("allowed");

    await ama.mutation(api.backOffice.invoices.confirmFee, {
      windowId: sheaWindow,
      fee: 1200,
      overEstimateAcknowledged: true,
    });
    const preview = await ama.query(api.backOffice.invoices.preview, { windowId: sheaWindow });
    expect(preview).toMatchObject({ confirmedFee: 1200, overEstimateAcknowledged: true });
  });

  test("it waits for the arrival and takes a whole number of pesewas", async () => {
    const shop = await withPreorders();
    const ama = shop.t.withIdentity({ subject: "auth-window-opener" });
    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.confirmFee, { windowId: shop.sheaWindow, fee: 900 }),
      ),
    ).toBe("NOT_ARRIVED");

    const { ama: staff, sheaWindow } = await sheaArrived();
    expect(
      await refusal(
        staff.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 9.5 }),
      ),
    ).toBe("INVALID_FEE");
    expect(
      await refusal(
        staff.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: -1 }),
      ),
    ).toBe("INVALID_FEE");
  });
});

const DAY = 24 * 60 * 60 * 1000;

describe("Issue Shipping Fee Invoices", () => {
  test("each Pre-order that got units gets one invoice for its arrived units, texted with its /p/ link", async () => {
    // 3 arrive: Kofi's P-0001 (1) and P-0002 (2) are filled, Esi's P-0003 gets nothing.
    const { t, ama, sheaWindow } = await sheaArrived(3);
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });

    const result = await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });

    expect(result).toEqual({ issued: 2, ready: 0 });
    const kofi = await sms.to(t, kofiPhone.slice(1));
    expect(kofi.map((s) => s.message.replace(/\/p\/[A-Z2-9]{8}/, "/p/CODE"))).toEqual([
      expect.stringMatching(
        /^Shipping Fee for P-0001 \(1 unit\): GHS 9\.00\. Due \d{1,2} [A-Z][a-z]{2}\. Pay: http:\/\/localhost:3001\/p\/CODE$/,
      ),
      expect.stringMatching(
        /^Shipping Fee for P-0002 \(2 units\): GHS 18\.00\. Due \d{1,2} [A-Z][a-z]{2}\. Pay: http:\/\/localhost:3001\/p\/CODE$/,
      ),
    ]);
    expect(await sms.to(t, esiPhone.slice(1))).toEqual([]);

    const invoice = await t.query(api.storefront.invoices.get, {
      code: payCodeIn(kofi[1]!.message),
    });
    expect(invoice).toMatchObject({
      kind: "shippingFee",
      number: "INV-0002",
      status: "unpaid",
      orderReference: "P-0002",
      total: 1800,
      lines: [{ kind: "shippingFee", units: 2, unitFee: 900, amount: 1800 }],
    });
    expect(invoice!.dueAt - invoice!.clockStartedAt).toBe(14 * DAY);
    expect(Math.abs(invoice!.clockStartedAt - Date.now())).toBeLessThan(60 * 1000);

    const statuses = await t.run(async (ctx) =>
      (await ctx.db.query("orders").collect()).map((o) => [o.reference, o.status]),
    );
    expect(statuses).toEqual([
      ["P-0001", "paymentDue"],
      ["P-0002", "paymentDue"],
      ["P-0003", "cancelled"],
    ]);
  });

  test("invoices are issued once, and only after the fee is confirmed", async () => {
    const { ama, sheaWindow } = await sheaArrived();
    expect(
      await refusal(ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow })),
    ).toBe("FEE_NOT_CONFIRMED");

    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });

    expect(
      await refusal(ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow })),
    ).toBe("ALREADY_ISSUED");
    expect(
      await refusal(
        ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 1000 }),
      ),
    ).toBe("ALREADY_ISSUED");
  });

  test("a GHS 0 Shipping Fee skips the invoice: the Pre-order is Ready and texted its Pickup Code", async () => {
    const { t, ama, sheaWindow } = await sheaArrived();
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 0 });

    expect(await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow })).toEqual({
      issued: 0,
      ready: 3,
    });

    const orders = await t.run(async (ctx) =>
      (await ctx.db.query("orders").collect()).map((o) => [o.reference, o.status, o.pickupCode]),
    );
    expect(orders.map(([reference, status]) => [reference, status])).toEqual([
      ["P-0001", "ready"],
      ["P-0002", "ready"],
      ["P-0003", "ready"],
    ]);
    const texts = await sms.to(t, esiPhone.slice(1));
    expect(texts.map((s) => s.message)).toEqual([
      `P-0003 is ready for pickup. Pickup code: ${orders[2]![2]}. Osu, Oxford Street. ` +
        "Mon-Sat 9am-6pm. http://localhost:3001/orders",
    ]);
  });

  test("the preview lists the invoices the confirmed fee makes, and the Pre-orders it skips", async () => {
    const { ama, sheaWindow } = await sheaArrived(3);
    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });

    const preview = await ama.query(api.backOffice.invoices.preview, { windowId: sheaWindow });

    expect(preview).toMatchObject({
      productName: "Shea Body Butter",
      number: 1,
      issued: false,
      exampleSms: expect.stringMatching(
        /^Shipping Fee for P-0001 \(1 unit\): GHS 9\.00\. Due \d{1,2} [A-Z][a-z]{2}\. Pay: http:\/\/localhost:3001\/p\/XXXXXXXX$/,
      ),
      invoices: [
        { reference: "P-0001", customerName: "Kofi Boateng", units: 1, shipping: 900, total: 900 },
        { reference: "P-0002", customerName: "Kofi Boateng", units: 2, shipping: 1800, total: 1800 },
      ],
      skipped: [{ reference: "P-0003", customerName: "Esi Owusu" }],
    });
  });

  test("the Arrivals card asks for the fee until invoices are issued, then counts them", async () => {
    const { ama, sheaWindow } = await sheaArrived(3);
    const card = async () =>
      (await ama.query(api.backOffice.arrivals.toDo, {})).find((r) => r.windowId === sheaWindow);
    expect((await card())?.invoices).toEqual({ issued: false, count: 0, paid: 0, outstanding: 0 });

    await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });
    await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });

    expect((await card())?.invoices).toEqual({
      issued: true,
      count: 2,
      paid: 0,
      outstanding: 2700,
    });
  });

  test("an unknown /p/ code finds nothing", async () => {
    const { t } = await sheaArrived();
    expect(await t.query(api.storefront.invoices.get, { code: "ZZZZZZZZ" })).toBeNull();
  });
});
