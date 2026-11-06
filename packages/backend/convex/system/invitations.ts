import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { requireOpenInvitation } from "../lib/guards";
import { acceptInvitation } from "../model/invitations";
import { staffRole } from "../schema";

/** The open invitation behind a token, for `backOffice/invitation.accept`. */
export const open = internalQuery({
  args: { token: v.string() },
  returns: v.object({ email: v.string(), role: staffRole }),
  handler: async (ctx, { token }) => {
    const { email, role } = await requireOpenInvitation(ctx, token);
    return { email, role };
  },
});

/** Records the accepted invitation once its Better Auth user exists. */
export const accept = internalMutation({
  args: { token: v.string(), authUserId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { token, authUserId, name }) => {
    const invitation = await requireOpenInvitation(ctx, token);
    await acceptInvitation(ctx, invitation, { authUserId, name });
    return null;
  },
});
