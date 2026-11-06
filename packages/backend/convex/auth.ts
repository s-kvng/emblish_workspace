import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { APIError } from "better-auth/api";
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL!;
const nativeAppUrl = process.env.NATIVE_APP_URL || "emblish_workspace://";

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
});

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  return {
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, nativeAppUrl, "exp://"],
    database: authComponent.adapter(ctx),
    // Email + password is for Staff only, who are bootstrapped or invited.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
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
    plugins: [
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
