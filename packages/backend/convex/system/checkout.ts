import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { deliveryFeesToday, endCheckout, findOwnCheckout } from "../model/checkout";
import { getCustomer } from "../model/customers";
import { settlePayment } from "../model/payments";
import { pollEveryMs } from "./seev";

/** Scheduled at `expiresAt` by Pay: an unpaid Checkout's holds lapse together. */
export const expire = internalMutation({
  args: { checkoutId: v.id("checkouts") },
  returns: v.null(),
  handler: async (ctx, { checkoutId }) => {
    const checkout = await ctx.db.get(checkoutId);
    if (checkout) await endCheckout(ctx, checkout, "expired");
    return null;
  },
});

/**
 * What Pay sends Seev for one of the Customer's pending Checkouts, or why it can't:
 * `notFound` for someone else's, `closed` once it's paid, expired or released.
 */
export const paymentRequest = internalQuery({
  args: { authUserId: v.string(), checkoutId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("notFound") }),
    v.object({ kind: v.literal("closed") }),
    v.object({
      kind: v.literal("open"),
      checkoutId: v.id("checkouts"),
      name: v.string(),
      phone: v.string(),
      items: v.array(v.object({ name: v.string(), quantity: v.number(), price: v.number() })),
      tries: v.number(),
    }),
  ),
  handler: async (ctx, { authUserId, checkoutId }) => {
    const customer = await getCustomer(ctx, authUserId);
    const checkout = await findOwnCheckout(ctx, customer, checkoutId);
    if (!customer || !checkout) return { kind: "notFound" as const };
    if (checkout.status !== "pending" || checkout.expiresAt <= Date.now()) {
      return { kind: "closed" as const };
    }
    const sessions = await ctx.db
      .query("paymentSessions")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
      .collect();
    const items = checkout.lines.map((line) => {
      const name = line.variantLabel
        ? `${line.productName} (${line.variantLabel})`
        : line.productName;
      return {
        name: line.orderWindowId === undefined ? name : `Pre-order: ${name}`,
        quantity: line.quantity,
        price: line.unitPrice,
      };
    });
    // The Store Order's fixed-zone Delivery Fee is paid now, as its own line; each Pre-order
    // pays its own on its Shipping Fee Invoice.
    const fee = deliveryFeesToday(checkout);
    if (fee > 0 && checkout.fulfilment.method === "delivery") {
      items.push({
        name: `Delivery: ${checkout.fulfilment.zoneName}`,
        quantity: 1,
        price: fee,
      });
    }
    return {
      kind: "open" as const,
      checkoutId: checkout._id,
      name: customer.name ?? "",
      phone: customer.phone,
      items,
      tries: sessions.length,
    };
  },
});

/** Keeps a new Seev session against its Checkout and starts polling it. */
export const recordSession = internalMutation({
  args: {
    checkoutId: v.id("checkouts"),
    reference: v.string(),
    checkoutUrl: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, session) => {
    const existing = await ctx.db
      .query("paymentSessions")
      .withIndex("by_reference", (q) => q.eq("reference", session.reference))
      .unique();
    // Two taps on Pay can replay one session; it's kept and polled once.
    if (existing) return null;
    await ctx.db.insert("paymentSessions", session);
    await ctx.scheduler.runAfter(pollEveryMs, internal.system.seev.poll, {
      reference: session.reference,
    });
    return null;
  },
});

/** The unsettled Seev sessions of one of the Customer's Checkouts, for the return page. */
export const unsettledReferences = internalQuery({
  args: { authUserId: v.string(), checkoutId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { authUserId, checkoutId }) => {
    const checkout = await findOwnCheckout(ctx, await getCustomer(ctx, authUserId), checkoutId);
    if (!checkout) return [];
    const sessions = await ctx.db
      .query("paymentSessions")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
      .collect();
    return sessions.filter((s) => s.settledAt === undefined).map((s) => s.reference);
  },
});

/** Records a payment Seev's verify route confirmed; idempotent on the reference. */
export const settle = internalMutation({
  args: { reference: v.string(), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, payment) => {
    await settlePayment(ctx, payment);
    return null;
  },
});
