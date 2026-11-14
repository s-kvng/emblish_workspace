import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

export type InboxFilter = FunctionArgs<typeof api.backOffice.invoices.inbox>["filter"];
export type InvoiceState = FunctionReturnType<
  typeof api.backOffice.invoices.inbox
>["rows"][number]["state"];

/** The Invoices inbox filter chips, in order. */
export const inboxFilters: { value: InboxFilter; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "eligible", label: "Eligible for Forfeit" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

/** Why an invoice is voided and reissued, as offered on its sheet. "Other" asks for words. */
export const voidReasons = [
  "Wrong fee",
  "Wrong Delivery Zone",
  "Units recounted",
  "Other",
] as const;

function shortDay(at: number) {
  return new Date(at).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** An invoice's status pill: "Due 14 Nov", "Overdue · day 16", "Day 31 · can Forfeit", ... */
export function statePill(row: {
  state: InvoiceState;
  day: number;
  dueAt: number;
  paidAt?: number;
}) {
  switch (row.state) {
    case "due":
      return `Due ${shortDay(row.dueAt)}`;
    case "overdue":
      return `Overdue · day ${row.day}`;
    case "forfeitable":
      return `Day ${row.day} · can Forfeit`;
    case "paid":
      return row.paidAt !== undefined ? `Paid ${shortDay(row.paidAt)}` : "Paid";
    case "void":
      return "Void";
  }
}

/** The pill's colours by state. */
export const statePillClass: Record<InvoiceState, string> = {
  due: "bg-border text-foreground",
  overdue: "bg-warning/20 text-warning",
  forfeitable: "bg-danger text-white",
  paid: "bg-success/20 text-success",
  void: "bg-border text-muted",
};

export { shortDay };
