import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { createAuth } from "../auth";
import { seedSettings } from "../model/settings";
import { hasAnyStaff, insertFirstOwner } from "../model/staff";

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

    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    const auth = await createAuth(ctx).$context;
    const { minPasswordLength, maxPasswordLength } = auth.password.config;
    if (args.password.length < minPasswordLength || args.password.length > maxPasswordLength) {
      throw new Error(
        `The password must be ${minPasswordLength} to ${maxPasswordLength} characters long.`,
      );
    }
    if (await auth.internalAdapter.findUserByEmail(email)) {
      throw new Error(`${email} is already signed up.`);
    }

    // Public sign-up is off, so the user and its password are created directly.
    const user = await auth.internalAdapter.createUser({
      email,
      name,
      emailVerified: true,
      kind: "staff",
    });
    try {
      await auth.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await auth.password.hash(args.password),
      });
      await ctx.runMutation(internal.system.bootstrap.insertOwnerAndSettings, {
        authUserId: user.id,
        email,
        name,
      });
    } catch (error) {
      // Leave nothing behind that would block a retry with the same email.
      await auth.internalAdapter.deleteUser(user.id);
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
