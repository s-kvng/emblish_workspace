import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import type { AdjustmentReason } from "@emblish_workspace/backend/convex/model/stock";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams } from "expo-router";
import { Button, FieldError, Input, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { variantLabel } from "@/components/product-wizard/draft";
import { ScreenHeader } from "@/components/screen-header";
import {
  adjustmentReasons,
  movementKindLabel,
  reasonLabel,
  signedQuantity,
} from "@/components/stock-labels";
import { refusalMessage } from "@/lib/form-errors";

type VariantStock = FunctionReturnType<typeof api.backOffice.stock.variant>;
type Movement = VariantStock["movements"][number];

/** A Variant's Stock: its counts, an Adjustment or Sold offline form, then its ledger. */
export default function VariantStockScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stock = useQuery(api.backOffice.stock.variant, {
    variantId: id as Id<"variants">,
  });

  if (stock === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <ScreenHeader title={variantLabel(stock)} backLabel="Back to Stock">
        <Text className="mt-1 font-sans text-sm text-white/80">
          {stock.productName}
          {stock.sku ? ` · ${stock.sku}` : ""}
        </Text>
      </ScreenHeader>
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row gap-3">
          <Count label="On hand" value={stock.onHand} />
          <Count label="Held" value={stock.held} />
          <Count label="Available" value={stock.available} highlight />
        </View>
        <RecordForm variantId={stock._id} onHand={stock.onHand} />
        <Ledger movements={stock.movements} />
      </View>
    </KeyboardAwareScrollView>
  );
}

function Count({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View
      className={`flex-1 rounded-2xl border p-3 ${highlight ? "border-brand-purple bg-brand-purple-mist" : "border-border bg-surface"}`}
    >
      <Text className="font-sans-semibold text-[11px] text-muted uppercase tracking-[1px]">
        {label}
      </Text>
      <Text className="mt-1 font-display text-[28px] text-foreground">{value}</Text>
    </View>
  );
}

type Mode = "adjustment" | "soldOffline";

function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      className={`min-h-11 justify-center rounded-full border px-4 ${selected ? "border-brand-purple bg-brand-purple" : "border-border bg-surface"}`}
    >
      <Text className={`font-sans-semibold text-sm ${selected ? "text-white" : "text-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecordForm({ variantId, onHand }: { variantId: Id<"variants">; onHand: number }) {
  const adjust = useMutation(api.backOffice.stock.adjust);
  const sellOffline = useMutation(api.backOffice.stock.sellOffline);
  const [mode, setMode] = useState<Mode>("adjustment");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [quantityText, setQuantityText] = useState("");
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : 0;
  const takesOut = mode === "soldOffline" || direction === "remove";
  const tooMany = takesOut && quantity > onHand;
  const ready = quantity > 0 && !tooMany && (mode === "soldOffline" || reason !== null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSaved(null);
  };

  const record = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      if (mode === "soldOffline") {
        await sellOffline({ variantId, quantity, note });
        setSaved(`Recorded ${quantity} sold offline.`);
      } else if (reason) {
        const signed = direction === "add" ? quantity : -quantity;
        await adjust({ variantId, quantity: signed, reason, note });
        setSaved(`Adjusted by ${signedQuantity(signed)}.`);
      }
      setQuantityText("");
      setReason(null);
      setNote("");
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <View accessibilityRole="radiogroup" className="flex-row gap-2">
        <Pill
          label="Adjustment"
          selected={mode === "adjustment"}
          onPress={() => switchMode("adjustment")}
        />
        <Pill
          label="Sold offline"
          selected={mode === "soldOffline"}
          onPress={() => switchMode("soldOffline")}
        />
      </View>

      {mode === "adjustment" ? (
        <View accessibilityRole="radiogroup" className="flex-row gap-2">
          <Pill
            label="− Take out"
            selected={direction === "remove"}
            onPress={() => setDirection("remove")}
          />
          <Pill label="+ Add" selected={direction === "add"} onPress={() => setDirection("add")} />
        </View>
      ) : (
        <Text className="font-sans text-muted text-sm">
          A walk-in, WhatsApp or DM sale. Only the quantity is recorded, with no price.
        </Text>
      )}

      <TextField isInvalid={tooMany}>
        <Text className="mb-1.5 font-sans-semibold text-foreground text-sm">Quantity</Text>
        <Input
          value={quantityText}
          onChangeText={(text) => setQuantityText(text.replace(/\D/g, ""))}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="Quantity"
        />
        <FieldError isInvalid={tooMany}>
          {`Only ${onHand} on hand, so no more than that can come out.`}
        </FieldError>
      </TextField>

      {mode === "adjustment" ? (
        <View className="gap-1.5">
          <Text className="font-sans-semibold text-foreground text-sm">Reason</Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {adjustmentReasons.map((option) => (
              <Pill
                key={option.value}
                label={option.label}
                selected={reason === option.value}
                onPress={() => setReason(option.value)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <TextField>
        <Text className="mb-1.5 font-sans-semibold text-foreground text-sm">Note (optional)</Text>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={
            mode === "soldOffline" ? "e.g. Walk-in, cash" : "e.g. Water damage in transit"
          }
          accessibilityLabel="Note"
        />
      </TextField>

      <FieldError isInvalid={!!error}>{error}</FieldError>
      {saved ? <Text className="font-sans-semibold text-sm text-success">{saved}</Text> : null}
      <Button size="lg" onPress={record} isDisabled={saving || !ready}>
        <Button.Label>
          {mode === "soldOffline" ? "Record sold offline" : "Record adjustment"}
        </Button.Label>
      </Button>
    </View>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function Ledger({ movements }: { movements: Movement[] }) {
  return (
    <View className="rounded-2xl border border-border bg-surface">
      <Text className="px-4 pt-4 pb-2 font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
        Ledger
      </Text>
      {movements.length === 0 ? (
        <Text className="px-4 pb-4 font-sans text-muted text-sm">
          No Stock Movements yet. Record one above.
        </Text>
      ) : (
        movements.map((movement) => <LedgerRow key={movement._id} movement={movement} />)
      )}
    </View>
  );
}

function LedgerRow({ movement }: { movement: Movement }) {
  const title = movement.reason
    ? `${movementKindLabel[movement.kind]} · ${reasonLabel(movement.reason)}`
    : movementKindLabel[movement.kind];
  return (
    <View className="flex-row gap-3 border-border border-t px-4 py-3">
      <View className="flex-1">
        <Text className="font-sans-semibold text-foreground">{title}</Text>
        {movement.note ? (
          <Text className="font-sans text-foreground text-sm">{movement.note}</Text>
        ) : null}
        <Text className="font-sans text-muted text-xs">
          {dateFormat.format(movement._creationTime)} · {movement.staffName ?? "System"}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={`font-sans-bold text-base ${movement.quantity > 0 ? "text-success" : "text-danger"}`}
        >
          {signedQuantity(movement.quantity)}
        </Text>
        <Text className="font-sans text-muted text-xs">= {movement.balance}</Text>
      </View>
    </View>
  );
}
