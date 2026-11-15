import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { windowAlertBlocked } from "@emblish_workspace/backend/convex/model/alertTiming";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shortDate } from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";

/** "14:05", in Ghana time (GMT). */
function ghanaTime(time: number) {
  return new Date(time).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Announce: pick open windows and text one Window Alert about them to every confirmed Alert
 * Subscriber, with the SMS preview and the recipient count. One a day, 08:00 to 20:00.
 */
export default function AnnounceSheet() {
  const insets = useSafeAreaInsets();
  const announce = useMutation(api.backOffice.alerts.announce);
  // Picked windows; until Staff touch it, the open windows not yet announced.
  const [picked, setPicked] = useState<Id<"orderWindows">[] | null>(null);
  const overview = useQuery(api.backOffice.alerts.sheet, { windowIds: [] });
  const defaultPick =
    overview?.windows.filter((w) => w.announcedAt === undefined).map((w) => w.windowId) ?? [];
  const windowIds = picked ?? defaultPick;
  const sheet = useQuery(
    api.backOffice.alerts.sheet,
    overview === undefined ? "skip" : { windowIds },
  );
  const [sending, setSending] = useState(false);

  if (overview === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  const blocked = windowAlertBlocked(Date.now(), overview.lastAlert?.sentAt);
  const recipients = sheet?.recipients ?? overview.recipients;

  const toggle = (windowId: Id<"orderWindows">) =>
    setPicked(
      windowIds.includes(windowId)
        ? windowIds.filter((id) => id !== windowId)
        : [...windowIds, windowId],
    );

  const send = async () => {
    setSending(true);
    try {
      await announce({ windowIds });
      router.back();
    } catch (error) {
      Alert.alert("Couldn't announce", refusalMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      <View className="gap-1">
        <Text className="font-display text-2xl text-foreground">Announce open windows</Text>
        <Text className="font-sans text-muted text-sm">
          One Window Alert a day, sent between 08:00 and 20:00. Pick several windows to name them in
          one text.
        </Text>
      </View>

      {overview.lastAlert ? (
        <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
          <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
            Last alert
          </Text>
          <Text className="font-sans text-foreground text-sm">
            {shortDate(overview.lastAlert.sentAt)} at {ghanaTime(overview.lastAlert.sentAt)} by{" "}
            {overview.lastAlert.staffName}: {overview.lastAlert.products.join(", ")}
          </Text>
          <Text className="font-sans text-muted text-xs">
            Texted to {overview.lastAlert.recipients} Alert Subscriber
            {overview.lastAlert.recipients === 1 ? "" : "s"}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="font-sans-semibold text-foreground">Open windows</Text>
        {overview.windows.length === 0 ? (
          <Text className="font-sans text-muted text-sm">No windows are open now.</Text>
        ) : (
          overview.windows.map((window) => {
            const on = windowIds.includes(window.windowId);
            return (
              <Pressable
                key={window.windowId}
                onPress={() => toggle(window.windowId)}
                accessibilityRole="checkbox"
                aria-checked={on}
                className={`flex-row items-center gap-3 rounded-2xl border p-4 ${on ? "border-brand-purple bg-brand-purple-mist" : "border-border bg-surface"}`}
              >
                <Ionicons
                  name={on ? "checkbox" : "square-outline"}
                  size={22}
                  color={on ? brand.purple : brand["ink-muted"]}
                />
                <View className="flex-1">
                  <Text className="font-sans-semibold text-base text-foreground">
                    {window.productName} · W{window.number}
                  </Text>
                  <Text className="font-sans text-muted text-xs">
                    Closes {shortDate(window.closesAt)}
                    {window.announcedAt
                      ? ` · announced ${shortDate(window.announcedAt)}`
                      : " · not announced yet"}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {sheet?.preview ? (
        <View className="gap-2">
          <Text className="font-sans-semibold text-foreground">SMS preview</Text>
          <View className="self-start rounded-2xl rounded-bl-sm bg-surface p-3">
            <Text className="font-sans text-foreground text-sm">{sheet.preview}</Text>
          </View>
          <Text className="font-sans text-muted text-xs">
            Each Alert Subscriber gets their own Stop alerts link.
          </Text>
        </View>
      ) : null}

      {blocked === "sentToday" ? (
        <Text className="font-sans text-muted text-sm">
          Today's alert has gone out. The next can go tomorrow.
        </Text>
      ) : blocked === "outsideSmsHours" ? (
        <Text className="font-sans text-muted text-sm">
          Window Alerts go out between 08:00 and 20:00.
        </Text>
      ) : null}

      <Button
        onPress={send}
        isDisabled={sending || windowIds.length === 0 || recipients === 0 || blocked !== null}
      >
        <Button.Label>
          {`Text ${recipients} Alert Subscriber${recipients === 1 ? "" : "s"}`}
        </Button.Label>
      </Button>
    </ScrollView>
  );
}
