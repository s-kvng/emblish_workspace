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
import { formatGhs, ghsText, parseGhs } from "@/lib/money";

type CountSheet = FunctionReturnType<typeof api.backOffice.arrivals.countSheet>;
type Preview = FunctionReturnType<typeof api.backOffice.invoices.preview>;

const STEPS = ["Count", "Check", "Fee", "Issue"] as const;

/** Above this share over the estimate, Staff must tick that they've checked the supplier's bill. */
const OVER_ESTIMATE = 1.2;

/**
 * The arrival wizard, full screen. Count: one Variant per screen, "How many arrived?", with an
 * "All N arrived" shortcut. Check: who gets what, then "Lock arrival & text N Customers", which
 * can't be undone. Fee: the confirmed per-unit Shipping Fee. Issue: one invoice per Pre-order,
 * "Issue N invoices". Leaving after the lock is safe: it reopens at Fee, with Count and Check
 * locked, and once issued it opens on Issue, read-only.
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
  const confirmFee = useMutation(api.backOffice.invoices.confirmFee);
  const issueInvoices = useMutation(api.backOffice.invoices.issue);
  const opening = useQuery(api.backOffice.invoices.preview, { windowId });
  const [step, setStep] = useState(locked ? 2 : 0);
  const [feeText, setFeeText] = useState<string>();
  const [acknowledged, setAcknowledged] = useState(false);
  const typedFee = feeText === undefined ? undefined : parseGhs(feeText);
  const fee =
    typedFee !== undefined && !Number.isNaN(typedFee)
      ? typedFee
      : feeText === undefined
        ? (opening?.confirmedFee ?? opening?.estimate)
        : undefined;
  const preview = useQuery(
    api.backOffice.invoices.preview,
    locked ? { windowId, ...(fee !== undefined && step === 2 ? { fee } : {}) } : "skip",
  );
  const issued = opening?.issued ?? false;
  const shownStep = issued ? 3 : step;
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
      setStep(2);
    } catch (error) {
      Alert.alert("Couldn't lock the arrival", refusalMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const estimate = preview?.estimate;
  const over = fee !== undefined && estimate !== undefined && fee > estimate * OVER_ESTIMATE;
  const confirm = async () => {
    if (fee === undefined) return;
    setBusy(true);
    try {
      await confirmFee({ windowId, fee, overEstimateAcknowledged: over && acknowledged });
      setStep(3);
    } catch (error) {
      Alert.alert("Couldn't confirm the fee", refusalMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const issue = async () => {
    setBusy(true);
    try {
      const { issued: count, ready } = await issueInvoices({ windowId });
      Alert.alert(
        "Invoices issued",
        `${count} invoice${count === 1 ? "" : "s"} texted.` +
          (ready > 0 ? ` ${ready} Pre-order${ready === 1 ? " owes" : "s owe"} nothing and ${ready === 1 ? "is" : "are"} Ready.` : ""),
      );
    } catch (error) {
      Alert.alert("Couldn't issue the invoices", refusalMessage(error));
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
            <View
              className={`h-1 rounded-full ${i <= shownStep ? "bg-brand-purple" : "bg-border"}`}
            />
            <Text
              className={`mt-1 text-[11px] ${i === shownStep ? "font-sans-bold text-foreground" : "font-sans text-muted"}`}
            >
              {(locked && i < 2) || (issued && i < 3) ? "🔒 " : ""}
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
        {shownStep === 2 && locked ? (
          preview === undefined ? (
            <Spinner />
          ) : (
            <FeeStep
              preview={preview}
              feeText={feeText ?? ghsText(opening?.confirmedFee ?? opening?.estimate)}
              setFeeText={setFeeText}
              fee={fee}
              over={over}
              acknowledged={acknowledged}
              setAcknowledged={setAcknowledged}
            />
          )
        ) : shownStep === 3 && locked ? (
          preview === undefined ? <Spinner /> : <IssueStep preview={preview} />
        ) : notYetOrdered ? (
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
        ) : locked && shownStep === 1 ? (
          <Button className="flex-1" onPress={() => setStep(2)}>
            <Button.Label>Next: Shipping Fee</Button.Label>
          </Button>
        ) : locked && shownStep === 2 ? (
          <>
            <Button variant="secondary" onPress={() => setStep(1)} isDisabled={busy}>
              <Button.Label>Who got what</Button.Label>
            </Button>
            <Button
              className="flex-1"
              isDisabled={busy || fee === undefined || (over && !acknowledged)}
              onPress={confirm}
            >
              <Button.Label>Confirm fee</Button.Label>
            </Button>
          </>
        ) : locked && !issued ? (
          <>
            <Button variant="secondary" onPress={() => setStep(2)} isDisabled={busy}>
              <Button.Label>Back</Button.Label>
            </Button>
            <Button
              className="flex-1"
              isDisabled={busy || preview?.confirmedFee === undefined}
              onPress={issue}
            >
              <Button.Label>
                {`Issue ${preview?.invoices.filter((row) => row.total > 0).length ?? 0} invoices`}
              </Button.Label>
            </Button>
          </>
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

/**
 * Fee: one big GH₵ per-unit field, pre-filled with the estimate, and how far it is over what
 * Customers saw. More than 20% over needs "I've checked the supplier's bill" ticked. Totals show
 * the invoices it makes, the units and what it collects.
 */
function FeeStep({
  preview,
  feeText,
  setFeeText,
  fee,
  over,
  acknowledged,
  setAcknowledged,
}: {
  preview: Preview;
  feeText: string;
  setFeeText: (text: string) => void;
  fee: number | undefined;
  over: boolean;
  acknowledged: boolean;
  setAcknowledged: (value: boolean) => void;
}) {
  const { estimate } = preview;
  const invoices = preview.invoices.filter((row) => row.total > 0);
  const units = preview.invoices.reduce((sum, row) => sum + row.units, 0);
  const toCollect = preview.invoices.reduce((sum, row) => sum + row.total, 0);
  const change =
    fee !== undefined && estimate ? Math.round(((fee - estimate) / estimate) * 100) : undefined;

  return (
    <View className="items-center gap-3 pt-4">
      <Text className="font-display text-2xl text-foreground">Shipping Fee per unit</Text>
      <View className="flex-row items-end gap-1 border-brand-purple border-b-2 pb-1">
        <Text className="font-sans-bold text-3xl text-muted">GH₵</Text>
        <TextInput
          value={feeText}
          onChangeText={setFeeText}
          keyboardType="decimal-pad"
          placeholder="0"
          accessibilityLabel="Shipping Fee per unit, in cedis"
          className="min-w-24 text-center font-sans-bold text-5xl text-foreground"
        />
      </View>
      {fee === undefined && feeText.trim() !== "" ? (
        <Text className="font-sans text-danger text-sm">Enter an amount, like 8 or 8.50.</Text>
      ) : null}
      <Text className="font-sans text-muted text-sm">
        {estimate === undefined
          ? "Customers were told the fee is confirmed on arrival."
          : `Customers saw ${formatGhs(estimate)} as the estimate` +
            (change ? ` (${change > 0 ? "+" : ""}${change}%)` : "") +
            "."}
      </Text>
      {over ? (
        <Pressable
          onPress={() => setAcknowledged(!acknowledged)}
          accessibilityRole="checkbox"
          aria-checked={acknowledged}
          className="w-full flex-row gap-3 rounded-xl border border-brand-gold bg-brand-gold-mist p-3"
        >
          <Ionicons
            name={acknowledged ? "checkbox" : "square-outline"}
            size={22}
            color={brand["gold-ink"]}
          />
          <View className="flex-1">
            <Text className="font-sans-semibold text-foreground text-sm">
              More than 20% over the estimate. Customers can't cancel over it.
            </Text>
            <Text className="font-sans text-foreground text-sm">I've checked the supplier's bill</Text>
          </View>
        </Pressable>
      ) : null}
      <View className="mt-2 w-full flex-row justify-between rounded-xl bg-surface p-3">
        <Total label="Invoices" value={String(invoices.length)} />
        <Total label="Units" value={String(units)} />
        <Total label="To collect" value={formatGhs(toCollect)} />
      </View>
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="font-sans text-muted text-xs">{label}</Text>
      <Text className="font-sans-bold text-base text-foreground">{value}</Text>
    </View>
  );
}

/**
 * Issue: every invoice the confirmed fee makes, units × fee plus any Delivery Fee, with
 * "Delivery Fee quoted later" for Elsewhere orders and why Pre-orders are skipped. Once issued,
 * each shows whether it's paid.
 */
function IssueStep({ preview }: { preview: Preview }) {
  const fee = preview.confirmedFee ?? 0;
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="font-display text-2xl text-foreground">
          {preview.issued ? "Invoices" : "Issue invoices"}
        </Text>
        <Text className="font-sans text-muted text-sm">
          {preview.issued
            ? "Each Customer was texted their total, due date and Pay link."
            : `${formatGhs(fee)} per arrived unit. Each Customer gets an SMS with their total, due date (14 days) and their own Pay link.`}
        </Text>
      </View>
      {preview.exampleSms ? (
        <View className="gap-1 rounded-xl bg-brand-purple-mist p-3">
          <Text className="font-sans-semibold text-muted text-xs">Example SMS</Text>
          <Text className="font-sans text-foreground text-sm">{preview.exampleSms}</Text>
        </View>
      ) : null}
      {preview.invoices.map((row) => (
        <View key={row.orderId} className="gap-1 rounded-xl border border-border bg-surface p-3">
          <View className="flex-row justify-between">
            <Text className="font-sans-semibold text-foreground">
              {row.reference} · {row.customerName}
            </Text>
            <Text className="font-sans-semibold text-foreground">{formatGhs(row.total)}</Text>
          </View>
          <Text className="font-sans text-muted text-xs">
            {row.units} {row.units === 1 ? "unit" : "units"} × {formatGhs(fee)} ={" "}
            {formatGhs(row.shipping)}
            {row.deliveryFee !== undefined ? ` + Delivery Fee ${formatGhs(row.deliveryFee)}` : ""}
          </Text>
          {row.quoteLater ? (
            <Text className="font-sans text-muted text-xs">Delivery Fee quoted later</Text>
          ) : null}
          {row.total === 0 && !preview.issued ? (
            <Text className="font-sans text-muted text-xs">Owes nothing: no invoice, Ready at once</Text>
          ) : null}
          {row.status ? (
            <Text
              className={`font-sans-semibold text-xs ${row.status === "paid" ? "text-success" : "text-brand-gold-ink"}`}
            >
              {row.number} · {row.status === "paid" ? "Paid" : row.status === "void" ? "Void" : "Unpaid"}
            </Text>
          ) : null}
        </View>
      ))}
      {preview.skipped.map((row) => (
        <View key={row.reference} className="rounded-xl border border-border border-dashed p-3">
          <Text className="font-sans text-muted text-sm">
            {row.reference} · {row.customerName}: skipped, nothing arrived (fully refunded)
          </Text>
        </View>
      ))}
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
