import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { findInvoiceByCode } from "../model/invoices";
import { pollEveryMs } from "./seev";

/**
 * What Pay at `/p/` sends Seev for an unpaid invoice, or why it can't: `notFound` for an unknown
 * code, `paid` once it's paid, `void` once it was replaced or cancelled.
 */
export const paymentRequest = internalQuery({
  args: { code: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("notFound") }),
    v.object({ kind: v.literal("paid") }),
    v.object({ kind: v.literal("void") }),
    v.object({
      kind: v.literal("open"),
      invoiceId: v.id("invoices"),
      code: v.string(),
      name: v.string(),
      phone: v.string(),
      items: v.array(v.object({ name: v.string(), quantity: v.number(), price: v.number() })),
      tries: v.number(),
    }),
  ),
  handler: async (ctx, { code }) => {
    const invoice = await findInvoiceByCode(ctx, code.trim().toUpperCase());
    const order = invoice && (await ctx.db.get(invoice.orderId));
    const customer = order && (await ctx.db.get(order.customerId));
    if (!invoice || !order || !customer) return { kind: "notFound" as const };
    if (invoice.status === "paid") return { kind: "paid" as const };
    if (invoice.status === "void") return { kind: "void" as const };
    const sessions = await ctx.db
      .query("paymentSessions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
      .collect();
    const items = [];
    for (const line of invoice.lines) {
      if (line.amount === 0) continue;
      items.push(
        line.kind === "shippingFee"
          ? {
              name: `Shipping Fee for ${order.reference} (${line.units} unit${line.units === 1 ? "" : "s"})`,
              quantity: line.units,
              price: line.unitFee,
            }
          : { name: `Delivery: ${line.zoneName}`, quantity: 1, price: line.amount },
      );
    }
    return {
      kind: "open" as const,
      invoiceId: invoice._id,
      code: invoice.code,
      name: customer.name ?? "",
      phone: customer.phone,
      items,
      tries: sessions.length,
    };
  },
});

/** Keeps a new Seev session against its invoice and starts polling it. */
export const recordSession = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    reference: v.string(),
    checkoutUrl: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, session) => {
    const existing = await ctx.db
      .query("paymentSessions")
      .withIndex("by_reference", (q) => q.eq("reference", session.reference))
      .unique();
    // Two taps on Pay can replay one session; it's kept and polled once.
    if (existing) return null;
    await ctx.db.insert("paymentSessions", session);
    await ctx.scheduler.runAfter(pollEveryMs, internal.system.seev.poll, {
      reference: session.reference,
    });
    return null;
  },
});

/** The unsettled Seev sessions of an invoice, for the return to its `/p/` page. */
export const unsettledReferences = internalQuery({
  args: { code: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { code }) => {
    const invoice = await findInvoiceByCode(ctx, code.trim().toUpperCase());
    if (!invoice) return [];
    const sessions = await ctx.db
      .query("paymentSessions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
      .collect();
    return sessions.filter((s) => s.settledAt === undefined).map((s) => s.reference);
  },
});
