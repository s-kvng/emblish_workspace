import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { Button } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { refusalMessage } from "@/lib/form-errors";
import { useStaffMember } from "@/lib/staff-member";

/**
 * Forfeit, offered on order detail and the invoice sheet once a Pre-order's Shipping Fee Invoice
 * is unpaid from day 30. Only an Owner can do it (Staff see it locked); it asks to confirm first,
 * since the Customer is texted and the Item Payment is kept.
 */
export function ForfeitAction({
  orderId,
  reference,
}: {
  orderId: Id<"orders">;
  reference: string;
}) {
  const isOwner = useStaffMember()?.role === "owner";
  const forfeit = useMutation(api.backOffice.orders.forfeit);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) {
    return (
      <View className="flex-row items-center gap-2">
        <Ionicons name="lock-closed" size={16} color={brand["ink-muted"]} />
        <Text className="flex-1 font-sans text-muted text-sm">
          Unpaid 30 days. Only an Owner can Forfeit {reference}.
        </Text>
      </View>
    );
  }
  if (!confirming) {
    return (
      <Button variant="danger-soft" onPress={() => setConfirming(true)}>
        <Button.Label>Forfeit {reference}</Button.Label>
      </Button>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await forfeit({ orderId });
      setConfirming(false);
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <Text className="font-sans text-foreground text-sm">
        {reference} ends Forfeited: its unpaid invoices are voided, its units go back into Stock,
        and the Customer is texted. The Item Payment is not refunded.
      </Text>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => setConfirming(false)}
          isDisabled={busy}
        >
          <Button.Label>Back</Button.Label>
        </Button>
        <Button variant="danger" className="flex-1" onPress={submit} isDisabled={busy}>
          <Button.Label>{busy ? "Forfeiting…" : "Forfeit"}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
