import type {
  AdjustmentReason,
  StockMovementKind,
} from "@emblish_workspace/backend/convex/model/stock";

/** How each Stock Movement kind reads in a Variant's ledger. */
export const movementKindLabel: Record<StockMovementKind, string> = {
  arrival: "Received",
  lateArrival: "Late arrival",
  released: "Released from Pre-order",
  sold: "Sold",
  cancelled: "Sale cancelled",
  returned: "Returned",
  soldOffline: "Sold offline",
  adjustment: "Adjustment",
};

/** The Adjustment reason chips, in the order they're offered. */
export const adjustmentReasons: { value: AdjustmentReason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost / missing" },
  { value: "recount", label: "Recount" },
  { value: "found", label: "Found" },
  { value: "other", label: "Other" },
];

/** The chip label for an Adjustment reason. */
export function reasonLabel(reason: AdjustmentReason) {
  return adjustmentReasons.find((option) => option.value === reason)?.label ?? reason;
}

/** "+3" or "−2", with a true minus sign. */
export function signedQuantity(quantity: number) {
  return quantity > 0 ? `+${quantity}` : `−${-quantity}`;
}
