import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const staffRole = v.union(v.literal("owner"), v.literal("staff"));
export const staffStatus = v.union(v.literal("active"), v.literal("deactivated"));
export const productStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);
export const productOption = v.object({
  name: v.string(),
  values: v.array(v.string()),
});
/** Every way Stock changes; see GLOSSARY.md, Stock Movement. */
export const stockMovementKind = v.union(
  v.literal("arrival"),
  v.literal("lateArrival"),
  v.literal("released"),
  v.literal("sold"),
  v.literal("cancelled"),
  v.literal("returned"),
  v.literal("soldOffline"),
  v.literal("adjustment"),
);
/** The reason chips on an Adjustment. */
export const adjustmentReason = v.union(
  v.literal("damaged"),
  v.literal("lost"),
  v.literal("recount"),
  v.literal("found"),
  v.literal("other"),
);
/** The outbox's states: `queued` until Arkesel takes it, then its delivery report decides. */
export const smsStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("failed"),
);
/** Keys of `model/sms` templates; add one here with each new template. */
export const smsTemplate = v.union(
  v.literal("loginCode"),
  v.literal("paymentConfirmed"),
  v.literal("paymentNotFilled"),
  v.literal("paymentUnmatched"),
);
/** A Checkout's life: `pending` while it awaits payment, then paid, or expired / released unpaid. */
export const checkoutStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("expired"),
  v.literal("released"),
);
/** A Checkout line as it was priced at Pay. */
export const checkoutLine = v.object({
  variantId: v.id("variants"),
  productName: v.string(),
  /** The Variant's option values joined, e.g. "Red / M"; empty for a default Variant. */
  variantLabel: v.string(),
  quantity: v.number(),
  /** Integer pesewas: the Store Price at Pay. */
  unitPrice: v.number(),
});
/** Fulfilment chosen once at Checkout; Delivery joins it with Delivery Zones. */
export const fulfilment = v.object({ method: v.literal("pickup") });
/** Shared by both order kinds; see the data-model decision. */
export const orderStatus = v.union(
  v.literal("awaitingArrival"),
  v.literal("paymentDue"),
  v.literal("ready"),
  v.literal("collected"),
  v.literal("dispatched"),
  v.literal("delivered"),
  v.literal("cancelled"),
  v.literal("forfeited"),
);
/** Statuses where an order's goods are still to be handed over, so its Pickup Code is live. */
export const openOrderStatuses = ["awaitingArrival", "paymentDue", "ready", "dispatched"] as const;
export const refundKind = v.union(
  v.literal("shortfall"),
  v.literal("latePaid"),
  v.literal("cancelledLine"),
  v.literal("cancelledPreorder"),
  v.literal("afterHandover"),
  v.literal("fulfilmentSwitch"),
  v.literal("discretionary"),
);
const invitationStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("cancelled"),
);

export default defineSchema({
  // The source of truth for Back Office permissions; Better Auth's `kind` only routes.
  staff: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: staffRole,
    status: staffStatus,
  })
    .index("by_authUser", ["authUserId"])
    .index("by_email", ["email"])
    .index("by_role_and_status", ["role", "status"]),

  // An Owner's emailed invitation to join as Staff; its link works until `expiresAt`.
  invitations: defineTable({
    email: v.string(),
    role: staffRole,
    token: v.string(),
    expiresAt: v.number(),
    status: invitationStatus,
    invitedBy: v.id("staff"),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"])
    .index("by_status", ["status"]),

  // Comes into being on a phone number's first verified sign-in; later sign-ins reuse it.
  customers: defineTable({
    authUserId: v.string(),
    /** E.164, e.g. +233241234567; the number they verified. */
    phone: v.string(),
    /** Asked once at the first Checkout; missing until then. */
    name: v.optional(v.string()),
  })
    .index("by_authUser", ["authUserId"])
    .index("by_phone", ["phone"]),

  // The SMS outbox and the log Staff see. Mutations insert a row and schedule
  // `system/sms.send`; only that action calls Arkesel, and its callback moves the status on.
  smsMessages: defineTable({
    /** E.164, e.g. +233241234567. */
    to: v.string(),
    /** The `model/sms` template the body was rendered from. */
    template: smsTemplate,
    /** As sent, except that secrets such as a login code are masked once it's sent. */
    body: v.string(),
    status: smsStatus,
    arkeselId: v.optional(v.string()),
    /** Why Arkesel refused it or reported it undelivered. */
    error: v.optional(v.string()),
    /** The message this one resends. */
    resendOf: v.optional(v.id("smsMessages")),
    // Refs to the order, invoice, window or subscriber are added with those tables.
  })
    .index("by_to_and_template", ["to", "template"])
    .index("by_arkeselId", ["arkeselId"])
    .index("by_status", ["status"]),

  // A flat list, shown on the Storefront in `sortOrder`.
  categories: defineTable({
    name: v.string(),
    sortOrder: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),

  products: defineTable({
    name: v.string(),
    /** The Storefront URL name, unique across the store and kept when the Product is renamed. */
    slug: v.string(),
    description: v.string(),
    /** Missing only on a Draft; publishing needs one. */
    categoryId: v.optional(v.id("categories")),
    status: productStatus,
    /** Ordered photos; the first is the cover. */
    gallery: v.array(v.id("_storage")),
    /** Up to 3; every combination of their values is a Variant. */
    options: v.array(productOption),
    /** Offered In-stock at its Store Prices; off means Pre-order only, through Order Windows. */
    sellInStock: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_category", ["status", "categoryId"]),

  variants: defineTable({
    productId: v.id("products"),
    /** One value per Product option, in option order; empty for the default Variant. */
    optionValues: v.array(v.string()),
    /** Unique across the store; missing only while the Product is a Draft. */
    sku: v.optional(v.string()),
    /** Integer pesewas. Only an Owner sets it. */
    storePrice: v.optional(v.number()),
    /** One of the Product's gallery photos; the Storefront falls back to the cover. */
    imageId: v.optional(v.id("_storage")),
    /**
     * Cached sum of the Variant's Stock Movements, written in the same mutation as each one.
     * Missing (read as 0) on Variants saved before Stock existed; read it through `stockCounts`.
     */
    stockOnHand: v.optional(v.number()),
    /** Cached units under active Stock Holds. Available = on-hand − held. */
    stockHeld: v.optional(v.number()),
  })
    .index("by_product", ["productId"])
    .index("by_sku", ["sku"]),

  // Append-only: Stock is the sum of a Variant's rows, never edited directly.
  stockMovements: defineTable({
    variantId: v.id("variants"),
    kind: stockMovementKind,
    /** Signed whole units: positive into Stock, negative out of it. */
    quantity: v.number(),
    /** Required on an Adjustment. */
    reason: v.optional(adjustmentReason),
    note: v.optional(v.string()),
    /** Missing when the system made the movement, such as a paid checkout. */
    staffId: v.optional(v.id("staff")),
    /** The order a Sold movement filled. */
    orderId: v.optional(v.id("orders")),
    // Source refs (Order Window, Pre-order) are added with the tables they point at.
  }).index("by_variant", ["variantId"]),

  // A submitted Bag awaiting one payment. Created at Pay with its Stock Holds; unpaid, it
  // expires as a whole at `expiresAt` (a `scheduler.runAt` job) or is released when the Bag changes.
  checkouts: defineTable({
    customerId: v.id("customers"),
    lines: v.array(checkoutLine),
    fulfilment,
    /** Integer pesewas: what the payment must cover. */
    total: v.number(),
    status: checkoutStatus,
    expiresAt: v.number(),
  }).index("by_customer_and_status", ["customerId", "status"]),

  // Units a Checkout sets aside. Stock-kind only for now; Order Window caps add `windowCap`.
  checkoutHolds: defineTable({
    checkoutId: v.id("checkouts"),
    kind: v.literal("stock"),
    variantId: v.id("variants"),
    quantity: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("converted"),
      v.literal("lapsed"),
      v.literal("released"),
    ),
  }).index("by_checkout", ["checkoutId"]),

  // One Seev Plus hosted-checkout session per Pay or retry (ADR 0003). Maps Seev's reference
  // back to the Checkout and drives the polling; `settledAt` is set once it's verified paid.
  paymentSessions: defineTable({
    checkoutId: v.id("checkouts"),
    reference: v.string(),
    checkoutUrl: v.string(),
    /** When Seev stops accepting payment on it. */
    expiresAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_reference", ["reference"])
    .index("by_checkout", ["checkoutId"]),

  // One row per verified Seev payment; a Receipt is a rendering of one.
  payments: defineTable({
    seevReference: v.string(),
    /** Integer pesewas, as Seev's verify route reported it. */
    amount: v.number(),
    paidAt: v.number(),
    customerId: v.id("customers"),
    checkoutId: v.id("checkouts"),
    /** `R-0001`, shown on the Receipt. */
    receiptNumber: v.string(),
    /** 8 characters, the Receipt's public `/r/<code>`. */
    receiptCode: v.string(),
  })
    .index("by_reference", ["seevReference"])
    .index("by_receiptCode", ["receiptCode"])
    .index("by_customer", ["customerId"])
    .index("by_checkout", ["checkoutId"]),

  // Pre-orders and Store Orders (ADR 0002). Only Store Orders exist so far.
  orders: defineTable({
    kind: v.literal("store"),
    /** `S-0001`. */
    reference: v.string(),
    customerId: v.id("customers"),
    checkoutId: v.id("checkouts"),
    paymentId: v.id("payments"),
    placedAt: v.number(),
    fulfilment,
    /** 6 digits, unique among open orders. */
    pickupCode: v.string(),
    status: orderStatus,
    readyAt: v.optional(v.number()),
  })
    .index("by_reference", ["reference"])
    .index("by_customer", ["customerId"])
    .index("by_payment", ["paymentId"])
    .index("by_pickupCode_and_status", ["pickupCode", "status"]),

  // An order's lines, with names and prices frozen at payment.
  orderLines: defineTable({
    orderId: v.id("orders"),
    variantId: v.id("variants"),
    productName: v.string(),
    variantLabel: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
  }).index("by_order", ["orderId"]),

  // Money owed back to a Customer from one payment. Paying it out comes with the refunds ticket.
  refunds: defineTable({
    paymentId: v.id("payments"),
    orderId: v.optional(v.id("orders")),
    kind: refundKind,
    /** Integer pesewas. */
    amount: v.number(),
    status: v.union(
      v.literal("toRefund"),
      v.literal("processing"),
      v.literal("refunded"),
      v.literal("needsAttention"),
    ),
    note: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_payment", ["paymentId"]),

  // One row per reference sequence (`S`, `R`, later `P` and `INV`), bumped where it's used.
  counters: defineTable({
    name: v.string(),
    next: v.number(),
  }).index("by_name", ["name"]),

  // A single row, seeded by the bootstrap and edited by an Owner.
  settings: defineTable({
    /** Pickup address and hours, one field: the `{location}` in SMS copy. */
    location: v.string(),
    whatsappNumber: v.string(),
    callNumber: v.string(),
  }),
});
