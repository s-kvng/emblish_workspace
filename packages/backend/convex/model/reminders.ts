import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { openOrderStatuses } from "../schema";
import { dueAfterMs, forfeitAfterDays, payUrl } from "./invoices";
import {
  awaitingPickupSince,
  DAY,
  daysSince,
  type invoiceReminderDays,
  nextInvoiceReminderOn,
  nextUncollectedReminderOn,
  uncollectedReminderDays,
} from "./reminderSchedule";
import { pickupLocation } from "./settings";
import { dayMonth, queueSms } from "./sms";

/**
 * Sends the reminders due today through the outbox: one per unpaid invoice on its reminder day,
 * and one per Pickup order waiting at Ready on its uncollected reminder day.
 * Each record it reads moves its `nextReminderOn` past today, so running it twice in a day
 * sends nothing new.
 */
export async function sendDueReminders(ctx: Pick<MutationCtx, "db" | "scheduler">, now: number) {
  const today = Math.floor(now / DAY) * DAY;
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_nextReminderOn", (q) => q.gt("nextReminderOn", 0).lte("nextReminderOn", today))
    .take(batchSize);
  for (const invoice of invoices) await remindInvoice(ctx, invoice, now);
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_nextReminderOn", (q) => q.gt("nextReminderOn", 0).lte("nextReminderOn", today))
    .take(batchSize);
  for (const order of orders) await remindUncollected(ctx, order, now);
  // Every record read has moved past today, so the next run picks up where this one stopped.
  if (invoices.length === batchSize || orders.length === batchSize) {
    await ctx.scheduler.runAfter(0, internal.system.reminders.sendDue, {});
  }
}

/** Records of each kind one run handles, to stay well inside a mutation's limits. */
const batchSize = 100;

/**
 * Sends a Pickup order its uncollected reminder if today is one of its days, then points it at
 * the next. One that's collected, cancelled or no longer for Pickup is dropped from the scan.
 */
async function remindUncollected(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  order: Doc<"orders">,
  now: number,
) {
  const readyAt = awaitingPickupSince(order);
  const customer = await ctx.db.get(order.customerId);
  const due =
    readyAt !== undefined &&
    (uncollectedReminderDays as readonly number[]).includes(daysSince(readyAt, now));
  if (customer && due) {
    await queueSms(ctx, customer.phone, "uncollectedReminder", {
      reference: order.reference,
      pickupCode: order.pickupCode,
      location: await pickupLocation(ctx),
    });
  }
  await ctx.db.patch(order._id, { nextReminderOn: nextUncollectedReminderOn(order, now) });
}

/** The SMS each invoice reminder day sends: one for each of `invoiceReminderDays`. */
const invoiceTemplates: Record<
  (typeof invoiceReminderDays)[number],
  "invoiceReminder" | "invoiceDueTomorrow" | "invoiceOverdue" | "invoiceFinalReminder"
> = {
  7: "invoiceReminder",
  13: "invoiceDueTomorrow",
  15: "invoiceOverdue",
  28: "invoiceFinalReminder",
};

/** Whether an order can still be owed reminders: its goods aren't handed over or cancelled. */
function isOpen(order: Doc<"orders"> | null): order is Doc<"orders"> {
  return order !== null && (openOrderStatuses as readonly string[]).includes(order.status);
}

/**
 * Sends an invoice's reminder if today is one of its days, then points it at the next one. One
 * that's paid, voided, or on a closed order is dropped from the scan instead.
 */
async function remindInvoice(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  invoice: Doc<"invoices">,
  now: number,
) {
  const order = await ctx.db.get(invoice.orderId);
  if (invoice.status !== "unpaid" || !isOpen(order)) {
    await ctx.db.patch(invoice._id, { nextReminderOn: undefined });
    return;
  }
  const customer = await ctx.db.get(order.customerId);
  const day = daysSince(invoice.clockStartedAt, now);
  const template =
    day in invoiceTemplates ? invoiceTemplates[day as keyof typeof invoiceTemplates] : undefined;
  if (customer && template) {
    await queueSms(ctx, customer.phone, template, {
      kind: invoice.kind,
      reference: order.reference,
      total: invoice.total,
      due: dayMonth(invoice.clockStartedAt + dueAfterMs),
      unpaidBy: dayMonth(invoice.clockStartedAt + forfeitAfterDays * DAY),
      payUrl: payUrl(invoice.code),
    });
  }
  await ctx.db.patch(invoice._id, {
    nextReminderOn: nextInvoiceReminderOn(invoice.clockStartedAt, now),
    ...(customer && template ? { remindersSent: [...(invoice.remindersSent ?? []), day] } : {}),
  });
}
