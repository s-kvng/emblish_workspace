import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { reassignPhone as reassignCustomerPhone } from "../model/customers";

/**
 * Moves a Customer who lost their number to a new one, found through Today's search. Returns
 * the new number in E.164.
 */
export const reassignPhone = mutation({
  args: { customerId: v.id("customers"), phone: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    return await reassignCustomerPhone(ctx, { ...args, staffId: staff._id });
  },
});
