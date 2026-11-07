import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { getCustomer } from "../model/customers";

/** Asked by Better Auth once a phone code is verified: the first sign-in creates the Customer. */
export const recordSignIn = internalMutation({
  args: { authUserId: v.string(), phone: v.string() },
  returns: v.id("customers"),
  handler: async (ctx, { authUserId, phone }) => {
    const existing = await getCustomer(ctx, authUserId);
    if (existing) return existing._id;
    return await ctx.db.insert("customers", { authUserId, phone });
  },
});
