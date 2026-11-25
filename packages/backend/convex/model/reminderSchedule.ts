import type { Doc } from "../_generated/dataModel";

export const DAY = 24 * 60 * 60 * 1000;

/** Which day of a clock started at `startedAt` it is at `now`, in Ghana time (GMT): day 0 is the first. */
export function daysSince(startedAt: number, now: number) {
  return Math.floor(now / DAY) - Math.floor(startedAt / DAY);
}

/** The days after first issue that an unpaid invoice is reminded on. */
export const invoiceReminderDays = [7, 13, 15, 28] as const;
/** The days after Ready that an uncollected Pickup order is reminded on; then they stop. */
export const uncollectedReminderDays = [3, 7, 14, 28] as const;

/**
 * The start (00:00 GMT) of the first of `days` on a clock started at `startedAt` that comes after
 * `now`'s day, or undefined once the last has passed. The daily cron sends what's due on or
 * before today, so a record's `nextReminderOn` always points past the day it was last reminded.
 */
function nextOn(startedAt: number, days: readonly number[], now: number) {
  const today = daysSince(startedAt, now);
  const day = days.find((d) => d > today);
  return day === undefined ? undefined : (Math.floor(startedAt / DAY) + day) * DAY;
}

/** An unpaid invoice's next reminder, counted from its first issue date. */
export function nextInvoiceReminderOn(clockStartedAt: number, now: number) {
  return nextOn(clockStartedAt, invoiceReminderDays, now);
}

type ReadyFields = Pick<Doc<"orders">, "status" | "fulfilment" | "readyAt">;

/** When a Pickup order waiting at Ready became Ready; undefined for any other order. */
export function awaitingPickupSince(order: ReadyFields) {
  return order.status === "ready" && order.fulfilment.method === "pickup"
    ? order.readyAt
    : undefined;
}

/** An order's next uncollected reminder: only Pickup orders waiting at Ready get them. */
export function nextUncollectedReminderOn(order: ReadyFields, now: number) {
  const readyAt = awaitingPickupSince(order);
  return readyAt === undefined ? undefined : nextOn(readyAt, uncollectedReminderDays, now);
}
