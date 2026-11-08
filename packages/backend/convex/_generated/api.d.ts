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
import type * as backOffice_categories from "../backOffice/categories.js";
import type * as backOffice_invitation from "../backOffice/invitation.js";
import type * as backOffice_products from "../backOffice/products.js";
import type * as backOffice_staff from "../backOffice/staff.js";
import type * as backOffice_stock from "../backOffice/stock.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_guards from "../lib/guards.js";
import type * as model_arkesel from "../model/arkesel.js";
import type * as model_authUsers from "../model/authUsers.js";
import type * as model_catalog from "../model/catalog.js";
import type * as model_categories from "../model/categories.js";
import type * as model_checkout from "../model/checkout.js";
import type * as model_codes from "../model/codes.js";
import type * as model_customers from "../model/customers.js";
import type * as model_email from "../model/email.js";
import type * as model_invitations from "../model/invitations.js";
import type * as model_money from "../model/money.js";
import type * as model_payments from "../model/payments.js";
import type * as model_products from "../model/products.js";
import type * as model_seev from "../model/seev.js";
import type * as model_settings from "../model/settings.js";
import type * as model_shelf from "../model/shelf.js";
import type * as model_sms from "../model/sms.js";
import type * as model_staff from "../model/staff.js";
import type * as model_stock from "../model/stock.js";
import type * as storefront_catalog from "../storefront/catalog.js";
import type * as storefront_checkout from "../storefront/checkout.js";
import type * as storefront_customer from "../storefront/customer.js";
import type * as storefront_receipts from "../storefront/receipts.js";
import type * as system_bootstrap from "../system/bootstrap.js";
import type * as system_checkout from "../system/checkout.js";
import type * as system_customers from "../system/customers.js";
import type * as system_email from "../system/email.js";
import type * as system_invitations from "../system/invitations.js";
import type * as system_seev from "../system/seev.js";
import type * as system_sms from "../system/sms.js";
import type * as system_staff from "../system/staff.js";
import type * as system_stock from "../system/stock.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "backOffice/categories": typeof backOffice_categories;
  "backOffice/invitation": typeof backOffice_invitation;
  "backOffice/products": typeof backOffice_products;
  "backOffice/staff": typeof backOffice_staff;
  "backOffice/stock": typeof backOffice_stock;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/guards": typeof lib_guards;
  "model/arkesel": typeof model_arkesel;
  "model/authUsers": typeof model_authUsers;
  "model/catalog": typeof model_catalog;
  "model/categories": typeof model_categories;
  "model/checkout": typeof model_checkout;
  "model/codes": typeof model_codes;
  "model/customers": typeof model_customers;
  "model/email": typeof model_email;
  "model/invitations": typeof model_invitations;
  "model/money": typeof model_money;
  "model/payments": typeof model_payments;
  "model/products": typeof model_products;
  "model/seev": typeof model_seev;
  "model/settings": typeof model_settings;
  "model/shelf": typeof model_shelf;
  "model/sms": typeof model_sms;
  "model/staff": typeof model_staff;
  "model/stock": typeof model_stock;
  "storefront/catalog": typeof storefront_catalog;
  "storefront/checkout": typeof storefront_checkout;
  "storefront/customer": typeof storefront_customer;
  "storefront/receipts": typeof storefront_receipts;
  "system/bootstrap": typeof system_bootstrap;
  "system/checkout": typeof system_checkout;
  "system/customers": typeof system_customers;
  "system/email": typeof system_email;
  "system/invitations": typeof system_invitations;
  "system/seev": typeof system_seev;
  "system/sms": typeof system_sms;
  "system/staff": typeof system_staff;
  "system/stock": typeof system_stock;
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
