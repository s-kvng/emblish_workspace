/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as backOffice_invitation from "../backOffice/invitation.js";
import type * as backOffice_staff from "../backOffice/staff.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_guards from "../lib/guards.js";
import type * as model_authUsers from "../model/authUsers.js";
import type * as model_email from "../model/email.js";
import type * as model_invitations from "../model/invitations.js";
import type * as model_settings from "../model/settings.js";
import type * as model_staff from "../model/staff.js";
import type * as system_bootstrap from "../system/bootstrap.js";
import type * as system_email from "../system/email.js";
import type * as system_invitations from "../system/invitations.js";
import type * as system_staff from "../system/staff.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "backOffice/invitation": typeof backOffice_invitation;
  "backOffice/staff": typeof backOffice_staff;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/guards": typeof lib_guards;
  "model/authUsers": typeof model_authUsers;
  "model/email": typeof model_email;
  "model/invitations": typeof model_invitations;
  "model/settings": typeof model_settings;
  "model/staff": typeof model_staff;
  "system/bootstrap": typeof system_bootstrap;
  "system/email": typeof system_email;
  "system/invitations": typeof system_invitations;
  "system/staff": typeof system_staff;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
