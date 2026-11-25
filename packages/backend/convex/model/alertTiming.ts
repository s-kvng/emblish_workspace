// When a Window Alert may go out. Plain functions with no server imports, so the Back Office
// app shows the same rule the server enforces.

const DAY = 24 * 60 * 60 * 1000;
/** Window Alerts are scheduled SMS: they go out only from 08:00 to 20:00 Ghana time (GMT). */
const SMS_HOURS = { from: 8, to: 20 } as const;

/**
 * Why a Window Alert can't go out at `now`, or null when it can: outside SMS hours, or one has
 * already gone out today (Ghana time) at `lastSentAt`.
 */
export function windowAlertBlocked(
  now: number,
  lastSentAt: number | undefined,
): "outsideSmsHours" | "sentToday" | null {
  const hour = new Date(now).getUTCHours();
  if (hour < SMS_HOURS.from || hour >= SMS_HOURS.to) return "outsideSmsHours";
  if (lastSentAt !== undefined && Math.floor(lastSentAt / DAY) === Math.floor(now / DAY)) {
    return "sentToday";
  }
  return null;
}
