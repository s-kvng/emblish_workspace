import type {
  DeliveryFailureReason,
  OrderStatus,
  OverrideReason,
} from "@emblish_workspace/backend/convex/model/orders";
import type { RefundKind, RefundMethod } from "@emblish_workspace/backend/convex/model/refunds";

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

/** Why a Delivery attempt failed, as offered when the rider comes back, in order. */
export const deliveryFailureReasons: { value: DeliveryFailureReason; label: string }[] = [
  { value: "customerNotReachable", label: "Customer not reachable" },
  { value: "wrongAddress", label: "Wrong address" },
  { value: "customerRefused", label: "Customer refused" },
  { value: "riderIssue", label: "Rider issue" },
];

/** The chip label for a failed delivery's reason. */
export function deliveryFailureLabel(reason: DeliveryFailureReason) {
  return deliveryFailureReasons.find((option) => option.value === reason)?.label ?? reason;
}

/** "2× Kente Weekend Tote · S", counting only units still the Customer's. */
export function lineLabel(line: {
  quantity: number;
  refundedQuantity?: number;
  productName: string;
  variantLabel: string;
}) {
  const units = line.quantity - (line.refundedQuantity ?? 0);
  return `${units}× ${line.productName}${line.variantLabel ? ` · ${line.variantLabel}` : ""}`;
}

/** Why a Refund is owed, as Refunds to make lists it. */
export const refundKindLabel: Record<RefundKind, string> = {
  shortfall: "Shortfall",
  latePaid: "Late-paid",
  cancelledLine: "Cancelled units",
  cancelledPreorder: "Cancelled Pre-order",
  afterHandover: "After handover",
  fulfilmentSwitch: "Fulfilment switch",
  discretionary: "Payment to check",
};

/** How the Owner sent a Refund back, as offered on Mark refunded, in order. */
export const refundMethods: { value: RefundMethod; label: string }[] = [
  { value: "seevDashboard", label: "Seev dashboard" },
  { value: "mobileMoney", label: "Mobile money" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

/** What Staff call a Customer: the name asked at their first Checkout, else their phone. */
export function customerLabel(customer: { name?: string; phone: string }) {
  return customer.name ?? customer.phone;
}
