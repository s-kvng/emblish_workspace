import { ConvexError } from "convex/values";

import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { endAllSessions } from "./sessions";

/** Ghana numbers only, in E.164: +233 then 9 digits of a mobile number. */
export const ghanaPhonePattern = /^\+233[25]\d{8}$/;

/** Better Auth needs an email for every user; a Customer's is this one, never shown and undeliverable. */
export function phoneSignInEmail(phone: string) {
  return `${phone.replace(/\D/g, "")}@phone.emblish.invalid`;
}

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

/**
 * Moves a Customer to a new phone number, after Staff have checked who they are offline. The
 * new number signs in to this Customer from now on; the old one would start a new Customer.
 */
export async function reassignPhone(
  ctx: Pick<MutationCtx, "db" | "runMutation">,
  {
    customerId,
    phone: typed,
    staffId,
  }: { customerId: Id<"customers">; phone: string; staffId: Id<"staff"> },
) {
  const customer = await ctx.db.get(customerId);
  if (!customer) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That Customer doesn't exist." });
  }
  const phone = toGhanaPhone(typed);
  if (!phone) {
    throw new ConvexError({
      code: "INVALID_PHONE",
      message: "Enter a Ghana mobile number, like 024 123 4567.",
    });
  }

  if (phone === customer.phone) {
    throw new ConvexError({ code: "SAME_PHONE", message: `${phone} is already their number.` });
  }
  const holder = await ctx.db
    .query("customers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
  if (holder) {
    throw new ConvexError({
      code: "PHONE_IN_USE",
      message: `${phone} already belongs to another Customer.`,
    });
  }

  await ctx.db.patch(customerId, { phone });
  await ctx.db.insert("phoneReassignments", {
    customerId,
    oldPhone: customer.phone,
    newPhone: phone,
    staffId,
  });
  // The email moves with the number, so the old number can sign up afresh without a clash.
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: customer.authUserId }],
      update: {
        phoneNumber: phone,
        phoneNumberVerified: true,
        email: phoneSignInEmail(phone),
        updatedAt: Date.now(),
      },
    },
  });
  // A lost number is often a lost phone, still signed in: they sign in again with the new one.
  await endAllSessions(ctx, customer.authUserId);
  return phone;
}
