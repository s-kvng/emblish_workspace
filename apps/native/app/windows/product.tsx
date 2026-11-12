import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import {
  daysUntil,
  expectedLabel,
  shortDate,
  stageLabel,
  timelineStages,
  type WindowStage,
} from "@/components/window-labels";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs } from "@/lib/money";

type OrderWindow = FunctionReturnType<typeof api.backOffice.windows.get>;

const EXTEND_BY = [3, 7, 14] as const;

/** A Product's Order Windows: a chip per window, and the picked one's Stage timeline. */
export default function ProductWindowsScreen() {
  const insets = useSafeAreaInsets();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const windows = useQuery(api.backOffice.windows.forProduct, {
    productId: productId as Id<"products">,
  });
  const [picked, setPicked] = useState<Id<"orderWindows">>();
  const windowId = picked ?? windows?.[0]?.windowId;
  const window = useQuery(api.backOffice.windows.get, windowId ? { windowId } : "skip");
  const busy = windows?.some((w) => w.stage === "draft" || w.stage === "open");

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <ScreenHeader title={window?.productName ?? "Order Windows"} backLabel="Back">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          <View className="flex-row gap-2">
            {windows?.map((w) => {
              const selected = w.windowId === windowId;
              return (
                <Pressable
                  key={w.windowId}
                  onPress={() => setPicked(w.windowId)}
                  accessibilityRole="tab"
                  aria-selected={selected}
                  className={`rounded-full px-3 py-1.5 ${selected ? "bg-brand-gold" : "bg-white/15"}`}
                >
                  <Text
                    className={`font-sans-semibold text-xs ${selected ? "text-brand-purple-deep" : "text-white"}`}
                  >
                    W{w.number}
                    {w.stage === "draft" ? " draft" : w.stage === "open" ? " open" : ""}
                  </Text>
                </Pressable>
              );
            })}
            {busy ? null : (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/windows/new",
                    params: { productId },
                  })
                }
                accessibilityRole="button"
                className="rounded-full border border-white/40 px-3 py-1.5"
              >
                <Text className="font-sans-semibold text-white text-xs">+ New</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </ScreenHeader>
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {windows === undefined || (windowId && window === undefined) ? (
          <Spinner />
        ) : !window ? (
          <Text className="font-sans text-base text-muted">
            No windows yet. Tap + New to open one.
          </Text>
        ) : (
          <WindowDetail window={window} />
        )}
      </View>
    </ScrollView>
  );
}

function WindowDetail({ window }: { window: OrderWindow }) {
  const units = window.variants.reduce((sum, row) => sum + row.preordered, 0);
  return (
    <View className="gap-4">
      <View>
        <Text className="font-display text-2xl text-foreground">
          W{window.number}
          {window.opensAt ? ` · ${shortDate(window.opensAt)} – ${shortDate(window.closesAt)}` : ""}
        </Text>
        <View className="mt-3 flex-row gap-2">
          <Stat label="Units" value={String(units)} />
          <Stat
            label="Ship est./unit"
            value={
              window.shippingFeeEstimate === undefined
                ? "On arrival"
                : formatGhs(window.shippingFeeEstimate)
            }
          />
          <Stat
            label="Minimum"
            value={
              window.minimumOrderQuantity === undefined ? "—" : String(window.minimumOrderQuantity)
            }
          />
        </View>
      </View>
      {window.stage === "draft" ? <DraftCard window={window} /> : <Timeline window={window} />}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-surface p-3">
      <Text className="font-sans text-[11px] text-muted">{label}</Text>
      <Text className="mt-0.5 font-sans-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DraftCard({ window }: { window: OrderWindow }) {
  const discard = useMutation(api.backOffice.windows.discard);
  const unpriced = window.variants.filter((row) => row.preorderPrice === undefined).length;
  return (
    <View className="gap-3 rounded-2xl border border-brand-gold border-dashed bg-surface p-4">
      <Text className="font-sans-semibold text-base text-foreground">Draft</Text>
      <Text className="font-sans text-muted text-sm">
        {unpriced > 0
          ? `Waiting for the Owner to price ${unpriced} Variant${unpriced === 1 ? "" : "s"}. Customers can't see it yet.`
          : "Priced and ready to open. Customers can't see it yet."}
      </Text>
      <Button
        onPress={() =>
          router.push({
            pathname: "/windows/new",
            params: { windowId: window._id },
          })
        }
      >
        <Button.Label>Review & open</Button.Label>
      </Button>
      <Button
        variant="danger-soft"
        onPress={() =>
          Alert.alert(`Discard W${window.number}?`, "The draft and its prices are thrown away.", [
            { text: "Keep it", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () =>
                discard({ windowId: window._id }).catch((error) =>
                  Alert.alert("Couldn't discard", refusalMessage(error)),
                ),
            },
          ])
        }
      >
        <Button.Label>Discard draft</Button.Label>
      </Button>
    </View>
  );
}

function Timeline({ window }: { window: OrderWindow }) {
  const current = timelineStages.indexOf(window.stage as (typeof timelineStages)[number]);
  return (
    <View>
      {timelineStages.map((stage, index) => {
        const event = window.events.find((e) => e.stage === stage);
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <View key={stage} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={`size-6 items-center justify-center rounded-full ${state === "next" ? "border-2 border-border bg-background" : "bg-brand-purple"}`}
              >
                {state === "done" ? (
                  <Ionicons name="checkmark" size={14} color="white" />
                ) : state === "current" ? (
                  <View className="size-2 rounded-full bg-brand-gold-bright" />
                ) : null}
              </View>
              {index < timelineStages.length - 1 ? (
                <View
                  className={`w-0.5 flex-1 ${index < current ? "bg-brand-purple" : "bg-border"}`}
                />
              ) : null}
            </View>
            <View className="flex-1 pb-5">
              <Text
                className={`font-sans-semibold text-base ${state === "next" ? "text-muted" : "text-foreground"}`}
              >
                {stageLabel[stage]}
              </Text>
              {event ? <EventDetail event={event} /> : null}
              {state === "current" && stage === "open" ? <OpenControls window={window} /> : null}
              {state !== "next" && stage === "orderedFromSupplier" ? (
                <StoreQuantities window={window} />
              ) : null}
              {state === "current" && isMarkable(stage) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 self-start"
                  onPress={() =>
                    router.push({
                      pathname: "/windows/stage",
                      params: { windowId: window._id, mode: "change" },
                    })
                  }
                >
                  <Button.Label>Change expected dates or note</Button.Label>
                </Button>
              ) : null}
              {state === "next" && index === current + 1 && isMarkable(stage) ? (
                <View className="mt-2 gap-2 rounded-2xl border border-border border-dashed p-3">
                  <Button
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/windows/stage",
                        params: { windowId: window._id },
                      })
                    }
                  >
                    <Button.Label>Mark as {stageLabel[stage].toLowerCase()}</Button.Label>
                  </Button>
                </View>
              ) : null}
              {state === "next" && index === current + 1 && stage === "arrived" ? (
                <Text className="mt-1 font-sans text-muted text-xs">
                  Arrived is set when the arrival is recorded.
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The stages Staff mark from the timeline; Closed comes from Close now, Arrived from the arrival. */
function isMarkable(stage: WindowStage): stage is "orderedFromSupplier" | "inTransit" {
  return stage === "orderedFromSupplier" || stage === "inTransit";
}

/**
 * A stage's date and who did it, then its expected range, note and how many were texted, and
 * when the dates or note were last changed.
 */
function EventDetail({ event }: { event: OrderWindow["events"][number] }) {
  const expected = expectedLabel(event);
  return (
    <View className="gap-0.5">
      <Text className="font-sans text-muted text-xs">
        {shortDate(event.at)} · {event.staffName ?? "Automatically"}
        {event.texted ? ` · texted ${event.texted}` : ""}
      </Text>
      {expected ? <Text className="font-sans text-foreground text-sm">{expected}</Text> : null}
      {event.note ? (
        <Text className="font-sans text-foreground text-sm italic">"{event.note}"</Text>
      ) : null}
      {event.changedAt ? (
        <Text className="font-sans text-muted text-xs">
          Changed {shortDate(event.changedAt)} · {event.changedByName ?? "Staff"}
        </Text>
      ) : null}
    </View>
  );
}

/** What was added to the supplier order for Stock, per Variant. */
function StoreQuantities({ window }: { window: OrderWindow }) {
  return (
    <View className="mt-2 gap-1 rounded-2xl border border-border bg-surface p-3">
      <Text className="font-sans-semibold text-foreground text-sm">On the supplier order</Text>
      {window.variants.map((row) => (
        <Text key={row.variantId} className="font-sans text-muted text-xs">
          {row.label || "Standard"}: {row.preordered} pre-ordered + {row.storeQuantity} for Stock
        </Text>
      ))}
    </View>
  );
}

function OpenControls({ window }: { window: OrderWindow }) {
  const extend = useMutation(api.backOffice.windows.extend);
  const closeNow = useMutation(api.backOffice.windows.closeNow);
  const days = daysUntil(window.closesAt);
  return (
    <View className="mt-2 gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-medium text-foreground">
        {days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`} ·{" "}
        {shortDate(window.closesAt)}
      </Text>
      {window.variants.map((row) => {
        const taken = row.preordered + row.held;
        const full = row.cap !== undefined && taken >= row.cap;
        return (
          <View key={row.variantId} className="gap-1">
            <View className="flex-row justify-between">
              <Text className="font-sans text-foreground text-sm">
                {row.label || "Standard"}
                {row.preorderPrice !== undefined ? ` · ${formatGhs(row.preorderPrice)}` : ""}
              </Text>
              <Text
                className={`font-sans-semibold text-xs ${full ? "text-brand-gold" : "text-muted"}`}
              >
                {full
                  ? "SOLD OUT"
                  : row.cap === undefined
                    ? `${row.preordered} ordered`
                    : `${row.preordered}/${row.cap}`}
              </Text>
            </View>
            {row.cap !== undefined ? (
              <View className="h-1.5 overflow-hidden rounded-full bg-brand-muted">
                <View
                  className="h-1.5 rounded-full bg-brand-purple"
                  style={{
                    width: `${Math.min(100, (taken / row.cap) * 100)}%`,
                  }}
                />
              </View>
            ) : null}
          </View>
        );
      })}
      <Text className="font-sans text-muted text-xs">
        A Variant at its cap shows sold out; the window stays open until it closes.
      </Text>
      <View className="flex-row gap-2">
        {EXTEND_BY.map((by) => (
          <Button
            key={by}
            variant="secondary"
            size="sm"
            className="flex-1"
            onPress={() =>
              extend({ windowId: window._id, days: by }).catch((error) =>
                Alert.alert("Couldn't extend", refusalMessage(error)),
              )
            }
          >
            <Button.Label>+{by} days</Button.Label>
          </Button>
        ))}
      </View>
      <Button
        variant="danger-soft"
        onPress={() =>
          Alert.alert(
            `Close W${window.number} now?`,
            "Pre-orders stop straight away. No one is texted.",
            [
              { text: "Keep open", style: "cancel" },
              {
                text: "Close now",
                style: "destructive",
                onPress: () =>
                  closeNow({ windowId: window._id }).catch((error) =>
                    Alert.alert("Couldn't close", refusalMessage(error)),
                  ),
              },
            ],
          )
        }
      >
        <Button.Label>Close now</Button.Label>
      </Button>
    </View>
  );
}
