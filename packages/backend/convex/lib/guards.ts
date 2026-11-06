import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findInvitation } from "../model/invitations";
import { getActiveStaff } from "../model/staff";

type GuardCtx = Pick<QueryCtx, "auth" | "db">;

/** Opens every `backOffice/` function: the caller must be an active Staff member. */
export async function requireStaff(ctx: GuardCtx): Promise<Doc<"staff">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
    });
  }
  const staff = await getActiveStaff(ctx, identity.subject);
  if (!staff) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only active Staff can do this.",
    });
  }
  return staff;
}

/** For Owner-only actions: sending money out, standing prices and fees, managing Staff. */
export async function requireOwner(ctx: GuardCtx): Promise<Doc<"staff">> {
  const staff = await requireStaff(ctx);
  if (staff.role !== "owner") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only an Owner can do this.",
    });
  }
  return staff;
}

const closedInvitation = {
  expired: "This invitation has expired. Ask an Owner to invite you again.",
  used: "This invitation has already been used. Sign in instead.",
  cancelled: "This invitation was cancelled. Ask an Owner to invite you again.",
  unknown: "This invitation link isn't valid.",
} as const;

/** Opens invitation acceptance, which is public to whoever holds an open invitation's token. */
export async function requireOpenInvitation(
  ctx: GuardCtx,
  token: string,
): Promise<Doc<"invitations">> {
  const found = await findInvitation(ctx, token);
  if (found.status !== "open") {
    throw new ConvexError({
      code: "INVITATION_CLOSED",
      status: found.status,
      message: closedInvitation[found.status],
    });
  }
  return found.invitation;
}
