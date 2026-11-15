import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { refundKindLabel } from "@/components/order-labels";
import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs } from "@/lib/money";
import {
  customPeriod,
  dayMs,
  dayText,
  longestPeriodDays,
  type Period,
  type Preset,
  periodLabel,
  presetLabel,
  presetPeriod,
} from "@/lib/report-period";
import { useStaffMember } from "@/lib/staff-member";

type Report = FunctionReturnType<typeof api.backOffice.reports.summary>;
type ProductSeller = Report["bestSellers"][number];
type Sales = ProductSeller["store"];

const presets: Preset[] = ["today", "last7", "thisMonth", "lastMonth"];

/**
 * More → Reports, Owner-only: for a period, Money in by what it paid for, Refunded by kind, Net,
 * and Best sellers per Product and Variant, plus Export CSV through the share sheet. Seev
 * reports no fees (ADR 0003), so they're reconciled from the Seev dashboard instead.
 */
export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const me = useStaffMember();
  const isOwner = me?.role === "owner";
  const [choice, setChoice] = useState<Preset | "custom">("thisMonth");
  const [custom, setCustom] = useState<Period | null>(null);
  const period = choice === "custom" ? custom : presetPeriod(choice);
  const report = useQuery(api.backOffice.reports.summary, isOwner && period ? period : "skip");

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Reports" backLabel="Back to More">
        <Text className="mt-2 font-sans text-sm text-white/80">
          {period ? periodLabel(period) : "Pick a period"} · days in GMT
        </Text>
      </ScreenHeader>
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {me === undefined ? (
          <Spinner />
        ) : !isOwner ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed" size={16} color={brand["ink-muted"]} />
            <Text className="font-sans text-muted text-sm">Only an Owner can see Reports.</Text>
          </View>
        ) : (
          <>
            <PeriodPicker
              choice={choice}
              onPick={setChoice}
              custom={custom}
              onCustom={(picked) => {
                setCustom(picked);
                setChoice("custom");
              }}
            />
            {!period ? null : report === undefined ? (
              <Spinner />
            ) : (
              <>
                <MoneyCard report={report} />
                <BestSellers sellers={report.bestSellers} />
                <ExportCsv period={period} />
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Chip({ label, picked, onPress }: { label: string; picked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={picked}
      className={`min-h-11 justify-center rounded-full px-4 ${picked ? "bg-brand-purple" : "border border-border"}`}
    >
      <Text className={`font-sans-semibold ${picked ? "text-white" : "text-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The four presets, or a Custom range of up to 92 days typed as its first and last days. */
function PeriodPicker({
  choice,
  onPick,
  custom,
  onCustom,
}: {
  choice: Preset | "custom";
  onPick: (preset: Preset | "custom") => void;
  custom: Period | null;
  onCustom: (period: Period) => void;
}) {
  const thisMonth = presetPeriod("thisMonth");
  const [firstDay, setFirstDay] = useState(dayText(custom?.from ?? thisMonth.from));
  const [lastDay, setLastDay] = useState(dayText((custom?.to ?? thisMonth.to) - dayMs));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const result = customPeriod(firstDay, lastDay);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onCustom(result.period);
  };

  return (
    <View className="gap-3">
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {presets.map((preset) => (
          <Chip
            key={preset}
            label={presetLabel[preset]}
            picked={choice === preset}
            onPress={() => onPick(preset)}
          />
        ))}
        <Chip label="Custom" picked={choice === "custom"} onPress={() => onPick("custom")} />
      </View>
      {choice === "custom" ? (
        <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
          <Text className="font-sans text-muted text-sm">
            Up to {longestPeriodDays} days, first and last day included.
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text className="font-sans-semibold text-foreground text-sm">First day</Text>
              <Input
                value={firstDay}
                onChangeText={setFirstDay}
                placeholder="2026-11-01"
                autoCapitalize="none"
                accessibilityLabel="First day, as year-month-day"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="font-sans-semibold text-foreground text-sm">Last day</Text>
              <Input
                value={lastDay}
                onChangeText={setLastDay}
                placeholder="2026-11-30"
                autoCapitalize="none"
                accessibilityLabel="Last day, as year-month-day"
              />
            </View>
          </View>
          {error ? <Text className="font-sans text-danger text-sm">{error}</Text> : null}
          <Button variant="secondary" onPress={apply}>
            <Button.Label>Show this period</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function Line({
  label,
  amount,
  strong,
  muted,
}: {
  label: string;
  amount: number;
  strong?: boolean;
  muted?: boolean;
}) {
  const weight = strong ? "font-sans-bold" : "font-sans";
  const tone = muted ? "text-muted" : "text-foreground";
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className={`flex-1 ${weight} ${tone} text-sm`}>{label}</Text>
      <Text className={`${weight} ${tone} text-sm tabular-nums`}>{formatGhs(amount)}</Text>
    </View>
  );
}

/** Money in by what it paid for, Refunded by kind, and Net. */
function MoneyCard({ report }: { report: Report }) {
  const { moneyIn, refunded } = report;
  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
        Money in · {report.payments} {report.payments === 1 ? "payment" : "payments"}
      </Text>
      <Line label="Store Order items" amount={moneyIn.storeItems} muted />
      <Line label="Pre-order Item Payments" amount={moneyIn.preorderItems} muted />
      <Line label="Shipping Fees" amount={moneyIn.shippingFees} muted />
      <Line label="Delivery Fees" amount={moneyIn.deliveryFees} muted />
      {moneyIn.unmatched > 0 ? (
        <Line label="Unmatched payments (to refund)" amount={moneyIn.unmatched} muted />
      ) : null}
      <Line label="Money in" amount={moneyIn.total} strong />

      <View className="my-1 h-px bg-border" />
      {refunded.byKind.map((row) => (
        <Line
          key={row.kind}
          label={`${refundKindLabel[row.kind]} (${row.count})`}
          amount={-row.amount}
          muted
        />
      ))}
      <Line label="Refunded" amount={-refunded.total} strong />

      <View className="my-1 h-px bg-border" />
      <Line label="Net" amount={report.net} strong />
      <Text className="font-sans text-muted text-xs">
        Seev reports no fees, so check them against the Seev dashboard.
      </Text>
    </View>
  );
}

function salesText({ units, amount }: Sales) {
  return units === 0 ? "–" : `${units} · ${formatGhs(amount)}`;
}

/** Each Product sold in the period, most GH₵ first, tapping open to its Variants. */
function BestSellers({ sellers }: { sellers: ProductSeller[] }) {
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
        Best sellers
      </Text>
      {sellers.length === 0 ? (
        <Text className="font-sans text-muted text-sm">Nothing sold in this period.</Text>
      ) : (
        sellers.map((seller) => <SellerRow key={seller.productId} seller={seller} />)
      )}
      <Text className="font-sans text-muted text-xs">
        Units · GH₵ at the prices paid, less cancelled or refunded units. Sold offline is units only
        and in no GH₵ total.
      </Text>
    </View>
  );
}

function SellerFigures({
  row,
}: {
  row: Omit<ProductSeller, "productId" | "productName" | "variants">;
}) {
  return (
    <View className="flex-row gap-3">
      <Figure label="Store" value={salesText(row.store)} />
      <Figure label="Pre-order" value={salesText(row.preorder)} />
      <Figure label="Sold offline" value={row.soldOffline === 0 ? "–" : `${row.soldOffline}`} />
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="font-sans text-muted text-xs">{label}</Text>
      <Text className="font-sans-semibold text-foreground text-sm tabular-nums">{value}</Text>
    </View>
  );
}

function SellerRow({ seller }: { seller: ProductSeller }) {
  const [open, setOpen] = useState(false);
  // A default Variant alone has nothing more to show.
  const hasVariants = seller.variants.length > 1 || seller.variants[0]?.variantLabel !== "";
  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
      <Pressable
        onPress={() => setOpen(!open)}
        disabled={!hasVariants}
        accessibilityRole="button"
        aria-expanded={hasVariants ? open : undefined}
        className="flex-row items-center gap-2"
      >
        <Text className="flex-1 font-sans-semibold text-base text-foreground">
          {seller.productName}
        </Text>
        {hasVariants ? (
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={brand["ink-muted"]}
          />
        ) : null}
      </Pressable>
      <SellerFigures row={seller} />
      {open
        ? seller.variants.map((variant) => (
            <View key={variant.variantId} className="gap-1 border-border border-t pt-2">
              <Text className="font-sans text-foreground text-sm">
                {variant.variantLabel || "Default"}
              </Text>
              <SellerFigures row={variant} />
            </View>
          ))
        : null}
    </View>
  );
}

/** One CSV file for the period, written to the cache and handed to the share sheet. */
function ExportCsv({ period }: { period: Period }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const { filename, csv } = await convex.query(api.backOffice.reports.exportCsv, period);
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
        dialogTitle: filename,
      });
    } catch (refused) {
      setError(refusalMessage(refused, "Couldn't export the file. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <Button onPress={exportFile} isDisabled={busy}>
        <Ionicons name="share-outline" size={18} color="white" />
        <Button.Label>{busy ? "Preparing the file…" : "Export CSV"}</Button.Label>
      </Button>
      <Text className="font-sans text-muted text-xs">
        One row per payment and per Refund paid back, with Refunds negative.
      </Text>
      {error ? <Text className="font-sans text-danger text-sm">{error}</Text> : null}
    </View>
  );
}
