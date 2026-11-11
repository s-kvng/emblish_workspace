import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { type PropsWithChildren, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  endOfDayIn,
  parseCloseDate,
  shortDate,
  stageLabel,
  windowSummary,
} from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs, ghsText, parseGhs } from "@/lib/money";
import { useStaffMember } from "@/lib/staff-member";

const STEPS = ["Product", "Variants", "Prices & caps", "Dates & review"] as const;
const CLOSE_IN_DAYS = [7, 14, 21, 30] as const;

type Row = {
  variantId: Id<"variants">;
  label: string;
  offered: boolean;
  priceText: string;
  capText: string;
};

type Draft = {
  windowId?: Id<"orderWindows">;
  productId: Id<"products">;
  productName: string;
  rows: Row[];
  closesAt?: number;
  dateText: string;
  minimumText: string;
  feeText: string;
};

type Prefill = FunctionReturnType<typeof api.backOffice.windows.prefill>;
type Saved = FunctionReturnType<typeof api.backOffice.windows.get>;

/** Whole units typed in a field: undefined when blank, NaN when it isn't a count of at least 1. */
function parseUnits(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 ? Number(trimmed) : Number.NaN;
}

function draftFromPrefill(productId: Id<"products">, productName: string, prefill: Prefill): Draft {
  return {
    productId,
    productName,
    rows: prefill.variants.map((variant) => ({
      variantId: variant.variantId,
      label: variant.label || "Standard",
      offered: variant.offered,
      priceText: ghsText(variant.preorderPrice),
      capText: variant.cap === undefined ? "" : String(variant.cap),
    })),
    dateText: "",
    minimumText:
      prefill.minimumOrderQuantity === undefined ? "" : String(prefill.minimumOrderQuantity),
    feeText: ghsText(prefill.shippingFeeEstimate),
  };
}

/** A saved draft reopens with all of the Product's Variants, the offered ones ticked. */
function draftFromSaved(saved: Saved, prefill: Prefill): Draft {
  return {
    windowId: saved._id,
    productId: saved.productId,
    productName: saved.productName,
    rows: prefill.variants.map((variant) => {
      const row = saved.variants.find((r) => r.variantId === variant.variantId);
      return {
        variantId: variant.variantId,
        label: variant.label || "Standard",
        offered: row !== undefined,
        priceText: ghsText(row?.preorderPrice),
        capText: row?.cap === undefined ? "" : String(row.cap),
      };
    }),
    closesAt: saved.closesAt,
    dateText: "",
    minimumText: saved.minimumOrderQuantity === undefined ? "" : String(saved.minimumOrderQuantity),
    feeText: ghsText(saved.shippingFeeEstimate),
  };
}

/** The 4-step "Open a window" wizard; `?windowId=` reopens a draft straight at Review. */
export default function NewWindowScreen() {
  const { windowId, productId } = useLocalSearchParams<{
    windowId?: string;
    productId?: string;
  }>();
  const saved = useQuery(
    api.backOffice.windows.get,
    windowId ? { windowId: windowId as Id<"orderWindows"> } : "skip",
  );
  const prefill = useQuery(
    api.backOffice.windows.prefill,
    saved ? { productId: saved.productId } : "skip",
  );

  if (!windowId) return <Wizard initialProductId={productId as Id<"products"> | undefined} />;
  if (saved === undefined || prefill === undefined) return <Loading />;
  return <Wizard key={saved._id} initial={draftFromSaved(saved, prefill)} />;
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Spinner />
    </View>
  );
}

function Wizard({
  initial,
  initialProductId,
}: {
  initial?: Draft;
  initialProductId?: Id<"products">;
}) {
  const insets = useSafeAreaInsets();
  const isOwner = useStaffMember()?.role === "owner";
  const save = useMutation(api.backOffice.windows.save);
  const [draft, setDraft] = useState<Draft | undefined>(initial);
  const [step, setStep] = useState(initial ? 3 : 0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{
    stage: "draft" | "open";
    productId: Id<"products">;
  }>();

  if (done) return <DoneScreen {...done} name={draft?.productName ?? ""} isOwner={isOwner} />;

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const offered = draft?.rows.filter((row) => row.offered) ?? [];
  const prices = offered.map((row) => parseGhs(row.priceText));
  const caps = offered.map((row) => parseUnits(row.capText));
  const minimum = parseUnits(draft?.minimumText ?? "");
  const fee = parseGhs(draft?.feeText ?? "");

  const blockers: string[] = [];
  const priceMissing = prices.some((price) => price === undefined);
  if (offered.length === 0) blockers.push("Pick at least one Variant");
  if (prices.some((price) => Number.isNaN(price) || price === 0)) {
    blockers.push("A Pre-order price isn't an amount");
  }
  if (priceMissing) blockers.push("A Pre-order price on every Variant (Owner)");
  if (caps.some(Number.isNaN)) blockers.push("A cap isn't a whole number of units");
  if (Number.isNaN(minimum)) blockers.push("The minimum isn't a whole number of units");
  if (Number.isNaN(fee) || fee === 0) blockers.push("The Shipping Fee estimate isn't an amount");
  if (!draft?.closesAt) blockers.push("A close date");
  else if (draft.closesAt <= Date.now()) blockers.push("A close date in the future");
  const ready = blockers.length === 0;
  const onlyPrices = !ready && blockers.every((b) => b.endsWith("(Owner)"));
  const canSaveDraft = blockers.every(
    (b) => b.endsWith("(Owner)") || b === "A close date in the future",
  );

  const submit = async (open: boolean) => {
    if (!draft?.closesAt) return;
    setSaving(true);
    try {
      const result = await save({
        windowId: draft.windowId,
        productId: draft.productId,
        variants: offered.map((row) => {
          const price = parseGhs(row.priceText);
          const cap = parseUnits(row.capText);
          return {
            variantId: row.variantId,
            // Staff can't change prices, so they send back what the Owner set.
            ...(price !== undefined && !Number.isNaN(price) ? { preorderPrice: price } : {}),
            ...(cap !== undefined ? { cap } : {}),
          };
        }),
        closesAt: draft.closesAt,
        ...(minimum !== undefined ? { minimumOrderQuantity: minimum } : {}),
        ...(fee !== undefined ? { shippingFeeEstimate: fee } : {}),
        open,
      });
      setDone({ stage: result.stage, productId: draft.productId });
    } catch (error) {
      Alert.alert("Couldn't save", refusalMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const close = () =>
    Alert.alert("Leave without saving?", "Nothing in this window is kept.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);

  const canGoOn = step === 0 ? draft !== undefined : step === 1 ? offered.length > 0 : true;

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <View className="bg-brand-purple-deep px-4 pb-3" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="-ml-2 size-11 items-center justify-center"
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <Text
            className="flex-1 px-2 text-center font-sans-semibold text-base text-white"
            numberOfLines={1}
          >
            {draft ? `Open a window · ${draft.productName}` : "Open a window"}
          </Text>
          <Text className="w-11 text-right font-sans text-sm text-white/70">
            {step + 1}/{STEPS.length}
          </Text>
        </View>
        <View className="mt-3 flex-row gap-1.5">
          {STEPS.map((label, index) => (
            <Pressable
              key={label}
              // A reopened draft keeps its Product; a new one needs a Product first.
              disabled={!draft || (initial !== undefined && index === 0)}
              onPress={() => setStep(index)}
              accessibilityRole="tab"
              aria-selected={index === step}
              accessibilityLabel={`Step ${index + 1}: ${label}`}
              className="flex-1"
            >
              <View
                className={`h-1.5 rounded-full ${index <= step ? "bg-brand-gold-bright" : "bg-white/20"}`}
              />
              <Text
                className={`mt-1 text-[10px] ${index === step ? "font-sans-semibold text-brand-gold-bright" : "font-sans text-white/70"}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <ProductStep
            picked={draft?.productId}
            autoPick={draft ? undefined : initialProductId}
            onPick={(next) => {
              setDraft(next);
              setStep(1);
            }}
          />
        ) : null}
        {step === 1 && draft ? <VariantsStep draft={draft} update={update} /> : null}
        {step === 2 && draft ? (
          <PricesStep draft={draft} update={update} isOwner={isOwner} />
        ) : null}
        {step === 3 && draft ? (
          <ReviewStep
            draft={draft}
            update={update}
            isOwner={isOwner}
            blockers={blockers}
            goTo={setStep}
          />
        ) : null}
      </ScrollView>

      <View
        className="flex-row gap-3 border-border border-t bg-surface px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          variant="secondary"
          className="h-14 flex-1"
          onPress={() => (step === 0 || (initial && step === 3) ? close() : setStep(step - 1))}
        >
          <Button.Label>{step === 0 || (initial && step === 3) ? "Cancel" : "Back"}</Button.Label>
        </Button>
        {step < STEPS.length - 1 ? (
          <Button className="h-14 flex-[2]" isDisabled={!canGoOn} onPress={() => setStep(step + 1)}>
            <Button.Label>Next: {STEPS[step + 1]}</Button.Label>
          </Button>
        ) : (
          <Button
            className="h-14 flex-[2]"
            isDisabled={saving || !(ready || canSaveDraft)}
            onPress={() => submit(ready)}
          >
            {saving ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label numberOfLines={2} className="text-center">
                {ready
                  ? "Open window"
                  : !isOwner && onlyPrices
                    ? "Save draft for the Owner"
                    : "Save draft"}
              </Button.Label>
            )}
          </Button>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="font-display text-2xl text-foreground">{title}</Text>
      {hint ? <Text className="mt-1 font-sans text-muted text-sm">{hint}</Text> : null}
    </View>
  );
}

function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <View className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>
      {children}
    </View>
  );
}

// ---------- 1. Product ----------

function ProductStep({
  picked,
  autoPick,
  onPick,
}: {
  /** The Product already in the wizard, highlighted. */
  picked?: Id<"products">;
  /** A Product to start with, as when "+ New" is tapped on its window screen. */
  autoPick?: Id<"products">;
  onPick: (draft: Draft) => void;
}) {
  const products = useQuery(api.backOffice.products.list);
  const [choosing, setChoosing] = useState<Id<"products"> | undefined>(autoPick);
  const prefill = useQuery(
    api.backOffice.windows.prefill,
    choosing ? { productId: choosing } : "skip",
  );
  const product = products?.find((p) => p._id === choosing);

  // Once the chosen Product's starting values arrive, the wizard moves on with them.
  useEffect(() => {
    if (!choosing || !prefill || !product) return;
    setChoosing(undefined);
    if (prefill.blockedBy) {
      Alert.alert(
        `${product.name} already has a window`,
        `W${prefill.blockedBy.number} is ${stageLabel[prefill.blockedBy.stage].toLowerCase()}. Finish or close it first.`,
      );
      return;
    }
    onPick(draftFromPrefill(choosing, product.name, prefill));
  }, [choosing, prefill, product, onPick]);

  if (products === undefined) return <Spinner />;
  const live = products.filter((p) => p.status !== "archived");
  return (
    <View>
      <StepTitle
        title="Which Product?"
        hint="A Product has one window at a time. Opening one on a Draft Product publishes it."
      />
      <View className="gap-3">
        {live.map((p) => {
          const busy = p.window !== undefined;
          return (
            <Pressable
              key={p._id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}${p.window ? `, ${windowSummary(p.window)}` : ""}`}
              onPress={() => {
                if (p.window?.stage === "draft") {
                  router.replace({
                    pathname: "/windows/new",
                    params: { windowId: p.window.windowId },
                  });
                } else if (p.window) {
                  router.replace({
                    pathname: "/windows/product",
                    params: { productId: p._id },
                  });
                } else setChoosing(p._id);
              }}
              className={`flex-row items-center gap-3 rounded-2xl border bg-surface p-3 ${choosing === p._id || picked === p._id ? "border-brand-purple" : "border-border"}`}
            >
              {p.coverUrl ? (
                <Image
                  source={{ uri: p.coverUrl }}
                  className="size-12 rounded-xl"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View className="size-12 items-center justify-center rounded-xl bg-brand-muted">
                  <Ionicons name="image-outline" size={20} color={brand["ink-muted"]} />
                </View>
              )}
              <View className="flex-1">
                <Text className="font-sans-semibold text-base text-foreground">{p.name}</Text>
                <Text className={`font-sans text-xs ${busy ? "text-brand-gold" : "text-muted"}`}>
                  {p.window
                    ? p.window.stage === "draft"
                      ? `${windowSummary(p.window)} · tap to finish it`
                      : `${windowSummary(p.window)} · tap to see it`
                    : `${p.variantCount} Variant${p.variantCount === 1 ? "" : "s"}${p.status === "draft" ? " · Draft" : ""}`}
                </Text>
              </View>
              {choosing === p._id ? (
                <Spinner size="sm" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- 2. Variants ----------

type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

function VariantsStep({ draft, update }: StepProps) {
  const toggle = (variantId: Id<"variants">) =>
    update({
      rows: draft.rows.map((row) =>
        row.variantId === variantId ? { ...row, offered: !row.offered } : row,
      ),
    });
  return (
    <View>
      <StepTitle
        title="Which Variants can be pre-ordered?"
        hint="Only these can be pre-ordered in this window."
      />
      <Card className="gap-1 p-2">
        {draft.rows.map((row) => (
          <Pressable
            key={row.variantId}
            onPress={() => toggle(row.variantId)}
            accessibilityRole="checkbox"
            aria-checked={row.offered}
            className="min-h-12 flex-row items-center gap-3 px-2"
          >
            <Ionicons
              name={row.offered ? "checkbox" : "square-outline"}
              size={22}
              color={row.offered ? brand.purple : brand["ink-muted"]}
            />
            <Text className="flex-1 font-sans text-base text-foreground">{row.label}</Text>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

// ---------- 3. Prices & caps ----------

function PricesStep({ draft, update, isOwner }: StepProps & { isOwner: boolean }) {
  const patchRow = (variantId: Id<"variants">, fields: Partial<Row>) =>
    update({
      rows: draft.rows.map((row) => (row.variantId === variantId ? { ...row, ...fields } : row)),
    });
  return (
    <View>
      <StepTitle
        title="Prices & caps"
        hint="The Pre-order price is the Owner's. A cap is optional: once it's reached, that Variant shows sold out, but the window stays open."
      />
      <View className="gap-3">
        {draft.rows
          .filter((row) => row.offered)
          .map((row) => {
            const price = parseGhs(row.priceText);
            const cap = parseUnits(row.capText);
            return (
              <Card key={row.variantId} className="gap-3">
                <Text className="font-sans-semibold text-base text-foreground">{row.label}</Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1 font-sans text-muted text-xs">Pre-order price (GH₵)</Text>
                    {isOwner ? (
                      <Input
                        value={row.priceText}
                        onChangeText={(priceText) => patchRow(row.variantId, { priceText })}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        accessibilityLabel={`Pre-order price for ${row.label}`}
                        isInvalid={Number.isNaN(price) || price === 0}
                      />
                    ) : (
                      <View className="h-12 flex-row items-center gap-1.5 rounded-xl bg-brand-muted px-3">
                        <Ionicons name="lock-closed" size={14} color={brand["ink-muted"]} />
                        <Text className="font-sans text-muted text-sm">
                          {price ? formatGhs(price) : "Owner sets"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 font-sans text-muted text-xs">Cap (optional)</Text>
                    <Input
                      value={row.capText}
                      onChangeText={(capText) => patchRow(row.variantId, { capText })}
                      keyboardType="number-pad"
                      placeholder="No cap"
                      accessibilityLabel={`Cap for ${row.label}`}
                      isInvalid={Number.isNaN(cap)}
                    />
                  </View>
                </View>
              </Card>
            );
          })}
      </View>
    </View>
  );
}

// ---------- 4. Dates & fees, then Review ----------

function ReviewStep({
  draft,
  update,
  isOwner,
  blockers,
  goTo,
}: StepProps & {
  isOwner: boolean;
  blockers: string[];
  goTo: (step: number) => void;
}) {
  const offered = draft.rows.filter((row) => row.offered);
  const typed = draft.dateText.trim() ? parseCloseDate(draft.dateText) : undefined;
  return (
    <View className="gap-4">
      <StepTitle title="Dates & fees" />
      <Card className="gap-3">
        <Text className="font-sans-semibold text-foreground">Orders close</Text>
        <View className="flex-row flex-wrap gap-2">
          {CLOSE_IN_DAYS.map((days) => {
            const at = endOfDayIn(days);
            const picked = draft.closesAt === at;
            return (
              <Pressable
                key={days}
                onPress={() => update({ closesAt: at, dateText: "" })}
                accessibilityRole="button"
                aria-selected={picked}
                className={`rounded-full border px-3 py-2 ${picked ? "border-brand-purple bg-brand-purple-mist" : "border-border"}`}
              >
                <Text className="font-sans-medium text-foreground text-sm">
                  +{days} days · {shortDate(at)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          value={draft.dateText}
          onChangeText={(dateText) => {
            const at = parseCloseDate(dateText);
            update({ dateText, ...(at ? { closesAt: at } : {}) });
          }}
          placeholder="Or type a date, e.g. 2026-11-30"
          accessibilityLabel="Close date"
          isInvalid={draft.dateText.trim() !== "" && typed === undefined}
        />
        <Text className="font-sans text-muted text-sm">
          {draft.closesAt
            ? `Closes at the end of ${new Date(draft.closesAt).toDateString()}.`
            : "Pick when Pre-orders stop."}
        </Text>
      </Card>

      <Card className="gap-2">
        <Text className="font-sans-semibold text-foreground">Shipping Fee estimate per unit</Text>
        <Input
          value={draft.feeText}
          onChangeText={(feeText) => update({ feeText })}
          keyboardType="decimal-pad"
          placeholder="Optional, GH₵"
          accessibilityLabel="Shipping Fee estimate per unit"
        />
        <Text className="font-sans text-muted text-xs">
          Shown to Customers as an estimate. Staff confirm the real fee on arrival.
        </Text>
      </Card>

      <Card className="gap-2">
        <Text className="font-sans-semibold text-foreground">Minimum Order Quantity</Text>
        <Input
          value={draft.minimumText}
          onChangeText={(minimumText) => update({ minimumText })}
          keyboardType="number-pad"
          placeholder="Optional"
          accessibilityLabel="Minimum Order Quantity"
        />
        <Text className="font-sans text-muted text-xs">
          Fewest units per Pre-order, counted across Variants.
        </Text>
      </Card>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-foreground">
            {offered.length} Variant{offered.length === 1 ? "" : "s"}
          </Text>
          <Pressable onPress={() => goTo(2)} accessibilityRole="button" hitSlop={8}>
            <Text className="font-sans-semibold text-brand-purple text-sm">Edit</Text>
          </Pressable>
        </View>
        {offered.map((row) => {
          const price = parseGhs(row.priceText);
          return (
            <Text key={row.variantId} className="font-sans text-muted text-sm">
              {row.label} · {price ? formatGhs(price) : "🔒 Owner sets"}
              {row.capText.trim() ? ` · cap ${row.capText.trim()}` : ""}
            </Text>
          );
        })}
      </Card>

      {blockers.length === 0 ? (
        <Card className="flex-row items-center gap-2 bg-brand-purple-mist">
          <Ionicons name="checkmark-circle" size={20} color={brand.success} />
          <Text className="font-sans-semibold text-foreground">Ready to open</Text>
        </Card>
      ) : (
        <Card className="gap-1.5">
          <Text className="font-sans-semibold text-foreground">Can't open yet</Text>
          {blockers.map((blocker) => (
            <View key={blocker} className="flex-row items-center gap-2">
              <Ionicons name="close-circle" size={16} color={brand.danger} />
              <Text className="flex-1 font-sans text-foreground text-sm">{blocker}</Text>
            </View>
          ))}
          {!isOwner && blockers.every((b) => b.endsWith("(Owner)")) ? (
            <Text className="mt-1 font-sans text-muted text-xs">
              Save it as a draft: it shows in the Owner's Needs prices list.
            </Text>
          ) : null}
        </Card>
      )}
    </View>
  );
}

function DoneScreen({
  stage,
  productId,
  name,
  isOwner,
}: {
  stage: "draft" | "open";
  productId: Id<"products">;
  name: string;
  isOwner: boolean;
}) {
  const open = stage === "open";
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <View
        className={`size-20 items-center justify-center rounded-full ${open ? "bg-brand-purple-mist" : "bg-brand-muted"}`}
      >
        <Ionicons
          name={open ? "checkmark" : "create-outline"}
          size={40}
          color={open ? brand.success : brand.ink}
        />
      </View>
      <Text className="mt-5 text-center font-display text-2xl text-foreground">
        {open ? "Window open" : "Draft saved"}
      </Text>
      <Text className="mt-2 text-center font-sans text-base text-muted">
        {open
          ? `${name} is taking Pre-orders on the Storefront.`
          : isOwner
            ? `Customers can't see it until it's opened.`
            : `It's in the Owner's Needs prices list. Customers can't see it until it's opened.`}
      </Text>
      <Button
        className="mt-8"
        onPress={() =>
          router.replace({
            pathname: "/windows/product",
            params: { productId },
          })
        }
      >
        <Button.Label>See the window</Button.Label>
      </Button>
    </View>
  );
}
