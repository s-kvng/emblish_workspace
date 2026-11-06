import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action, query } from "../_generated/server";
import { createStaffAuthUser } from "../model/authUsers";
import { findInvitation } from "../model/invitations";
import { staffRole } from "../schema";

// The only Back Office functions open to someone who isn't Staff yet: each
// opens with the invitation token, standing in for `requireStaff`.

/** What the invitation link leads to; the email and role show only while it's open. */
export const lookup = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({ status: v.literal("open"), email: v.string(), role: staffRole }),
    v.object({
      status: v.union(
        v.literal("expired"),
        v.literal("used"),
        v.literal("cancelled"),
        v.literal("unknown"),
      ),
    }),
  ),
  handler: async (ctx, { token }) => {
    const found = await findInvitation(ctx, token);
    if (found.status !== "open") return { status: found.status };
    const { email, role } = found.invitation;
    return { status: "open" as const, email, role };
  },
});

/**
 * The invitee sets their name and password: this creates their Better Auth
 * user and `staff` row. The app then signs them in with that password.
 */
export const accept = action({
  args: { token: v.string(), name: v.string(), password: v.string() },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, args): Promise<{ email: string }> => {
    const { email }: { email: string } = await ctx.runQuery(internal.system.invitations.open, {
      token: args.token,
    });
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "NAME_REQUIRED",
        message: "Enter your name.",
      });
    }

    const { authUserId, remove } = await createStaffAuthUser(ctx, {
      email,
      name,
      password: args.password,
    });
    try {
      await ctx.runMutation(internal.system.invitations.accept, {
        token: args.token,
        authUserId,
        name,
      });
    } catch (error) {
      // Leave nothing behind, so the invitation can still be accepted.
      await remove();
      throw error;
    }
    return { email };
  },
});
