import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";
import { phoneNumber } from "better-auth/plugins/phone-number";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { ghanaPhonePattern } from "./model/customers";

const siteUrl = process.env.SITE_URL!;
const daySeconds = 24 * 60 * 60;
/** Where email links land in the Back Office app. */
export const nativeAppUrl = process.env.NATIVE_APP_URL || "emblish-back-office://";

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
});

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  return {
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, nativeAppUrl, "exp://"],
    database: authComponent.adapter(ctx),
    // About 60 days, sliding: each day's first visit pushes the end out again.
    session: { expiresIn: 60 * daySeconds, updateAge: daySeconds },
    // Email + password is for Staff only, who are bootstrapped or invited.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      // A reset link is emailed to active Staff only; it signs them out everywhere once used.
      sendResetPassword: async ({ user, url }) => {
        await requireActionCtx(ctx).runMutation(internal.system.staff.emailPasswordReset, {
          authUserId: user.id,
          link: url,
        });
      },
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        // Routes a person to the right app; the `staff` table decides permissions.
        kind: {
          type: "string",
          required: true,
          defaultValue: "customer",
          input: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, endpoint) => {
            // Email sign-in is the Back Office's door: only active Staff get through.
            if (endpoint?.path !== "/sign-in/email") return;
            const allowed = await ctx.runQuery(internal.system.staff.mayStartBackOfficeSession, {
              authUserId: session.userId,
            });
            if (!allowed) {
              throw new APIError("FORBIDDEN", {
                code: "NOT_ACTIVE_STAFF",
                message: "Only active Staff can sign in to the Back Office.",
              });
            }
          },
        },
      },
    },
    hooks: {
      // A Customer's phone number never changes from the Storefront; Staff reassign it.
      before: createAuthMiddleware(async (endpoint) => {
        if (endpoint.path === "/phone-number/verify" && endpoint.body?.updatePhoneNumber) {
          throw new APIError("FORBIDDEN", {
            code: "PHONE_NUMBER_CANNOT_BE_UPDATED",
            message: "Ask us to change your phone number.",
          });
        }
      }),
    },
    plugins: [
      // A phone code is the Storefront's only door: no password, no email.
      phoneNumber({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 3,
        phoneNumberValidator: (phone) => ghanaPhonePattern.test(phone),
        sendOTP: async ({ phoneNumber: phone, code }) => {
          const { queued } = await requireActionCtx(ctx).runMutation(
            internal.system.sms.queueLoginCode,
            { phone, code },
          );
          if (!queued) {
            throw new APIError("TOO_MANY_REQUESTS", {
              code: "TOO_MANY_CODES",
              message: "That's a lot of codes for one number. Try again in an hour.",
            });
          }
        },
        signUpOnVerification: {
          // Better Auth needs an email; this one is never shown and can't receive mail.
          getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.emblish.invalid`,
        },
        callbackOnVerification: async ({ phoneNumber: phone, user }) => {
          if ((user as { kind?: string }).kind !== "customer") {
            throw new APIError("FORBIDDEN", {
              code: "NOT_A_CUSTOMER",
              message: "Staff sign in to the Back Office with their email.",
            });
          }
          await requireActionCtx(ctx).runMutation(internal.system.customers.recordSignIn, {
            authUserId: user.id,
            phone,
          });
        },
      }),
      expo(),
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx));
}
