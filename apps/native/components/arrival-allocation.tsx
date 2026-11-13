import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Text, View } from "react-native";

import { formatGhs } from "@/lib/money";

type Allocation = NonNullable<FunctionReturnType<typeof api.backOffice.arrivals.allocation>>;

/** The four parts of an arrival, in allocation order, with their bar colours. */
const parts = [
  { key: "toPreorders", label: "Pre-orders", className: "bg-brand-purple" },
  { key: "toStore", label: "Store Quantity", className: "bg-brand-gold" },
  { key: "surplus", label: "Surplus", className: "bg-success" },
  { key: "shortfall", label: "Shortfall", className: "bg-danger" },
] as const;

/**
 * Who gets what: one bar per Variant (Pre-orders, Store Quantity, Surplus, Shortfall), then
 * each Pre-order in placement order with what it got. Short rows are red, with their refund.
 */
export function AllocationView({ allocation }: { allocation: Allocation }) {
  return (
    <View className="gap-4">
      <View className="gap-3">
        {allocation.variants.map((variant) => {
          const total = parts.reduce((sum, part) => sum + variant[part.key], 0);
          return (
            <View key={variant.variantId} className="gap-1">
              <View className="flex-row justify-between">
                <Text className="font-sans-semibold text-foreground text-sm">
                  {variant.label || "Standard"}
                </Text>
                <Text className="font-sans text-muted text-xs">
                  {variant.arrived} arrived · {variant.toStore} store · {variant.surplus} surplus
                  {variant.shortfall > 0 ? ` · ${variant.shortfall} short` : ""}
                </Text>
              </View>
              <View className="h-2.5 flex-row overflow-hidden rounded-full bg-border">
                {parts.map((part) =>
                  variant[part.key] > 0 ? (
                    <View
                      key={part.key}
                      className={part.className}
                      style={{ flex: variant[part.key] / Math.max(1, total) }}
                    />
                  ) : null,
                )}
              </View>
            </View>
          );
        })}
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          {parts.map((part) => (
            <View key={part.key} className="flex-row items-center gap-1">
              <View className={`size-2.5 rounded-full ${part.className}`} />
              <Text className="font-sans text-muted text-xs">{part.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {allocation.preorders.length === 0 ? (
        <Text className="font-sans text-muted text-sm">
          No Pre-orders are waiting in this window.
        </Text>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {allocation.preorders.map((row, index) => {
            const short = row.got < row.ordered;
            return (
              <View
                key={row.orderId}
                className={`flex-row items-center gap-3 px-3 py-2.5 ${index > 0 ? "border-border border-t" : ""} ${short ? "bg-danger/10" : ""}`}
              >
                <Text className="w-5 font-sans text-muted text-xs">{index + 1}</Text>
                <View className="flex-1">
                  <Text className="font-sans-medium text-foreground text-sm">
                    {row.customerName} · {row.reference}
                  </Text>
                  <Text className="font-sans text-muted text-xs">
                    {row.lines
                      .map((line) => `${line.label || "Standard"} ${line.got}/${line.ordered}`)
                      .join(", ")}
                  </Text>
                </View>
                {short ? (
                  <Text className="text-right font-sans-bold text-danger text-xs">
                    {row.got}/{row.ordered}
                    {"\n"}refund {formatGhs(row.refund)}
                  </Text>
                ) : (
                  <Text className="font-sans-bold text-success text-xs">✓ {row.got}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
