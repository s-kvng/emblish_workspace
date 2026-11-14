import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { announceWindows, describeAnnounceSheet } from "../model/alerts";

/**
 * The Announce sheet: the open windows to pick from, how many confirmed Alert Subscribers the
 * alert would text, the SMS for the picked windows, and the last alert sent.
 */
export const sheet = query({
  args: { windowIds: v.array(v.id("orderWindows")) },
  returns: v.object({
    windows: v.array(
      v.object({
        windowId: v.id("orderWindows"),
        productName: v.string(),
        number: v.number(),
        closesAt: v.number(),
        announcedAt: v.optional(v.number()),
      }),
    ),
    recipients: v.number(),
    preview: v.union(v.string(), v.null()),
    lastAlert: v.union(
      v.null(),
      v.object({
        sentAt: v.number(),
        products: v.array(v.string()),
        recipients: v.number(),
        staffName: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { windowIds }) => {
    await requireStaff(ctx);
    return await describeAnnounceSheet(ctx, windowIds);
  },
});

/**
 * Announce: texts one Window Alert naming the picked open windows to every confirmed Alert
 * Subscriber. At most one a day, from 08:00 to 20:00 Ghana time.
 */
export const announce = mutation({
  args: { windowIds: v.array(v.id("orderWindows")) },
  returns: v.null(),
  handler: async (ctx, { windowIds }) => {
    const staff = await requireStaff(ctx);
    await announceWindows(ctx, staff, windowIds);
    return null;
  },
});
