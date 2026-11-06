import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireOwner, requireStaff } from "../lib/guards";
import {
  cancelInvitation as cancelPendingInvitation,
  createInvitation,
  listPendingInvitations,
} from "../model/invitations";
import { deactivateStaff, normalizeEmail, reactivateStaff, setStaffRole } from "../model/staff";
import { staffRole, staffStatus } from "../schema";

/** The signed-in Staff member, for the Back Office's gate and More tab. */
export const me = query({
  args: {},
  returns: v.object({ name: v.string(), email: v.string(), role: staffRole }),
  handler: async (ctx) => {
    const { name, email, role } = await requireStaff(ctx);
    return { name, email, role };
  },
});

/** An Owner invites someone by email with a role; they set their own password from the link. */
export const invite = mutation({
  args: { email: v.string(), role: staffRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError({
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      });
    }
    await createInvitation(ctx, owner, { email, role: args.role });
    return null;
  },
});

/** More → Staff: everyone who is or was Staff, and the invitations still waiting. */
export const list = query({
  args: {},
  returns: v.object({
    staff: v.array(
      v.object({
        _id: v.id("staff"),
        name: v.string(),
        email: v.string(),
        role: staffRole,
        status: staffStatus,
        isYou: v.boolean(),
      }),
    ),
    invitations: v.array(
      v.object({
        _id: v.id("invitations"),
        email: v.string(),
        role: staffRole,
        expiresAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const you = await requireOwner(ctx);
    const staff = await ctx.db.query("staff").collect();
    const invitations = await listPendingInvitations(ctx);
    return {
      staff: staff.map(({ _id, name, email, role, status }) => ({
        _id,
        name,
        email,
        role,
        status,
        isYou: _id === you._id,
      })),
      invitations: invitations.map(({ _id, email, role, expiresAt }) => ({
        _id,
        email,
        role,
        expiresAt,
      })),
    };
  },
});

export const cancelInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, { invitationId }) => {
    await requireOwner(ctx);
    await cancelPendingInvitation(ctx, invitationId);
    return null;
  },
});

/** The last active Owner can't be demoted. */
export const setRole = mutation({
  args: { staffId: v.id("staff"), role: staffRole },
  returns: v.null(),
  handler: async (ctx, { staffId, role }) => {
    await requireOwner(ctx);
    await setStaffRole(ctx, staffId, role);
    return null;
  },
});

/** Signs them out everywhere and keeps them out; the last active Owner can't be deactivated. */
export const deactivate = mutation({
  args: { staffId: v.id("staff") },
  returns: v.null(),
  handler: async (ctx, { staffId }) => {
    await requireOwner(ctx);
    await deactivateStaff(ctx, staffId);
    return null;
  },
});

export const reactivate = mutation({
  args: { staffId: v.id("staff") },
  returns: v.null(),
  handler: async (ctx, { staffId }) => {
    await requireOwner(ctx);
    await reactivateStaff(ctx, staffId);
    return null;
  },
});
