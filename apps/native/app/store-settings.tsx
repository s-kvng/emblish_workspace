import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button, FieldError, Input, Label, Spinner, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";
import { useStaffMember } from "@/lib/staff-member";

/**
 * More → Store settings: the pickup point (address and hours, shown at Checkout, on Receipts
 * and in SMS) and the WhatsApp and call numbers. Only an Owner edits them.
 */
export default function StoreSettingsScreen() {
  const insets = useSafeAreaInsets();
  const saved = useQuery(api.backOffice.settings.get);
  const update = useMutation(api.backOffice.settings.update);
  const isOwner = useStaffMember()?.role === "owner";
  const [form, setForm] = useState({ location: "", whatsappNumber: "", callNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      await update(form);
      setStatus("saved");
    } catch (refused) {
      setError(refusalMessage(refused));
      setStatus("idle");
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    editable: isOwner,
    onChangeText: (text: string) => {
      setForm({ ...form, [key]: text });
      setStatus("idle");
    },
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Store settings" backLabel="Back to More" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {saved === undefined ? (
          <Spinner />
        ) : (
          <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
            {isOwner ? null : (
              <Text className="font-sans text-muted text-sm">Only an Owner can change these.</Text>
            )}
            <FieldError isInvalid={!!error}>{error}</FieldError>
            <TextField>
              <Label>Pickup point: address and hours</Label>
              <Input
                {...field("location")}
                multiline
                placeholder={"Osu, Oxford Street\nMon-Sat 9am-6pm"}
              />
            </TextField>
            <TextField>
              <Label>WhatsApp number</Label>
              <Input {...field("whatsappNumber")} keyboardType="phone-pad" />
            </TextField>
            <TextField>
              <Label>Call number</Label>
              <Input {...field("callNumber")} keyboardType="phone-pad" />
            </TextField>
            {isOwner ? (
              <Button onPress={save} isDisabled={status === "saving"}>
                <Button.Label>{status === "saved" ? "Saved" : "Save"}</Button.Label>
              </Button>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
