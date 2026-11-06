import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { invitationEmail } from "./email";
import { findStaffByEmail } from "./staff";

const DAY = 24 * 60 * 60 * 1000;
export const INVITATION_LIFETIME = 7 * DAY;

/** The https link in the email; the backend's HTTP route hands it on to the Back Office app. */
export function invitationLink(token: string) {
  return `${process.env.CONVEX_SITE_URL}/back-office/invite?token=${encodeURIComponent(token)}`;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Invitations not yet accepted or cancelled, whether or not their link has expired. */
export async function listPendingInvitations(ctx: Pick<QueryCtx, "db">) {
  return await ctx.db
    .query("invitations")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .collect();
}

/**
 * Records an invitation from an Owner and schedules its email. Inviting the
 * same email again replaces the earlier invitation, so only the newest link works.
 */
export async function createInvitation(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  invitedBy: Doc<"staff">,
  { email, role }: Pick<Doc<"invitations">, "email" | "role">,
) {
  if (await findStaffByEmail(ctx, email)) {
    throw new ConvexError({
      code: "ALREADY_STAFF",
      message: `${email} is already Staff. Change their role or reactivate them instead.`,
    });
  }
  const earlier = await ctx.db
    .query("invitations")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  for (const invitation of earlier) {
    if (invitation.status === "pending")
      await ctx.db.patch(invitation._id, { status: "cancelled" });
  }

  const token = newToken();
  await ctx.db.insert("invitations", {
    email,
    role,
    token,
    expiresAt: Date.now() + INVITATION_LIFETIME,
    status: "pending",
    invitedBy: invitedBy._id,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.system.email.send,
    invitationEmail(email, role, invitationLink(token)),
  );
}

export type InvitationState =
  | { status: "open"; invitation: Doc<"invitations"> }
  | { status: "expired" | "used" | "cancelled" | "unknown" };

/** What an invitation link's token leads to, as of now. */
export async function findInvitation(
  ctx: Pick<QueryCtx, "db">,
  token: string,
): Promise<InvitationState> {
  const invitation = await ctx.db
    .query("invitations")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!invitation) return { status: "unknown" };
  if (invitation.status === "accepted") return { status: "used" };
  if (invitation.status === "cancelled") return { status: "cancelled" };
  if (invitation.expiresAt <= Date.now()) return { status: "expired" };
  return { status: "open", invitation };
}

/** Makes the invitee Staff with the invited role and closes the invitation. */
export async function acceptInvitation(
  ctx: Pick<MutationCtx, "db">,
  invitation: Doc<"invitations">,
  { authUserId, name }: { authUserId: string; name: string },
) {
  await ctx.db.insert("staff", {
    authUserId,
    email: invitation.email,
    name,
    role: invitation.role,
    status: "active",
  });
  await ctx.db.patch(invitation._id, { status: "accepted" });
}

export async function cancelInvitation(
  ctx: Pick<MutationCtx, "db">,
  invitationId: Id<"invitations">,
) {
  const invitation = await ctx.db.get(invitationId);
  if (invitation?.status === "pending") {
    await ctx.db.patch(invitationId, { status: "cancelled" });
  }
}
