import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { sendPhoneCode, verifyPhoneCode } from "./test.auth";
import { setupBackend, type TestBackend } from "./test.setup";
import { captureSms, codeIn } from "./test.sms";

const sms = captureSms();
const kofi = "+233241234567";

/** Texts a code to the number and signs in with it; returns the verify response. */
async function signInByPhone(t: TestBackend, phone: string) {
  await sendPhoneCode(t, phone);
  const [text] = await sms.to(t, phone.slice(1));
  return verifyPhoneCode(t, phone, codeIn(text!));
}

async function signedInUserId(response: Response) {
  const body = (await response.json()) as { user: { id: string } };
  return body.user.id;
}

describe("Customer phone sign-in", () => {
  test("texts a 6-digit code from EMBLISH", async () => {
    const t = setupBackend();

    const response = await sendPhoneCode(t, kofi);

    expect(response.status).toBe(200);
    const [text] = await sms.to(t, "233241234567");
    expect(text?.sender).toBe("EMBLISH");
    expect(text?.message).toBe(
      `Your Emblish code is ${codeIn(text!)}. It expires in 5 minutes. Never share it.`,
    );
  });

  test("signing in with the code creates the Customer", async () => {
    const t = setupBackend();

    const response = await signInByPhone(t, kofi);

    expect(response.status).toBe(200);
    const me = await t
      .withIdentity({ subject: await signedInUserId(response) })
      .query(api.storefront.customer.me, {});
    expect(me).toEqual({ phone: kofi });
  });

  test("a later sign-in reuses the same Customer", async () => {
    const t = setupBackend();
    const first = await signedInUserId(await signInByPhone(t, kofi));

    const second = await signedInUserId(await signInByPhone(t, kofi));

    expect(second).toBe(first);
  });

  test("the session lasts 60 days", async () => {
    const t = setupBackend();

    const response = await signInByPhone(t, kofi);

    expect(response.headers.get("set-cookie")).toMatch(/session_token=[^;]+;.*Max-Age=5184000/i);
  });

  test("refuses a wrong code", async () => {
    const t = setupBackend();
    await sendPhoneCode(t, kofi);
    const [text] = await sms.to(t, kofi.slice(1));
    const wrong = codeIn(text!) === "000000" ? "111111" : "000000";

    const response = await verifyPhoneCode(t, kofi, wrong);

    expect(response.status).toBe(400);
  });

  test("refuses a number outside Ghana and texts nothing", async () => {
    const t = setupBackend();

    const response = await sendPhoneCode(t, "+2348031234567");

    expect(response.status).toBe(400);
    expect(await sms.to(t, "2348031234567")).toEqual([]);
  });

  test("texts a number at most 3 codes an hour", async () => {
    const t = setupBackend();
    for (let i = 0; i < 3; i++) expect((await sendPhoneCode(t, kofi)).status).toBe(200);

    const fourth = await sendPhoneCode(t, kofi);

    expect(fourth.status).toBe(429);
    expect(await sms.to(t, kofi.slice(1))).toHaveLength(3);
  });

  test("a Customer can't move their session to another number", async () => {
    const t = setupBackend();
    await sendPhoneCode(t, "+233551234567");
    const [text] = await sms.to(t, "233551234567");

    const response = await t.fetch("/api/auth/phone-number/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3001",
      },
      body: JSON.stringify({
        phoneNumber: "+233551234567",
        code: codeIn(text!),
        updatePhoneNumber: true,
      }),
    });

    expect(response.status).toBe(403);
  });
});
