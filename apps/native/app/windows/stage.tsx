import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dayText, middayIn, parseDay, shortDate, stageLabel } from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";

/** Quick expected-arrival ranges, in days from today. */
const RANGES = [
  { label: "+1w", from: 7, to: 14 },
  { label: "+2w", from: 14, to: 21 },
] as const;

/**
 * The "Mark as <next stage>" sheet: expected arrival dates, a note to Customers, the Store
 * Quantity per Variant at "Ordered from supplier", the SMS preview and "Text N Customers".
 */
export default function MarkStageSheet() {
  const insets = useSafeAreaInsets();
  const { windowId: id } = useLocalSearchParams<{ windowId: string }>();
  const windowId = id as Id<"orderWindows">;
  const window = useQuery(api.backOffice.windows.get, { windowId });
  const advance = useMutation(api.backOffice.windows.advance);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const expectedFrom = parseDay(fromText);
  const expectedTo = parseDay(toText);
  const dates =
    expectedFrom !== undefined && expectedTo !== undefined ? { expectedFrom, expectedTo } : {};
  const sheet = useQuery(api.backOffice.windows.stageSheet, {
    windowId,
    ...dates,
  });

  if (window === undefined || sheet === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  const next = sheet.next;
  if (!next) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Text className="font-sans text-base text-muted">
          W{window.number} has no stage to mark by hand now.
        </Text>
        <Button variant="secondary" onPress={() => router.back()}>
          <Button.Label>Close</Button.Label>
        </Button>
      </View>
    );
  }

  const halfDates = (fromText.trim() !== "") !== (toText.trim() !== "");
  const badDates =
    (fromText.trim() !== "" && expectedFrom === undefined) ||
    (toText.trim() !== "" && expectedTo === undefined) ||
    (expectedFrom !== undefined && expectedTo !== undefined && expectedTo < expectedFrom);
  const storeQuantities =
    next === "orderedFromSupplier"
      ? window.variants.map((row) => ({
          variantId: row.variantId,
          quantity: Number(quantities[row.variantId] ?? "0"),
        }))
      : undefined;
  const badQuantity = storeQuantities?.some(
    (row) => !Number.isSafeInteger(row.quantity) || row.quantity < 0,
  );

  const save = async () => {
    setSaving(true);
    try {
      await advance({
        windowId,
        stage: next,
        ...dates,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(storeQuantities ? { storeQuantities } : {}),
      });
      router.back();
    } catch (error) {
      Alert.alert("Couldn't save", refusalMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="font-display text-2xl text-foreground">
        Mark W{window.number} as {stageLabel[next].toLowerCase()}
      </Text>

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Expected arrival</Text>
        <View className="flex-row flex-wrap gap-2">
          {RANGES.map((range) => {
            const from = middayIn(range.from);
            const to = middayIn(range.to);
            const picked = expectedFrom === from && expectedTo === to;
            return (
              <Pressable
                key={range.label}
                onPress={() => {
                  setFromText(dayText(from));
                  setToText(dayText(to));
                }}
                accessibilityRole="button"
                aria-selected={picked}
                className={`rounded-full border px-3 py-2 ${picked ? "border-brand-purple bg-brand-purple-mist" : "border-border"}`}
              >
                <Text className="font-sans-medium text-foreground text-sm">
                  {range.label} · {shortDate(from)} – {shortDate(to)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Input
              value={fromText}
              onChangeText={setFromText}
              placeholder="From, 2026-12-02"
              accessibilityLabel="Expected from"
              isInvalid={badDates}
            />
          </View>
          <View className="flex-1">
            <Input
              value={toText}
              onChangeText={setToText}
              placeholder="To, 2026-12-09"
              accessibilityLabel="Expected to"
              isInvalid={badDates}
            />
          </View>
        </View>
        {halfDates ? (
          <Text className="font-sans text-muted text-xs">Give both a from and a to date.</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Note to Customers</Text>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Optional, shown in My orders"
          accessibilityLabel="Note to Customers"
          maxLength={200}
        />
      </View>

      {next === "orderedFromSupplier" ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-foreground">Store Quantity</Text>
          <Text className="font-sans text-muted text-xs">
            Extra units for Stock, added to the supplier order.
          </Text>
          {window.variants.map((row) => (
            <View key={row.variantId} className="flex-row items-center gap-3">
              <Text className="flex-1 font-sans text-foreground text-sm">
                {row.label || "Standard"} · {row.preordered} pre-ordered
              </Text>
              <View className="w-24">
                <Input
                  value={quantities[row.variantId] ?? ""}
                  onChangeText={(text) => setQuantities((q) => ({ ...q, [row.variantId]: text }))}
                  keyboardType="number-pad"
                  placeholder="0"
                  accessibilityLabel={`Store Quantity for ${row.label || "Standard"}`}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">SMS preview</Text>
        <View className="self-start rounded-2xl rounded-bl-sm bg-surface p-3">
          <Text className="font-sans text-foreground text-sm">{sheet.preview}</Text>
        </View>
      </View>

      <Button onPress={save} isDisabled={saving || halfDates || badDates || badQuantity}>
        <Button.Label>
          {sheet.customers === 0
            ? "Save"
            : `Text ${sheet.customers} Customer${sheet.customers === 1 ? "" : "s"} & save`}
        </Button.Label>
      </Button>
    </ScrollView>
  );
}
