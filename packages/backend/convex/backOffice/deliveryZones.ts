import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireOwner, requireStaff } from "../lib/guards";
import {
  createZone,
  listZones,
  setZoneActive,
  updateZone,
  zoneAsShown,
} from "../model/deliveryZones";

const zoneFields = {
  name: v.string(),
  areas: v.string(),
  /** Integer pesewas; leave it out for Elsewhere in Ghana. */
  fee: v.optional(v.number()),
};

/** Every Delivery Zone, active or not, in Checkout order. Any Staff member can look. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("deliveryZones"),
      name: v.string(),
      areas: v.string(),
      fee: v.optional(v.number()),
      isElsewhere: v.boolean(),
      active: v.boolean(),
      /** The Owner who last changed it, and when. */
      changedBy: v.optional(v.string()),
      changedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const zones = [];
    for (const zone of await listZones(ctx)) {
      const owner = zone.changedBy && (await ctx.db.get(zone.changedBy));
      zones.push({
        ...zoneAsShown(zone),
        active: zone.active,
        ...(zone.changedBy ? { changedBy: owner?.name ?? "Former Staff" } : {}),
        ...(zone.changedAt === undefined ? {} : { changedAt: zone.changedAt }),
      });
    }
    return zones;
  },
});

/** Zones and their fees are standing prices, so only an Owner changes them. */
export const create = mutation({
  args: { name: v.string(), areas: v.string(), fee: v.number() },
  returns: v.id("deliveryZones"),
  handler: async (ctx, fields) => {
    const owner = await requireOwner(ctx);
    return await createZone(ctx, owner, fields);
  },
});

export const update = mutation({
  args: { zoneId: v.id("deliveryZones"), ...zoneFields },
  returns: v.null(),
  handler: async (ctx, { zoneId, ...fields }) => {
    const owner = await requireOwner(ctx);
    await updateZone(ctx, owner, zoneId, fields);
    return null;
  },
});

export const setActive = mutation({
  args: { zoneId: v.id("deliveryZones"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { zoneId, active }) => {
    const owner = await requireOwner(ctx);
    await setZoneActive(ctx, owner, zoneId, active);
    return null;
  },
});
