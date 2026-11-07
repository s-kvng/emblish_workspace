import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCustomer } from "../lib/guards";

/** The signed-in Customer, as the Storefront shows them. */
export const me = query({
  args: {},
  returns: v.object({ phone: v.string(), name: v.optional(v.string()) }),
  handler: async (ctx) => {
    const customer = await requireCustomer(ctx);
    return { phone: customer.phone, name: customer.name };
  },
});
