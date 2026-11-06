import type { Doc } from "../_generated/dataModel";
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
  return await ctx.db.insert("staff", { ...owner, role: "owner", status: "active" });
}
