import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { staffRole } from "../schema";

/** The signed-in Staff member, for the Back Office's gate and More tab. */
export const me = query({
  args: {},
  returns: v.object({ name: v.string(), email: v.string(), role: staffRole }),
  handler: async (ctx) => {
    const { name, email, role } = await requireStaff(ctx);
    return { name, email, role };
  },
});
