import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AllocationView } from "@/components/arrival-allocation";
import { stageLabel } from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";

type CountSheet = FunctionReturnType<typeof api.backOffice.arrivals.countSheet>;

const STEPS = ["Count", "Check"] as const;

/**
 * The arrival wizard, full screen. Count: one Variant per screen, "How many arrived?", with an
 * "All N arrived" shortcut. Check: who gets what, then "Lock arrival & text N Customers", which
 * can't be undone. Once locked it opens on Check, read-only.
 */
export default function RecordArrival() {
  const { windowId: id } = useLocalSearchParams<{ windowId: string }>();
  const windowId = id as Id<"orderWindows">;
  const sheet = useQuery(api.backOffice.arrivals.countSheet, { windowId });

  if (sheet === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  return <Wizard windowId={windowId} sheet={sheet} />;
}

function Wizard({ windowId, sheet }: { windowId: Id<"orderWindows">; sheet: CountSheet }) {
  const insets = useSafeAreaInsets();
  const locked = sheet.stage === "arrived";
  const lock = useMutation(api.backOffice.arrivals.lock);
  const [step, setStep] = useState(locked ? 1 : 0);
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const counted = sheet.variants.every((row) => counts[row.variantId] !== undefined);
  const allocation = useQuery(
    api.backOffice.arrivals.allocation,
    locked
      ? { windowId }
      : counted
        ? {
            windowId,
            counts: sheet.variants.map((row) => ({
              variantId: row.variantId,
              arrived: counts[row.variantId] ?? 0,
            })),
          }
        : "skip",
  );
  const variant = sheet.variants[index];
  const notYetOrdered =
    !locked && sheet.stage !== "orderedFromSupplier" && sheet.stage !== "inTransit";

  const lockArrival = async () => {
    setBusy(true);
    try {
      await lock({
        windowId,
        counts: sheet.variants.map((row) => ({
          variantId: row.variantId,
          arrived: counts[row.variantId] ?? 0,
        })),
      });
    } catch (error) {
      Alert.alert("Couldn't lock the arrival", refusalMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2 px-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Leave the arrival"
          className="-ml-2 size-11 items-center justify-center"
        >
          <Ionicons name="close" size={24} color={brand["ink-muted"]} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">
            {sheet.productName} · W{sheet.number}
          </Text>
          <Text className="font-sans text-muted text-xs">
            {locked ? "Arrival locked" : "Recording arrival"}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-1 px-4 pb-2">
        {STEPS.map((label, i) => (
          <View key={label} className="flex-1">
            <View className={`h-1 rounded-full ${i <= step ? "bg-brand-purple" : "bg-border"}`} />
            <Text
              className={`mt-1 text-[11px] ${i === step ? "font-sans-bold text-foreground" : "font-sans text-muted"}`}
            >
              {locked ? "🔒 " : ""}
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
      >
        {notYetOrdered ? (
          <Text className="font-sans text-muted text-sm">
            W{sheet.number} is {stageLabel[sheet.stage].toLowerCase()}, so its arrival can't be
            recorded yet.
          </Text>
        ) : step === 0 && variant ? (
          <CountStep
            sheet={sheet}
            index={index}
            setIndex={setIndex}
            counts={counts}
            setCount={(arrived) =>
              setCounts(({ [variant.variantId]: _, ...rest }) =>
                arrived === undefined ? rest : { ...rest, [variant.variantId]: arrived },
              )
            }
          />
        ) : allocation === undefined ? (
          <Spinner />
        ) : allocation === null ? (
          <Text className="font-sans text-muted text-sm">Count every Variant first.</Text>
        ) : (
          <>
            <View className="gap-1">
              <Text className="font-display text-2xl text-foreground">Who gets what</Text>
              <Text className="font-sans text-muted text-sm">
                Earliest Pre-orders first, then Store Quantity; the rest is Surplus into Stock.
                Missing units are refunded.
              </Text>
            </View>
            <AllocationView allocation={allocation} />
            <Text className="font-sans text-muted text-xs">
              {locked
                ? "Units that turn up later go into Stock as a late arrival, from Arrivals."
                : "Locking can't be undone. It marks the window Arrived, texts Customers, puts Store Quantity and Surplus into Stock and flags Shortfall refunds."}
            </Text>
          </>
        )}
      </ScrollView>

      <View
        className="flex-row gap-2 border-border border-t bg-surface p-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {notYetOrdered ? (
          <Button className="flex-1" variant="secondary" onPress={() => router.back()}>
            <Button.Label>Close</Button.Label>
          </Button>
        ) : locked ? (
          <Button className="flex-1" onPress={() => router.back()}>
            <Button.Label>Done</Button.Label>
          </Button>
        ) : step === 0 ? (
          <>
            {index > 0 ? (
              <Button variant="secondary" onPress={() => setIndex(index - 1)}>
                <Button.Label>Back</Button.Label>
              </Button>
            ) : null}
            <Button
              className="flex-1"
              isDisabled={variant === undefined || counts[variant.variantId] === undefined}
              onPress={() => (index < sheet.variants.length - 1 ? setIndex(index + 1) : setStep(1))}
            >
              <Button.Label>
                {index < sheet.variants.length - 1
                  ? `Next Variant (${index + 2}/${sheet.variants.length})`
                  : "Check who gets what"}
              </Button.Label>
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={() => setStep(0)} isDisabled={busy}>
              <Button.Label>Back</Button.Label>
            </Button>
            <Button
              className="flex-1"
              isDisabled={busy || !counted || !allocation}
              onPress={lockArrival}
            >
              <Button.Label>
                {allocation && allocation.customers > 0
                  ? `Lock arrival & text ${allocation.customers} Customer${allocation.customers === 1 ? "" : "s"}`
                  : "Lock arrival"}
              </Button.Label>
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

/** One Variant: "How many arrived?", its supplier order, "All N arrived" and the Variant chips. */
function CountStep({
  sheet,
  index,
  setIndex,
  counts,
  setCount,
}: {
  sheet: CountSheet;
  index: number;
  setIndex: (index: number) => void;
  counts: Record<string, number>;
  setCount: (arrived: number | undefined) => void;
}) {
  const variant = sheet.variants[index];
  if (!variant) return null;
  const expected = variant.preordered + variant.storeQuantity;
  const value = counts[variant.variantId];

  return (
    <View className="items-center gap-3 pt-4">
      <Text className="font-sans text-muted text-xs">
        Variant {index + 1} of {sheet.variants.length}
      </Text>
      <Text className="font-display text-3xl text-foreground">{variant.label || "Standard"}</Text>
      <Text className="font-sans text-muted text-sm">How many arrived?</Text>
      <TextInput
        value={value === undefined ? "" : String(value)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "");
          setCount(digits === "" ? undefined : Number.parseInt(digits, 10));
        }}
        keyboardType="number-pad"
        placeholder="0"
        accessibilityLabel={`Units of ${variant.label || "Standard"} that arrived`}
        className="w-32 border-brand-purple border-b-2 pb-1 text-center font-sans-bold text-5xl text-foreground"
      />
      <Text className="font-sans text-muted text-xs">
        Supplier order: {variant.preordered} pre-ordered + {variant.storeQuantity} Store Quantity ={" "}
        {expected}
      </Text>
      <Pressable
        onPress={() => setCount(expected)}
        accessibilityRole="button"
        className="min-h-11 justify-center rounded-full border border-brand-purple px-4"
      >
        <Text className="font-sans-bold text-brand-purple text-sm">All {expected} arrived</Text>
      </Pressable>
      {sheet.variants.length > 1 ? (
        <View className="mt-4 flex-row flex-wrap justify-center gap-2">
          {sheet.variants.map((row, i) => {
            const count = counts[row.variantId];
            return (
              <Pressable
                key={row.variantId}
                onPress={() => setIndex(i)}
                accessibilityRole="button"
                aria-selected={i === index}
                className={`min-h-9 justify-center rounded-lg px-3 ${i === index ? "bg-brand-purple-deep" : count !== undefined ? "bg-brand-purple-mist" : "bg-surface"}`}
              >
                <Text
                  className={`font-sans-semibold text-xs ${i === index ? "text-white" : "text-foreground"}`}
                >
                  {row.label || "Standard"}
                  {count !== undefined ? ` · ${count}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
