import type { Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { smsTemplate } from "../schema";
import { ghs } from "./money";

/** "Pre-order P-1042 placed.", naming at most two so the SMS stays within 2 segments. */
export function preordersPlaced(references: string[]) {
  const named = references.slice(0, 2).join(", ");
  const more = references.length > 2 ? ` and ${references.length - 2} more` : "";
  return `Pre-order${references.length === 1 ? "" : "s"} ${named}${more} placed.`;
}

/** "P-1042", "P-1042 and P-1043", or "P-1042, P-1043 and 2 more". */
export function orderReferences(references: string[]) {
  if (references.length <= 2) return references.join(" and ");
  return `${references.slice(0, 2).join(", ")} and ${references.length - 2} more`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day in Ghana time (GMT), as SMS copy writes dates: "14 Nov". */
export function dayMonth(at: number) {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** An expected arrival range in Ghana time (GMT): "2 to 9 Dec", "28 Nov to 5 Dec" or "9 Dec". */
export function expectedRange(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  const day = (d: Date) => dayMonth(d.getTime());
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return a.getUTCDate() === b.getUTCDate() ? day(b) : `${a.getUTCDate()} to ${day(b)}`;
  }
  return `${day(a)} to ${day(b)}`;
}

/**
 * Text Staff typed, such as a Product name, made safe to put in an SMS: characters outside
 * GSM-7 are dropped and it's cut to `max`, so it can't break the template's segment budget.
 */
export function smsSafe(text: string, max: number) {
  let safe = "";
  for (const char of text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")) {
    if (basic.has(char) && char !== "\n" && char !== "\r") safe += char;
  }
  safe = safe.replace(/\s+/g, " ").trim();
  return safe.length <= max ? safe : `${safe.slice(0, max - 3).trimEnd()}...`;
}

/** The tracking link in stage SMS: My orders, behind sign-in. */
export function ordersUrl() {
  return `${process.env.SITE_URL}/orders`;
}

/** What the Order Window stage SMS say about one Customer's Pre-orders in the window. */
type StageSmsArgs = {
  references: string[];
  productName: string;
  /** From `expectedRange`; left out when Staff gave no dates. */
  expected?: string;
  ordersUrl: string;
};

/** What the Arrived SMS say: one Customer's units across their Pre-orders in the window. */
type ArrivedSmsArgs = {
  references: string[];
  productName: string;
  /** Units the arrival filled. */
  got: number;
  /** Units they were waiting for. */
  ordered: number;
  /** Pesewas flagged as Shortfall Refunds; 0 when nothing was short. */
  refund: number;
  ordersUrl: string;
};

function units(count: number) {
  return count === 1 ? "unit" : "units";
}

/** The store's `{location}` setting as SMS copy carries it: at most 50 characters, no full stop. */
function location(text: string) {
  return smsSafe(text, 50).replace(/\.+$/, "");
}

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
    /** Pre-orders the same charge placed. */
    preorders?: string[];
  }>({
    render: ({ amount, reference, pickupCode, receiptUrl, refund, preorders }) =>
      `Emblish: payment of ${ghs(amount)} received. Order ${reference} is ready for pickup. ` +
      `Pickup Code ${pickupCode}. Receipt: ${receiptUrl}` +
      (preorders?.length ? ` ${preordersPlaced(preorders)}` : "") +
      (refund ? ` ${ghs(refund)} of it could not be filled and will be refunded.` : ""),
    example: {
      amount: 45000,
      reference: "S-0310",
      pickupCode: "482913",
      receiptUrl: "https://emblish.com/r/7KQ2MX9P",
      refund: 12000,
      preorders: ["P-1042", "P-1043", "P-1044"],
    },
    redact: (body) => body.replace(/Pickup Code \d{6}/, "Pickup Code ******"),
  }),
  // As paymentConfirmed, for a Store Order going to a fixed Delivery Zone: no Pickup Code.
  paymentConfirmedDelivery: template<{
    amount: number;
    reference: string;
    zoneName: string;
    receiptUrl: string;
    refund?: number;
    /** Pre-orders the same charge placed. */
    preorders?: string[];
  }>({
    render: ({ amount, reference, zoneName, receiptUrl, refund, preorders }) =>
      `Emblish: payment of ${ghs(amount)} received. Order ${reference} will be delivered to ` +
      `${zoneName}. We will text you when it is on its way. Receipt: ${receiptUrl}` +
      (preorders?.length ? ` ${preordersPlaced(preorders)}` : "") +
      (refund ? ` ${ghs(refund)} of it could not be filled and will be refunded.` : ""),
    example: {
      amount: 48000,
      reference: "S-0310",
      zoneName: "Accra Central",
      receiptUrl: "https://emblish.com/r/7KQ2MX9P",
      refund: 12000,
      preorders: ["P-1042", "P-1043", "P-1044"],
    },
  }),
  // As paymentConfirmed, for Delivery Elsewhere in Ghana: the fee is quoted later.
  paymentConfirmedQuoteDelivery: template<{
    amount: number;
    reference: string;
    zoneName: string;
    receiptUrl: string;
    refund?: number;
    /** Pre-orders the same charge placed. */
    preorders?: string[];
  }>({
    render: ({ amount, reference, zoneName, receiptUrl, refund, preorders }) =>
      `Emblish: payment of ${ghs(amount)} received for order ${reference}. We will text you ` +
      `the delivery fee to ${zoneName}. Receipt: ${receiptUrl}` +
      (preorders?.length ? ` ${preordersPlaced(preorders)}` : "") +
      (refund ? ` ${ghs(refund)} of it could not be filled and will be refunded.` : ""),
    example: {
      amount: 45000,
      reference: "S-0310",
      zoneName: "Elsewhere in Ghana",
      receiptUrl: "https://emblish.com/r/7KQ2MX9P",
      refund: 12000,
      preorders: ["P-1042", "P-1043", "P-1044"],
    },
  }),
  // One per charge that created Pre-orders and no Store Order.
  paymentConfirmedPreorder: template<{
    amount: number;
    references: string[];
    receiptUrl: string;
    refund?: number;
  }>({
    render: ({ amount, references, receiptUrl, refund }) =>
      `Emblish: payment of ${ghs(amount)} received. ${preordersPlaced(references)} ` +
      `We will text you when ${references.length === 1 ? "it arrives" : "they arrive"}. ` +
      `Receipt: ${receiptUrl}` +
      (refund ? ` ${ghs(refund)} of it could not be filled and will be refunded.` : ""),
    example: {
      amount: 116000,
      references: ["P-1042", "P-1043", "P-1044"],
      receiptUrl: "https://emblish.com/r/7KQ2MX9P",
      refund: 12000,
    },
  }),
  // Order Window stage "Ordered from supplier", to every Customer holding a Pre-order in it.
  stageOrdered: template<StageSmsArgs>({
    render: ({ references, productName, expected, ordersUrl }) =>
      `${orderReferences(references)} (${smsSafe(productName, 24)}): ordered from our supplier.` +
      (expected ? ` Expected in Ghana ${expected}.` : "") +
      ` ${ordersUrl}`,
    example: {
      references: ["P-1042", "P-1043", "P-1044"],
      productName: "Ankara Wrap Dress with a Very Long Name Indeed",
      expected: "28 Nov to 5 Dec",
      ordersUrl: "https://emblish.com/orders",
    },
  }),
  // Order Window stage "In transit".
  stageInTransit: template<StageSmsArgs>({
    render: ({ references, productName, expected, ordersUrl }) =>
      `${orderReferences(references)} (${smsSafe(productName, 24)}) is on its way to Ghana.` +
      (expected ? ` Expected ${expected}.` : "") +
      ` ${ordersUrl}`,
    example: {
      references: ["P-1042", "P-1043", "P-1044"],
      productName: "Ankara Wrap Dress with a Very Long Name Indeed",
      expected: "28 Nov to 5 Dec",
      ordersUrl: "https://emblish.com/orders",
    },
  }),
  // Staff changed the current stage's expected dates; a note-only change sends nothing.
  stageNewDates: template<StageSmsArgs & { expected: string }>({
    render: ({ references, productName, expected, ordersUrl }) =>
      `${orderReferences(references)} (${smsSafe(productName, 24)}): new expected arrival ` +
      `${expected}. Sorry for the wait. ${ordersUrl}`,
    example: {
      references: ["P-1042", "P-1043", "P-1044"],
      productName: "Ankara Wrap Dress with a Very Long Name Indeed",
      expected: "28 Nov to 5 Dec",
      ordersUrl: "https://emblish.com/orders",
    },
  }),
  // The arrival was locked: one per Customer holding Pre-orders in the window, with their units.
  arrived: template<ArrivedSmsArgs>({
    render: ({ references, productName, got, ordered, refund, ordersUrl }) => {
      const what = `${orderReferences(references)} (${smsSafe(productName, 24)})`;
      const verb = references.length === 1 ? "has" : "have";
      if (refund === 0) {
        return (
          `${what} ${verb} arrived in Ghana: ${got} of ${ordered} ${units(ordered)}. ` +
          `Your Shipping Fee invoice will follow. ${ordersUrl}`
        );
      }
      const missing = ordered - got;
      return (
        `${what} ${verb} arrived: ${got} of ${ordered} ${units(ordered)}. We will refund ` +
        `${ghs(refund)} for the missing ${units(missing)}. Shipping Fee invoice to follow. ${ordersUrl}`
      );
    },
    example: {
      references: ["P-1042", "P-1043", "P-1044"],
      productName: "Ankara Wrap Dress with a Very Long Name Indeed",
      got: 12,
      ordered: 15,
      refund: 1350000,
      ordersUrl: "https://emblish.com/orders",
    },
  }),
  // The arrival was locked and none of the Customer's units came: their Pre-orders are cancelled.
  arrivedNone: template<ArrivedSmsArgs>({
    render: ({ references, productName, ordered, refund, ordersUrl }) =>
      `${orderReferences(references)} (${smsSafe(productName, 24)}): sorry, ` +
      (ordered === 1 ? "your unit did not arrive" : `none of your ${ordered} units arrived`) +
      `. We will refund ${ghs(refund)}. ${ordersUrl}`,
    example: {
      references: ["P-1042", "P-1043", "P-1044"],
      productName: "Ankara Wrap Dress with a Very Long Name Indeed",
      got: 0,
      ordered: 15,
      refund: 1350000,
      ordersUrl: "https://emblish.com/orders",
    },
  }),
  // #19 row 4: a Shipping Fee Invoice was issued, with any Delivery Fee on it.
  shippingFeeInvoice: template<{
    reference: string;
    units: number;
    /** Pesewas: arrived units × the confirmed fee. */
    shipping: number;
    /** Pesewas, when the Delivery Fee is on the invoice. */
    deliveryFee?: number;
    total: number;
    /** From `dayMonth`. */
    due: string;
    payUrl: string;
  }>({
    render: ({ reference, units: count, shipping, deliveryFee, total, due, payUrl }) =>
      `Shipping Fee for ${reference} (${count} ${units(count)}): ${ghs(shipping)}` +
      (deliveryFee ? ` + delivery ${ghs(deliveryFee)} = ${ghs(total)}` : "") +
      `. Due ${due}. Pay: ${payUrl}`,
    example: {
      reference: "P-1042",
      units: 3,
      shipping: 9000,
      deliveryFee: 3000,
      total: 12000,
      due: "14 Nov",
      payUrl: "https://emblish.com/p/K7Q2M9XA",
    },
  }),
  // #19 row 5: Void & reissue replaced the invoice; the due date is kept.
  invoiceReplaced: template<{
    reference: string;
    total: number;
    /** From `dayMonth`. */
    due: string;
    payUrl: string;
  }>({
    render: ({ reference, total, due, payUrl }) =>
      `Your invoice for ${reference} has been corrected. New total ${ghs(total)}, ` +
      `still due ${due}. Pay: ${payUrl}`,
    example: {
      reference: "P-1042",
      total: 11000,
      due: "14 Nov",
      payUrl: "https://emblish.com/p/K7Q2M9XA",
    },
  }),
  // #19 row 8: Ready for Pickup without a payment, such as a GHS 0 Shipping Fee.
  readyForPickup: template<{
    reference: string;
    pickupCode: string;
    location: string;
    ordersUrl: string;
  }>({
    render: ({ reference, pickupCode, location: where, ordersUrl }) =>
      `${reference} is ready for pickup. Pickup code: ${pickupCode}. ${location(where)}. ${ordersUrl}`,
    example: {
      reference: "P-1042",
      pickupCode: "482913",
      location: "Osu, Oxford Street, opposite the Shell. Mon-Sat 9am-6pm",
      ordersUrl: "https://emblish.com/orders",
    },
    redact: (body) => body.replace(/Pickup code: \d{6}/, "Pickup code: ******"),
  }),
  // #19 row 1, for a paid invoice: the Pickup Code when it makes the order Ready for Pickup.
  invoicePaid: template<{
    amount: number;
    reference: string;
    receiptUrl: string;
    /** Set when the payment made the order Ready for Pickup. */
    pickup?: { code: string; location: string };
    /** Set when the payment made a Delivery order ready to go out. */
    delivering?: boolean;
  }>({
    render: ({ amount, reference, receiptUrl, pickup, delivering }) =>
      `Payment of ${ghs(amount)} received for ${reference}.` +
      (pickup
        ? ` Pickup code for ${reference}: ${pickup.code}. ${location(pickup.location)}.`
        : "") +
      (delivering ? " We will text you when it is on its way." : "") +
      ` Receipt: ${receiptUrl}`,
    example: {
      amount: 12000,
      reference: "P-1042",
      receiptUrl: "https://emblish.com/r/K7Q2M9XA",
      pickup: {
        code: "482913",
        location: "Osu, Oxford Street, opposite the Shell. Mon-Sat 9am-6pm",
      },
    },
    redact: (body) => body.replace(/(Pickup code for \S+): \d{6}/, "$1: ******"),
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
