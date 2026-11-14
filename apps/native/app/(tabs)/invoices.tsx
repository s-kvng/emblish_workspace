import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router } from "expo-router";
import { Spinner } from "heroui-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type InboxFilter,
  inboxFilters,
  statePill,
  statePillClass,
} from "@/components/invoice-labels";
import { formatGhs } from "@/lib/money";

const emblem = require("@/assets/images/emblem.png");

type Inbox = FunctionReturnType<typeof api.backOffice.invoices.inbox>;
type Row = Inbox["rows"][number];

const filterNote: Partial<Record<InboxFilter, string>> = {
  overdue: "Unpaid after the due date, 14 days after first issue.",
  eligible: "Unpaid 30+ days after first issue. No SMS goes to the Customer.",
};

/**
 * Invoices: every Shipping Fee and Delivery Fee Invoice across all windows. Each filter chip
 * shows its count and GH₵ total, worked out now from each invoice's first issue date; a row
 * opens the invoice sheet.
 */
export default function Invoices() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>("unpaid");
  const inbox = useQuery(api.backOffice.invoices.inbox, { filter });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 16 }}>
        <Image source={emblem} className="size-7" accessibilityIgnoresInvertColors />
        <Text className="mt-3 font-display text-[28px] text-white leading-tight">Invoices</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 pt-4"
      >
        {inboxFilters.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            totals={inbox?.counts[option.value]}
            selected={filter === option.value}
            alarm={option.value === "eligible"}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ScrollView>
      <View className="gap-3 p-4">
        {filterNote[filter] ? (
          <Text className="font-sans text-muted text-xs">{filterNote[filter]}</Text>
        ) : null}
        {inbox === undefined ? (
          <Spinner />
        ) : inbox.rows.length === 0 ? (
          <Text className="font-sans text-muted text-sm">No invoices here.</Text>
        ) : (
          inbox.rows.map((row) => <InvoiceRow key={row.invoiceId} row={row} />)
        )}
      </View>
    </ScrollView>
  );
}

function FilterChip({
  label,
  totals,
  selected,
  alarm,
  onPress,
}: {
  label: string;
  totals: { count: number; total: number } | undefined;
  selected: boolean;
  /** Red once it has anything in it. */
  alarm: boolean;
  onPress: () => void;
}) {
  const red = alarm && (totals?.count ?? 0) > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      className={`min-h-11 justify-center rounded-2xl border px-3 py-2 ${selected ? "border-brand-purple bg-brand-purple" : red ? "border-danger bg-surface" : "border-border bg-surface"}`}
    >
      <Text
        className={`font-sans-semibold text-sm ${selected ? "text-white" : red ? "text-danger" : "text-foreground"}`}
      >
        {label} · {totals?.count ?? "…"}
      </Text>
      <Text className={`font-sans text-xs ${selected ? "text-white/80" : "text-muted"}`}>
        {totals ? formatGhs(totals.total) : " "}
      </Text>
    </Pressable>
  );
}

function InvoiceRow({ row }: { row: Row }) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/invoices/sheet",
          params: { invoiceId: row.invoiceId },
        })
      }
      accessibilityRole="button"
      className="gap-1 rounded-2xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-start">
        <Text className="flex-1 font-sans-semibold text-base text-foreground">
          {row.customerName}
        </Text>
        <Text className="font-sans-bold text-base text-foreground">{formatGhs(row.total)}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-sans text-muted text-xs">
          {row.number} · {row.orderReference}
          {row.productName ? ` · ${row.productName}` : ""}
          {row.windowNumber !== undefined ? ` W${row.windowNumber}` : ""}
          {row.kind === "deliveryFee" ? " · Delivery Fee" : ""}
        </Text>
        <Text
          className={`overflow-hidden rounded-full px-2 py-0.5 font-sans-semibold text-[11px] ${statePillClass[row.state]}`}
        >
          {statePill(row)}
        </Text>
      </View>
    </Pressable>
  );
}
