import { ConvexError, type Infer, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  awaitsDeliveryQuote,
  type Fulfilment,
  type FulfilmentRequest,
  freezeFulfilment,
  invoicedDeliveryFee,
} from "./fulfilment";
import {
  type InvoiceActor,
  issueDeliveryFeeInvoice,
  refuseWhilePaying,
  voidInvoice,
  writeReplacement,
} from "./invoices";
import { refundsOnOrder } from "./orders";
import { type RefundableFee, refundableDeliveryFees } from "./refunds";
import { nextUncollectedReminderOn } from "./reminderSchedule";
import { pickupLocation } from "./settings";
import { ordersUrl, queueSms } from "./sms";

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * One thing a switch does to the order's money, as the switch sheet's money-effect panel says it:
 * - `onComingInvoice`: a Pre-order not yet invoiced; the Delivery Fee goes on its Shipping Fee
 *   Invoice when it's issued.
 * - `invoiceReissued`: an unpaid invoice is voided and reissued at `total`, due date kept.
 * - `invoiceVoided`: an unpaid Delivery Fee Invoice is voided, nothing left on it to pay.
 * - `newInvoice`: a Delivery Fee Invoice for the fee, or the difference on a paid one.
 * - `refund`: paid Delivery Fee going back, as a `fulfilmentSwitch` Refund.
 * - `refundCancelled`: an earlier switch's Refund, not yet paid out, is taken back (in part or
 *   whole) to cover the fee instead of billing the Customer again.
 * - `quoteLater`: Elsewhere in Ghana; Staff will text a quote.
 */
export const switchEffect = v.union(
  v.object({ kind: v.literal("onComingInvoice"), amount: v.number() }),
  v.object({
    kind: v.literal("invoiceReissued"),
    number: v.string(),
    total: v.number(),
  }),
  v.object({
    kind: v.literal("invoiceVoided"),
    number: v.string(),
    amount: v.number(),
  }),
  v.object({ kind: v.literal("newInvoice"), amount: v.number() }),
  v.object({ kind: v.literal("refund"), amount: v.number() }),
  v.object({ kind: v.literal("refundCancelled"), amount: v.number() }),
  v.object({ kind: v.literal("quoteLater") }),
);
/** One money effect of a switch; see `switchEffect`. */
export type SwitchEffect = Infer<typeof switchEffect>;

/** A fulfilment the order could switch to, with what it would do to the money. */
export const switchChoice = v.union(
  v.object({
    method: v.literal("pickup"),
    /** Pesewas the Delivery Fee changes by; missing when either side awaits a quote. */
    difference: v.optional(v.number()),
    effects: v.array(switchEffect),
  }),
  v.object({
    method: v.literal("delivery"),
    zoneId: v.id("deliveryZones"),
    zoneName: v.string(),
    areas: v.string(),
    /** The zone the order is delivered to now: picking it changes only the address. */
    current: v.boolean(),
    /** Pesewas; missing for Elsewhere in Ghana, quoted by Staff. */
    fee: v.optional(v.number()),
    difference: v.optional(v.number()),
    effects: v.array(switchEffect),
  }),
);

/** The switch sheet: whether the order can still switch, and each choice with its money effect. */
export const switchOptionsResult = v.object({
  /** False once the order is Dispatched, handed over or ended. */
  switchable: v.boolean(),
  choices: v.array(switchChoice),
});

/** Statuses before dispatch or handover, while the Fulfilment Method, zone or address can change. */
const switchableStatuses: readonly Doc<"orders">["status"][] = [
  "awaitingArrival",
  "paymentDue",
  "ready",
];

/** Whether the order's fulfilment can still change: it hasn't been Dispatched or Collected. */
export function switchable(order: Doc<"orders">) {
  return switchableStatuses.includes(order.status);
}

/** Where a switch goes, as far as the money cares: the zone, not the address. */
type SwitchTarget = { method: "pickup" } | { method: "delivery"; zoneId: Id<"deliveryZones"> };

/** The Delivery Fee the order would owe after the switch, and whether Staff must quote it. */
async function targetFee(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">, to: SwitchTarget) {
  if (to.method === "pickup") return { fee: 0, quote: false, zoneName: "" };
  const current = order.fulfilment;
  // Staying in the zone keeps the fee frozen at Checkout (or quoted), whatever it is today.
  if (current.method === "delivery" && current.zoneId === to.zoneId) {
    return {
      fee: invoicedDeliveryFee(current),
      quote: false,
      zoneName: current.zoneName,
    };
  }
  const zone = await ctx.db.get(to.zoneId);
  if (!zone) refuse("ZONE_UNAVAILABLE", "We no longer deliver to that zone. Pick another one.");
  return zone.fee === undefined
    ? { fee: 0, quote: true, zoneName: zone.name }
    : { fee: zone.fee, quote: false, zoneName: zone.name };
}

type Step =
  | { kind: "onComingInvoice"; amount: number }
  | {
      kind: "reissue";
      invoice: Doc<"invoices">;
      deliveryFee: number;
      total: number;
    }
  | { kind: "void"; invoice: Doc<"invoices"> }
  | { kind: "newInvoice"; amount: number }
  | { kind: "refund"; amount: number; paid: RefundableFee[] }
  | { kind: "refundCancelled"; amount: number; pending: Doc<"refunds">[] }
  | { kind: "quoteLater" };

/**
 * What switching the order would do to its money (Fulfilment: Pickup and Delivery). What's
 * unpaid is adjusted; a difference on what's paid is settled on its own:
 * - Not yet invoiced (a Pre-order awaiting arrival): the new fee rides on its Shipping Fee Invoice.
 * - Each unpaid invoice's Delivery Fee line is changed to what's still owed: void & reissue, or
 *   void a Delivery Fee Invoice left with nothing on it.
 * - Still owed with no unpaid line to carry it: added to an unpaid Shipping Fee Invoice when
 *   nothing was paid yet, else a Delivery Fee Invoice for it.
 * - Paid beyond the new fee: a `fulfilmentSwitch` Refund. An earlier switch's Refund not yet paid
 *   out still counts as held: it's taken back before anything new is billed.
 */
async function planSwitch(
  ctx: Pick<QueryCtx, "db">,
  order: Doc<"orders">,
  to: SwitchTarget,
): Promise<Step[]> {
  const { fee, quote, zoneName } = await targetFee(ctx, order, to);
  const steps: Step[] = [];
  const current = order.fulfilment;
  const sameZone =
    current.method === "delivery" && to.method === "delivery" && current.zoneId === to.zoneId;
  if (order.kind === "preorder" && order.status === "awaitingArrival") {
    // Staying in the zone, the fee on the coming invoice doesn't change.
    if (fee > 0 && !sameZone) steps.push({ kind: "onComingInvoice", amount: fee });
  } else {
    const paid = await refundableDeliveryFees(ctx, order);
    // Delivery Fee a past switch flagged for refund, not yet paid out: still ours to keep.
    const pending = (await refundsOnOrder(ctx, order))
      .filter((r) => r.kind === "fulfilmentSwitch" && r.status === "toRefund")
      .reverse();
    const pendingTotal = pending.reduce((sum, r) => sum + r.amount, 0);
    const paidTotal = paid.reduce((sum, p) => sum + p.amount, 0);
    const held = paidTotal + pendingTotal;
    const reclaim = Math.min(pendingTotal, Math.max(0, fee - paidTotal));
    if (reclaim > 0) steps.push({ kind: "refundCancelled", amount: reclaim, pending });
    let owed = Math.max(0, fee - held);
    const unpaid = (
      await ctx.db
        .query("invoices")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect()
    ).filter((invoice) => invoice.status === "unpaid");
    for (const invoice of unpaid) {
      const line = invoice.lines.find((l) => l.kind === "deliveryFee");
      if (!line) continue;
      const amount = owed;
      owed = 0;
      if (amount === line.amount && line.zoneName === zoneName) continue;
      const others = invoice.total - line.amount;
      if (others === 0 && amount === 0) steps.push({ kind: "void", invoice });
      else
        steps.push({
          kind: "reissue",
          invoice,
          deliveryFee: amount,
          total: others + amount,
        });
    }
    if (owed > 0) {
      const shipping =
        held === 0 &&
        unpaid.find(
          (i) => i.kind === "shippingFee" && !i.lines.some((l) => l.kind === "deliveryFee"),
        );
      if (shipping) {
        steps.push({
          kind: "reissue",
          invoice: shipping,
          deliveryFee: owed,
          total: shipping.total + owed,
        });
      } else {
        steps.push({ kind: "newInvoice", amount: owed });
      }
    }
    if (paidTotal > fee) steps.push({ kind: "refund", amount: paidTotal - fee, paid });
  }
  if (quote) steps.push({ kind: "quoteLater" });
  return steps;
}

function asEffect(step: Step): SwitchEffect {
  switch (step.kind) {
    case "reissue":
      return {
        kind: "invoiceReissued",
        number: step.invoice.number,
        total: step.total,
      };
    case "void":
      return {
        kind: "invoiceVoided",
        number: step.invoice.number,
        amount: step.invoice.total,
      };
    case "refund":
      return { kind: "refund", amount: step.amount };
    case "refundCancelled":
      return { kind: "refundCancelled", amount: step.amount };
    default:
      return step;
  }
}

/**
 * The switch sheet: Pickup (unless it's Pickup now) and every active Delivery Zone, plus the
 * current one, each with its fee, the difference from the fee now and the money effect.
 */
export async function switchOptions(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">) {
  if (!switchable(order)) return { switchable: false, choices: [] };
  const current = order.fulfilment;
  const quoting = awaitsDeliveryQuote(current);
  const feeNow = invoicedDeliveryFee(current);
  const difference = (fee: number, quote: boolean) =>
    quoting || quote ? {} : { difference: fee - feeNow };

  const choices: Infer<typeof switchChoice>[] = [];
  if (current.method !== "pickup") {
    const effects = (await planSwitch(ctx, order, { method: "pickup" })).map(asEffect);
    choices.push({ method: "pickup", ...difference(0, false), effects });
  }
  const zones = (await ctx.db.query("deliveryZones").collect())
    .filter((zone) => zone.active || (current.method === "delivery" && current.zoneId === zone._id))
    // Elsewhere in Ghana comes last, under the zones with a set fee.
    .sort((a, b) => Number(a.isElsewhere) - Number(b.isElsewhere));
  for (const zone of zones) {
    const to = { method: "delivery" as const, zoneId: zone._id };
    const { fee, quote } = await targetFee(ctx, order, to);
    const steps = await planSwitch(ctx, order, to);
    const keepsQuote = current.method === "delivery" && current.zoneId === zone._id && quoting;
    choices.push({
      method: "delivery",
      zoneId: zone._id,
      zoneName: zone.name,
      areas: zone.areas,
      current: current.method === "delivery" && current.zoneId === zone._id,
      ...(quote || keepsQuote ? {} : { fee }),
      ...(keepsQuote ? {} : difference(fee, quote)),
      effects: steps.map(asEffect),
    });
  }
  return { switchable: true, choices };
}

/** Who is switching: the signed-in Customer (their own orders only) or a Staff member. */
export type Switcher =
  | { kind: "customer"; customer: Doc<"customers"> }
  | { kind: "staff"; staff: Doc<"staff"> };

/** A fulfilment as the order's History names it. */
function described(fulfilment: Fulfilment) {
  return fulfilment.method === "pickup" ? "Pickup" : `Delivery to ${fulfilment.zoneName}`;
}

/**
 * Switches an order between Pickup and Delivery, or to another zone or address, until it's
 * Dispatched or Collected. The money moves exactly as `switchOptions` showed for the choice
 * (see `planSwitch`), and the order's status follows: Ready once nothing is owed or awaiting a
 * quote, else payment due. Ready for Pickup, the Customer is texted the Pickup Code. Each switch
 * writes a `fulfilmentSwitched` row naming who did it.
 */
export async function switchFulfilment(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  by: Switcher,
  {
    orderId,
    to,
    expected,
  }: {
    orderId: Id<"orders">;
    to: FulfilmentRequest;
    /** The money effect the sheet showed; refused if it no longer holds. */
    expected?: SwitchEffect[];
  },
): Promise<SwitchEffect[]> {
  const order = await ctx.db.get(orderId);
  if (!order || (by.kind === "customer" && order.customerId !== by.customer._id)) {
    refuse("NOT_FOUND", "That order doesn't exist.");
  }
  if (!switchable(order)) {
    refuse(
      "NOT_SWITCHABLE",
      order.status === "dispatched"
        ? `${order.reference} is out for delivery, so it can't be switched.`
        : `${order.reference} is no longer open, so it can't be switched.`,
    );
  }
  if (to.method === "pickup" && order.fulfilment.method === "pickup") {
    refuse("NO_CHANGE", `${order.reference} is already for Pickup.`);
  }
  const customer = await ctx.db.get(order.customerId);
  if (!customer) refuse("NOT_FOUND", "That order's Customer doesn't exist.");
  const fulfilment = await freezeFulfilment(ctx, customer, to, order.fulfilment);
  const steps = await planSwitch(
    ctx,
    order,
    to.method === "pickup" ? to : { method: "delivery", zoneId: to.zoneId },
  );
  const effects = steps.map(asEffect);
  if (expected && JSON.stringify(expected) !== JSON.stringify(effects)) {
    refuse(
      "MONEY_CHANGED",
      "What this change does to the money has changed since you looked. Check it and confirm again.",
    );
  }
  for (const step of steps) {
    if (step.kind === "reissue" || step.kind === "void") await refuseWhilePaying(ctx, step.invoice);
  }

  const actor: InvoiceActor =
    by.kind === "staff"
      ? { kind: "staff", staffId: by.staff._id }
      : { kind: "customer", customerId: by.customer._id };
  const switched = { ...order, fulfilment };
  await ctx.db.patch(order._id, { fulfilment });
  const reason = `Switched to ${described(fulfilment)}`;
  const zoneName = fulfilment.method === "delivery" ? fulfilment.zoneName : "";
  for (const step of steps) {
    if (step.kind === "reissue") {
      const lines: Doc<"invoices">["lines"] = step.invoice.lines.flatMap(
        (line): Doc<"invoices">["lines"] =>
          line.kind === "shippingFee"
            ? [line]
            : step.deliveryFee > 0
              ? [{ ...line, zoneName, amount: step.deliveryFee }]
              : [],
      );
      if (step.deliveryFee > 0 && !lines.some((line) => line.kind === "deliveryFee")) {
        lines.push({ kind: "deliveryFee", zoneName, amount: step.deliveryFee });
      }
      await writeReplacement(ctx, actor, step.invoice, switched, lines, reason);
    } else if (step.kind === "void") {
      await voidInvoice(ctx, step.invoice, reason);
    } else if (step.kind === "newInvoice") {
      await issueDeliveryFeeInvoice(ctx, actor, switched, zoneName, step.amount);
    } else if (step.kind === "refund") {
      // Newest payment first: a difference invoice is refunded before the fee it topped up.
      let left = step.amount;
      for (const paid of [...step.paid].reverse()) {
        const amount = Math.min(left, paid.amount);
        if (amount <= 0) break;
        await ctx.db.insert("refunds", {
          paymentId: paid.paymentId,
          orderId: order._id,
          kind: "fulfilmentSwitch",
          amount,
          deliveryFee: amount,
          status: "toRefund",
          returnToStock: false,
          note: reason,
          ...(by.kind === "staff" ? { flaggedBy: by.staff._id } : {}),
        });
        left -= amount;
      }
    } else if (step.kind === "refundCancelled") {
      // Newest first: what the last switch flagged is what this one takes back.
      let left = step.amount;
      for (const refund of step.pending) {
        const amount = Math.min(left, refund.amount);
        if (amount <= 0) break;
        if (amount === refund.amount) {
          await ctx.db.delete(refund._id);
        } else {
          await ctx.db.patch(refund._id, {
            amount: refund.amount - amount,
            deliveryFee: (refund.deliveryFee ?? refund.amount) - amount,
          });
        }
        left -= amount;
      }
    }
  }
  const from = described(order.fulfilment);
  const toName = described(fulfilment);
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "fulfilmentSwitched",
    actor,
    note: from === toName ? `${toName}: new address` : `${from} → ${toName}`,
  });

  // Ready once nothing is owed or awaiting a quote; a switch can go either way.
  let status = order.status;
  if (status === "paymentDue" || status === "ready") {
    const owing =
      awaitsDeliveryQuote(fulfilment) ||
      (
        await ctx.db
          .query("invoices")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect()
      ).some((invoice) => invoice.status === "unpaid");
    if (owing && status === "ready") {
      status = "paymentDue";
      await ctx.db.patch(order._id, { status, readyAt: undefined, nextReminderOn: undefined });
    } else if (!owing && status === "paymentDue") {
      status = "ready";
      const now = Date.now();
      await ctx.db.patch(order._id, {
        status,
        readyAt: now,
        nextReminderOn: nextUncollectedReminderOn({ status, fulfilment, readyAt: now }, now),
      });
      await ctx.db.insert("orderEvents", {
        orderId: order._id,
        kind: "ready",
        actor,
      });
    }
  }
  if (status === "ready" && order.status === "ready") {
    // Still Ready under the new fulfilment: uncollected reminders start or stop with Pickup.
    await ctx.db.patch(order._id, {
      nextReminderOn: nextUncollectedReminderOn(
        { status, fulfilment, readyAt: order.readyAt },
        Date.now(),
      ),
    });
  }
  if (status === "ready" && fulfilment.method === "pickup") {
    await queueSms(ctx, customer.phone, "readyForPickup", {
      reference: order.reference,
      pickupCode: order.pickupCode,
      location: await pickupLocation(ctx),
      ordersUrl: ordersUrl(),
    });
  }
  return effects;
}
