import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Button, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { refusalMessage } from "@/lib/form-errors";

/**
 * "Change phone number" on a Today search result, for a Customer who lost their number. Staff
 * check who they are first; once moved, the old number no longer signs in to this Customer and
 * every device they were signed in on is signed out.
 */
export function ReassignPhone({
  customerId,
  phone,
  onMoved,
}: {
  customerId: Id<"customers">;
  phone: string;
  /** Called with the new number in E.164, e.g. to search for it. */
  onMoved: (phone: string) => void;
}) {
  const reassign = useMutation(api.backOffice.customers.reassignPhone);
  const [open, setOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onPress={() => setOpen(true)}>
        <Button.Label>Change phone number</Button.Label>
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setNewPhone("");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const moved = await reassign({ customerId, phone: newPhone });
      close();
      onMoved(moved);
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3 px-4 pb-4">
      <Text className="font-sans text-foreground text-sm">
        Check who they are before moving them off {phone}. Afterwards {phone} no longer signs in as
        this Customer, and they're signed out everywhere until they sign in with the new number.
      </Text>
      <TextField>
        <Label>New phone number</Label>
        <Input
          value={newPhone}
          onChangeText={setNewPhone}
          placeholder="e.g. 024 123 4567"
          keyboardType="phone-pad"
          autoFocus
        />
      </TextField>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={close} isDisabled={busy}>
          <Button.Label>Back</Button.Label>
        </Button>
        <Button
          className="flex-1"
          onPress={submit}
          isDisabled={busy || newPhone.trim().length === 0}
        >
          <Button.Label>{busy ? "Moving…" : "Move to new number"}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
