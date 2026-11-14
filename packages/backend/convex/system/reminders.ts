import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { sendDueReminders } from "../model/reminders";

/** The daily 10:00 UTC reminders run (`crons.ts`): invoice and uncollected reminders due today. */
export const sendDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await sendDueReminders(ctx, Date.now());
    return null;
  },
});
