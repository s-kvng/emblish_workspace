import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, mutation, type QueryCtx, query } from "../_generated/server";
import { requireCustomer, requireIdentity } from "../lib/guards";
import { endCheckout, findOwnCheckout, orderCount, startCheckout } from "../model/checkout";
import { createSession, SeevUnavailable } from "../model/seev";
import { checkoutLine, checkoutStatus, fulfilment, fulfilmentRequest } from "../schema";

/** The signed-in Customer's own Checkout, or NOT_FOUND. */
async function ownCheckout(
  ctx: Pick<QueryCtx, "db">,
  customer: Doc<"customers">,
  checkoutId: string,
) {
  const checkout = await findOwnCheckout(ctx, customer, checkoutId);
  if (!checkout) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That Checkout doesn't exist." });
  }
  return checkout;
}

/** Pay: submits the Bag as a Checkout, holding its Stock for 30 minutes. */
export const start = mutation({
  args: {
    /** In-stock lines, and Pre-order lines naming the Order Window they're ordered in. */
    lines: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        windowId: v.optional(v.id("orderWindows")),
      }),
    ),
    /** Asked once, at the Pickup or Delivery step of the Customer's first Checkout. */
    name: v.optional(v.string()),
    /** Pickup when left out. */
    fulfilment: v.optional(fulfilmentRequest),
  },
  returns: v.object({ checkoutId: v.id("checkouts") }),
  handler: async (ctx, { lines, name, fulfilment }) => {
    const customer = await requireCustomer(ctx);
    return { checkoutId: await startCheckout(ctx, customer, lines, name, fulfilment) };
  },
});

/**
 * Hands a pending Checkout to Seev's hosted checkout and returns its URL. Each call is a new
 * try with its own session, so "Try payment again" calls it again.
 */
export const pay = action({
  args: { checkoutId: v.string() },
  returns: v.object({ checkoutUrl: v.string() }),
  handler: async (ctx, { checkoutId }) => {
    // The Customer and ownership checks finish inside `paymentRequest` (ADR 0001).
    const identity = await requireIdentity(ctx);
    const request = await ctx.runQuery(internal.system.checkout.paymentRequest, {
      authUserId: identity.subject,
      checkoutId,
    });
    if (request.kind === "notFound") {
      throw new ConvexError({ code: "NOT_FOUND", message: "That Checkout doesn't exist." });
    }
    if (request.kind === "closed") {
      throw new ConvexError({
        code: "CHECKOUT_CLOSED",
        message: "This Checkout has ended. Go back to your bag to pay again.",
      });
    }
    try {
      const session = await createSession({
        idempotencyKey: `${request.checkoutId}-${request.tries + 1}`,
        recipient: { name: request.name, phone: request.phone },
        items: request.items,
        redirectUrl: `${process.env.SITE_URL}/checkout?checkout=${request.checkoutId}`,
        meta: { checkoutId: request.checkoutId },
      });
      await ctx.runMutation(internal.system.checkout.recordSession, {
        checkoutId: request.checkoutId,
        ...session,
      });
      return { checkoutUrl: session.checkoutUrl };
    } catch (error) {
      if (!(error instanceof SeevUnavailable)) throw error;
      console.error(error.message);
      throw new ConvexError({
        code: "PAYMENT_UNAVAILABLE",
        message: "We couldn't open the payment page. Nothing was charged. Try again.",
      });
    }
  },
});

/**
 * The return from Seev: asks Seev about the Checkout's sessions now rather than waiting for
 * the next poll, so a paid Customer lands on their Receipt straight away. The page then
 * reads the outcome from `get`.
 */
export const refresh = action({
  args: { checkoutId: v.string() },
  returns: v.null(),
  handler: async (ctx, { checkoutId }) => {
    const identity = await requireIdentity(ctx);
    const references = await ctx.runQuery(internal.system.checkout.unsettledReferences, {
      authUserId: identity.subject,
      checkoutId,
    });
    for (const reference of references) {
      await ctx.runAction(internal.system.seev.verify, { reference });
    }
    return null;
  },
});

/** The Bag changed after Pay: the Checkout's holds go back on sale. */
export const release = mutation({
  args: { checkoutId: v.string() },
  returns: v.null(),
  handler: async (ctx, { checkoutId }) => {
    const customer = await requireCustomer(ctx);
    await endCheckout(ctx, await ownCheckout(ctx, customer, checkoutId), "released");
    return null;
  },
});

/** One of the Customer's Checkouts, as Review & pay and the return from Seev show it. */
export const get = query({
  args: { checkoutId: v.string() },
  returns: v.object({
    status: checkoutStatus,
    expiresAt: v.number(),
    total: v.number(),
    lines: v.array(checkoutLine),
    /** Frozen at Pay, with its per-order Delivery Fee. */
    fulfilment,
    /** How many orders it becomes, each delivered (and charged) separately. */
    orderCount: v.number(),
    /** Set once a payment has settled it: the Receipt's `/r/` code. */
    receiptCode: v.optional(v.string()),
  }),
  handler: async (ctx, { checkoutId }) => {
    const customer = await requireCustomer(ctx);
    const checkout = await ownCheckout(ctx, customer, checkoutId);
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
      .first();
    return {
      status: checkout.status,
      expiresAt: checkout.expiresAt,
      total: checkout.total,
      lines: checkout.lines,
      fulfilment: checkout.fulfilment,
      orderCount: orderCount(checkout.lines),
      receiptCode: payment?.receiptCode,
    };
  },
});
