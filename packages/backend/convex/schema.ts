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
/**
 * An Order Window's stages, in order. `draft` waits for the Owner's Pre-order prices and is
 * never shown to Customers; the stage list is fixed in code.
 */
export const windowStages = [
  "draft",
  "open",
  "closed",
  "orderedFromSupplier",
  "inTransit",
  "arrived",
] as const;
export const windowStage = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("orderedFromSupplier"),
  v.literal("inTransit"),
  v.literal("arrived"),
);
/** The stages Staff mark by hand ("Mark as <next>"); Closed is Close now, Arrived the arrival. */
export const markableStage = v.union(v.literal("orderedFromSupplier"), v.literal("inTransit"));
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
  v.literal("paymentConfirmedDelivery"),
  v.literal("paymentConfirmedQuoteDelivery"),
  v.literal("paymentConfirmedPreorder"),
  v.literal("paymentNotFilled"),
  v.literal("paymentUnmatched"),
  v.literal("stageOrdered"),
  v.literal("stageInTransit"),
);
/** A Checkout's life: `pending` while it awaits payment, then paid, or expired / released unpaid. */
export const checkoutStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("expired"),
  v.literal("released"),
);
/** A Checkout line as it was priced at Pay: In-stock, or a Pre-order in `orderWindowId`. */
export const checkoutLine = v.object({
  variantId: v.id("variants"),
  /** Set on a Pre-order line: the Order Window it's ordered in. */
  orderWindowId: v.optional(v.id("orderWindows")),
  productName: v.string(),
  /** The Variant's option values joined, e.g. "Red / M"; empty for a default Variant. */
  variantLabel: v.string(),
  quantity: v.number(),
  /** Integer pesewas: the Store Price, or the window's Pre-order price, at Pay. */
  unitPrice: v.number(),
});
/** The Delivery address as the Customer typed it at Checkout. */
const deliveryAddress = {
  recipientName: v.string(),
  /** E.164; the Customer's verified phone unless they changed it for a gift. */
  recipientPhone: v.string(),
  area: v.string(),
  street: v.optional(v.string()),
  /** Required: riders find people by landmark. */
  landmark: v.string(),
  /** GhanaPost GPS digital address, e.g. GA-123-4567. */
  ghanaPostGps: v.optional(v.string()),
};
/** Fulfilment chosen once at Checkout and frozen on each order it makes. */
export const fulfilment = v.union(
  v.object({ method: v.literal("pickup") }),
  v.object({
    method: v.literal("delivery"),
    zoneId: v.id("deliveryZones"),
    zoneName: v.string(),
    /** Integer pesewas per order, frozen at Checkout; missing for Elsewhere until quoted. */
    deliveryFee: v.optional(v.number()),
    ...deliveryAddress,
  }),
);
/** What the Customer picks at Checkout; the server looks up the zone and its fee. */
export const fulfilmentRequest = v.union(
  v.object({ method: v.literal("pickup") }),
  v.object({
    method: v.literal("delivery"),
    zoneId: v.id("deliveryZones"),
    ...deliveryAddress,
    /** Defaults to the Customer's name. */
    recipientName: v.optional(v.string()),
    /** Defaults to the Customer's verified phone; any Ghana format is accepted. */
    recipientPhone: v.optional(v.string()),
  }),
);
/** A Store Order (In-stock, paid in full) or a Pre-order (one Order Window); ADR 0002. */
export const orderKind = v.union(v.literal("store"), v.literal("preorder"));
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
/** Why Staff handed over without the Pickup Code, after checking ID. */
export const overrideReason = v.union(
  v.literal("lostSms"),
  v.literal("collectingForSomeone"),
  v.literal("phoneDead"),
  v.literal("other"),
);
/** Why a Delivery attempt failed; the order goes back to Ready with no new fee. */
export const deliveryFailureReason = v.union(
  v.literal("customerNotReachable"),
  v.literal("wrongAddress"),
  v.literal("customerRefused"),
  v.literal("riderIssue"),
);
/** Every kind of `orderEvents` row; more join with the actions that write them. */
export const orderEventKind = v.union(
  v.literal("paid"),
  v.literal("collected"),
  v.literal("dispatched"),
  v.literal("delivered"),
  v.literal("deliveryFailed"),
  v.literal("unitsCancelled"),
  v.literal("cancelled"),
  v.literal("refundFlagged"),
  v.literal("refunded"),
);
/** Who did something to an order: a Staff member, or the system (such as a verified payment). */
export const orderActor = v.union(
  v.object({ kind: v.literal("staff"), staffId: v.id("staff") }),
  v.object({ kind: v.literal("system") }),
);
export const refundKind = v.union(
  v.literal("shortfall"),
  v.literal("latePaid"),
  v.literal("cancelledLine"),
  v.literal("cancelledPreorder"),
  v.literal("afterHandover"),
  v.literal("fulfilmentSwitch"),
  v.literal("discretionary"),
);
/** How the Owner sent a Refund's money back; Seev has no refunds API (ADR 0004). */
export const refundMethod = v.union(
  v.literal("seevDashboard"),
  v.literal("mobileMoney"),
  v.literal("cash"),
  v.literal("other"),
);
/** Units of one order line a cancel or Refund covers. */
export const refundLine = v.object({
  orderLineId: v.id("orderLines"),
  quantity: v.number(),
});
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
    /** The next Order Window's number (W1, W2, …); missing reads as 1. */
    nextWindowNumber: v.optional(v.number()),
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

  // A period during which a Product takes Pre-orders; one supplier order, one arrival.
  orderWindows: defineTable({
    productId: v.id("products"),
    /** W1, W2, … per Product. */
    number: v.number(),
    stage: windowStage,
    /** When it opened; missing while it's a draft. */
    opensAt: v.optional(v.number()),
    /** When it closes on its own, unless Staff close it sooner or extend it. */
    closesAt: v.number(),
    /** Fewest units per Pre-order, counted across the Product's Variants. */
    minimumOrderQuantity: v.optional(v.number()),
    /** Integer pesewas per unit, shown to Customers as an estimate. */
    shippingFeeEstimate: v.optional(v.number()),
    /** The one `scheduler.runAt(closesAt)` auto-close job; Extend and Close now replace it. */
    closeJobId: v.optional(v.id("_scheduled_functions")),
    createdBy: v.id("staff"),
  })
    .index("by_product_and_stage", ["productId", "stage"])
    .index("by_stage_and_closesAt", ["stage", "closesAt"]),

  // One per Variant a window offers.
  windowVariants: defineTable({
    orderWindowId: v.id("orderWindows"),
    variantId: v.id("variants"),
    /** Integer pesewas. Only an Owner sets it; a window can't open without one on every row. */
    preorderPrice: v.optional(v.number()),
    /** Most units it takes across all Pre-orders; missing means uncapped. */
    cap: v.optional(v.number()),
    /** Cached units on paid Pre-orders. */
    preordered: v.number(),
    /** Cached units under active window-cap holds. */
    held: v.number(),
    /**
     * Extra units for Stock added to the supplier order, set when it's marked "Ordered from
     * supplier"; missing reads as 0.
     */
    storeQuantity: v.optional(v.number()),
  })
    .index("by_window", ["orderWindowId"])
    .index("by_variant", ["variantId"]),

  // A window's stage changes, oldest first: its timeline in the Back Office and for Customers.
  windowStageEvents: defineTable({
    orderWindowId: v.id("orderWindows"),
    stage: windowStage,
    /** Missing when the system did it, such as the auto-close. */
    staffId: v.optional(v.id("staff")),
    /** The expected arrival range Staff gave with it, as times on its first and last days. */
    expectedFrom: v.optional(v.number()),
    expectedTo: v.optional(v.number()),
    /** Staff's note to Customers. */
    note: v.optional(v.string()),
    /** How many Customers were texted about it; missing when no one was. */
    texted: v.optional(v.number()),
  }).index("by_window", ["orderWindowId"]),

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

  // Units a Checkout sets aside: In-stock units (`stock`), or units under a capped Order
  // Window's cap (`windowCap`). Uncapped Pre-order lines hold nothing. They end together.
  checkoutHolds: defineTable({
    checkoutId: v.id("checkouts"),
    kind: v.union(v.literal("stock"), v.literal("windowCap")),
    variantId: v.id("variants"),
    /** Set on a `windowCap` hold: the window whose cap it counts against. */
    orderWindowId: v.optional(v.id("orderWindows")),
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

  // Pre-orders and Store Orders (ADR 0002).
  orders: defineTable({
    kind: orderKind,
    /** `S-0001` for a Store Order, `P-0001` for a Pre-order. */
    reference: v.string(),
    /** Pre-orders only: the Order Window it was ordered in. */
    orderWindowId: v.optional(v.id("orderWindows")),
    /** Pre-orders only: integer pesewas of the payment that were its Item Payment. */
    itemPayment: v.optional(v.number()),
    customerId: v.id("customers"),
    checkoutId: v.id("checkouts"),
    paymentId: v.id("payments"),
    /** When its payment settled; earliest-placed Pre-orders are filled first on a Shortfall. */
    placedAt: v.number(),
    fulfilment,
    /** 6 digits, unique among open orders. */
    pickupCode: v.string(),
    status: orderStatus,
    readyAt: v.optional(v.number()),
  })
    .index("by_reference", ["reference"])
    .index("by_customer", ["customerId"])
    .index("by_orderWindow", ["orderWindowId"])
    .index("by_payment", ["paymentId"])
    .index("by_status", ["status"])
    .index("by_pickupCode_and_status", ["pickupCode", "status"]),

  // An order's lines, with names and prices frozen at payment.
  orderLines: defineTable({
    orderId: v.id("orders"),
    variantId: v.id("variants"),
    productName: v.string(),
    variantLabel: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
    /** Units cancelled before handover or refunded after it; missing reads as 0. */
    refundedQuantity: v.optional(v.number()),
  }).index("by_order", ["orderId"]),

  // Append-only: one row per order action, the audit trail and the order's History.
  orderEvents: defineTable({
    orderId: v.id("orders"),
    kind: orderEventKind,
    actor: orderActor,
    /** Set on a handover without the Pickup Code. */
    overrideReason: v.optional(overrideReason),
    /** Set on `dispatched`: who took the goods out. */
    riderName: v.optional(v.string()),
    /** Set on `deliveryFailed`. */
    failureReason: v.optional(deliveryFailureReason),
    /** Set on `unitsCancelled` and `refundFlagged`: how many units. */
    units: v.optional(v.number()),
    /** Pesewas, set on `unitsCancelled`, `refundFlagged` and `refunded`. */
    amount: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_order", ["orderId"]),

  // Money owed back to a Customer from one payment. Seev has no refunds API, so the Owner pays
  // it out by hand and marks it refunded (ADR 0004).
  refunds: defineTable({
    paymentId: v.id("payments"),
    orderId: v.optional(v.id("orders")),
    kind: refundKind,
    /** Integer pesewas, including `deliveryFee`. */
    amount: v.number(),
    status: v.union(v.literal("toRefund"), v.literal("refunded")),
    /** Why it was flagged. */
    note: v.optional(v.string()),
    /** Whether its units went back to Stock; missing on refunds from before cancels existed. */
    returnToStock: v.optional(v.boolean()),
    /** The order lines and units it covers, when it's for units. */
    lines: v.optional(v.array(refundLine)),
    /** Pesewas of `amount` that are the order's Delivery Fee. */
    deliveryFee: v.optional(v.number()),
    /** Who flagged it; missing when the system did, at settlement. */
    flaggedBy: v.optional(v.id("staff")),
    /** Set when the Owner marks it refunded. */
    refundedAt: v.optional(v.number()),
    refundedBy: v.optional(v.id("staff")),
    method: v.optional(refundMethod),
    /** The Owner's payout note, such as the MoMo transaction id. */
    refundNote: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_payment", ["paymentId"]),

  // One row per reference sequence (`S`, `R`, later `P` and `INV`), bumped where it's used.
  counters: defineTable({
    name: v.string(),
    next: v.number(),
  }).index("by_name", ["name"]),

  // Where the company delivers, each with a flat Delivery Fee only an Owner sets. Disabled,
  // never deleted. One seeded "Elsewhere in Ghana" row has no fee: Staff quote it per order.
  deliveryZones: defineTable({
    name: v.string(),
    /** The areas it covers, as Customers read them under the zone picker. */
    areas: v.string(),
    /** Integer pesewas per order; missing only on Elsewhere in Ghana. */
    fee: v.optional(v.number()),
    isElsewhere: v.boolean(),
    active: v.boolean(),
    /** The Owner behind the last change, and when; missing on the seeded Elsewhere row. */
    changedBy: v.optional(v.id("staff")),
    changedAt: v.optional(v.number()),
  }),

  // A single row, seeded by the bootstrap and edited by an Owner.
  settings: defineTable({
    /** Pickup address and hours, one field: the `{location}` in SMS copy. */
    location: v.string(),
    whatsappNumber: v.string(),
    callNumber: v.string(),
  }),
});
