import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { createStaffAuthUser } from "../model/authUsers";
import { seedSettings } from "../model/settings";
import { hasAnyStaff, insertFirstOwner, normalizeEmail } from "../model/staff";

/**
 * Creates the first Owner and seeds `settings`, once, on a fresh deployment.
 * Run it with `bunx convex run system/bootstrap:firstOwner` (see the README).
 */
export const firstOwner = internalAction({
  args: { email: v.string(), password: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.runQuery(internal.system.bootstrap.hasStaff, {})) {
      throw new Error("Staff already exist, so the first Owner is already bootstrapped.");
    }

    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    const { authUserId, remove } = await createStaffAuthUser(ctx, {
      email,
      name,
      password: args.password,
    });
    try {
      await ctx.runMutation(internal.system.bootstrap.insertOwnerAndSettings, {
        authUserId,
        email,
        name,
      });
    } catch (error) {
      // Leave nothing behind that would block a retry with the same email.
      await remove();
      throw error;
    }
    return null;
  },
});

export const hasStaff = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    return await hasAnyStaff(ctx);
  },
});

export const insertOwnerAndSettings = internalMutation({
  args: { authUserId: v.string(), email: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, owner) => {
    await insertFirstOwner(ctx, owner);
    await seedSettings(ctx);
    return null;
  },
});
