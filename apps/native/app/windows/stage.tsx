import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dayText, middayIn, parseDay, shortDate, stageLabel } from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";

type OrderWindow = FunctionReturnType<typeof api.backOffice.windows.get>;
type MarkableStage = "orderedFromSupplier" | "inTransit";

/** Quick expected-arrival ranges, in days from today. */
const RANGES = [
  { label: "+1w", from: 7, to: 14 },
  { label: "+2w", from: 14, to: 21 },
] as const;

/**
 * The stage sheet. By default it's "Mark as <next stage>": expected arrival dates, a note to
 * Customers, the Store Quantity per Variant at "Ordered from supplier", the SMS preview and
 * "Text N Customers". With `mode=change` it's "Change expected dates or note" on the current
 * stage, filled in with what's saved; Store Quantity stays editable until arrival.
 */
export default function StageSheet() {
  const { windowId: id, mode } = useLocalSearchParams<{
    windowId: string;
    mode?: string;
  }>();
  const windowId = id as Id<"orderWindows">;
  const window = useQuery(api.backOffice.windows.get, { windowId });

  if (window === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  if (mode === "change") {
    const stage = window.stage;
    if (stage !== "orderedFromSupplier" && stage !== "inTransit") {
      return <Nothing message={`W${window.number}'s dates can't be changed now.`} />;
    }
    const event = [...window.events].reverse().find((e) => e.stage === stage);
    return <ChangeSheet window={window} stage={stage} event={event} />;
  }
  return <MarkSheet window={window} />;
}

function Nothing({ message }: { message: string }) {
  return (
    <View className="flex-1 gap-3 bg-background p-4">
      <Text className="font-sans text-base text-muted">{message}</Text>
      <Button variant="secondary" onPress={() => router.back()}>
        <Button.Label>Close</Button.Label>
      </Button>
    </View>
  );
}

function MarkSheet({ window }: { window: OrderWindow }) {
  const advance = useMutation(api.backOffice.windows.advance);
  const form = useStageForm(window, {});
  const sheet = useQuery(api.backOffice.windows.stageSheet, {
    windowId: window._id,
    ...form.dates,
  });

  if (sheet === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  const next = sheet.next;
  if (!next) return <Nothing message={`W${window.number} has no stage to mark by hand now.`} />;
  const storeQuantities = next === "orderedFromSupplier" ? form.storeQuantities : undefined;

  return (
    <StageFormView
      title={`Mark W${window.number} as ${stageLabel[next].toLowerCase()}`}
      window={window}
      form={form}
      showStoreQuantity={next === "orderedFromSupplier"}
      preview={sheet.preview}
      buttonLabel={textLabel(sheet.customers)}
      onSave={() =>
        advance({
          windowId: window._id,
          stage: next,
          ...form.dates,
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
          ...(storeQuantities ? { storeQuantities } : {}),
        })
      }
    />
  );
}

function ChangeSheet({
  window,
  stage,
  event,
}: {
  window: OrderWindow;
  stage: MarkableStage;
  event: OrderWindow["events"][number] | undefined;
}) {
  const change = useMutation(api.backOffice.windows.change);
  const form = useStageForm(window, {
    expectedFrom: event?.expectedFrom,
    expectedTo: event?.expectedTo,
    note: event?.note,
  });
  const sheet = useQuery(api.backOffice.windows.changeSheet, {
    windowId: window._id,
    ...form.dates,
  });
  const { expectedFrom, expectedTo } = form.dates;
  const newDates =
    expectedFrom !== undefined &&
    expectedTo !== undefined &&
    (expectedFrom !== event?.expectedFrom || expectedTo !== event?.expectedTo);
  const customers = sheet?.customers ?? 0;

  return (
    <StageFormView
      title={`Change W${window.number}'s expected dates or note`}
      subtitle={`${stageLabel[stage]}. New dates text every Customer with a Pre-order; a change to the note alone texts no one.`}
      window={window}
      form={form}
      showStoreQuantity
      preview={newDates ? (sheet?.preview ?? null) : null}
      buttonLabel={newDates ? textLabel(customers) : "Save"}
      onSave={() =>
        change({
          windowId: window._id,
          ...form.dates,
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
          storeQuantities: form.storeQuantities,
        })
      }
    />
  );
}

function textLabel(customers: number) {
  return customers === 0
    ? "Save"
    : `Text ${customers} Customer${customers === 1 ? "" : "s"} & save`;
}

/** The sheet's fields, starting from what's saved (or empty when marking a new stage). */
function useStageForm(
  window: OrderWindow,
  initial: { expectedFrom?: number; expectedTo?: number; note?: string },
) {
  const [fromText, setFromText] = useState(
    initial.expectedFrom !== undefined ? dayText(initial.expectedFrom) : "",
  );
  const [toText, setToText] = useState(
    initial.expectedTo !== undefined ? dayText(initial.expectedTo) : "",
  );
  const [note, setNote] = useState(initial.note ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      window.variants
        .filter((row) => row.storeQuantity > 0)
        .map((row) => [row.variantId, String(row.storeQuantity)]),
    ),
  );
  const parsedFrom = parseDay(fromText);
  const parsedTo = parseDay(toText);
  // Keep a saved time as it was when its day wasn't retyped, so unchanged dates stay unchanged.
  const expectedFrom =
    initial.expectedFrom !== undefined && fromText === dayText(initial.expectedFrom)
      ? initial.expectedFrom
      : parsedFrom;
  const expectedTo =
    initial.expectedTo !== undefined && toText === dayText(initial.expectedTo)
      ? initial.expectedTo
      : parsedTo;
  const dates =
    expectedFrom !== undefined && expectedTo !== undefined ? { expectedFrom, expectedTo } : {};
  const halfDates = (fromText.trim() !== "") !== (toText.trim() !== "");
  const badDates =
    (fromText.trim() !== "" && expectedFrom === undefined) ||
    (toText.trim() !== "" && expectedTo === undefined) ||
    (expectedFrom !== undefined && expectedTo !== undefined && expectedTo < expectedFrom);
  const storeQuantities = window.variants.map((row) => ({
    variantId: row.variantId,
    quantity: Number(quantities[row.variantId] ?? "0"),
  }));
  const badQuantity = storeQuantities.some(
    (row) => !Number.isSafeInteger(row.quantity) || row.quantity < 0,
  );
  return {
    fromText,
    setFromText,
    toText,
    setToText,
    note,
    setNote,
    quantities,
    setQuantities,
    expectedFrom,
    expectedTo,
    dates,
    halfDates,
    badDates,
    storeQuantities,
    badQuantity,
  };
}

function StageFormView({
  title,
  subtitle,
  window,
  form,
  showStoreQuantity,
  preview,
  buttonLabel,
  onSave,
}: {
  title: string;
  subtitle?: string;
  window: OrderWindow;
  form: ReturnType<typeof useStageForm>;
  showStoreQuantity: boolean;
  preview: string | null;
  buttonLabel: string;
  onSave: () => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave();
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
      <View className="gap-1">
        <Text className="font-display text-2xl text-foreground">{title}</Text>
        {subtitle ? <Text className="font-sans text-muted text-sm">{subtitle}</Text> : null}
      </View>

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Expected arrival</Text>
        <View className="flex-row flex-wrap gap-2">
          {RANGES.map((range) => {
            const from = middayIn(range.from);
            const to = middayIn(range.to);
            const picked = form.expectedFrom === from && form.expectedTo === to;
            return (
              <Pressable
                key={range.label}
                onPress={() => {
                  form.setFromText(dayText(from));
                  form.setToText(dayText(to));
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
              value={form.fromText}
              onChangeText={form.setFromText}
              placeholder="From, 2026-12-02"
              accessibilityLabel="Expected from"
              isInvalid={form.badDates}
            />
          </View>
          <View className="flex-1">
            <Input
              value={form.toText}
              onChangeText={form.setToText}
              placeholder="To, 2026-12-09"
              accessibilityLabel="Expected to"
              isInvalid={form.badDates}
            />
          </View>
        </View>
        {form.halfDates ? (
          <Text className="font-sans text-muted text-xs">Give both a from and a to date.</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Note to Customers</Text>
        <Input
          value={form.note}
          onChangeText={form.setNote}
          placeholder="Optional, shown in My orders"
          accessibilityLabel="Note to Customers"
          maxLength={200}
        />
      </View>

      {showStoreQuantity ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-foreground">Store Quantity</Text>
          <Text className="font-sans text-muted text-xs">
            Extra units for Stock, added to the supplier order. Editable until arrival.
          </Text>
          {window.variants.map((row) => (
            <View key={row.variantId} className="flex-row items-center gap-3">
              <Text className="flex-1 font-sans text-foreground text-sm">
                {row.label || "Standard"} · {row.preordered} pre-ordered
              </Text>
              <View className="w-24">
                <Input
                  value={form.quantities[row.variantId] ?? ""}
                  onChangeText={(text) =>
                    form.setQuantities((q) => ({ ...q, [row.variantId]: text }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  accessibilityLabel={`Store Quantity for ${row.label || "Standard"}`}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {preview ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-foreground">SMS preview</Text>
          <View className="self-start rounded-2xl rounded-bl-sm bg-surface p-3">
            <Text className="font-sans text-foreground text-sm">{preview}</Text>
          </View>
        </View>
      ) : null}

      <Button
        onPress={save}
        isDisabled={saving || form.halfDates || form.badDates || form.badQuantity}
      >
        <Button.Label>{buttonLabel}</Button.Label>
      </Button>
    </ScrollView>
  );
}
