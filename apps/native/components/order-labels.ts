import type { OrderStatus, OverrideReason } from "@emblish_workspace/backend/convex/model/orders";

/** How each order status reads to Staff. */
export const orderStatusLabel: Record<OrderStatus, string> = {
  awaitingArrival: "Awaiting arrival",
  paymentDue: "Payment due",
  ready: "Ready for pickup",
  collected: "Collected",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  forfeited: "Forfeited",
};

/** The override reasons offered when the Customer has no Pickup Code, in order. */
export const overrideReasons: { value: OverrideReason; label: string }[] = [
  { value: "lostSms", label: "Lost the SMS" },
  { value: "collectingForSomeone", label: "Collecting for someone else" },
  { value: "phoneDead", label: "Phone dead" },
  { value: "other", label: "Other" },
];

/** The chip label for an override reason. */
export function overrideReasonLabel(reason: OverrideReason) {
  return overrideReasons.find((option) => option.value === reason)?.label ?? reason;
}

/** "2× Kente Weekend Tote · S" */
export function lineLabel(line: { quantity: number; productName: string; variantLabel: string }) {
  return `${line.quantity}× ${line.productName}${line.variantLabel ? ` · ${line.variantLabel}` : ""}`;
}

/** What Staff call a Customer: the name asked at their first Checkout, else their phone. */
export function customerLabel(customer: { name?: string; phone: string }) {
  return customer.name ?? customer.phone;
}
