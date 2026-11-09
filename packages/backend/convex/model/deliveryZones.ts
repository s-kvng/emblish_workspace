import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isGsm7 } from "./sms";

/** Zone names go into SMS copy, so they stay short. */
const maxNameLength = 40;

/** The name of the seeded zone whose fee Staff quote per order. */
export const elsewhereName = "Elsewhere in Ghana";

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** Every zone in the order Checkout offers them: fixed zones as added, Elsewhere last. */
export async function listZones(ctx: Pick<QueryCtx, "db">) {
  const zones = await ctx.db.query("deliveryZones").collect();
  return [...zones.filter((z) => !z.isElsewhere), ...zones.filter((z) => z.isElsewhere)];
}

/** A zone as both apps list it; a missing fee means Staff quote it per order. */
export function zoneAsShown({ _id, name, areas, fee, isElsewhere }: Doc<"deliveryZones">) {
  return { _id, name, areas, ...(fee === undefined ? {} : { fee }), isElsewhere };
}

/** Creates the Elsewhere in Ghana zone if it's missing; the bootstrap calls it. */
export async function seedElsewhere(ctx: Pick<MutationCtx, "db">) {
  const zones = await ctx.db.query("deliveryZones").collect();
  if (zones.some((zone) => zone.isElsewhere)) return;
  await ctx.db.insert("deliveryZones", {
    name: elsewhereName,
    areas: "Anywhere outside our zones. We text you the Delivery Fee before it's due.",
    isElsewhere: true,
    active: true,
  });
}

type ZoneFields = { name: string; areas: string; fee?: number };

function checkedFields(zone: Pick<Doc<"deliveryZones">, "isElsewhere"> | null, fields: ZoneFields) {
  const name = fields.name.trim();
  if (!name) refuse("INVALID_NAME", "Give the zone a name.");
  // A name SMS can't carry would make the payment SMS, and so settling the payment, fail.
  if (name.length > maxNameLength || !isGsm7(name)) {
    refuse(
      "INVALID_NAME",
      `Keep the name to ${maxNameLength} plain letters, numbers and punctuation (no ₵ or emoji).`,
    );
  }
  const areas = fields.areas.trim();
  if (zone?.isElsewhere) {
    if (fields.fee !== undefined) {
      refuse("ELSEWHERE_HAS_NO_FEE", `${name} is quoted per order, so it has no fee.`);
    }
    return { name, areas };
  }
  const { fee } = fields;
  if (fee === undefined || !Number.isSafeInteger(fee) || fee <= 0) {
    refuse("INVALID_FEE", "Enter a Delivery Fee above GH₵0, to the pesewa.");
  }
  return { name, areas, fee };
}

/** Zone fees are standing prices, so each change records the Owner and the time. */
function changed(owner: Doc<"staff">) {
  return { changedBy: owner._id, changedAt: Date.now() };
}

/** A new active fixed-fee zone. */
export async function createZone(
  ctx: Pick<MutationCtx, "db">,
  owner: Doc<"staff">,
  fields: ZoneFields,
) {
  return await ctx.db.insert("deliveryZones", {
    ...checkedFields(null, fields),
    isElsewhere: false,
    active: true,
    ...changed(owner),
  });
}

async function getZone(ctx: Pick<QueryCtx, "db">, zoneId: Id<"deliveryZones">) {
  const zone = await ctx.db.get(zoneId);
  if (!zone) refuse("NOT_FOUND", "That Delivery Zone doesn't exist.");
  return zone;
}

/** Renames a zone, or changes its areas or fee; orders keep the fee frozen at their Checkout. */
export async function updateZone(
  ctx: Pick<MutationCtx, "db">,
  owner: Doc<"staff">,
  zoneId: Id<"deliveryZones">,
  fields: ZoneFields,
) {
  const zone = await getZone(ctx, zoneId);
  await ctx.db.patch(zoneId, { ...checkedFields(zone, fields), ...changed(owner) });
}

/** Disables a zone so Checkout stops offering it, or brings it back. */
export async function setZoneActive(
  ctx: Pick<MutationCtx, "db">,
  owner: Doc<"staff">,
  zoneId: Id<"deliveryZones">,
  active: boolean,
) {
  await getZone(ctx, zoneId);
  await ctx.db.patch(zoneId, { active, ...changed(owner) });
}
