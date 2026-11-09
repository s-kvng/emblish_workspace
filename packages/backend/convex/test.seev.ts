import { afterEach, vi } from "vitest";

import { hmacSha256Hex } from "./model/arkesel";
import type { TestBackend } from "./test.setup";

export const seevWebhookSecret = "seev-test-webhook-secret";

type SessionState = "pending" | "completed" | "failed" | "cancelled";
type CreatedSession = {
  reference: string;
  idempotencyKey: string | null;
  apiKey: string | null;
  body: {
    type: string;
    recipient: { name?: string; email?: string; phone?: string };
    items: { name: string; quantity: number; price: number }[];
    currency: string;
    redirect_url: string;
    meta: Record<string, string>;
  };
  status: SessionState;
  finalAmount: number;
};

/**
 * Stands in for Seev Plus's Checkout API: creating a session returns a hosted URL and a
 * `PAY-<n>` reference, and the verify route reports whatever the test set. Call once per file.
 */
export function fakeSeev() {
  const sessions: CreatedSession[] = [];
  let down = false;
  const realFetch = globalThis.fetch;

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const base = "https://api.seevplus.com/api/v1/developer/payments";
    if (!url.startsWith(base)) return realFetch(input, init);
    if (down) return Response.json({ error: "upstream", message: "upstream" }, { status: 502 });
    const headers = new Headers(init?.headers);
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const idempotencyKey = headers.get("Idempotency-Key");
      const replay = sessions.find((s) => idempotencyKey && s.idempotencyKey === idempotencyKey);
      const session = replay ?? {
        reference: `PAY-${sessions.length + 1}`,
        idempotencyKey,
        apiKey: headers.get("Authorization"),
        body,
        status: "pending" as const,
        finalAmount: body.items.reduce(
          (sum: number, item: { quantity: number; price: number }) =>
            sum + item.quantity * item.price,
          0,
        ),
      };
      if (!replay) sessions.push(session);
      return Response.json(
        {
          success: true,
          data: {
            amount: session.finalAmount,
            checkout_url: `https://pay.seevplus.com/${session.reference}`,
            currency: "GHS",
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            reference: session.reference,
            status: "pending",
          },
        },
        { status: 201 },
      );
    }
    const reference = decodeURIComponent(url.slice(base.length + 1));
    const session = sessions.find((s) => s.reference === reference);
    if (!session) {
      return Response.json(
        { error: "session not found or invalid", message: "session not found or invalid" },
        { status: 404 },
      );
    }
    return Response.json({
      success: true,
      data: {
        id: `checkout_${reference}`,
        reference,
        status: session.status,
        amount: session.finalAmount,
        final_amount: session.finalAmount,
        currency: "GHS",
      },
    });
  });
  afterEach(() => {
    sessions.length = 0;
    down = false;
  });

  return {
    sessions,
    /** The Customer finishes paying on the hosted page (or it fails). */
    setStatus(reference: string, status: SessionState) {
      const session = sessions.find((s) => s.reference === reference);
      if (!session) throw new Error(`No Seev session ${reference}`);
      session.status = status;
    },
    /** Makes Seev confirm a different amount than the session was created for. */
    setAmount(reference: string, finalAmount: number) {
      const session = sessions.find((s) => s.reference === reference);
      if (!session) throw new Error(`No Seev session ${reference}`);
      session.finalAmount = finalAmount;
    },
    /** Makes every Seev call answer 502 until the test ends. */
    goDown() {
      down = true;
    },
  };
}

/** Posts a Seev webhook delivery signed as Seev signs it, or with a given signature. */
export async function postSeevWebhook(
  t: TestBackend,
  payload: unknown,
  { signature, timestamp }: { signature?: string; timestamp?: number } = {},
) {
  const body = JSON.stringify(payload);
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const signed = signature ?? `v1=${await hmacSha256Hex(seevWebhookSecret, `${ts}.${body}`)}`;
  return t.fetch("/seev/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Seev-Event-ID": "evt_1",
      "X-Seev-Event-Type": "payment.succeeded",
      "X-Seev-Timestamp": ts,
      "X-Seev-Signature": signed,
    },
    body,
  });
}

/** A `payment.succeeded` delivery for one reference, shaped like Seev's example. */
export function paymentSucceeded(reference: string) {
  return {
    id: "evt_1",
    event: "payment.succeeded",
    env: "sandbox",
    createdAt: new Date().toISOString(),
    data: {
      transaction: {
        id: "txn_1",
        product: "checkout",
        type: "payment",
        status: "completed",
        reference,
        gatewaySessionRef: reference,
      },
    },
  };
}
