import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { passwordResetEmail } from "../model/email";
import { getActiveStaff } from "../model/staff";

/** Asked by Better Auth before an email sign-in gets a session. */
export const mayStartBackOfficeSession = internalQuery({
  args: { authUserId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { authUserId }) => {
    return (await getActiveStaff(ctx, authUserId)) !== null;
  },
});

/** Asked by Better Auth to send a reset link: only active Staff get one, and nobody is told otherwise. */
export const emailPasswordReset = internalMutation({
  args: { authUserId: v.string(), link: v.string() },
  returns: v.null(),
  handler: async (ctx, { authUserId, link }) => {
    const staff = await getActiveStaff(ctx, authUserId);
    if (staff) {
      await ctx.scheduler.runAfter(
        0,
        internal.system.email.send,
        passwordResetEmail(staff.email, link),
      );
    }
    return null;
  },
});
