import type { MutationCtx } from "../_generated/server";

/** Creates the single `settings` row if it's missing; the Owner fills it in from the Back Office. */
export async function seedSettings(ctx: Pick<MutationCtx, "db">) {
  if ((await ctx.db.query("settings").first()) === null) {
    await ctx.db.insert("settings", { location: "", whatsappNumber: "", callNumber: "" });
  }
}
