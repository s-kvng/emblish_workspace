import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { onHandDrift } from "../model/stock";

/**
 * Re-sums every Variant's Stock Movements and lists each one whose cached on-hand count
 * disagrees. Run on demand from the dashboard; an empty list means the counters are sound.
 * Held units are checked here once Stock Holds exist.
 */
export const checkConsistency = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      variantId: v.id("variants"),
      stockOnHand: v.number(),
      ledger: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const drifts = [];
    for await (const variant of ctx.db.query("variants")) {
      const drift = await onHandDrift(ctx, variant);
      if (drift) drifts.push(drift);
    }
    return drifts;
  },
});
