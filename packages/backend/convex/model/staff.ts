import { ConvexError } from "convex/values";

import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The Staff member behind a Better Auth user, or null if there's none or they're deactivated. */
export async function getActiveStaff(
  ctx: Pick<QueryCtx, "db">,
  authUserId: string,
): Promise<Doc<"staff"> | null> {
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_authUser", (q) => q.eq("authUserId", authUserId))
    .unique();
  return staff?.status === "active" ? staff : null;
}

/** Whether anyone has ever been made Staff; the first Owner is bootstrapped only before that. */
export async function hasAnyStaff(ctx: Pick<QueryCtx, "db">): Promise<boolean> {
  return (await ctx.db.query("staff").first()) !== null;
}

/** Records the first Owner, refusing if there is already any Staff member. */
export async function insertFirstOwner(
  ctx: Pick<MutationCtx, "db">,
  owner: Pick<Doc<"staff">, "authUserId" | "email" | "name">,
) {
  if (await hasAnyStaff(ctx)) {
    throw new Error("Staff already exist, so the first Owner is already bootstrapped.");
  }
  return await ctx.db.insert("staff", {
    ...owner,
    role: "owner",
    status: "active",
  });
}

/** Staff emails are stored trimmed and lower-cased, as Better Auth stores them. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** The Staff member with this email, whatever their status. */
export async function findStaffByEmail(ctx: Pick<QueryCtx, "db">, email: string) {
  return await ctx.db
    .query("staff")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

async function getStaffMember(ctx: Pick<QueryCtx, "db">, staffId: Id<"staff">) {
  const staff = await ctx.db.get(staffId);
  if (!staff) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "That Staff member doesn't exist.",
    });
  }
  return staff;
}

/** There is always at least one active Owner, so the last one can't step down or be switched off. */
async function assertAnotherActiveOwner(ctx: Pick<QueryCtx, "db">, staff: Doc<"staff">) {
  if (staff.role !== "owner" || staff.status !== "active") return;
  const activeOwners = await ctx.db
    .query("staff")
    .withIndex("by_role_and_status", (q) => q.eq("role", "owner").eq("status", "active"))
    .take(2);
  if (activeOwners.length < 2) {
    throw new ConvexError({
      code: "LAST_OWNER",
      message: `${staff.name} is the last active Owner. Make someone else an Owner first.`,
    });
  }
}

export async function setStaffRole(
  ctx: Pick<MutationCtx, "db">,
  staffId: Id<"staff">,
  role: Doc<"staff">["role"],
) {
  const staff = await getStaffMember(ctx, staffId);
  if (staff.role === role) return;
  await assertAnotherActiveOwner(ctx, staff);
  await ctx.db.patch(staffId, { role });
}

/** Deactivate, never delete: their name stays on what they did, and every session ends now. */
export async function deactivateStaff(
  ctx: Pick<MutationCtx, "db" | "runMutation">,
  staffId: Id<"staff">,
) {
  const staff = await getStaffMember(ctx, staffId);
  if (staff.status === "deactivated") return;
  await assertAnotherActiveOwner(ctx, staff);
  await ctx.db.patch(staffId, { status: "deactivated" });
  // Every page, so no session survives however many devices they used.
  let cursor: string | null = null;
  do {
    const deleted: { isDone: boolean; continueCursor: string } = await ctx.runMutation(
      components.betterAuth.adapter.deleteMany,
      {
        input: { model: "session", where: [{ field: "userId", value: staff.authUserId }] },
        paginationOpts: { cursor, numItems: 100 },
      },
    );
    cursor = deleted.isDone ? null : deleted.continueCursor;
  } while (cursor !== null);
}

export async function reactivateStaff(ctx: Pick<MutationCtx, "db">, staffId: Id<"staff">) {
  await getStaffMember(ctx, staffId);
  await ctx.db.patch(staffId, { status: "active" });
}
