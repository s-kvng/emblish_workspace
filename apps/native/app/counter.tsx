import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import type { OverrideReason } from "@emblish_workspace/backend/convex/model/orders";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Input, Spinner } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pickupCodeLength } from "@emblish_workspace/backend/convex/model/orders";

import {
  customerLabel,
  lineLabel,
  orderStatusLabel,
  overrideReasons,
} from "@/components/order-labels";
import { refusalMessage } from "@/lib/form-errors";

type Override = { reason: OverrideReason; note?: string };
/** How one "also ready" order is being proved: its own code, or an override reason. */
type Extra = { code?: string; override?: Override };
type Step = "code" | "noCode" | "reason" | "done";

// An order that's gone (or a bad link) shows the router's error screen with Retry.
export { ErrorBoundary } from "expo-router";

/**
 * The Counter: a full-screen desk over any tab. Code first; a match opens the handover card
 * with the Customer's other ready orders. "Customer has no code" falls back to a phone
 * search and a required reason. Opened with `orderId`, it's aimed at that order.
 */
export default function CounterScreen() {
  const insets = useSafeAreaInsets();
  const { orderId: aimedId } = useLocalSearchParams<{ orderId?: string }>();
  const aimed = useQuery(
    api.backOffice.orders.get,
    aimedId ? { orderId: aimedId as Id<"orders"> } : "skip",
  );
  const handOver = useMutation(api.backOffice.orders.handOver);

  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [pickedId, setPickedId] = useState<Id<"orders"> | null>(null);
  const [handedTo, setHandedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = code.length === pickupCodeLength;
  const card = useQuery(api.backOffice.orders.findByCode, complete ? { code } : "skip");
  // Aimed at an order that hasn't loaded yet, nothing is judged until it has.
  const aimedLoading = !!aimedId && aimed === undefined;
  // While handing over, the live lookup drops the order as it's Collected: that's no wrong code.
  const judging = complete && card !== undefined && !aimedLoading && !busy;
  const wrongCode =
    judging && (card === null || (aimed !== undefined && card.orderId !== aimed.orderId));
  const matched = judging && card && !wrongCode ? card : null;

  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!wrongCode) return;
    Animated.sequence(
      [10, -10, 8, -8, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 60, useNativeDriver: true }),
      ),
    ).start();
  }, [wrongCode, shake]);

  const reset = () => {
    // The next Customer isn't the one this Counter was opened for.
    if (aimedId) router.setParams({ orderId: undefined });
    setStep("code");
    setCode("");
    setExtras({});
    setPickedId(null);
    setError(null);
  };

  const submit = async (
    orders: { orderId: Id<"orders">; code?: string; override?: Override }[],
    name: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await handOver({ orders });
      setHandedTo(name);
      setStep("done");
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  const noCode = () => {
    if (aimedLoading) return;
    setError(null);
    if (aimed) {
      setPickedId(aimed.orderId);
      setStep("reason");
    } else {
      setStep("noCode");
    }
  };

  return (
    <View className="flex-1 bg-brand-purple-deep">
      <View className="flex-row items-center px-4" style={{ paddingTop: insets.top + 8 }}>
        <Text className="flex-1 font-display text-[24px] text-white">Counter</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close the Counter"
          className="size-11 items-center justify-center"
        >
          <Ionicons name="close" size={26} color="white" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="grow gap-4 p-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === "done" ? (
          <Done name={handedTo} onNext={reset} />
        ) : step === "noCode" ? (
          <PhoneLookup
            onPick={(id) => {
              setPickedId(id);
              setStep("reason");
            }}
            onBack={reset}
          />
        ) : step === "reason" && pickedId ? (
          <ReasonStep
            orderId={pickedId}
            busy={busy}
            error={error}
            onBack={reset}
            onHandOver={(override, name) => submit([{ orderId: pickedId, override }], name)}
          />
        ) : matched ? (
          <HandoverCard
            card={matched}
            extras={extras}
            setExtras={setExtras}
            busy={busy}
            error={error}
            onBack={reset}
            onHandOver={() => {
              const name = customerLabel(matched.customer);
              submit(
                [
                  { orderId: matched.orderId, code },
                  ...Object.entries(extras).map(([orderId, extra]) => ({
                    orderId: orderId as Id<"orders">,
                    ...extra,
                  })),
                ],
                name,
              );
            }}
          />
        ) : (
          <>
            <Text className="text-center font-sans text-base text-white/80">
              {aimed
                ? `Ask ${aimed.customer.name ?? "the Customer"} for the code for ${aimed.reference}`
                : "Enter the Customer's Pickup Code"}
            </Text>
            <Animated.View
              style={{ transform: [{ translateX: shake }] }}
              className="flex-row justify-center gap-2"
              accessibilityLabel={`Code entered: ${code.split("").join(" ") || "none"}`}
            >
              {Array.from({ length: pickupCodeLength }, (_, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed boxes, one per digit place
                  key={i}
                  className={`h-14 w-11 items-center justify-center rounded-xl border-2 ${wrongCode ? "border-red-400" : i === code.length ? "border-brand-gold" : "border-white/25"}`}
                >
                  <Text className="font-sans-bold text-[26px] text-white">{code[i] ?? ""}</Text>
                </View>
              ))}
            </Animated.View>
            <Text
              className="min-h-5 text-center font-sans-semibold text-red-300 text-sm"
              accessibilityLiveRegion="polite"
            >
              {wrongCode
                ? card && aimed
                  ? `That code is for ${card.reference}, not ${aimed.reference}.`
                  : "No order with that code"
                : complete && !judging
                  ? "Checking…"
                  : ""}
            </Text>
            <Keypad
              onDigit={(d) => setCode((c) => (c.length < pickupCodeLength ? c + d : c))}
              onDelete={() => setCode((c) => c.slice(0, -1))}
            />
            <Pressable onPress={noCode} accessibilityRole="button" className="items-center py-3">
              <Text className="font-sans-semibold text-base text-brand-gold-bright">
                Customer has no code →
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Keypad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <View className="mx-auto w-full max-w-xs flex-row flex-wrap">
      {keys.map((key) => (
        <View key={key || "blank"} className="w-1/3 p-1.5">
          {key === "" ? null : (
            <Pressable
              onPress={() => (key === "del" ? onDelete() : onDigit(key))}
              accessibilityRole="button"
              accessibilityLabel={key === "del" ? "Delete" : key}
              className="h-16 items-center justify-center rounded-2xl bg-white/10 active:bg-white/20"
            >
              {key === "del" ? (
                <Ionicons name="backspace-outline" size={26} color="white" />
              ) : (
                <Text className="font-sans-semibold text-[26px] text-white">{key}</Text>
              )}
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

type Card = NonNullable<ReturnType<typeof useQuery<typeof api.backOffice.orders.findByCode>>>;

function HandoverCard({
  card,
  extras,
  setExtras,
  busy,
  error,
  onBack,
  onHandOver,
}: {
  card: Card;
  extras: Record<string, Extra>;
  setExtras: (next: Record<string, Extra>) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onHandOver: () => void;
}) {
  const name = customerLabel(card.customer);
  const ready = card.status === "ready";
  const extrasComplete = Object.values(extras).every(
    (extra) =>
      extra.code?.length === pickupCodeLength ||
      (extra.override && (extra.override.reason !== "other" || extra.override.note?.trim())),
  );
  return (
    <View className="gap-4">
      <View className="gap-3 rounded-3xl bg-surface p-5">
        <Text className="font-display text-[26px] text-foreground">{name}</Text>
        {ready ? (
          <Text className="font-sans-semibold text-success">✓ Code matches {card.reference}</Text>
        ) : (
          <View className="rounded-xl bg-danger/10 p-3">
            <Text className="font-sans-semibold text-danger">
              {card.reference} can't be handed over: {orderStatusLabel[card.status]}.
            </Text>
          </View>
        )}
        {card.lines.map((line) => (
          <Text key={lineLabel(line)} className="font-sans text-base text-foreground">
            {lineLabel(line)}
          </Text>
        ))}
      </View>

      {card.alsoReady.length > 0 && ready ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-sm text-white/70 uppercase tracking-[1px]">
            Also ready for {name}
          </Text>
          {card.alsoReady.map((other) => {
            const extra = extras[other.orderId];
            const set = (next: Extra | undefined) => {
              const copy = { ...extras };
              if (next) copy[other.orderId] = next;
              else delete copy[other.orderId];
              setExtras(copy);
            };
            return (
              <View key={other.orderId} className="gap-2 rounded-2xl bg-white/10 p-4">
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-white">{other.reference}</Text>
                    {other.lines.map((line) => (
                      <Text key={lineLabel(line)} className="font-sans text-sm text-white/70">
                        {lineLabel(line)}
                      </Text>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => set(extra ? undefined : { code: "" })}
                    accessibilityRole="checkbox"
                    aria-checked={!!extra}
                    className={`min-h-11 justify-center rounded-full px-4 ${extra ? "bg-brand-gold" : "border border-white/40"}`}
                  >
                    <Text
                      className={`font-sans-semibold ${extra ? "text-brand-purple-deep" : "text-white"}`}
                    >
                      {extra ? "Added" : "Add"}
                    </Text>
                  </Pressable>
                </View>
                {extra ? (
                  <View className="gap-2">
                    <TextInput
                      value={extra.code ?? ""}
                      onChangeText={(text) =>
                        set({ code: text.replace(/\D/g, "").slice(0, pickupCodeLength) })
                      }
                      placeholder="Its Pickup Code"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      keyboardType="number-pad"
                      accessibilityLabel={`Pickup Code for ${other.reference}`}
                      className="h-12 rounded-xl bg-white/10 px-3 font-sans text-lg text-white tracking-[4px]"
                    />
                    <Text className="font-sans text-white/60 text-xs">Or, without its code:</Text>
                    <ReasonPills
                      value={extra.override?.reason}
                      onChange={(reason) =>
                        set({ override: { reason, note: extra.override?.note } })
                      }
                      dark
                    />
                    {extra.override?.reason === "other" ? (
                      <TextInput
                        value={extra.override.note ?? ""}
                        onChangeText={(note) => set({ override: { reason: "other", note } })}
                        placeholder="Why?"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        className="h-12 rounded-xl bg-white/10 px-3 font-sans text-white"
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {error ? <Text className="font-sans-semibold text-red-300">{error}</Text> : null}
      {ready ? (
        <BigButton
          label={`Hand over to ${name}`}
          disabled={busy || !extrasComplete}
          onPress={onHandOver}
        />
      ) : null}
      <Pressable onPress={onBack} accessibilityRole="button" className="items-center py-2">
        <Text className="font-sans-semibold text-white/80">Different code</Text>
      </Pressable>
    </View>
  );
}

function ReasonPills({
  value,
  onChange,
  dark,
}: {
  value?: OverrideReason;
  onChange: (reason: OverrideReason) => void;
  dark?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
      {overrideReasons.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            aria-checked={selected}
            className={`min-h-11 justify-center rounded-full border px-4 ${selected ? "border-brand-gold bg-brand-gold" : dark ? "border-white/40" : "border-border bg-surface"}`}
          >
            <Text
              className={`font-sans-semibold text-sm ${selected ? "text-brand-purple-deep" : dark ? "text-white" : "text-foreground"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhoneLookup({
  onPick,
  onBack,
}: {
  onPick: (orderId: Id<"orders">) => void;
  onBack: () => void;
}) {
  const [phone, setPhone] = useState("");
  const searching = phone.replace(/\D/g, "").length >= 9;
  const results = useQuery(api.backOffice.orders.search, searching ? { query: phone } : "skip");
  const ready = (results ?? []).flatMap((customer) =>
    customer.orders
      .filter((order) => order.status === "ready")
      .map((order) => ({ ...order, name: customerLabel(customer) })),
  );
  return (
    <View className="gap-4">
      <Text className="font-sans text-base text-white/80">
        Check the Customer's ID, then find their order by phone number.
      </Text>
      <Input
        value={phone}
        onChangeText={setPhone}
        placeholder="024 123 4567"
        keyboardType="phone-pad"
        accessibilityLabel="Customer's phone number"
        autoFocus
      />
      {searching ? (
        results === undefined ? (
          <Spinner />
        ) : ready.length === 0 ? (
          <Text className="font-sans text-white/70">No ready Pickup orders for that number.</Text>
        ) : (
          ready.map((order) => (
            <Pressable
              key={order.orderId}
              onPress={() => onPick(order.orderId)}
              accessibilityRole="button"
              className="flex-row items-center rounded-2xl bg-surface p-4"
            >
              <View className="flex-1">
                <Text className="font-sans-semibold text-base text-foreground">
                  {order.reference}
                </Text>
                <Text className="font-sans text-muted text-sm">{order.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
            </Pressable>
          ))
        )
      ) : null}
      <Pressable onPress={onBack} accessibilityRole="button" className="items-center py-2">
        <Text className="font-sans-semibold text-white/80">← Back to the keypad</Text>
      </Pressable>
    </View>
  );
}

function ReasonStep({
  orderId,
  busy,
  error,
  onBack,
  onHandOver,
}: {
  orderId: Id<"orders">;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onHandOver: (override: Override, name: string) => void;
}) {
  const order = useQuery(api.backOffice.orders.get, { orderId });
  const [reason, setReason] = useState<OverrideReason | undefined>();
  const [note, setNote] = useState("");
  if (!order) return <Spinner />;
  const name = customerLabel(order.customer);
  const complete = reason !== undefined && (reason !== "other" || note.trim() !== "");
  // A note only goes with "Other", even if one was typed before switching reason.
  const kept = reason === "other" ? note.trim() : "";
  return (
    <View className="gap-4">
      <View className="gap-2 rounded-3xl bg-surface p-5">
        <Text className="font-display text-[26px] text-foreground">{name}</Text>
        <Text className="font-sans-semibold text-muted">{order.reference} · no code</Text>
        {order.lines.map((line) => (
          <Text key={lineLabel(line)} className="font-sans text-base text-foreground">
            {lineLabel(line)}
          </Text>
        ))}
      </View>
      <Text className="font-sans-semibold text-white">Why is there no code?</Text>
      <ReasonPills value={reason} onChange={setReason} dark />
      {reason === "other" ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Say why"
          placeholderTextColor="rgba(255,255,255,0.5)"
          accessibilityLabel="Why there's no code"
          className="h-12 rounded-xl bg-white/10 px-3 font-sans text-white"
        />
      ) : null}
      <Text className="font-sans text-white/60 text-xs">
        The reason is recorded on the order with your name.
      </Text>
      {error ? <Text className="font-sans-semibold text-red-300">{error}</Text> : null}
      <BigButton
        label={`Hand over to ${name}`}
        disabled={busy || !complete || order.primaryAction !== "handOver"}
        onPress={() => reason && onHandOver({ reason, ...(kept ? { note: kept } : {}) }, name)}
      />
      <Pressable onPress={onBack} accessibilityRole="button" className="items-center py-2">
        <Text className="font-sans-semibold text-white/80">← Back to the keypad</Text>
      </Pressable>
    </View>
  );
}

function Done({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <View className="size-28 items-center justify-center rounded-full bg-success">
        <Ionicons name="checkmark" size={72} color="white" />
      </View>
      <Text className="text-center font-display text-[26px] text-white">Handed over to {name}</Text>
      <View className="w-full gap-3">
        <BigButton label="Next customer" onPress={onNext} />
        <Pressable
          onPress={() => router.replace("/")}
          accessibilityRole="button"
          className="items-center py-3"
        >
          <Text className="font-sans-semibold text-base text-white/80">Done · back to Today</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BigButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      aria-disabled={disabled}
      className={`h-16 items-center justify-center rounded-2xl ${disabled ? "bg-white/20" : "bg-brand-gold"}`}
    >
      <Text
        className={`font-sans-bold text-lg ${disabled ? "text-white/60" : "text-brand-purple-deep"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
