import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { getActiveStaff } from "../model/staff";

/** Asked by Better Auth before an email sign-in gets a session. */
export const mayStartBackOfficeSession = internalQuery({
  args: { authUserId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { authUserId }) => {
    return (await getActiveStaff(ctx, authUserId)) !== null;
  },
});
