import { describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { withPreorders } from "../test.checkout";
import type { TestBackend } from "../test.setup";
import { captureSms, codeIn } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const abena = "+233551234567";
const yaw = "+233201112222";
const efua = "+233501239876";

const DAY = 24 * 60 * 60 * 1000;
/** 16 Nov 2026 in Ghana (GMT), at the hour given. */
const nov16 = (hour: number, minute = 0) => Date.UTC(2026, 10, 16, hour, minute);
/** 25 Nov 2026, midday: when the Shea window closes in these tests; the Kaftan's is later. */
const nov25 = Date.UTC(2026, 10, 25, 12);
const dec1 = Date.UTC(2026, 11, 1, 12);

/** Runs `call` with the clock at `at`. */
async function at<T>(time: number, call: () => Promise<T>) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
  try {
    return await call();
  } finally {
    vi.useRealTimers();
  }
}

/** Signs a number up on the Storefront and confirms it with the texted code. */
async function subscribe(t: TestBackend, phone: string) {
  await t.mutation(api.storefront.alerts.signUp, { phone });
  const [text] = await sms.to(t, phone.slice(1));
  await t.mutation(api.storefront.alerts.confirm, {
    phone,
    code: codeIn(text!),
  });
}

/**
 * The shop's two open windows (Shea closing 25 Nov, the Kaftan 1 Dec), Ama the Owner, and
 * three numbers: Abena and Yaw confirmed, Efua still pending.
 */
async function withSubscribers() {
  const shop = await withPreorders();
  const { t, sheaWindow, kaftanWindow } = shop;
  await t.run(async (ctx) => {
    await ctx.db.patch(sheaWindow, { closesAt: nov25 });
    await ctx.db.patch(kaftanWindow, { closesAt: dec1 });
  });
  await subscribe(t, abena);
  await subscribe(t, yaw);
  await t.mutation(api.storefront.alerts.signUp, { phone: efua });
  await sms.to(t, efua.slice(1));
  const ama = t.withIdentity({ subject: "auth-window-opener" });
  return { ...shop, ama };
}

/** The `/u/` link in an alert. */
function unsubscribeLinkIn(message: string) {
  const link = message.match(/http:\/\/localhost:3001\/u\/([A-Z0-9]{8})$/)?.[1];
  if (!link) throw new Error(`No /u/ link in "${message}"`);
  return link;
}

describe("The Announce sheet", () => {
  test("lists the open windows and counts only confirmed Alert Subscribers", async () => {
    const { ama, sheaWindow, kaftanWindow } = await withSubscribers();

    const sheet = await ama.query(api.backOffice.alerts.sheet, {
      windowIds: [],
    });

    expect(sheet.recipients).toBe(2);
    expect(sheet.preview).toBeNull();
    expect(sheet.windows.map((w) => [w.windowId, w.productName, w.announcedAt])).toEqual(
      expect.arrayContaining([
        [sheaWindow, "Shea Body Butter", undefined],
        [kaftanWindow, "Linen Kaftan", undefined],
      ]),
    );
    expect(sheet.lastAlert).toBeNull();
  });

  test("previews the SMS for the picked windows", async () => {
    const { ama, sheaWindow } = await withSubscribers();

    const sheet = await ama.query(api.backOffice.alerts.sheet, {
      windowIds: [sheaWindow],
    });

    expect(sheet.preview).toBe(
      "New pre-order at Emblish: Shea Body Butter. Order by 25 Nov: " +
        "http://localhost:3001/products/shea-body-butter " +
        "Stop alerts: http://localhost:3001/u/XXXXXXXX",
    );
  });

  test("is for Staff only", async () => {
    const { t } = await withSubscribers();

    expect(await refusal(t.query(api.backOffice.alerts.sheet, { windowIds: [] }))).toBe(
      "UNAUTHENTICATED",
    );
  });
});

describe("Announcing open windows", () => {
  test("texts each confirmed Alert Subscriber their own /u/ link, and no one else", async () => {
    const { t, ama, sheaWindow } = await withSubscribers();

    await at(nov16(10), () =>
      ama.mutation(api.backOffice.alerts.announce, { windowIds: [sheaWindow] }),
    );

    const [toAbena] = await sms.to(t, abena.slice(1));
    const [toYaw] = await sms.to(t, yaw.slice(1));
    expect(toAbena?.message).toMatch(
      /^New pre-order at Emblish: Shea Body Butter\. Order by 25 Nov: http:\/\/localhost:3001\/products\/shea-body-butter Stop alerts: http:\/\/localhost:3001\/u\/[A-Z0-9]{8}$/,
    );
    expect(unsubscribeLinkIn(toAbena!.message)).not.toBe(unsubscribeLinkIn(toYaw!.message));
    expect(await sms.to(t, efua.slice(1))).toEqual([]);
  });

  test("records the alert with its windows, recipient count and Staff member", async () => {
    const { t, ama, sheaWindow, kaftanWindow } = await withSubscribers();

    await at(nov16(10), () =>
      ama.mutation(api.backOffice.alerts.announce, {
        windowIds: [kaftanWindow, sheaWindow],
      }),
    );
    await sms.to(t, abena.slice(1));

    const sheet = await ama.query(api.backOffice.alerts.sheet, {
      windowIds: [],
    });
    expect(sheet.lastAlert).toEqual({
      sentAt: nov16(10),
      products: ["Linen Kaftan", "Shea Body Butter"],
      recipients: 2,
      staffName: "Ama Mensah",
    });
    expect(sheet.windows.find((w) => w.windowId === sheaWindow)?.announcedAt).toBe(nov16(10));
  });

  test("several windows go out in one SMS, linking to the Storefront by the earliest close", async () => {
    const { t, ama, sheaWindow, kaftanWindow } = await withSubscribers();

    await at(nov16(10), () =>
      ama.mutation(api.backOffice.alerts.announce, {
        windowIds: [kaftanWindow, sheaWindow],
      }),
    );

    const texts = await sms.to(t, abena.slice(1));
    expect(texts).toHaveLength(1);
    expect(texts[0]?.message).toMatch(
      /^New pre-orders at Emblish: Linen Kaftan and 1 more\. Order by 25 Nov: http:\/\/localhost:3001 Stop alerts: http:\/\/localhost:3001\/u\/[A-Z0-9]{8}$/,
    );
  });

  test("the /u/ link in an alert stops the next one", async () => {
    const { t, ama, sheaWindow, kaftanWindow } = await withSubscribers();
    await at(nov16(10), () =>
      ama.mutation(api.backOffice.alerts.announce, { windowIds: [sheaWindow] }),
    );
    const [text] = await sms.to(t, abena.slice(1));
    await sms.to(t, yaw.slice(1));

    await t.mutation(api.storefront.alerts.unsubscribe, {
      code: unsubscribeLinkIn(text!.message),
    });
    await at(nov16(10) + DAY, () =>
      ama.mutation(api.backOffice.alerts.announce, {
        windowIds: [kaftanWindow],
      }),
    );

    expect(await sms.to(t, abena.slice(1))).toEqual([]);
    expect(await sms.to(t, yaw.slice(1))).toHaveLength(1);
  });

  test("a second alert on the same day is refused; the next day it's allowed", async () => {
    const { t, ama, sheaWindow, kaftanWindow } = await withSubscribers();
    await at(nov16(9), () =>
      ama.mutation(api.backOffice.alerts.announce, { windowIds: [sheaWindow] }),
    );
    await sms.to(t, abena.slice(1));

    expect(
      await refusal(
        at(nov16(19, 59), () =>
          ama.mutation(api.backOffice.alerts.announce, {
            windowIds: [kaftanWindow],
          }),
        ),
      ),
    ).toBe("ALREADY_SENT_TODAY");
    expect(await sms.to(t, abena.slice(1))).toEqual([]);

    await at(nov16(8) + DAY, () =>
      ama.mutation(api.backOffice.alerts.announce, {
        windowIds: [kaftanWindow],
      }),
    );
    expect(await sms.to(t, abena.slice(1))).toHaveLength(1);
  });

  test("is refused outside the 08:00 to 20:00 SMS hours", async () => {
    const { t, ama, sheaWindow } = await withSubscribers();

    for (const time of [nov16(7, 59), nov16(20)]) {
      expect(
        await refusal(
          at(time, () =>
            ama.mutation(api.backOffice.alerts.announce, {
              windowIds: [sheaWindow],
            }),
          ),
        ),
      ).toBe("OUTSIDE_SMS_HOURS");
    }
    expect(await sms.to(t, abena.slice(1))).toEqual([]);
  });

  test("only open windows can be announced, at least one", async () => {
    const { ama, sheaWindow } = await withSubscribers();
    await ama.mutation(api.backOffice.windows.closeNow, {
      windowId: sheaWindow,
    });

    for (const windowIds of [[sheaWindow], [] as Id<"orderWindows">[]]) {
      expect(
        await refusal(
          at(nov16(10), () => ama.mutation(api.backOffice.alerts.announce, { windowIds })),
        ),
      ).toBe("NOT_OPEN");
    }
  });

  test("is refused while no one is confirmed, so it doesn't use up the day's alert", async () => {
    const { t, sheaWindow } = await withPreorders();
    const ama = t.withIdentity({ subject: "auth-window-opener" });

    expect(
      await refusal(
        at(nov16(10), () =>
          ama.mutation(api.backOffice.alerts.announce, { windowIds: [sheaWindow] }),
        ),
      ),
    ).toBe("NO_SUBSCRIBERS");
    const sheet = await ama.query(api.backOffice.alerts.sheet, { windowIds: [] });
    expect(sheet.lastAlert).toBeNull();
  });

  test("links to the Storefront when the Product's link would make the SMS too long", async () => {
    const { t, ama, sheaWindow } = await withSubscribers();
    const product = await t.run(async (ctx) => (await ctx.db.get(sheaWindow))!.productId);
    await t.run((ctx) => ctx.db.patch(product, { slug: "shea-".repeat(40) + "butter" }));

    const sheet = await ama.query(api.backOffice.alerts.sheet, { windowIds: [sheaWindow] });

    expect(sheet.preview).toBe(
      "New pre-order at Emblish: Shea Body Butter. Order by 25 Nov: http://localhost:3001 " +
        "Stop alerts: http://localhost:3001/u/XXXXXXXX",
    );
  });

  test("reaches every subscriber when there are more than one batch of them", async () => {
    const { t, ama, sheaWindow } = await withSubscribers();
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        await ctx.db.insert("alertSubscribers", {
          phone: `+23324${String(i).padStart(7, "0")}`,
          status: "confirmed",
          consentSource: "storefront",
          consentedAt: Date.now(),
          unsubscribeCode: `BATCH${String(i).padStart(3, "0")}`,
        });
      }
    });

    await at(nov16(10), () =>
      ama.mutation(api.backOffice.alerts.announce, { windowIds: [sheaWindow] }),
    );
    await sms.to(t, abena.slice(1));

    expect(sms.sent.filter((s) => s.message.startsWith("New pre-order"))).toHaveLength(251);
    const sheet = await ama.query(api.backOffice.alerts.sheet, {
      windowIds: [],
    });
    expect(sheet.lastAlert?.recipients).toBe(252);
  });
});
