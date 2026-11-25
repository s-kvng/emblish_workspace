import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { refusalMessage } from "@/lib/form-errors";
import { formatGhs } from "@/lib/money";

type Order = FunctionReturnType<typeof api.backOffice.orders.get>;
type Choice = FunctionReturnType<typeof api.backOffice.orders.switchOptions>["choices"][number];
type Effect = Choice["effects"][number];

/** One money effect, as Staff read it on the money-effect panel. */
export function switchEffectText(effect: Effect) {
  switch (effect.kind) {
    case "onComingInvoice":
      return `Delivery Fee ${formatGhs(effect.amount)} goes on the Shipping Fee Invoice when it's issued`;
    case "invoiceReissued":
      return `${effect.number} voided & reissued at ${formatGhs(effect.total)}, due date kept`;
    case "invoiceVoided":
      return `${effect.number} (${formatGhs(effect.amount)}) voided, nothing left on it`;
    case "newInvoice":
      return `Delivery Fee Invoice for ${formatGhs(effect.amount)}, texted to the Customer`;
    case "refund":
      return `${formatGhs(effect.amount)} flagged on Refunds to make`;
    case "refundCancelled":
      return `${formatGhs(effect.amount)} pending refund taken back to cover it`;
    case "quoteLater":
      return "Elsewhere in Ghana: quote the Delivery Fee after switching";
  }
}

function differenceText(difference: number | undefined) {
  if (difference === undefined || difference === 0) return null;
  return `${difference > 0 ? "+" : "−"}${formatGhs(Math.abs(difference))}`;
}

function keyOf(choice: Choice) {
  return choice.method === "pickup" ? "pickup" : choice.zoneId;
}

/**
 * ⋯ → Switch fulfilment, until dispatch: Pickup and every zone with its fee difference, the
 * address for Delivery, and a money-effect panel showing exactly what the switch will do.
 */
export function SwitchFulfilment({ order, onDone }: { order: Order; onDone: () => void }) {
  const options = useQuery(api.backOffice.orders.switchOptions, {
    orderId: order.orderId,
  });
  const switchFulfilment = useMutation(api.backOffice.orders.switchFulfilment);
  const current = order.fulfilment.method === "delivery" ? order.fulfilment : null;
  const [picked, setPicked] = useState<string | null>(null);
  const [area, setArea] = useState(current?.area ?? "");
  const [street, setStreet] = useState(current?.street ?? "");
  const [landmark, setLandmark] = useState(current?.landmark ?? "");
  const [ghanaPostGps, setGhanaPostGps] = useState(current?.ghanaPostGps ?? "");
  const [recipientName, setRecipientName] = useState(current?.recipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(current?.recipientPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options === undefined) return <Spinner />;
  if (!options.switchable) {
    return <Text className="font-sans text-muted text-sm">This order can't switch any more.</Text>;
  }
  const choice = options.choices.find((c) => keyOf(c) === picked);
  const ready =
    choice !== undefined &&
    (choice.method === "pickup" || (area.trim() !== "" && landmark.trim() !== ""));

  const submit = async () => {
    if (!choice || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await switchFulfilment({
        orderId: order.orderId,
        expected: choice.effects,
        to:
          choice.method === "pickup"
            ? { method: "pickup" }
            : {
                method: "delivery",
                zoneId: choice.zoneId as Id<"deliveryZones">,
                area,
                landmark,
                ...(street.trim() ? { street } : {}),
                ...(ghanaPostGps.trim() ? { ghanaPostGps } : {}),
                ...(recipientName.trim() ? { recipientName } : {}),
                ...(recipientPhone.trim() ? { recipientPhone } : {}),
              },
      });
      onDone();
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      {options.choices.map((c) => {
        const key = keyOf(c);
        const selected = picked === key;
        const diff = differenceText(c.difference);
        return (
          <Pressable
            key={key}
            onPress={() => setPicked(key)}
            accessibilityRole="radio"
            aria-checked={selected}
            className={`min-h-11 flex-row items-center gap-2 rounded-lg border p-3 ${
              selected ? "border-brand-purple bg-brand-purple-mist" : "border-border"
            }`}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? brand.purple : brand["ink-muted"]}
            />
            <View className="flex-1">
              <Text className="font-sans-semibold text-foreground">
                {c.method === "pickup" ? "Pickup" : c.zoneName}
                {c.method === "delivery" && c.current ? " (now)" : ""}
              </Text>
              {c.method === "delivery" ? (
                <Text className="font-sans text-muted text-xs">{c.areas}</Text>
              ) : null}
            </View>
            <View className="items-end">
              {c.method === "delivery" ? (
                <Text className="font-sans text-foreground">
                  {c.fee === undefined ? "Quote" : formatGhs(c.fee)}
                </Text>
              ) : null}
              {diff ? <Text className="font-sans text-brand-purple text-xs">{diff}</Text> : null}
            </View>
          </Pressable>
        );
      })}

      {choice?.method === "delivery" ? (
        <View className="gap-2">
          <Input
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Recipient name"
            accessibilityLabel="Recipient name"
          />
          <Input
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            placeholder="Recipient phone"
            accessibilityLabel="Recipient phone"
            keyboardType="phone-pad"
          />
          <Input value={area} onChangeText={setArea} placeholder="Area" accessibilityLabel="Area" />
          <Input
            value={street}
            onChangeText={setStreet}
            placeholder="Street and house (optional)"
            accessibilityLabel="Street and house"
          />
          <Input
            value={landmark}
            onChangeText={setLandmark}
            placeholder="Closest landmark"
            accessibilityLabel="Closest landmark"
          />
          <Input
            value={ghanaPostGps}
            onChangeText={setGhanaPostGps}
            placeholder="GhanaPost GPS (optional)"
            accessibilityLabel="GhanaPost GPS"
            autoCapitalize="characters"
          />
        </View>
      ) : null}

      <View className="gap-1 rounded-lg bg-brand-purple-mist p-3">
        <Text className="font-sans-semibold text-foreground">Money effect</Text>
        {choice === undefined ? (
          <Text className="font-sans text-muted text-sm">Pick where it goes.</Text>
        ) : choice.effects.length === 0 ? (
          <Text className="font-sans text-foreground text-sm">No change to what's owed.</Text>
        ) : (
          choice.effects.map((effect, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: effects are a fixed, ordered list
            <Text key={`${effect.kind}-${i}`} className="font-sans text-foreground text-sm">
              {switchEffectText(effect)}
            </Text>
          ))
        )}
      </View>

      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={onDone} isDisabled={busy}>
          <Button.Label>Back</Button.Label>
        </Button>
        <Button className="flex-1" onPress={submit} isDisabled={busy || !ready}>
          <Button.Label>Switch</Button.Label>
        </Button>
      </View>
    </View>
  );
}
