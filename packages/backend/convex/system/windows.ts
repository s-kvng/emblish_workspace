import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { closeWindow } from "../model/orderWindows";

/**
 * Scheduled at `closesAt` when a window opens, and replaced by Extend and Close now. It closes
 * the window only if it's still open and due, so a stale run does nothing.
 */
export const close = internalMutation({
  args: { windowId: v.id("orderWindows") },
  returns: v.null(),
  handler: async (ctx, { windowId }) => {
    const window = await ctx.db.get(windowId);
    if (window && window.closesAt <= Date.now()) await closeWindow(ctx, window, undefined);
    return null;
  },
});
