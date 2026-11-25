import { longestPeriodDays, type Period } from "@emblish_workspace/backend/convex/model/reports";

/**
 * Reports periods, as GMT days: Ghana keeps GMT all year, so a UTC day is a local day. A period
 * runs from `from` (inclusive) to `to` (exclusive), in ms, as the server takes it.
 */
export { longestPeriodDays, type Period };

export type Preset = "today" | "last7" | "thisMonth" | "lastMonth";

export const dayMs = 24 * 60 * 60 * 1000;

export const presetLabel: Record<Preset, string> = {
  today: "Today",
  last7: "Last 7 days",
  thisMonth: "This month",
  lastMonth: "Last month",
};

/** The period a preset names, as of `now`. */
export function presetPeriod(preset: Preset, now = Date.now()): Period {
  const today = Math.floor(now / dayMs) * dayMs;
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (preset) {
    case "today":
      return { from: today, to: today + dayMs };
    case "last7":
      return { from: today - 6 * dayMs, to: today + dayMs };
    case "thisMonth":
      return { from: Date.UTC(year, month, 1), to: today + dayMs };
    case "lastMonth":
      return { from: Date.UTC(year, month - 1, 1), to: Date.UTC(year, month, 1) };
  }
}

/** A day as the Custom fields take it, e.g. "2026-11-15". */
export function dayText(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A typed "YYYY-MM-DD" as the start of that GMT day, or null if it isn't a real date. */
function parseDay(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  return dayText(ms) === text.trim() ? ms : null;
}

/** A Custom period from its first and last days, both included, or why it can't be used. */
export function customPeriod(
  firstDay: string,
  lastDay: string,
): { period: Period } | { error: string } {
  const from = parseDay(firstDay);
  const last = parseDay(lastDay);
  if (from === null || last === null) return { error: "Enter both days as YYYY-MM-DD." };
  if (last < from) return { error: "The last day can't be before the first." };
  const to = last + dayMs;
  if (to - from > longestPeriodDays * dayMs) {
    return { error: `Pick ${longestPeriodDays} days or fewer.` };
  }
  return { period: { from, to } };
}

/** The period as the screen names it, e.g. "1 Nov – 30 Nov 2026" or "15 Nov 2026". */
export function periodLabel({ from, to }: Period) {
  const format = (ms: number, withYear: boolean) =>
    new Date(ms).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const last = to - dayMs;
  return last <= from ? format(from, true) : `${format(from, false)} – ${format(last, true)}`;
}
