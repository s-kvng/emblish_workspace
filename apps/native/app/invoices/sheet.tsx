import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shortDay, statePill, statePillClass, voidReasons } from "@/components/invoice-labels";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs, ghsText, parseGhs } from "@/lib/money";

type Sheet = FunctionReturnType<typeof api.backOffice.invoices.sheet>;

// An invoice that's gone (or a bad link) shows the router's error screen with Retry.
export { ErrorBoundary } from "expo-router";

/**
 * The invoice sheet, set out like a paper invoice: lines and total, issued / reissued / due
 * dates and the day count, reminder dots, the payment, and earlier voided versions struck
 * through. An unpaid invoice can be voided and reissued here. Opened on a reissued invoice, it
 * follows to the replacement.
 */
export default function InvoiceSheet() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const sheet = useQuery(api.backOffice.invoices.sheet, {
    invoiceId: invoiceId as Id<"invoices">,
  });
  const insets = useSafeAreaInsets();

  if (sheet === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  const shipping = sheet.lines.find((line) => line.kind === "shippingFee");
  const delivery = sheet.lines.find((line) => line.kind === "deliveryFee");
  const reissued = sheet.voidedVersions.length > 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text className="font-display text-2xl text-foreground">{sheet.number}</Text>
          <Text className="font-sans text-muted text-sm">
            {sheet.customerName ?? sheet.phone} · {sheet.orderReference}
            {sheet.productName ? ` · ${sheet.productName}` : ""}
            {sheet.windowNumber !== undefined ? ` W${sheet.windowNumber}` : ""}
          </Text>
        </View>
        <Text
          className={`overflow-hidden rounded-full px-2 py-0.5 font-sans-semibold text-xs ${statePillClass[sheet.state]}`}
        >
          {statePill({ ...sheet, paidAt: sheet.paid?.paidAt })}
        </Text>
      </View>

      <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
        {sheet.items.map((item) => (
          <Text key={`${item.productName}-${item.variantLabel}`} className="font-sans text-sm">
            {item.arrived}× {item.productName}
            {item.variantLabel ? ` · ${item.variantLabel}` : ""}
            {item.missing > 0 ? ` (${item.missing} didn't arrive)` : ""}
          </Text>
        ))}
        {shipping?.kind === "shippingFee" ? (
          <Row
            label={`Shipping Fee · ${shipping.units} × ${formatGhs(shipping.unitFee)}`}
            amount={shipping.amount}
          />
        ) : null}
        {delivery?.kind === "deliveryFee" ? (
          <Row label={`Delivery · ${delivery.zoneName}`} amount={delivery.amount} />
        ) : null}
        <View className="h-px bg-border" />
        <Row label="Total" amount={sheet.total} bold />
      </View>

      <View className="gap-1">
        <Text className="font-sans text-foreground text-sm">
          First issued {shortDay(sheet.clockStartedAt)}
          {reissued ? ` · reissued ${shortDay(sheet.issuedAt)}` : ""} · due {shortDay(sheet.dueAt)}{" "}
          · day {sheet.day}
        </Text>
        <ReminderDots reminders={sheet.reminders} />
      </View>

      {sheet.paid ? (
        <Text className="font-sans text-foreground text-sm">
          Paid {shortDay(sheet.paid.paidAt)} · Receipt {sheet.paid.receiptNumber}
        </Text>
      ) : null}

      {reissued ? (
        <View className="gap-1">
          <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[1px]">
            Earlier versions
          </Text>
          {sheet.voidedVersions.map((version) => (
            <Text key={version.invoiceId} className="font-sans text-muted text-sm">
              <Text className="line-through">
                {version.number} · {formatGhs(version.total)}
              </Text>
              {version.voidReason ? ` · ${version.voidReason}` : ""}
              {version.voidedAt !== undefined ? ` · voided ${shortDay(version.voidedAt)}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {sheet.status === "unpaid" ? <VoidAndReissue sheet={sheet} /> : null}

      <Button
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: "/orders/detail",
            params: { orderId: sheet.orderId },
          })
        }
      >
        <Button.Label>Open {sheet.orderReference}</Button.Label>
      </Button>
    </ScrollView>
  );
}

function Row({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  const weight = bold ? "font-sans-bold" : "font-sans";
  return (
    <View className="flex-row">
      <Text className={`flex-1 text-foreground text-sm ${weight}`}>{label}</Text>
      <Text className={`text-foreground text-sm ${weight}`}>{formatGhs(amount)}</Text>
    </View>
  );
}

/** d7, d13, d15 and d28 reminders, then d30 in red: filled once the clock has reached them. */
function ReminderDots({ reminders }: { reminders: Sheet["reminders"] }) {
  return (
    <View className="flex-row gap-3" accessibilityLabel="Reminder days reached">
      {reminders.map(({ day, reached }) => {
        const forfeit = day === 30;
        return (
          <View key={day} className="items-center gap-0.5">
            <View
              className={`size-3 rounded-full border ${forfeit ? "border-danger" : "border-brand-purple"} ${reached ? (forfeit ? "bg-danger" : "bg-brand-purple") : ""}`}
            />
            <Text className={`font-sans text-[10px] ${forfeit ? "text-danger" : "text-muted"}`}>
              d{day}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function VoidAndReissue({ sheet }: { sheet: Sheet }) {
  const voidAndReissue = useMutation(api.backOffice.invoices.voidAndReissue);
  const shipping = sheet.lines.find((line) => line.kind === "shippingFee");
  const delivery = sheet.lines.find((line) => line.kind === "deliveryFee");
  const [open, setOpen] = useState(false);
  const [feeText, setFeeText] = useState(
    ghsText(shipping?.kind === "shippingFee" ? shipping.unitFee : undefined),
  );
  const [deliveryText, setDeliveryText] = useState(ghsText(delivery?.amount));
  const [reason, setReason] = useState<(typeof voidReasons)[number]>();
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onPress={() => setOpen(true)}>
        <Button.Label>Void & reissue</Button.Label>
      </Button>
    );
  }

  const unitFee = shipping ? parseGhs(feeText) : undefined;
  const deliveryFee = delivery || deliveryText.trim() ? (parseGhs(deliveryText) ?? 0) : undefined;
  const units = shipping?.kind === "shippingFee" ? shipping.units : 0;
  const newTotal = units * (unitFee ?? 0) + (deliveryFee ?? 0);
  const voidReason = reason === "Other" ? otherText.trim() : reason;
  const valid =
    !!voidReason &&
    !Number.isNaN(unitFee ?? 0) &&
    !Number.isNaN(deliveryFee ?? 0) &&
    (!shipping || unitFee !== undefined);

  const save = async () => {
    if (!valid || !voidReason) return;
    setSaving(true);
    try {
      await voidAndReissue({
        invoiceId: sheet.invoiceId,
        reason: voidReason,
        ...(unitFee !== undefined ? { unitFee } : {}),
        ...(deliveryFee !== undefined ? { deliveryFee } : {}),
      });
      setOpen(false);
    } catch (error) {
      Alert.alert("Couldn't reissue", refusalMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-semibold text-base text-foreground">Void & reissue</Text>
      <Text className="font-sans text-muted text-xs">
        The new invoice keeps the first issue date, so it's still due {shortDay(sheet.dueAt)}. The
        Customer gets its new link by SMS.
      </Text>
      {shipping ? (
        <FeeField
          label={`Shipping Fee per unit (${units} units)`}
          value={feeText}
          onChange={setFeeText}
        />
      ) : null}
      {delivery || sheet.fulfilment.method === "delivery" ? (
        <FeeField label="Delivery Fee" value={deliveryText} onChange={setDeliveryText} />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {voidReasons.map((option) => {
          const selected = reason === option;
          return (
            <Pressable
              key={option}
              onPress={() => setReason(option)}
              accessibilityRole="radio"
              aria-checked={selected}
              className={`min-h-11 justify-center rounded-full border px-4 ${selected ? "border-brand-gold bg-brand-gold" : "border-border bg-surface"}`}
            >
              <Text
                className={`font-sans-semibold text-sm ${selected ? "text-brand-purple-deep" : "text-foreground"}`}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {reason === "Other" ? (
        <TextInput
          value={otherText}
          onChangeText={setOtherText}
          placeholder="Why is it being voided?"
          accessibilityLabel="Void reason"
          className="min-h-11 rounded-xl border border-border px-3 font-sans text-foreground"
        />
      ) : null}
      <Button onPress={save} isDisabled={!valid || saving}>
        <Button.Label>
          {saving ? "Reissuing…" : `Void ${sheet.number} & send ${formatGhs(newTotal)}`}
        </Button.Label>
      </Button>
      <Button variant="ghost" size="sm" onPress={() => setOpen(false)}>
        <Button.Label>Cancel</Button.Label>
      </Button>
    </View>
  );
}

function FeeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <View className="gap-1">
      <Text className="font-sans text-muted text-xs">{label}, GH₵</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        accessibilityLabel={`${label}, in cedis`}
        className="min-h-11 rounded-xl border border-border px-3 font-sans text-foreground"
      />
    </View>
  );
}
