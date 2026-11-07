import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Ghana numbers only, in E.164: +233 then 9 digits of a mobile number. */
export const ghanaPhonePattern = /^\+233[25]\d{8}$/;

export function getCustomer(
  ctx: Pick<QueryCtx, "db">,
  authUserId: string,
): Promise<Doc<"customers"> | null> {
  return ctx.db
    .query("customers")
    .withIndex("by_authUser", (q) => q.eq("authUserId", authUserId))
    .unique();
}

/**
 * A Ghana number as a Customer might type it (024 123 4567, 241234567, +233 24 123 4567)
 * in E.164, or null when it isn't one.
 */
export function toGhanaPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const local = digits.replace(/^(\+?233|0)/, "");
  const phone = `+233${local}`;
  return ghanaPhonePattern.test(phone) ? phone : null;
}
