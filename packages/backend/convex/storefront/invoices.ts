import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action, query } from "../_generated/server";
import { shownFulfilment } from "../model/fulfilment";
import { findInvoiceByCode, invoiceDocument, payUrl } from "../model/invoices";
import { createSession, SeevUnavailable } from "../model/seev";
import { invoiceKind, invoiceLine, invoiceStatus } from "../schema";

const invoiceDocumentValidator = v.object({
  kind: invoiceKind,
  /** `INV-0001`. */
  number: v.string(),
  code: v.string(),
  status: invoiceStatus,
  issuedAt: v.number(),
  /** The first issue date; a reissue keeps it. */
  clockStartedAt: v.number(),
  /** 14 days after `clockStartedAt`. */
  dueAt: v.number(),
  orderReference: v.string(),
  customerName: v.optional(v.string()),
  fulfilment: shownFulfilment,
  pickupLocation: v.string(),
  /** The order's lines: units that arrived, and any that didn't (refunded separately). */
  items: v.array(
    v.object({
      productName: v.string(),
      variantLabel: v.string(),
      arrived: v.number(),
      missing: v.number(),
    }),
  ),
  lines: v.array(invoiceLine),
  /** Pesewas: the AMOUNT DUE. */
  total: v.number(),
  /** The Item Payment's Receipt, for the footer. */
  itemReceiptNumber: v.optional(v.string()),
  /** Set once paid: the PAID stamp and its Receipt. */
  paid: v.optional(
    v.object({ paidAt: v.number(), receiptNumber: v.string(), receiptCode: v.string() }),
  ),
  /** Set on a voided invoice. */
  voidReason: v.optional(v.string()),
  /** The live invoice that replaced a voided one. */
  replacedByCode: v.optional(v.string()),
});

/**
 * An invoice by its `/p/` code: public to whoever holds the link, like the SMS that carries it,
 * so it opens without sign-in (ADR 0001's public-by-code check). Null for an unknown code.
 */
export const get = query({
  args: { code: v.string() },
  returns: v.union(v.null(), invoiceDocumentValidator),
  handler: async (ctx, { code }) => {
    const invoice = await findInvoiceByCode(ctx, code.trim().toUpperCase());
    return invoice && (await invoiceDocument(ctx, invoice));
  },
});

/**
 * Pay on `/p/`: hands an unpaid invoice to Seev's hosted checkout and returns its URL. No
 * sign-in: holding the link is enough to pay it, as with the SMS that carries it. Each call is
 * a new try with its own session.
 */
export const pay = action({
  args: { code: v.string() },
  returns: v.object({ checkoutUrl: v.string() }),
  handler: async (ctx, { code }) => {
    const request = await ctx.runQuery(internal.system.invoices.paymentRequest, { code });
    if (request.kind === "notFound") {
      throw new ConvexError({ code: "NOT_FOUND", message: "That invoice doesn't exist." });
    }
    if (request.kind === "paid") {
      throw new ConvexError({ code: "INVOICE_PAID", message: "This invoice is already paid." });
    }
    if (request.kind === "void") {
      throw new ConvexError({
        code: "INVOICE_VOID",
        message: "This invoice was cancelled. Open the new one from your latest SMS.",
      });
    }
    try {
      const session = await createSession({
        idempotencyKey: `${request.invoiceId}-${request.tries + 1}`,
        recipient: { name: request.name, phone: request.phone },
        items: request.items,
        // Back to `/p/`, which verifies at once and says "Nothing was charged" if unpaid.
        redirectUrl: `${payUrl(request.code)}?from=seev`,
        meta: { invoiceId: request.invoiceId },
      });
      await ctx.runMutation(internal.system.invoices.recordSession, {
        invoiceId: request.invoiceId,
        ...session,
      });
      return { checkoutUrl: session.checkoutUrl };
    } catch (error) {
      if (!(error instanceof SeevUnavailable)) throw error;
      console.error(error.message);
      throw new ConvexError({
        code: "PAYMENT_UNAVAILABLE",
        message: "We couldn't open the payment page. Nothing was charged. Try again.",
      });
    }
  },
});

/**
 * The return from Seev to `/p/`: asks Seev about the invoice's sessions now rather than waiting
 * for the next poll, so a paid Customer sees the PAID stamp straight away.
 */
export const refresh = action({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const references = await ctx.runQuery(internal.system.invoices.unsettledReferences, { code });
    for (const reference of references) {
      await ctx.runAction(internal.system.seev.verify, { reference });
    }
    return null;
  },
});
