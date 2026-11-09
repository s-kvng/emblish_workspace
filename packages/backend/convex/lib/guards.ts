import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getCustomer } from "../model/customers";
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

/**
 * The signed-in caller's identity, for a Storefront action: actions can't read the database,
 * so each hands `identity.subject` to an internal query that finishes the Customer check.
 */
export async function requireIdentity(ctx: Pick<QueryCtx, "auth">): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in with your phone number to continue.",
    });
  }
  return identity;
}

/** Opens every signed-in `storefront/` function: the caller must be a Customer. */
export async function requireCustomer(ctx: GuardCtx): Promise<Doc<"customers">> {
  const identity = await requireIdentity(ctx);
  const customer = await getCustomer(ctx, identity.subject);
  if (!customer) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only Customers can do this.",
    });
  }
  return customer;
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
