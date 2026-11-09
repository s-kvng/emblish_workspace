import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { seedElsewhere } from "./deliveryZones";

/** The pickup point's address and hours: the `{location}` setting, empty until set. */
export async function pickupLocation(ctx: Pick<QueryCtx, "db">) {
  return (await ctx.db.query("settings").first())?.location ?? "";
}

/**
 * Creates the single `settings` row and the Elsewhere in Ghana zone if either is missing;
 * the Owner fills them in from the Back Office.
 */
export async function seedSettings(ctx: Pick<MutationCtx, "db">) {
  if ((await ctx.db.query("settings").first()) === null) {
    await ctx.db.insert("settings", { location: "", whatsappNumber: "", callNumber: "" });
  }
  await seedElsewhere(ctx);
}

export type StoreSettings = Pick<Doc<"settings">, "location" | "whatsappNumber" | "callNumber">;

/** The store settings as the Back Office edits them, blank until an Owner fills them in. */
export async function getSettings(ctx: Pick<QueryCtx, "db">): Promise<StoreSettings> {
  const row = await ctx.db.query("settings").first();
  return {
    location: row?.location ?? "",
    whatsappNumber: row?.whatsappNumber ?? "",
    callNumber: row?.callNumber ?? "",
  };
}

/** Saves the store settings, trimmed, creating the row if the bootstrap never did. */
export async function updateSettings(ctx: Pick<MutationCtx, "db">, settings: StoreSettings) {
  const trimmed = {
    location: settings.location.trim(),
    whatsappNumber: settings.whatsappNumber.trim(),
    callNumber: settings.callNumber.trim(),
  };
  const row = await ctx.db.query("settings").first();
  if (row) await ctx.db.patch(row._id, trimmed);
  else await ctx.db.insert("settings", trimmed);
}
