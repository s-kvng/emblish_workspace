import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { verifySession } from "../model/seev";

/** We ask Seev about an open session about this often. */
export const pollEveryMs = 60 * 1000;

/** How long after a session's expiry we still look, to catch a payment that lands late. */
const graceMs = 5 * 60 * 1000;

/**
 * Asks Seev about one session and settles it if it's paid. Every way we learn of a payment
 * (the return page, polling, the webhook) comes through here, so nothing settles unverified.
 */
export const verify = internalAction({
  args: { reference: v.string() },
  returns: v.union(
    v.literal("paid"),
    v.literal("unpaid"),
    v.literal("failed"),
    v.literal("unknown"),
  ),
  handler: async (ctx, { reference }) => {
    const status = await verifySession(reference);
    if (status.kind === "paid") {
      await ctx.runMutation(internal.system.checkout.settle, {
        reference,
        amount: status.amount,
      });
    }
    return status.kind;
  },
});

/** Whether a Seev session we created is settled yet, and when it stops taking payment. */
export const sessionForPolling = internalQuery({
  args: { reference: v.string() },
  returns: v.union(v.null(), v.object({ expiresAt: v.number(), settled: v.boolean() })),
  handler: async (ctx, { reference }) => {
    const session = await ctx.db
      .query("paymentSessions")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    return session && { expiresAt: session.expiresAt, settled: session.settledAt !== undefined };
  },
});

/**
 * Polls a session about once a minute until it's settled or failed, or until a few
 * minutes past its expiry. Seev's webhook fires only after a verify and isn't retried,
 * so this is what guarantees a paid session is noticed (ADR 0003).
 */
export const poll = internalAction({
  args: { reference: v.string() },
  returns: v.null(),
  handler: async (ctx, { reference }) => {
    const session = await ctx.runQuery(internal.system.seev.sessionForPolling, { reference });
    if (!session || session.settled) return null;
    const status = await ctx.runAction(internal.system.seev.verify, { reference });
    if (status === "paid" || status === "failed") return null;
    if (Date.now() + pollEveryMs <= session.expiresAt + graceMs) {
      await ctx.scheduler.runAfter(pollEveryMs, internal.system.seev.poll, { reference });
    }
    return null;
  },
});
