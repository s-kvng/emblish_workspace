import { ConvexError, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { toGhanaPhone } from "./customers";
import { openOrderStatuses, type orderStatus, type overrideReason } from "../schema";

export type OverrideReason = Infer<typeof overrideReason>;
export type OrderStatus = Infer<typeof orderStatus>;

/** A Pickup Code is this many digits. */
export const pickupCodeLength = 6;

/** Whether text is the shape of a Pickup Code (not whether any order holds it). */
export function looksLikePickupCode(text: string) {
  return new RegExp(`^\\d{${pickupCodeLength}}$`).test(text);
}

/** One order to hand over: proved by its Pickup Code, or by Staff's override reason. */
export type Handover = {
  orderId: Id<"orders">;
  code?: string;
  override?: { reason: OverrideReason; note?: string };
};

/** The open order holding this Pickup Code, if any; closed orders may reuse codes. */
export async function findOpenOrderByCode(ctx: Pick<QueryCtx, "db">, code: string) {
  for (const status of openOrderStatuses) {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_pickupCode_and_status", (q) => q.eq("pickupCode", code).eq("status", status))
      .first();
    if (order) return order;
  }
  return null;
}

/** An order's lines as Staff see them at the Counter. */
export async function orderLines(ctx: Pick<QueryCtx, "db">, orderId: Id<"orders">) {
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return lines.map(({ productName, variantLabel, quantity, unitPrice }) => ({
    productName,
    variantLabel,
    quantity,
    unitPrice,
  }));
}

/** Whether an order can be handed over at the Counter now: Ready, for Pickup. */
export function handOverable(order: Doc<"orders">) {
  return order.status === "ready" && order.fulfilment.method === "pickup";
}

/** The Customer's other orders waiting at the Counter, oldest first. */
export async function alsoReady(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_customer", (q) => q.eq("customerId", order.customerId))
    .collect();
  return orders.filter((other) => other._id !== order._id && handOverable(other));
}

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Hands one Customer's Ready Pickup orders over at the Counter, all together or none: each needs
 * its own Pickup Code, or an override reason (and a note for "Other") after Staff checked ID.
 * Each becomes Collected with an `orderEvents` row naming the Staff member.
 */
export async function handOver(
  ctx: Pick<MutationCtx, "db">,
  actor: Doc<"staff">,
  handovers: Handover[],
) {
  if (handovers.length === 0) refuse("NOTHING_TO_HAND_OVER", "Pick an order to hand over.");
  if (new Set(handovers.map((h) => h.orderId)).size !== handovers.length) {
    refuse("DUPLICATE_ORDER", "Each order can only be handed over once.");
  }
  const checked = [];
  for (const handover of handovers) {
    const order = await ctx.db.get(handover.orderId);
    if (!order) refuse("NOT_FOUND", "That order doesn't exist.");
    if (!handOverable(order)) {
      refuse("NOT_READY", `${order.reference} isn't ready for pickup, so it can't be handed over.`);
    }
    if (checked.length > 0 && order.customerId !== checked[0]?.order.customerId) {
      refuse("DIFFERENT_CUSTOMERS", "Hand over one Customer's orders at a time.");
    }
    const code = handover.code?.trim();
    // A note only explains an override, so it's dropped when the code was given.
    const note = code ? undefined : handover.override?.note?.trim() || undefined;
    if (code) {
      if (code !== order.pickupCode) {
        refuse(
          "WRONG_CODE",
          `That code doesn't match ${order.reference}. Check it with the Customer.`,
        );
      }
    } else if (!handover.override) {
      refuse(
        "CODE_OR_REASON_REQUIRED",
        `Enter the Pickup Code for ${order.reference}, or pick why the Customer doesn't have it.`,
      );
    } else if (handover.override.reason === "other" && !note) {
      refuse("NOTE_REQUIRED", "Say why you're handing over without the code.");
    }
    checked.push({ order, override: code ? undefined : handover.override, note });
  }
  for (const { order, override, note } of checked) {
    await ctx.db.patch(order._id, { status: "collected" });
    await ctx.db.insert("orderEvents", {
      orderId: order._id,
      kind: "collected",
      actor: { kind: "staff", staffId: actor._id },
      ...(override ? { overrideReason: override.reason } : {}),
      ...(note ? { note } : {}),
    });
  }
}

/** An order's History, oldest first, naming the Staff member behind each action. */
export async function orderHistory(ctx: Pick<QueryCtx, "db">, orderId: Id<"orders">) {
  const events = await ctx.db
    .query("orderEvents")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const history = [];
  for (const event of events) {
    const staff = event.actor.kind === "staff" ? await ctx.db.get(event.actor.staffId) : null;
    history.push({
      kind: event.kind,
      at: event._creationTime,
      by: event.actor.kind === "system" ? "System" : (staff?.name ?? "Former Staff"),
      overrideReason: event.overrideReason,
      note: event.note,
    });
  }
  return history;
}

/** Pesewas flagged for refund against this order and not yet refunded. */
export async function owedBack(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">) {
  const refunds = await ctx.db
    .query("refunds")
    .withIndex("by_payment", (q) => q.eq("paymentId", order.paymentId))
    .collect();
  return refunds
    .filter((refund) => refund.orderId === order._id && refund.status !== "refunded")
    .reduce((sum, refund) => sum + refund.amount, 0);
}

/** The Customer a Staff search means: by a Pickup Code of an open order, or by phone as typed. */
export async function findCustomerForSearch(ctx: Pick<QueryCtx, "db">, text: string) {
  if (looksLikePickupCode(text)) {
    const order = await findOpenOrderByCode(ctx, text);
    return order && (await ctx.db.get(order.customerId));
  }
  const phone = toGhanaPhone(text);
  if (!phone) return null;
  return await ctx.db
    .query("customers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
}

/** The Customer as Staff see them on an order: name (asked at first Checkout) and phone. */
export function customerContact(customer: Doc<"customers">) {
  return { name: customer.name, phone: customer.phone };
}
