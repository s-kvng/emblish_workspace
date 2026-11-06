import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
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
