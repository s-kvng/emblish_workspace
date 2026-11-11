import type { windowStages } from "@emblish_workspace/backend/convex/schema";

export type WindowStage = (typeof windowStages)[number];

/** Each stage as the timeline names it. */
export const stageLabel: Record<WindowStage, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  orderedFromSupplier: "Ordered from supplier",
  inTransit: "In transit",
  arrived: "Arrived",
};

/** The timeline's stages, after the draft. */
export const timelineStages = [
  "open",
  "closed",
  "orderedFromSupplier",
  "inTransit",
  "arrived",
] as const satisfies readonly WindowStage[];

const DAY = 24 * 60 * 60 * 1000;

/** "31 Oct", in the phone's time zone. */
export function shortDate(time: number) {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Whole days until `time`, never below 0. */
export function daysUntil(time: number) {
  return Math.max(0, Math.ceil((time - Date.now()) / DAY));
}

/** The end of the day `days` from today: a window closes at the end of its close date. */
export function endOfDayIn(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 0, 0);
  return date.getTime();
}

/** A typed "2026-11-30" as the end of that day, or undefined when it isn't a date. */
export function parseCloseDate(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(y, m - 1, d, 23, 59, 0, 0);
  return date.getMonth() === m - 1 ? date.getTime() : undefined;
}

/** "W3 open until 31 Oct" or "W1 draft", for a Product's current window. */
export function windowSummary(window: { number: number; stage: WindowStage; closesAt: number }) {
  return window.stage === "open"
    ? `W${window.number} open until ${shortDate(window.closesAt)}`
    : `W${window.number} ${stageLabel[window.stage].toLowerCase()}`;
}
