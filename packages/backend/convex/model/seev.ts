/**
 * Seev Plus, the payment provider (ADR 0003), kept behind this one module so it can be
 * swapped. Its Checkout API takes pesewas; sandbox or production is chosen by the key.
 */

const paymentsUrl = "https://api.seevplus.com/api/v1/developer/payments";

/** The path Seev posts webhook deliveries to, on the deployment's `.convex.site` URL. */
export const webhookPath = "/seev/webhook";

export class SeevUnavailable extends Error {}

export type SessionRequest = {
  /** One per try of a Checkout: Seev replays the first answer to a repeated key. */
  idempotencyKey: string;
  recipient: { name: string; phone: string };
  items: { name: string; quantity: number; price: number }[];
  redirectUrl: string;
  meta: Record<string, string>;
};

/**
 * Creates a hosted checkout session and returns where to send the Customer. Call it from
 * an action only. Throws `SeevUnavailable` when Seev refuses or doesn't answer; no session
 * exists then, so trying again is safe.
 */
export async function createSession(request: SessionRequest) {
  const apiKey = process.env.SEEV_CHECKOUT_API_KEY;
  if (!apiKey)
    throw new Error("Set SEEV_CHECKOUT_API_KEY on the Convex deployment to take payments.");
  const response = await fetch(paymentsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": request.idempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "checkout",
      // No email: we don't collect one (ADR 0003).
      recipient: request.recipient,
      items: request.items,
      currency: "GHS",
      redirect_url: request.redirectUrl,
      meta: request.meta,
    }),
  }).catch((error) => {
    throw new SeevUnavailable(String(error));
  });
  const result = (await response.json().catch(() => null)) as {
    error?: string;
    data?: { reference?: string; checkout_url?: string; expires_at?: string };
  } | null;
  const { reference, checkout_url: checkoutUrl, expires_at } = result?.data ?? {};
  if (response.status !== 201 || !reference || !checkoutUrl) {
    throw new SeevUnavailable(`Seev refused the session (${response.status}): ${result?.error}`);
  }
  const expiresAt = expires_at ? Date.parse(expires_at) : Number.NaN;
  return {
    reference,
    checkoutUrl,
    expiresAt: Number.isNaN(expiresAt) ? Date.now() + 30 * 60 * 1000 : expiresAt,
  };
}

/**
 * What Seev says about a session now: `paid` with the pesewas it confirmed, `unpaid` while it
 * can still be paid, `failed` once it can't, or `unknown` when Seev can't say (a 404 or 502
 * never means the Customer wasn't charged).
 */
export type SessionStatus =
  | { kind: "paid"; amount: number }
  | { kind: "unpaid" }
  | { kind: "failed" }
  | { kind: "unknown" };

/** Seev's verify route takes no key, by design: a callback can check without a secret. */
export async function verifySession(reference: string): Promise<SessionStatus> {
  const response = await fetch(`${paymentsUrl}/${encodeURIComponent(reference)}`).catch(() => null);
  if (!response?.ok) return { kind: "unknown" };
  const result = (await response.json().catch(() => null)) as {
    data?: { status?: string; final_amount?: number };
  } | null;
  const status = result?.data?.status;
  const amount = result?.data?.final_amount;
  if ((status === "completed" || status === "success") && Number.isSafeInteger(amount)) {
    return { kind: "paid", amount: amount as number };
  }
  if (status === "failed" || status === "cancelled") return { kind: "failed" };
  // `pending`, and anything Seev adds later, is treated as not paid yet.
  return { kind: "unpaid" };
}

const maxAgeSeconds = 5 * 60;

/**
 * Checks a webhook delivery as Seev documents it: `v1=` then the lowercase hex
 * HMAC-SHA256, with the endpoint's signing secret, of `{timestamp}.{raw body}`. Older than
 * 5 minutes is refused, so a captured delivery can't be replayed.
 */
export async function verifyWebhookSignature(
  {
    rawBody,
    timestamp,
    signature,
  }: { rawBody: string; timestamp: string | null; signature: string | null },
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > maxAgeSeconds) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const hex = signature.startsWith("v1=") ? signature.slice(3) : "";
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const mac = new Uint8Array((hex.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)));
  // `verify` compares in constant time.
  return crypto.subtle.verify("HMAC", key, mac, encoder.encode(`${timestamp}.${rawBody}`));
}
