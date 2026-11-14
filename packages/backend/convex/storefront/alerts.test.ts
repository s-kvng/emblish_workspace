import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { setupBackend, type TestBackend } from "../test.setup";
import { captureSms, codeIn } from "../test.sms";
import { refusal } from "../test.staff";

const sms = captureSms();
const abena = "+233551234567";

/** Abena's subscriber row, as the consent record keeps it. */
function subscriberOf(t: TestBackend, phone: string) {
  return t.run((ctx) =>
    ctx.db
      .query("alertSubscribers")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique(),
  );
}

/** Signs a number up and returns the code texted to it. */
async function signUp(t: TestBackend, phone: string, typed = phone) {
  await t.mutation(api.storefront.alerts.signUp, { phone: typed });
  const [text] = await sms.to(t, phone.slice(1));
  return codeIn(text!);
}

describe("Signing up for Window Alerts", () => {
  test("texts a 6-digit code and leaves the number pending until it's confirmed", async () => {
    const t = setupBackend();

    await t.mutation(api.storefront.alerts.signUp, { phone: "055 123 4567" });

    const [text] = await sms.to(t, abena.slice(1));
    expect(text?.message).toBe(
      `Your Emblish code is ${codeIn(text!)}. It expires in 5 minutes. Never share it.`,
    );
    expect(await subscriberOf(t, abena)).toMatchObject({ status: "pending" });
  });

  test("the right code confirms it, recording the consent source and time", async () => {
    const t = setupBackend();
    const code = await signUp(t, abena);

    const before = Date.now();
    const result = await t.mutation(api.storefront.alerts.confirm, {
      phone: abena,
      code,
    });

    expect(result).toEqual({ status: "confirmed" });
    const subscriber = await subscriberOf(t, abena);
    expect(subscriber).toMatchObject({
      status: "confirmed",
      consentSource: "storefront",
    });
    expect(subscriber!.consentedAt).toBeGreaterThanOrEqual(before);
    expect(subscriber!.unsubscribeCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  test("a wrong code is refused, and three wrong tries spend the code", async () => {
    const t = setupBackend();
    const code = await signUp(t, abena);
    const wrong = code === "000000" ? "111111" : "000000";

    const confirm = (typed: string) =>
      t.mutation(api.storefront.alerts.confirm, { phone: abena, code: typed });

    expect(await confirm(wrong)).toEqual({ status: "wrongCode" });
    expect(await confirm(wrong)).toEqual({ status: "wrongCode" });
    expect(await confirm(wrong)).toEqual({ status: "codeExpired" });
    // The right code no longer works either: a new one must be asked for.
    expect(await confirm(code)).toEqual({ status: "codeExpired" });
    expect(await subscriberOf(t, abena)).toMatchObject({ status: "pending" });
  });

  test("refuses a number outside Ghana and texts nothing", async () => {
    const t = setupBackend();

    expect(
      await refusal(t.mutation(api.storefront.alerts.signUp, { phone: "+2348031234567" })),
    ).toBe("INVALID_PHONE");
    expect(await sms.to(t, "2348031234567")).toEqual([]);
  });

  test("shares the login codes' limit of three texts an hour", async () => {
    const t = setupBackend();
    for (let i = 0; i < 3; i++) await signUp(t, abena);

    expect(await refusal(t.mutation(api.storefront.alerts.signUp, { phone: abena }))).toBe(
      "TOO_MANY_CODES",
    );
  });

  test("a confirmed number signing up again is told so and texted nothing", async () => {
    const t = setupBackend();
    const code = await signUp(t, abena);
    await t.mutation(api.storefront.alerts.confirm, { phone: abena, code });

    const result = await t.mutation(api.storefront.alerts.signUp, {
      phone: abena,
    });

    expect(result).toEqual({ status: "alreadySubscribed" });
    expect(await sms.to(t, abena.slice(1))).toEqual([]);
  });
});

describe("Unsubscribing with the /u/ link", () => {
  test("one tap stops alerts without sign-in, and a second tap is harmless", async () => {
    const t = setupBackend();
    const code = await signUp(t, abena);
    await t.mutation(api.storefront.alerts.confirm, { phone: abena, code });
    const { unsubscribeCode } = (await subscriberOf(t, abena))!;

    expect(
      await t.mutation(api.storefront.alerts.unsubscribe, {
        code: unsubscribeCode,
      }),
    ).toEqual({ unsubscribed: true });
    expect(await subscriberOf(t, abena)).toMatchObject({
      status: "unsubscribed",
    });

    expect(
      await t.mutation(api.storefront.alerts.unsubscribe, {
        code: unsubscribeCode,
      }),
    ).toEqual({ unsubscribed: true });
  });

  test("an unknown code unsubscribes no one", async () => {
    const t = setupBackend();

    expect(await t.mutation(api.storefront.alerts.unsubscribe, { code: "ZZZZZZZZ" })).toEqual({
      unsubscribed: false,
    });
  });

  test("signing up again after unsubscribing needs a new code", async () => {
    const t = setupBackend();
    const first = await signUp(t, abena);
    await t.mutation(api.storefront.alerts.confirm, {
      phone: abena,
      code: first,
    });
    const { unsubscribeCode } = (await subscriberOf(t, abena))!;
    await t.mutation(api.storefront.alerts.unsubscribe, {
      code: unsubscribeCode,
    });

    const second = await signUp(t, abena);
    expect(await subscriberOf(t, abena)).toMatchObject({ status: "pending" });
    await t.mutation(api.storefront.alerts.confirm, {
      phone: abena,
      code: second,
    });

    expect(await subscriberOf(t, abena)).toMatchObject({ status: "confirmed" });
  });
});
