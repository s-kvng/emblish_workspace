import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { queueWindowAlertBatch } from "../model/alerts";

/** Queues the next batch of a Window Alert's texts; scheduled by Announce, then by itself. */
export const queueBatch = internalMutation({
  args: {
    windowAlertId: v.id("windowAlerts"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { windowAlertId, cursor }) => {
    await queueWindowAlertBatch(ctx, windowAlertId, cursor);
    return null;
  },
});
