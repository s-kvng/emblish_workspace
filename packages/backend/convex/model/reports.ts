import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { deliveryFeesToday, storeLines } from "./checkout";
import { keptUnits, type RefundKind, type RefundMethod } from "./refunds";
import { DAY } from "./reminderSchedule";

/** A Reports period: `from` inclusive, `to` exclusive, in ms. */
export type Period = { from: number; to: number };

/** The longest Custom period, which keeps each report's reads small. */
export const longestPeriodDays = 92;

/** Refuses a period that ends before it starts or runs longer than 92 days. */
export function checkPeriod({ from, to }: Period) {
  if (!(to > from) || to - from > longestPeriodDays * DAY) {
    throw new ConvexError({
      code: "INVALID_PERIOD",
      message: `Pick a period of 1 to ${longestPeriodDays} days.`,
    });
  }
}

/** Money in, in pesewas, by what it paid for. */
type MoneyIn = {
  storeItems: number;
  preorderItems: number;
  shippingFees: number;
  deliveryFees: number;
  unmatched: number;
  total: number;
};

function noMoney(): MoneyIn {
  return {
    storeItems: 0,
    preorderItems: 0,
    shippingFees: 0,
    deliveryFees: 0,
    unmatched: 0,
    total: 0,
  };
}

/** Every payment that arrived in the period, oldest first. */
async function paymentsIn(ctx: Pick<QueryCtx, "db">, { from, to }: Period) {
  return await ctx.db
    .query("payments")
    .withIndex("by_paidAt", (q) => q.gte("paidAt", from).lt("paidAt", to))
    .collect();
}

/**
 * What one payment paid for. A Checkout payment is split by its line snapshot: In-stock lines
 * are Store Order items, Pre-order lines Item Payments, plus the Delivery Fee it charged. An
 * invoice payment is split by the invoice's lines. A payment that settled nothing (a second
 * charge on a paid Checkout, an invoice no longer unpaid, or the wrong amount) is all Unmatched:
 * settlement flagged all of it as a Refund.
 */
async function splitPayment(ctx: Pick<QueryCtx, "db">, payment: Doc<"payments">): Promise<MoneyIn> {
  const split = noMoney();
  split.total = payment.amount;
  const checkout = payment.checkoutId && (await ctx.db.get(payment.checkoutId));
  const invoice = payment.invoiceId && (await ctx.db.get(payment.invoiceId));
  if (checkout && (await settledCheckout(ctx, checkout, payment))) {
    const store = storeLines(checkout.lines);
    split.storeItems = store.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    split.deliveryFees = deliveryFeesToday(checkout);
    split.preorderItems = payment.amount - split.storeItems - split.deliveryFees;
  } else if (invoice && invoice.paymentId === payment._id) {
    for (const line of invoice.lines) {
      if (line.kind === "shippingFee") split.shippingFees += line.amount;
      else split.deliveryFees += line.amount;
    }
  } else {
    split.unmatched = payment.amount;
  }
  return split;
}

/**
 * Whether this payment is the one that settled the Checkout: the first for its exact total.
 * Settlement refunds every other payment on it in full.
 */
async function settledCheckout(
  ctx: Pick<QueryCtx, "db">,
  checkout: Doc<"checkouts">,
  payment: Doc<"payments">,
) {
  if (payment.amount !== checkout.total) return false;
  // A Checkout has one payment, or a few when charged again: oldest first.
  const settling = (
    await ctx.db
      .query("payments")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
      .collect()
  ).find((other) => other.amount === checkout.total);
  return settling?._id === payment._id;
}

/** Every Refund marked refunded in the period, oldest first. */
async function refundsIn(ctx: Pick<QueryCtx, "db">, { from, to }: Period) {
  return await ctx.db
    .query("refunds")
    .withIndex("by_refundedAt", (q) => q.gte("refundedAt", from).lt("refundedAt", to))
    .collect();
}

/** Refunds paid out, totalled by kind, largest first. */
function refundedByKind(refunds: Doc<"refunds">[]) {
  const byKind = new Map<RefundKind, { kind: RefundKind; amount: number; count: number }>();
  for (const refund of refunds) {
    const row = byKind.get(refund.kind) ?? { kind: refund.kind, amount: 0, count: 0 };
    row.amount += refund.amount;
    row.count += 1;
    byKind.set(refund.kind, row);
  }
  return {
    total: refunds.reduce((sum, refund) => sum + refund.amount, 0),
    byKind: [...byKind.values()].sort((a, b) => b.amount - a.amount),
  };
}

/** Units sold and the pesewas they came to. */
type Sales = { units: number; amount: number };

type SellerRow = {
  store: Sales;
  preorder: Sales;
  /** Units only: Sold offline has no price, so it's in no GH₵ total. */
  soldOffline: number;
};
type VariantSeller = SellerRow & { variantId: Id<"variants">; variantLabel: string };
type ProductSeller = SellerRow & {
  productId: Id<"products">;
  productName: string;
  variants: VariantSeller[];
};

function noSales(): SellerRow {
  return { store: { units: 0, amount: 0 }, preorder: { units: 0, amount: 0 }, soldOffline: 0 };
}

/** Most GH₵ first, then most units, then by name. */
function bySales(a: SellerRow & { name: string }, b: SellerRow & { name: string }) {
  const amount = (row: SellerRow) => row.store.amount + row.preorder.amount;
  const units = (row: SellerRow) => row.store.units + row.preorder.units + row.soldOffline;
  return amount(b) - amount(a) || units(b) - units(a) || a.name.localeCompare(b.name);
}

/**
 * Best sellers: every Product sold in the period, each with its Variants. Units and GH₵ come
 * from the lines of orders paid in the period, at their frozen prices, less units cancelled or
 * refunded since, split Store vs Pre-order; Sold offline units come from Stock Movements.
 */
async function bestSellers(ctx: Pick<QueryCtx, "db">, { from, to }: Period) {
  const products = new Map<Id<"products">, ProductSeller>();
  const variants = new Map<Id<"variants">, VariantSeller>();

  /** The Variant's row, added under its Product the first time; names as frozen on a line. */
  async function rowFor(
    variantId: Id<"variants">,
    frozen?: { productName: string; variantLabel: string },
  ) {
    const known = variants.get(variantId);
    if (known) return known;
    const variant = await ctx.db.get(variantId);
    const product = variant && (await ctx.db.get(variant.productId));
    if (!variant) return null;
    let productRow = products.get(variant.productId);
    if (!productRow) {
      productRow = {
        productId: variant.productId,
        productName: product?.name ?? frozen?.productName ?? "",
        ...noSales(),
        variants: [],
      };
      products.set(variant.productId, productRow);
    }
    const row: VariantSeller = {
      variantId,
      variantLabel: frozen?.variantLabel ?? variant.optionValues.join(" / "),
      ...noSales(),
    };
    productRow.variants.push(row);
    variants.set(variantId, row);
    return row;
  }

  const orders = await ctx.db
    .query("orders")
    .withIndex("by_placedAt", (q) => q.gte("placedAt", from).lt("placedAt", to))
    .collect();
  for (const order of orders) {
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    for (const line of lines) {
      const units = keptUnits(line);
      const row = units > 0 ? await rowFor(line.variantId, line) : null;
      if (!row) continue;
      const sales = order.kind === "store" ? row.store : row.preorder;
      sales.units += units;
      sales.amount += units * line.unitPrice;
    }
  }

  const offline = await ctx.db
    .query("stockMovements")
    .withIndex("by_kind", (q) =>
      q.eq("kind", "soldOffline").gte("_creationTime", from).lt("_creationTime", to),
    )
    .collect();
  for (const movement of offline) {
    const row = await rowFor(movement.variantId);
    // Sold offline movements are negative: units out of Stock.
    if (row) row.soldOffline -= movement.quantity;
  }

  const rows = [...products.values()];
  for (const product of rows) {
    for (const variant of product.variants) {
      product.store.units += variant.store.units;
      product.store.amount += variant.store.amount;
      product.preorder.units += variant.preorder.units;
      product.preorder.amount += variant.preorder.amount;
      product.soldOffline += variant.soldOffline;
    }
    product.variants.sort((a, b) =>
      bySales({ ...a, name: a.variantLabel }, { ...b, name: b.variantLabel }),
    );
  }
  return rows.sort((a, b) => bySales({ ...a, name: a.productName }, { ...b, name: b.productName }));
}

/** Adds one split into a running total. */
function addMoney(into: MoneyIn, more: MoneyIn) {
  for (const key of Object.keys(into) as (keyof MoneyIn)[]) into[key] += more[key];
}

/** The Reports screen for a period. */
export async function reportSummary(ctx: Pick<QueryCtx, "db">, period: Period) {
  const payments = await paymentsIn(ctx, period);
  const moneyIn = noMoney();
  for (const payment of payments) addMoney(moneyIn, await splitPayment(ctx, payment));
  const refunded = refundedByKind(await refundsIn(ctx, period));
  return {
    moneyIn,
    payments: payments.length,
    refunded,
    net: moneyIn.total - refunded.total,
    bestSellers: await bestSellers(ctx, period),
  };
}

/** Refund kinds as the Back Office names them. */
const refundKindLabel: Record<RefundKind, string> = {
  shortfall: "Shortfall",
  latePaid: "Late-paid",
  cancelledLine: "Cancelled units",
  cancelledPreorder: "Cancelled Pre-order",
  afterHandover: "After handover",
  fulfilmentSwitch: "Fulfilment switch",
  discretionary: "Payment to check",
};

/** How a Refund was sent back, as Mark refunded offers it. */
const refundMethodLabel: Record<RefundMethod, string> = {
  seevDashboard: "Seev dashboard",
  mobileMoney: "Mobile money",
  cash: "Cash",
  other: "Other",
};

/** A day as `2026-11-15`, in GMT (Ghana's time all year). */
function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A moment as `2026-11-15 14:03`, in GMT. */
function isoMinute(ms: number) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** Pesewas as cedis with two decimals, e.g. -18000 → "-180.00". */
function cedis(pesewas: number) {
  return (pesewas / 100).toFixed(2);
}

/** One CSV field, quoted only when it has to be. */
function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The references of the orders a payment made, or the order its invoice was for. */
async function paymentOrders(ctx: Pick<QueryCtx, "db">, payment: Doc<"payments">) {
  const invoice = payment.invoiceId && (await ctx.db.get(payment.invoiceId));
  if (invoice) {
    const order = await ctx.db.get(invoice.orderId);
    return order ? [order.reference] : [];
  }
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
    .collect();
  return orders.map((order) => order.reference);
}

/** What a payment was for, as the CSV's Kind. */
async function paymentKind(ctx: Pick<QueryCtx, "db">, payment: Doc<"payments">) {
  const invoice = payment.invoiceId && (await ctx.db.get(payment.invoiceId));
  if (!invoice) return "Checkout";
  return invoice.kind === "shippingFee" ? "Shipping Fee Invoice" : "Delivery Fee Invoice";
}

/** The CSV's columns. There's no fee column: Seev reports no fee (ADR 0003). */
const csvHeader = ["Date (GMT)", "Receipt or refund", "Orders", "Kind", "Amount (GHS)", "Method"];

/**
 * The period as one CSV file: one row per payment (by when it arrived) and one per Refund paid
 * back (by when it was marked refunded, negative), oldest first. The Amount column adds up to
 * the period's Net.
 */
export async function reportCsv(ctx: Pick<QueryCtx, "db">, period: Period) {
  const rows: { at: number; fields: string[] }[] = [];
  for (const payment of await paymentsIn(ctx, period)) {
    rows.push({
      at: payment.paidAt,
      fields: [
        isoMinute(payment.paidAt),
        payment.receiptNumber,
        (await paymentOrders(ctx, payment)).join(" "),
        await paymentKind(ctx, payment),
        cedis(payment.amount),
        "Seev Plus",
      ],
    });
  }
  for (const refund of await refundsIn(ctx, period)) {
    const at = refund.refundedAt ?? 0;
    const order = refund.orderId && (await ctx.db.get(refund.orderId));
    const payment = !order ? await ctx.db.get(refund.paymentId) : null;
    rows.push({
      at,
      fields: [
        isoMinute(at),
        refund._id,
        order ? order.reference : payment ? (await paymentOrders(ctx, payment)).join(" ") : "",
        `Refund: ${refundKindLabel[refund.kind]}`,
        cedis(-refund.amount),
        refund.method ? refundMethodLabel[refund.method] : "",
      ],
    });
  }
  rows.sort((a, b) => a.at - b.at);
  const lines = [csvHeader, ...rows.map((row) => row.fields)];
  const lastDay = isoDay(period.to - 1);
  const firstDay = isoDay(period.from);
  return {
    filename: `emblish-${firstDay === lastDay ? firstDay : `${firstDay}-to-${lastDay}`}.csv`,
    csv: lines.map((fields) => `${fields.map(csvField).join(",")}\r\n`).join(""),
  };
}
