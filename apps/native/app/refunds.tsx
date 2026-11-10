import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { RefundMethod } from "@emblish_workspace/backend/convex/model/refunds";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customerLabel, refundKindLabel, refundMethods } from "@/components/order-labels";
import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs } from "@/lib/money";

type Row = FunctionReturnType<typeof api.backOffice.refunds.toMake>["refunds"][number];

/**
 * Refunds to make: every Refund still owed, of every kind, with the GH₵ total. Seev has no
 * refunds API, so the Owner sends the money from the Seev dashboard (or by MoMo or cash) and
 * then marks it refunded here. Staff see the list with the action locked.
 */
export default function RefundsScreen() {
  const insets = useSafeAreaInsets();
  const toMake = useQuery(api.backOffice.refunds.toMake);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Refunds to make" backLabel="Back to Today">
        <Text className="mt-2 font-display text-[22px] text-white">
          {toMake === undefined ? "…" : formatGhs(toMake.total)}
        </Text>
      </ScreenHeader>
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Text className="font-sans text-muted text-sm">
          Send each one from the Seev dashboard (find it by its Seev reference), or by mobile money
          or cash, then mark it refunded.
        </Text>
        {toMake === undefined ? (
          <Spinner />
        ) : toMake.refunds.length === 0 ? (
          <Text className="font-sans text-muted text-sm">Nothing to refund.</Text>
        ) : (
          toMake.refunds.map((row) => (
            <RefundRow key={row.refundId} row={row} canRefund={toMake.canRefund} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function RefundRow({ row, canRefund }: { row: Row; canRefund: boolean }) {
  const [paying, setPaying] = useState(false);
  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">
            {customerLabel({ name: row.customerName, phone: row.phone })}
          </Text>
          <Text className="font-sans text-muted text-xs">
            {refundKindLabel[row.kind]}
            {row.orderReference ? ` · ${row.orderReference}` : ""} · {row.receiptNumber} · Seev{" "}
            {row.seevReference}
          </Text>
        </View>
        <Text className="font-sans-bold text-base text-foreground">{formatGhs(row.amount)}</Text>
      </View>
      {row.note ? <Text className="font-sans text-foreground text-sm">{row.note}</Text> : null}
      <Text className="font-sans text-muted text-xs">
        {row.phone} · flagged {new Date(row.flaggedAt).toLocaleDateString("en-GH")}
        {row.returnToStock ? " · units back in Stock" : ""}
      </Text>
      {row.orderId ? (
        <Link href={{ pathname: "/orders/detail", params: { id: row.orderId } }} asChild>
          <Pressable accessibilityRole="link" className="min-h-11 justify-center">
            <Text className="font-sans-semibold text-brand-purple">Open {row.orderReference}</Text>
          </Pressable>
        </Link>
      ) : null}
      {!canRefund ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="lock-closed" size={16} color={brand["ink-muted"]} />
          <Text className="font-sans text-muted text-sm">Only an Owner can refund.</Text>
        </View>
      ) : paying ? (
        <MarkRefundedForm row={row} onBack={() => setPaying(false)} />
      ) : (
        <Button onPress={() => setPaying(true)}>
          <Button.Label>Mark refunded</Button.Label>
        </Button>
      )}
    </View>
  );
}

/** How the money went back, with a note (needed for "Other"), then Mark refunded. */
function MarkRefundedForm({ row, onBack }: { row: Row; onBack: () => void }) {
  const markRefunded = useMutation(api.backOffice.refunds.markRefunded);
  const [method, setMethod] = useState<RefundMethod | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!method) return;
    setBusy(true);
    setError(null);
    try {
      await markRefunded({ refundId: row.refundId, method, note: note || undefined });
    } catch (refused) {
      setError(refusalMessage(refused));
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-foreground">
        How did you send {formatGhs(row.amount)}?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {refundMethods.map((option) => {
          const picked = method === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setMethod(option.value)}
              accessibilityRole="radio"
              aria-checked={picked}
              className={`min-h-11 justify-center rounded-full px-4 ${picked ? "bg-brand-purple" : "border border-border"}`}
            >
              <Text className={`font-sans-semibold ${picked ? "text-white" : "text-foreground"}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Input
        value={note}
        onChangeText={setNote}
        placeholder={method === "other" ? "How was it sent?" : "Transaction id or note (optional)"}
        accessibilityLabel="Payout note"
      />
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={onBack} isDisabled={busy}>
          <Button.Label>Back</Button.Label>
        </Button>
        <Button
          className="flex-1"
          onPress={submit}
          isDisabled={busy || !method || (method === "other" && !note.trim())}
        >
          <Button.Label>Mark refunded</Button.Label>
        </Button>
      </View>
    </View>
  );
}
