import { describe, expect, test } from "vitest";

import { sendPhoneCode } from "./test.auth";
import { setupBackend, type TestBackend } from "./test.setup";
import { captureSms } from "./test.sms";

const sms = captureSms();
const secret = "arkesel-test-webhook-secret";
const kofi = "+233241234567";

/** Signs as Arkesel documents: HMAC-SHA256 over `{timestamp}.{canonical JSON}`, hex. */
async function sign(canonical: string, timestamp: string, key = secret) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(`${timestamp}.${canonical}`),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function now() {
  return String(Math.floor(Date.now() / 1000));
}

function report(
  t: TestBackend,
  status: string,
  headers: { timestamp: string; signature: string },
  method = "POST",
) {
  return t.fetch(`/arkesel/delivery?sms_id=sms-1&status=${status}`, {
    method,
    headers: {
      "X-Arkesel-Webhook-Timestamp": headers.timestamp,
      "X-Arkesel-Webhook-Signature": headers.signature,
      "X-Arkesel-Webhook-Id": "8a3a9f1d-4f3e-46a1-93d3-c9b9e0a6f86f",
    },
  });
}

/** Texts Kofi a login code, which Arkesel accepts as `sms-1`. */
async function withSentCode() {
  const t = setupBackend();
  await sendPhoneCode(t, kofi);
  await sms.to(t, kofi.slice(1));
  return t;
}

function outbox(t: TestBackend) {
  return t.run((ctx) => ctx.db.query("smsMessages").take(10));
}

describe("SMS outbox", () => {
  test("a sent login code is logged as sent, with the code masked", async () => {
    const t = await withSentCode();

    const [row] = await outbox(t);

    expect(row).toMatchObject({
      to: kofi,
      template: "loginCode",
      status: "sent",
      arkeselId: "sms-1",
    });
    expect(row?.body).toBe("Your Emblish code is ******. It expires in 5 minutes. Never share it.");
  });

  test("a send Arkesel refuses is logged as failed", async () => {
    const t = setupBackend();
    sms.refuseSends();

    await sendPhoneCode(t, kofi);
    await sms.to(t, kofi.slice(1));

    const [row] = await outbox(t);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("402");
    expect(row?.body).not.toMatch(/\d{6}/);
  });
});

describe("POST /arkesel/delivery", () => {
  test("a signed DELIVERED report marks the SMS delivered", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"DELIVERED"}', timestamp)}`;

    const response = await report(t, "DELIVERED", { timestamp, signature });

    expect(response.status).toBe(200);
    expect((await outbox(t))[0]?.status).toBe("delivered");
  });

  test("a signed NOT_DELIVERED report marks the SMS failed", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"NOT_DELIVERED"}', timestamp)}`;

    const response = await report(t, "NOT_DELIVERED", { timestamp, signature });

    expect(response.status).toBe(200);
    expect((await outbox(t))[0]?.status).toBe("failed");
  });

  test("Arkesel's GET callback is accepted too", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"DELIVERED"}', timestamp)}`;

    const response = await report(t, "DELIVERED", { timestamp, signature }, "GET");

    expect(response.status).toBe(200);
    expect((await outbox(t))[0]?.status).toBe("delivered");
  });

  test("rejects a report signed with the wrong secret", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"DELIVERED"}', timestamp, "not-the-secret")}`;

    const response = await report(t, "DELIVERED", { timestamp, signature });

    expect(response.status).toBe(401);
    expect((await outbox(t))[0]?.status).toBe("sent");
  });

  test("rejects a signature made for a different status", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"NOT_DELIVERED"}', timestamp)}`;

    const response = await report(t, "DELIVERED", { timestamp, signature });

    expect(response.status).toBe(401);
  });

  test("rejects a report with no signature", async () => {
    const t = await withSentCode();

    const response = await report(t, "DELIVERED", {
      timestamp: now(),
      signature: "",
    });

    expect(response.status).toBe(401);
  });

  test("rejects a correctly signed report older than 5 minutes", async () => {
    const t = await withSentCode();
    const timestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const signature = `v1=${await sign('{"sms_id":"sms-1","status":"DELIVERED"}', timestamp)}`;

    const response = await report(t, "DELIVERED", { timestamp, signature });

    expect(response.status).toBe(401);
    expect((await outbox(t))[0]?.status).toBe("sent");
  });

  test("accepts either signature while the secret is being rotated", async () => {
    const t = await withSentCode();
    const timestamp = now();
    const canonical = '{"sms_id":"sms-1","status":"DELIVERED"}';
    const signature = `v1=${await sign(canonical, timestamp, "the-old-secret")},v1=${await sign(canonical, timestamp)}`;

    const response = await report(t, "DELIVERED", { timestamp, signature });

    expect(response.status).toBe(200);
    expect((await outbox(t))[0]?.status).toBe("delivered");
  });

  test("a late in-between report doesn't undo delivered", async () => {
    const t = await withSentCode();
    const timestamp = now();
    await report(t, "DELIVERED", {
      timestamp,
      signature: `v1=${await sign('{"sms_id":"sms-1","status":"DELIVERED"}', timestamp)}`,
    });

    await report(t, "NOT_DELIVERED", {
      timestamp,
      signature: `v1=${await sign('{"sms_id":"sms-1","status":"NOT_DELIVERED"}', timestamp)}`,
    });

    expect((await outbox(t))[0]?.status).toBe("delivered");
  });
});
