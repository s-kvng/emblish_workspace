/** Arkesel, the SMS provider, kept behind this one module so it can be swapped. */

const sender = "EMBLISH";

/** The path Arkesel reports delivery to, on the deployment's `.convex.site` URL. */
export const deliveryPath = "/arkesel/delivery";

/**
 * Sends one SMS and returns Arkesel's id for it. Call it from an action only: mutations
 * queue an `smsMessages` row instead. `ARKESEL_SANDBOX=true` sends nothing to the networks.
 */
export async function sendSms({ to, body }: { to: string; body: string }): Promise<string> {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) throw new Error("Set ARKESEL_API_KEY on the Convex deployment to send SMS.");
  const recipient = to.replace(/^\+/, "");
  const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender,
      recipients: [recipient],
      message: body,
      callback_url: `${process.env.CONVEX_SITE_URL}${deliveryPath}`,
      sandbox: process.env.ARKESEL_SANDBOX === "true",
    }),
  });
  const result = (await response.json().catch(() => null)) as {
    status?: string;
    message?: string;
    data?: { recipient: string; id: string }[];
  } | null;
  const id = result?.data?.find((d) => d.recipient === recipient)?.id;
  if (!response.ok || result?.status !== "success" || !id) {
    throw new Error(`Arkesel refused the SMS (${response.status}): ${result?.message ?? "no id"}`);
  }
  return id;
}

/**
 * What a delivery report means for the outbox row: `delivered`, `failed`, or nothing yet
 * (SUBMITTED / QUEUED are still on their way).
 */
export function deliveryOutcome(status: string): "delivered" | "failed" | null {
  switch (status.toUpperCase()) {
    case "DELIVERED":
      return "delivered";
    case "NOT_DELIVERED":
    case "UNDELIVERED":
    case "EXPIRED":
    case "PROHIBITED":
    case "REJECTED":
    case "FAILED":
      return "failed";
    default:
      return null;
  }
}

const maxAgeSeconds = 5 * 60;

/**
 * Checks a delivery callback's signature as Arkesel documents it: HMAC-SHA256 with the
 * webhook secret over `{timestamp}.{canonical JSON of the query parameters}`, sent as
 * one or more `v1=<hex>` values (two while a secret is being rotated). Older than
 * 5 minutes is refused, so a captured callback can't be replayed.
 */
export async function verifyDeliverySignature(
  {
    params,
    timestamp,
    signature,
  }: {
    params: Record<string, string>;
    timestamp: string | null;
    signature: string | null;
  },
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > maxAgeSeconds) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${canonicalJson(params)}`);
  return signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .some((part) => constantTimeEqual(part.slice(3), expected));
}

/** Keys sorted, slashes unescaped and non-ASCII as \uXXXX, matching PHP's `json_encode`. */
export function canonicalJson(params: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]]),
  );
  return JSON.stringify(sorted).replace(
    /[\u0080-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
