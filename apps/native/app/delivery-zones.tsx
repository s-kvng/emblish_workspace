import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Button, FieldError, Input, Label, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs, ghsText, parseGhs } from "@/lib/money";
import { useStaffMember } from "@/lib/staff-member";

type Zone = FunctionReturnType<typeof api.backOffice.deliveryZones.list>[number];

/**
 * More → Delivery Zones: where we deliver and each zone's flat Delivery Fee. Every Staff
 * member can look; only an Owner adds, edits or disables a zone (the server checks too).
 */
export default function DeliveryZonesScreen() {
  const insets = useSafeAreaInsets();
  const zones = useQuery(api.backOffice.deliveryZones.list);
  const isOwner = useStaffMember()?.role === "owner";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Delivery Zones" backLabel="Back to More" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Text className="font-sans text-muted text-sm">
          A fee change only affects new Checkouts: every order keeps the fee it was placed with.
          Disabled zones are hidden from Checkout.
        </Text>
        {isOwner ? <ZoneForm /> : null}
        {zones === undefined ? (
          <Spinner />
        ) : (
          <View className="rounded-2xl border border-border bg-surface">
            {zones.map((zone) => (
              <ZoneRow key={zone._id} zone={zone} isOwner={isOwner} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** Adds a zone, or edits one when given it. */
function ZoneForm({ zone, onDone }: { zone?: Zone; onDone?: () => void }) {
  const create = useMutation(api.backOffice.deliveryZones.create);
  const update = useMutation(api.backOffice.deliveryZones.update);
  const [name, setName] = useState(zone?.name ?? "");
  const [areas, setAreas] = useState(zone?.areas ?? "");
  const [fee, setFee] = useState(ghsText(zone?.fee));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const quoted = zone?.isElsewhere ?? false;

  const save = async () => {
    const pesewas = parseGhs(fee);
    if (!quoted && (pesewas === undefined || Number.isNaN(pesewas))) {
      setError("Enter the Delivery Fee in cedis, like 30 or 30.50.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (zone) {
        await update({
          zoneId: zone._id,
          name,
          areas,
          ...(quoted ? {} : { fee: pesewas }),
        });
      } else {
        await create({ name, areas, fee: pesewas ?? 0 });
        setName("");
        setAreas("");
        setFee("");
      }
      onDone?.();
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      className={
        zone
          ? "gap-3 border-border border-t p-4"
          : "gap-3 rounded-2xl border border-border bg-surface p-4"
      }
    >
      {zone ? null : (
        <Text className="font-sans-semibold text-base text-foreground">Add a Delivery Zone</Text>
      )}
      <FieldError isInvalid={!!error}>{error}</FieldError>
      <TextField>
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} placeholder="e.g. Accra Central" />
      </TextField>
      <TextField>
        <Label>Areas</Label>
        <Input
          value={areas}
          onChangeText={setAreas}
          placeholder="Osu, Labone, Cantonments"
          multiline
        />
      </TextField>
      {quoted ? (
        <Text className="font-sans text-muted text-sm">No set fee: Staff quote it per order.</Text>
      ) : (
        <TextField>
          <Label>Delivery Fee (GH₵, per order)</Label>
          <Input value={fee} onChangeText={setFee} keyboardType="decimal-pad" placeholder="30" />
        </TextField>
      )}
      <View className="flex-row gap-2">
        {onDone ? (
          <Button variant="secondary" className="flex-1" onPress={onDone}>
            <Button.Label>Cancel</Button.Label>
          </Button>
        ) : null}
        <Button className="flex-1" onPress={save} isDisabled={saving || !name.trim()}>
          <Button.Label>{zone ? "Save" : "Add zone"}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function ZoneRow({ zone, isOwner }: { zone: Zone; isOwner: boolean }) {
  const setActive = useMutation(api.backOffice.deliveryZones.setActive);
  const [editing, setEditing] = useState(false);

  if (editing) return <ZoneForm zone={zone} onDone={() => setEditing(false)} />;

  return (
    <View className="flex-row items-center gap-3 border-border border-t p-4 first:border-t-0">
      <Pressable
        className="flex-1"
        disabled={!isOwner}
        onPress={() => setEditing(true)}
        accessibilityRole={isOwner ? "button" : undefined}
        accessibilityHint={isOwner ? "Edit this zone" : undefined}
      >
        <Text
          className={`font-sans-semibold text-base ${zone.active ? "text-foreground" : "text-muted"}`}
        >
          {zone.name}
          {zone.active ? "" : " · disabled"}
        </Text>
        {zone.areas ? <Text className="font-sans text-muted text-sm">{zone.areas}</Text> : null}
        <Text className="mt-1 font-sans-medium text-brand-purple text-sm">
          {zone.fee === undefined ? "Quoted per order" : formatGhs(zone.fee)}
        </Text>
      </Pressable>
      {isOwner ? (
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            setActive({ zoneId: zone._id as Id<"deliveryZones">, active: !zone.active })
          }
        >
          <Button.Label>{zone.active ? "Disable" : "Enable"}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
