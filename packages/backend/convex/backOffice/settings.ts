import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireOwner, requireStaff } from "../lib/guards";
import { getSettings, updateSettings } from "../model/settings";

const settingsFields = {
  /** Pickup address and hours in one field, as the Pickup step, Receipt and SMS show it. */
  location: v.string(),
  whatsappNumber: v.string(),
  callNumber: v.string(),
};

/** More → Store settings. Any Staff member can read them. */
export const get = query({
  args: {},
  returns: v.object(settingsFields),
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await getSettings(ctx);
  },
});

/** Only an Owner edits the store settings. */
export const update = mutation({
  args: settingsFields,
  returns: v.null(),
  handler: async (ctx, settings) => {
    await requireOwner(ctx);
    await updateSettings(ctx, settings);
    return null;
  },
});
