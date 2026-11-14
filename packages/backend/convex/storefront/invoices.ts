import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action, query } from "../_generated/server";
import {
  findInvoiceByCode,
  invoiceDocument,
  invoiceDocumentFields,
  payUrl,
} from "../model/invoices";
import { createSession, SeevUnavailable } from "../model/seev";

const invoiceDocumentValidator = v.object({
  ...invoiceDocumentFields,
  /** On a voided invoice: the `/p/` code of the live end of its chain, where the page redirects. */
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
