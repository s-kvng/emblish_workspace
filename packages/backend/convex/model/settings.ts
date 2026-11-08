import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The pickup point's address and hours: the `{location}` setting, empty until set. */
export async function pickupLocation(ctx: Pick<QueryCtx, "db">) {
  return (await ctx.db.query("settings").first())?.location ?? "";
}

/** Creates the single `settings` row if it's missing; the Owner fills it in from the Back Office. */
export async function seedSettings(ctx: Pick<MutationCtx, "db">) {
  if ((await ctx.db.query("settings").first()) === null) {
    await ctx.db.insert("settings", { location: "", whatsappNumber: "", callNumber: "" });
  }
}
