import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forfeitAfterDays, invoiceState, liveInvoice, voidInvoice } from "./invoices";
import { keptUnits } from "./refunds";
import { DAY } from "./reminderSchedule";
import { getSettings } from "./settings";
import { dayMonth, queueSms } from "./sms";
import { recordMovement } from "./stock";

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Why the order can't be Forfeited now, or null when it can: its Shipping Fee Invoice is unpaid
 * from day 30 after first issue. A Delivery Fee Invoice never leads to Forfeit.
 */
async function forfeitRefusal(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">, now: number) {
  const invoice = await liveInvoice(ctx, order._id, "shippingFee");
  if (order.status !== "paymentDue" || !invoice || invoice.status !== "unpaid") {
    return {
      code: "NOT_FORFEITABLE",
      message: `${order.reference} has no unpaid Shipping Fee Invoice, so it can't be Forfeited.`,
    };
  }
  if (invoiceState(invoice, now) !== "forfeitable") {
    const from = dayMonth(invoice.clockStartedAt + forfeitAfterDays * DAY);
    return { code: "TOO_EARLY", message: `${order.reference} can be Forfeited from ${from}.` };
  }
  return null;
}

/** Whether the Owner can Forfeit the order now, so order detail and the invoice sheet offer it. */
export async function forfeitable(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">, now: number) {
  return (await forfeitRefusal(ctx, order, now)) === null;
}

/** The store's WhatsApp number as a `wa.me` link, or undefined until it's set. */
function whatsappUrl(number: string) {
  const digits = number.replace(/\D/g, "");
  return digits ? `wa.me/${digits}` : undefined;
}

/**
 * The Owner Forfeits a Pre-order whose Shipping Fee Invoice is still unpaid from day 30 after
 * its first issue. The order ends `forfeited`, every unpaid invoice on it is voided, the units it
 * still holds go into Stock as `released` movements, and the Customer is texted. Nothing is
 * refunded: the Item Payment is kept.
 */
export async function forfeit(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  owner: Doc<"staff">,
  { orderId }: { orderId: Id<"orders"> },
) {
  const order = await ctx.db.get(orderId);
  if (!order) refuse("NOT_FOUND", "That order doesn't exist.");
  const refusal = await forfeitRefusal(ctx, order, Date.now());
  if (refusal) refuse(refusal.code, refusal.message);

  // The Shipping Fee Invoice, and a Delivery Fee Invoice beside it: nothing is left to pay.
  for (const invoice of await ctx.db
    .query("invoices")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect()) {
    if (invoice.status === "unpaid") await voidInvoice(ctx, invoice, "Forfeited");
  }

  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  let units = 0;
  for (const line of lines) {
    const quantity = keptUnits(line);
    if (quantity === 0) continue;
    await recordMovement(ctx, {
      variantId: line.variantId,
      kind: "released",
      quantity,
      staffId: owner._id,
      orderId: order._id,
    });
    units += quantity;
  }

  await ctx.db.patch(order._id, { status: "forfeited" });
  await ctx.db.insert("orderEvents", {
    orderId: order._id,
    kind: "forfeited",
    actor: { kind: "staff", staffId: owner._id },
    units,
  });
  const customer = await ctx.db.get(order.customerId);
  if (customer) {
    const url = whatsappUrl((await getSettings(ctx)).whatsappNumber);
    await queueSms(ctx, customer.phone, "forfeited", {
      reference: order.reference,
      ...(url ? { whatsappUrl: url } : {}),
    });
  }
}
