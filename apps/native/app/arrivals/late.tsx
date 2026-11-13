import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { refusalMessage } from "@/lib/form-errors";

/**
 * Add a late arrival: units of an arrived window that turned up after its arrival was locked.
 * They're Surplus, straight into Stock; they don't fill Pre-orders or undo Shortfall refunds.
 */
export default function LateArrivalSheet() {
  const insets = useSafeAreaInsets();
  const { windowId: id } = useLocalSearchParams<{ windowId: string }>();
  const windowId = id as Id<"orderWindows">;
  const sheet = useQuery(api.backOffice.arrivals.countSheet, { windowId });
  const lateArrival = useMutation(api.backOffice.arrivals.lateArrival);
  const [picked, setPicked] = useState<Id<"variants"> | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (sheet === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  const variantId = picked ?? (sheet.variants.length === 1 ? sheet.variants[0]?.variantId : null);
  const units = Number(quantity);
  const valid = variantId && Number.isSafeInteger(units) && units > 0;

  const save = async () => {
    if (!variantId) return;
    setBusy(true);
    try {
      await lateArrival({
        windowId,
        variantId,
        quantity: units,
        note: note.trim() || undefined,
      });
      router.back();
    } catch (error) {
      Alert.alert("Couldn't add it", refusalMessage(error));
    } finally {
      setBusy(false);
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
        <Text className="font-display text-2xl text-foreground">
          Late arrival · {sheet.productName} W{sheet.number}
        </Text>
        <Text className="font-sans text-muted text-sm">
          Units that turned up after the arrival was locked go into Stock as Surplus.
        </Text>
      </View>
      {sheet.variants.length > 1 ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-foreground">Variant</Text>
          <View className="flex-row flex-wrap gap-2">
            {sheet.variants.map((row) => {
              const selected = variantId === row.variantId;
              return (
                <Pressable
                  key={row.variantId}
                  onPress={() => setPicked(row.variantId)}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  className={`min-h-11 justify-center rounded-full px-4 ${selected ? "bg-brand-purple" : "border border-border"}`}
                >
                  <Text
                    className={`font-sans-semibold ${selected ? "text-white" : "text-foreground"}`}
                  >
                    {row.label || "Standard"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">How many turned up?</Text>
        <Input
          value={quantity}
          onChangeText={(text) => setQuantity(text.replace(/\D/g, ""))}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="Units that turned up"
        />
      </View>
      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Note</Text>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Optional, such as a second box from the courier"
          accessibilityLabel="Note"
        />
      </View>
      <Button onPress={save} isDisabled={busy || !valid}>
        <Button.Label>{valid ? `Add ${units} to Stock` : "Add to Stock"}</Button.Label>
      </Button>
    </ScrollView>
  );
}
