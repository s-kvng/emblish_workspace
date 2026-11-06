import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { sendEmail } from "../model/email";

/** Mutations schedule this rather than calling Resend themselves. */
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, email) => {
    await sendEmail(email);
    return null;
  },
});
