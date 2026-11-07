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
    // Source refs (Order Window, order, Pre-order) are added with the tables they point at.
  }).index("by_variant", ["variantId"]),

  // A single row, seeded by the bootstrap and edited by an Owner.
  settings: defineTable({
    /** Pickup address and hours, one field: the `{location}` in SMS copy. */
    location: v.string(),
    whatsappNumber: v.string(),
    callNumber: v.string(),
  }),
});
