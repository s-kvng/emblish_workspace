import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import {
  alsoReady,
  customerContact,
  findCustomerForSearch,
  findOpenOrderByCode,
  handOver as handOverOrders,
  handOverable,
  orderHistory,
  orderLines,
  owedBack,
} from "../model/orders";
import { pickupLocation } from "../model/settings";
import { orderEventKind, orderStatus, overrideReason } from "../schema";

const line = v.object({
  productName: v.string(),
  variantLabel: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
});

/**
 * The Counter's code-first lookup: the open order with this Pickup Code, as a handover card
 * with the Customer's other ready orders, or null so the keypad says "No order with that code".
 */
export const findByCode = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      orderId: v.id("orders"),
      reference: v.string(),
      status: orderStatus,
      customer: v.object({ name: v.optional(v.string()), phone: v.string() }),
      lines: v.array(line),
      alsoReady: v.array(
        v.object({ orderId: v.id("orders"), reference: v.string(), lines: v.array(line) }),
      ),
    }),
  ),
  handler: async (ctx, { code }) => {
    await requireStaff(ctx);
    const order = await findOpenOrderByCode(ctx, code.trim());
    const customer = order && (await ctx.db.get(order.customerId));
    if (!order || !customer) return null;
    const others = [];
    for (const other of await alsoReady(ctx, order)) {
      others.push({
        orderId: other._id,
        reference: other.reference,
        lines: await orderLines(ctx, other._id),
      });
    }
    return {
      orderId: order._id,
      reference: order.reference,
      status: order.status,
      customer: customerContact(customer),
      lines: await orderLines(ctx, order._id),
      alsoReady: others,
    };
  },
});

/** Marks the Customer's orders Collected: each with its Pickup Code or an override reason. */
export const handOver = mutation({
  args: {
    orders: v.array(
      v.object({
        orderId: v.id("orders"),
        code: v.optional(v.string()),
        override: v.optional(v.object({ reason: overrideReason, note: v.optional(v.string()) })),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { orders }) => {
    const staff = await requireStaff(ctx);
    await handOverOrders(ctx, staff, orders);
    return null;
  },
});

/** Order detail: lines, payment, History with who did what, and the one primary action. */
export const get = query({
  args: { orderId: v.id("orders") },
  returns: v.object({
    orderId: v.id("orders"),
    kind: v.literal("store"),
    reference: v.string(),
    status: orderStatus,
    placedAt: v.number(),
    customer: v.object({ name: v.optional(v.string()), phone: v.string() }),
    fulfilment: v.literal("pickup"),
    pickupLocation: v.string(),
    pickupCode: v.string(),
    lines: v.array(line),
    payments: v.array(
      v.object({
        receiptNumber: v.string(),
        receiptCode: v.string(),
        amount: v.number(),
        paidAt: v.number(),
        seevReference: v.string(),
      }),
    ),
    /** Pesewas flagged for refund from this order's payment and not yet refunded. */
    toRefund: v.number(),
    history: v.array(
      v.object({
        kind: orderEventKind,
        at: v.number(),
        /** The Staff member's name, or "System". */
        by: v.string(),
        overrideReason: v.optional(overrideReason),
        note: v.optional(v.string()),
      }),
    ),
    /** The sticky bar's one action for this state, or null when there's nothing to do. */
    primaryAction: v.union(v.literal("handOver"), v.null()),
  }),
  handler: async (ctx, { orderId }) => {
    await requireStaff(ctx);
    const order = await ctx.db.get(orderId);
    const customer = order && (await ctx.db.get(order.customerId));
    if (!order || !customer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That order doesn't exist." });
    }
    const payment = await ctx.db.get(order.paymentId);
    return {
      orderId: order._id,
      kind: order.kind,
      reference: order.reference,
      status: order.status,
      placedAt: order.placedAt,
      customer: customerContact(customer),
      fulfilment: order.fulfilment.method,
      pickupLocation: await pickupLocation(ctx),
      pickupCode: order.pickupCode,
      lines: await orderLines(ctx, order._id),
      payments: payment
        ? [
            {
              receiptNumber: payment.receiptNumber,
              receiptCode: payment.receiptCode,
              amount: payment.amount,
              paidAt: payment.paidAt,
              seevReference: payment.seevReference,
            },
          ]
        : [],
      toRefund: await owedBack(ctx, order),
      history: await orderHistory(ctx, order._id),
      primaryAction: handOverable(order) ? ("handOver" as const) : null,
    };
  },
});

/** Today, the Back Office home: the Ready-for-pickup queue, longest waiting first. */
export const today = query({
  args: {},
  returns: v.object({
    readyForPickup: v.number(),
    ready: v.array(
      v.object({
        orderId: v.id("orders"),
        reference: v.string(),
        customerName: v.optional(v.string()),
        phone: v.string(),
        units: v.number(),
        readyAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const orders = (
      await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", "ready"))
        .collect()
    ).filter(handOverable);
    const ready = [];
    for (const order of orders) {
      const customer = await ctx.db.get(order.customerId);
      const lines = await orderLines(ctx, order._id);
      ready.push({
        orderId: order._id,
        reference: order.reference,
        customerName: customer?.name,
        phone: customer?.phone ?? "",
        units: lines.reduce((sum, l) => sum + l.quantity, 0),
        readyAt: order.readyAt ?? order.placedAt,
      });
    }
    ready.sort((a, b) => a.readyAt - b.readyAt);
    return { readyForPickup: ready.length, ready };
  },
});

/**
 * Today's search: a Customer by phone number (as typed) or by an open order's Pickup Code,
 * with their orders newest first. Anything else finds nobody.
 */
export const search = query({
  args: { query: v.string() },
  returns: v.array(
    v.object({
      name: v.optional(v.string()),
      phone: v.string(),
      orders: v.array(
        v.object({
          orderId: v.id("orders"),
          reference: v.string(),
          status: orderStatus,
          placedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const customer = await findCustomerForSearch(ctx, args.query.trim());
    if (!customer) return [];
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .collect();
    return [
      {
        name: customer.name,
        phone: customer.phone,
        orders: orders.map((order) => ({
          orderId: order._id,
          reference: order.reference,
          status: order.status,
          placedAt: order.placedAt,
        })),
      },
    ];
  },
});
