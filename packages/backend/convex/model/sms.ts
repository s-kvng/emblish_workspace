import type { Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { smsTemplate } from "../schema";
import { ghs } from "./money";

/**
 * Every SMS a Customer gets is rendered from one of these templates. They follow the
 * notification style rules: English, GSM-7 only (money as "GHS", never "₵"; no emoji,
 * en dashes, curly quotes or bullets), aiming for 1 segment and never over 2.
 * `model/sms.test.ts` checks every template's `example` against those rules.
 */
type Template<Args> = {
  render: (args: Args) => string;
  /** Typical arguments, used by the tests to check the rendered copy. */
  example: Args;
  /** Strips anything Staff mustn't read in the SMS log once it has been sent. */
  redact?: (body: string) => string;
};

function template<Args>(t: Template<Args>) {
  return t;
}

export const smsTemplates = {
  loginCode: template({
    render: ({ code }: { code: string }) =>
      `Your Emblish code is ${code}. It expires in 5 minutes. Never share it.`,
    example: { code: "482913" },
    redact: (body) => body.replace(/\d{6}/, "******"),
  }),
  // One per charge that created a Store Order; `refund` is any part Stock couldn't fill.
  paymentConfirmed: template<{
    amount: number;
    reference: string;
    pickupCode: string;
    receiptUrl: string;
    refund?: number;
  }>({
    render: ({ amount, reference, pickupCode, receiptUrl, refund }) =>
      `Emblish: payment of ${ghs(amount)} received. Order ${reference} is ready for pickup. ` +
      `Pickup Code ${pickupCode}. Receipt: ${receiptUrl}` +
      (refund ? ` ${ghs(refund)} of it could not be filled and will be refunded.` : ""),
    example: {
      amount: 45000,
      reference: "S-0310",
      pickupCode: "482913",
      receiptUrl: "https://emblish.com/r/7KQ2MX9P",
      refund: 12000,
    },
    redact: (body) => body.replace(/Pickup Code \d{6}/, "Pickup Code ******"),
  }),
  // A late charge Stock couldn't fill at all: nothing to pick up, all of it refunded.
  paymentNotFilled: template({
    render: ({ amount, receiptUrl }: { amount: number; receiptUrl: string }) =>
      `Emblish: payment of ${ghs(amount)} received, but your items sold out before it came ` +
      `through. We will refund ${ghs(amount)}. Receipt: ${receiptUrl}`,
    example: { amount: 45000, receiptUrl: "https://emblish.com/r/7KQ2MX9P" },
  }),
  // A charge we couldn't match to an order: a second payment, or a wrong amount.
  paymentUnmatched: template({
    render: ({ amount, receiptUrl }: { amount: number; receiptUrl: string }) =>
      `Emblish: we received ${ghs(amount)}, but it doesn't match an order to fill. ` +
      `We will refund it. Receipt: ${receiptUrl}`,
    example: { amount: 45000, receiptUrl: "https://emblish.com/r/7KQ2MX9P" },
  }),
};

export type SmsTemplateKey = keyof typeof smsTemplates;
// The schema's `smsTemplate` validator must list exactly these keys.
const _sameKeys: [SmsTemplateKey, Infer<typeof smsTemplate>] extends [
  Infer<typeof smsTemplate>,
  SmsTemplateKey,
]
  ? true
  : never = true;

/** The rendered body, checked against the GSM-7 and 2-segment rules. */
export function renderSms<K extends SmsTemplateKey>(
  key: K,
  args: Parameters<(typeof smsTemplates)[K]["render"]>[0],
): string {
  const body = (smsTemplates[key].render as (a: typeof args) => string)(args);
  if (!isGsm7(body) || segmentCount(body) > 2) {
    throw new Error(`The ${key} SMS breaks the GSM-7 or 2-segment rule: ${body}`);
  }
  return body;
}

/** The body as it may stay in the SMS log after sending. */
export function redactSms(key: SmsTemplateKey, body: string): string {
  const { redact } = smsTemplates[key] as { redact?: (body: string) => string };
  return redact ? redact(body) : body;
}

/**
 * The only way to send an SMS: renders the template into an `smsMessages` row and
 * schedules `system/sms.send` to hand it to Arkesel once this mutation commits.
 */
export async function queueSms<K extends SmsTemplateKey>(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  to: string,
  key: K,
  args: Parameters<(typeof smsTemplates)[K]["render"]>[0],
): Promise<Id<"smsMessages">> {
  const smsMessageId = await ctx.db.insert("smsMessages", {
    to,
    template: key,
    body: renderSms(key, args),
    status: "queued",
  });
  await ctx.scheduler.runAfter(0, internal.system.sms.send, { smsMessageId });
  return smsMessageId;
}

// The GSM 03.38 default alphabet, and its extension table whose characters take two places.
const basic = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const extension = new Set("^{}\\[~]|€\f");

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!basic.has(char) && !extension.has(char)) return false;
  }
  return true;
}

/** How many SMS segments a GSM-7 text is billed as: 160 places in one, 153 each when split. */
export function segmentCount(text: string): number {
  let places = 0;
  for (const char of text) places += extension.has(char) ? 2 : 1;
  return places <= 160 ? 1 : Math.ceil(places / 153);
}
