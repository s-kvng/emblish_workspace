import { ConvexError, v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireOwner, requireStaff } from "../lib/guards";
import { fulfilmentAsShown, shownFulfilment } from "../model/fulfilment";
import {
  deliveryQuotable,
  invoicesOnOrder,
  quoteDeliveryFee as quoteOrderDeliveryFee,
} from "../model/invoices";
import {
  alsoReady,
  customerContact,
  dispatchable,
  dispatch as dispatchOrder,
  failDelivery,
  findCustomerForSearch,
  findOpenOrderByCode,
  handOverable,
  handOver as handOverOrders,
  latestRider,
  markDelivered as markOrderDelivered,
  orderHistory,
  orderLines,
  owedBack,
  primaryAction,
} from "../model/orders";
import {
  cancellable,
  cancelPreorder as cancelOrderPreorder,
  cancelUnits as cancelOrderUnits,
  handedOver,
  preorderCancellable,
  refundableDeliveryFee,
  refundAfterHandover as refundOrderAfterHandover,
} from "../model/refunds";
import { pickupLocation } from "../model/settings";
import {
  cancelReason,
  deliveryFailureReason,
  invoiceKind,
  invoiceStatus,
  orderEventKind,
  orderKind,
  orderStatus,
  overrideReason,
  refundLine,
} from "../schema";

const line = v.object({
  orderLineId: v.id("orderLines"),
  productName: v.string(),
  variantLabel: v.string(),
  /** Units paid for. */
  quantity: v.number(),
  unitPrice: v.number(),
  /** Of those, units cancelled before handover or refunded after it. */
  refundedQuantity: v.number(),
});

/** The lines with units left to hand over; fully cancelled ones aren't on the counter. */
function toHandOver<Line extends { quantity: number; refundedQuantity: number }>(lines: Line[]) {
  return lines.filter((line) => line.quantity > line.refundedQuantity);
}

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
        lines: toHandOver(await orderLines(ctx, other._id)),
      });
    }
    return {
      orderId: order._id,
      reference: order.reference,
      status: order.status,
      customer: customerContact(customer),
      lines: toHandOver(await orderLines(ctx, order._id)),
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

/** Sends a Ready Delivery order out with the rider taking it: it becomes Dispatched. */
export const dispatch = mutation({
  args: { orderId: v.id("orders"), riderName: v.string() },
  returns: v.null(),
  handler: async (ctx, { orderId, riderName }) => {
    const staff = await requireStaff(ctx);
    await dispatchOrder(ctx, staff, orderId, riderName);
    return null;
  },
});

/**
 * Any Staff member quotes an Elsewhere in Ghana Delivery Fee. It's billed on a Delivery Fee
 * Invoice texted to the Customer, or, on a Pre-order not yet invoiced, on its coming Shipping
 * Fee Invoice. The order can go out once every invoice on it is paid.
 */
export const quoteDeliveryFee = mutation({
  args: {
    orderId: v.id("orders"),
    /** Integer pesewas. */
    fee: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    await quoteOrderDeliveryFee(ctx, staff, args);
    return null;
  },
});

/** The rider handed it over: a Dispatched order becomes Delivered. */
export const markDelivered = mutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const staff = await requireStaff(ctx);
    await markOrderDelivered(ctx, staff, orderId);
    return null;
  },
});

/** The rider couldn't deliver: the attempt is recorded and the order is Ready again, no new fee. */
export const deliveryFailed = mutation({
  args: { orderId: v.id("orders"), reason: deliveryFailureReason, note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { orderId, reason, note }) => {
    const staff = await requireStaff(ctx);
    await failDelivery(ctx, staff, orderId, { reason, note });
    return null;
  },
});

/**
 * Cancels units on a Store Order before handover. They go back to Stock unless Staff say
 * otherwise, and their price is flagged as a Refund for the Owner to pay out.
 */
export const cancelUnits = mutation({
  args: {
    orderId: v.id("orders"),
    lines: v.array(refundLine),
    /** Defaults to true: the units are on the shelf, unharmed. */
    returnToStock: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    await cancelOrderUnits(ctx, staff, args);
    return null;
  },
});

/**
 * Cancels a whole Pre-order awaiting arrival, at any window stage; after "Ordered from supplier"
 * this is the only way. Its window's `preordered` counts drop and its Item Payment is flagged
 * as a `cancelledPreorder` Refund for the Owner to pay out.
 */
export const cancelPreorder = mutation({
  args: { orderId: v.id("orders"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    await cancelOrderPreorder(ctx, { kind: "staff", staff }, args);
    return null;
  },
});

/**
 * The Owner refunds a handed-over order: units and/or its paid Delivery Fee, with a reason.
 * Goods that came back can be restocked as Returned. The Refund waits on Refunds to make.
 */
export const refundAfterHandover = mutation({
  args: {
    orderId: v.id("orders"),
    lines: v.array(refundLine),
    /** Also refund the Delivery Fee paid on it, if any is left to refund. */
    deliveryFee: v.optional(v.boolean()),
    /** Defaults to false: the Customer usually keeps the goods. */
    returnToStock: v.optional(v.boolean()),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await refundOrderAfterHandover(ctx, owner, args);
    return null;
  },
});

/** Order detail: lines, payment, History with who did what, and the one primary action. */
export const get = query({
  args: { orderId: v.id("orders") },
  returns: v.object({
    orderId: v.id("orders"),
    kind: orderKind,
    reference: v.string(),
    status: orderStatus,
    placedAt: v.number(),
    customer: v.object({ name: v.optional(v.string()), phone: v.string() }),
    /** Pickup, or Delivery with the zone, frozen fee and address from Checkout. */
    fulfilment: shownFulfilment,
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
    /** Shipping Fee and Delivery Fee Invoices, oldest first. */
    invoices: v.array(
      v.object({
        kind: invoiceKind,
        number: v.string(),
        code: v.string(),
        status: invoiceStatus,
        total: v.number(),
        dueAt: v.number(),
        paidAt: v.optional(v.number()),
      }),
    ),
    /** Pesewas flagged for refund from this order's payment and not yet refunded. */
    toRefund: v.number(),
    /** On a cancelled Pre-order: whether the Customer or Staff cancelled it. */
    cancelReason: v.optional(cancelReason),
    /** Staff may cancel units: the goods are still with us. */
    canCancelUnits: v.boolean(),
    /** Staff may cancel the whole Pre-order: it's still awaiting arrival. */
    canCancelPreorder: v.boolean(),
    /** The Customer has the goods, so an Owner may refund after handover. */
    canRefundAfterHandover: v.boolean(),
    /** Pesewas of the paid Delivery Fee not yet flagged for refund. */
    refundableDeliveryFee: v.number(),
    /** Elsewhere in Ghana with no fee yet: Staff can quote it. */
    canQuoteDeliveryFee: v.boolean(),
    history: v.array(
      v.object({
        kind: orderEventKind,
        at: v.number(),
        /** The Staff member's name, or "System". */
        by: v.string(),
        overrideReason: v.optional(overrideReason),
        /** Who took it out, on a dispatch. */
        riderName: v.optional(v.string()),
        /** Why a Delivery attempt failed. */
        failureReason: v.optional(deliveryFailureReason),
        /** Units cancelled or refunded, on those events. */
        units: v.optional(v.number()),
        /** Pesewas flagged or paid back, on refund events. */
        amount: v.optional(v.number()),
        note: v.optional(v.string()),
      }),
    ),
    /** The sticky bar's one action for this state, or null when there's nothing to do. */
    primaryAction: v.union(
      v.literal("handOver"),
      v.literal("dispatch"),
      v.literal("markDelivered"),
      v.null(),
    ),
  }),
  handler: async (ctx, { orderId }) => {
    await requireStaff(ctx);
    const order = await ctx.db.get(orderId);
    const customer = order && (await ctx.db.get(order.customerId));
    if (!order || !customer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That order doesn't exist." });
    }
    const invoices = await invoicesOnOrder(ctx, order._id);
    // The Item Payment, then each paid invoice's payment.
    const payments = [];
    for (const paymentId of [order.paymentId, ...invoices.flatMap((i) => i.paymentId ?? [])]) {
      const payment = await ctx.db.get(paymentId);
      if (payment) {
        payments.push({
          receiptNumber: payment.receiptNumber,
          receiptCode: payment.receiptCode,
          amount: payment.amount,
          paidAt: payment.paidAt,
          seevReference: payment.seevReference,
        });
      }
    }
    return {
      orderId: order._id,
      kind: order.kind,
      reference: order.reference,
      status: order.status,
      placedAt: order.placedAt,
      customer: customerContact(customer),
      fulfilment: fulfilmentAsShown(order.fulfilment),
      pickupLocation: await pickupLocation(ctx),
      pickupCode: order.pickupCode,
      lines: await orderLines(ctx, order._id),
      payments,
      invoices: invoices.map(({ kind, number, code, status, total, dueAt, paidAt }) => ({
        kind,
        number,
        code,
        status,
        total,
        dueAt,
        ...(paidAt !== undefined ? { paidAt } : {}),
      })),
      toRefund: await owedBack(ctx, order),
      ...(order.cancelReason ? { cancelReason: order.cancelReason } : {}),
      canCancelUnits: cancellable(order),
      canCancelPreorder: await preorderCancellable(ctx, order),
      canRefundAfterHandover: handedOver(order),
      refundableDeliveryFee: await refundableDeliveryFee(ctx, order),
      canQuoteDeliveryFee: deliveryQuotable(order),
      history: await orderHistory(ctx, order._id),
      primaryAction: primaryAction(order),
    };
  },
});

/** A Delivery order on one of Today's queues: who it's for, where it goes and how much. */
const deliveryRow = {
  orderId: v.id("orders"),
  reference: v.string(),
  customerName: v.optional(v.string()),
  phone: v.string(),
  zoneName: v.string(),
  area: v.string(),
  units: v.number(),
};

/**
 * Today, the Back Office home: the Ready-for-pickup queue, then Delivery orders To dispatch and
 * Out for delivery, each longest waiting first.
 */
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
    /** Ready Delivery orders with every invoice paid, waiting for a rider. */
    toDispatch: v.array(v.object({ ...deliveryRow, readyAt: v.number() })),
    /** Dispatched and not yet Delivered, with the rider who took each. */
    outForDelivery: v.array(v.object({ ...deliveryRow, riderName: v.optional(v.string()) })),
  }),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const readyOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    const dispatchedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "dispatched"))
      .collect();

    const row = async (order: Doc<"orders">) => {
      const customer = await ctx.db.get(order.customerId);
      const lines = await orderLines(ctx, order._id);
      return {
        orderId: order._id,
        reference: order.reference,
        customerName: customer?.name,
        phone: customer?.phone ?? "",
        units: lines.reduce((sum, l) => sum + l.quantity - l.refundedQuantity, 0),
      };
    };
    const where = (order: Doc<"orders">) =>
      order.fulfilment.method === "delivery"
        ? { zoneName: order.fulfilment.zoneName, area: order.fulfilment.area }
        : { zoneName: "", area: "" };

    const ready = [];
    for (const order of readyOrders.filter(handOverable)) {
      ready.push({ ...(await row(order)), readyAt: order.readyAt ?? order.placedAt });
    }
    ready.sort((a, b) => a.readyAt - b.readyAt);

    const toDispatch = [];
    for (const order of readyOrders.filter(dispatchable)) {
      toDispatch.push({
        ...(await row(order)),
        ...where(order),
        readyAt: order.readyAt ?? order.placedAt,
      });
    }
    toDispatch.sort((a, b) => a.readyAt - b.readyAt);

    // Oldest order first: the index reads in creation order.
    const outForDelivery = [];
    for (const order of dispatchedOrders) {
      const riderName = await latestRider(ctx, order._id);
      outForDelivery.push({
        ...(await row(order)),
        ...where(order),
        ...(riderName ? { riderName } : {}),
      });
    }

    return { readyForPickup: ready.length, ready, toDispatch, outForDelivery };
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
