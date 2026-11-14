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
import type * as backOffice_arrivals from "../backOffice/arrivals.js";
import type * as backOffice_categories from "../backOffice/categories.js";
import type * as backOffice_deliveryZones from "../backOffice/deliveryZones.js";
import type * as backOffice_invitation from "../backOffice/invitation.js";
import type * as backOffice_invoices from "../backOffice/invoices.js";
import type * as backOffice_orders from "../backOffice/orders.js";
import type * as backOffice_products from "../backOffice/products.js";
import type * as backOffice_refunds from "../backOffice/refunds.js";
import type * as backOffice_settings from "../backOffice/settings.js";
import type * as backOffice_staff from "../backOffice/staff.js";
import type * as backOffice_stock from "../backOffice/stock.js";
import type * as backOffice_windows from "../backOffice/windows.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_guards from "../lib/guards.js";
import type * as model_arkesel from "../model/arkesel.js";
import type * as model_arrivals from "../model/arrivals.js";
import type * as model_authUsers from "../model/authUsers.js";
import type * as model_catalog from "../model/catalog.js";
import type * as model_categories from "../model/categories.js";
import type * as model_checkout from "../model/checkout.js";
import type * as model_codes from "../model/codes.js";
import type * as model_customers from "../model/customers.js";
import type * as model_deliveryZones from "../model/deliveryZones.js";
import type * as model_email from "../model/email.js";
import type * as model_fulfilment from "../model/fulfilment.js";
import type * as model_invitations from "../model/invitations.js";
import type * as model_invoices from "../model/invoices.js";
import type * as model_money from "../model/money.js";
import type * as model_orders from "../model/orders.js";
import type * as model_orderWindows from "../model/orderWindows.js";
import type * as model_payments from "../model/payments.js";
import type * as model_products from "../model/products.js";
import type * as model_seev from "../model/seev.js";
import type * as model_refunds from "../model/refunds.js";
import type * as model_settings from "../model/settings.js";
import type * as model_shelf from "../model/shelf.js";
import type * as model_sms from "../model/sms.js";
import type * as model_staff from "../model/staff.js";
import type * as model_stock from "../model/stock.js";
import type * as storefront_catalog from "../storefront/catalog.js";
import type * as storefront_checkout from "../storefront/checkout.js";
import type * as storefront_customer from "../storefront/customer.js";
import type * as storefront_invoices from "../storefront/invoices.js";
import type * as storefront_orders from "../storefront/orders.js";
import type * as storefront_receipts from "../storefront/receipts.js";
import type * as system_bootstrap from "../system/bootstrap.js";
import type * as system_checkout from "../system/checkout.js";
import type * as system_customers from "../system/customers.js";
import type * as system_email from "../system/email.js";
import type * as system_invitations from "../system/invitations.js";
import type * as system_invoices from "../system/invoices.js";
import type * as system_seev from "../system/seev.js";
import type * as system_sms from "../system/sms.js";
import type * as system_staff from "../system/staff.js";
import type * as system_stock from "../system/stock.js";
import type * as system_windows from "../system/windows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "backOffice/arrivals": typeof backOffice_arrivals;
  "backOffice/categories": typeof backOffice_categories;
  "backOffice/deliveryZones": typeof backOffice_deliveryZones;
  "backOffice/invitation": typeof backOffice_invitation;
  "backOffice/invoices": typeof backOffice_invoices;
  "backOffice/orders": typeof backOffice_orders;
  "backOffice/products": typeof backOffice_products;
  "backOffice/refunds": typeof backOffice_refunds;
  "backOffice/settings": typeof backOffice_settings;
  "backOffice/staff": typeof backOffice_staff;
  "backOffice/stock": typeof backOffice_stock;
  "backOffice/windows": typeof backOffice_windows;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/guards": typeof lib_guards;
  "model/arkesel": typeof model_arkesel;
  "model/arrivals": typeof model_arrivals;
  "model/authUsers": typeof model_authUsers;
  "model/catalog": typeof model_catalog;
  "model/categories": typeof model_categories;
  "model/checkout": typeof model_checkout;
  "model/codes": typeof model_codes;
  "model/customers": typeof model_customers;
  "model/deliveryZones": typeof model_deliveryZones;
  "model/email": typeof model_email;
  "model/fulfilment": typeof model_fulfilment;
  "model/invitations": typeof model_invitations;
  "model/invoices": typeof model_invoices;
  "model/money": typeof model_money;
  "model/orders": typeof model_orders;
  "model/orderWindows": typeof model_orderWindows;
  "model/payments": typeof model_payments;
  "model/products": typeof model_products;
  "model/seev": typeof model_seev;
  "model/refunds": typeof model_refunds;
  "model/settings": typeof model_settings;
  "model/shelf": typeof model_shelf;
  "model/sms": typeof model_sms;
  "model/staff": typeof model_staff;
  "model/stock": typeof model_stock;
  "storefront/catalog": typeof storefront_catalog;
  "storefront/checkout": typeof storefront_checkout;
  "storefront/customer": typeof storefront_customer;
  "storefront/invoices": typeof storefront_invoices;
  "storefront/orders": typeof storefront_orders;
  "storefront/receipts": typeof storefront_receipts;
  "system/bootstrap": typeof system_bootstrap;
  "system/checkout": typeof system_checkout;
  "system/customers": typeof system_customers;
  "system/email": typeof system_email;
  "system/invitations": typeof system_invitations;
  "system/invoices": typeof system_invoices;
  "system/seev": typeof system_seev;
  "system/sms": typeof system_sms;
  "system/staff": typeof system_staff;
  "system/stock": typeof system_stock;
  "system/windows": typeof system_windows;
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
