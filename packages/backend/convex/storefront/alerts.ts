import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { confirmAlerts, signUpForAlerts, unsubscribeFromAlerts } from "../model/alerts";

/**
 * Window Alert sign-up, open to anyone, Customer or not: texts a code to confirm the number.
 * A number that's already confirmed is texted nothing.
 */
export const signUp = mutation({
  args: { phone: v.string() },
  returns: v.object({
    status: v.union(v.literal("codeSent"), v.literal("alreadySubscribed")),
  }),
  handler: async (ctx, { phone }) => signUpForAlerts(ctx, phone),
});

/**
 * Confirms a Window Alert sign-up with the texted code. Three wrong tries spend the code, and
 * it reads as expired until a new one is asked for.
 */
export const confirm = mutation({
  args: { phone: v.string(), code: v.string() },
  returns: v.object({
    status: v.union(v.literal("confirmed"), v.literal("wrongCode"), v.literal("codeExpired")),
  }),
  handler: async (ctx, { phone, code }) => confirmAlerts(ctx, phone, code),
});

/** The `/u/<code>` link in every Window Alert: stops them, public to whoever holds the code. */
export const unsubscribe = mutation({
  args: { code: v.string() },
  returns: v.object({ unsubscribed: v.boolean() }),
  handler: async (ctx, { code }) => unsubscribeFromAlerts(ctx, code),
});
