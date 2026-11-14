import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shortDate, stageLabel } from "@/components/window-labels";
import { formatGhs } from "@/lib/money";

const emblem = require("@/assets/images/emblem.png");

type Row = FunctionReturnType<typeof api.backOffice.arrivals.toDo>[number];

/**
 * Arrivals: a to-do list of Order Windows ordered from the supplier. To do: those still to
 * arrive ("Record arrival") and arrived ones still to invoice ("Confirm fee & issue invoices").
 * Invoiced: how many invoices are paid and what's outstanding, plus late arrivals.
 */
export default function Arrivals() {
  const insets = useSafeAreaInsets();
  const rows = useQuery(api.backOffice.arrivals.toDo);
  const toDo = rows?.filter((row) => !row.invoices?.issued) ?? [];
  const arrived = rows?.filter((row) => row.invoices?.issued) ?? [];

  return (
    // The tab bar already clears the bottom inset, so no Container here.
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 16 }}>
        <Image source={emblem} className="size-7" accessibilityIgnoresInvertColors />
        <Text className="mt-3 font-display text-[28px] text-white leading-tight">Arrivals</Text>
      </View>
      <View className="gap-3 p-4">
        {rows === undefined ? (
          <Spinner />
        ) : (
          <>
            <SectionTitle>To do</SectionTitle>
            {toDo.length === 0 ? (
              <Text className="font-sans text-muted text-sm">
                Nothing waiting. Windows show here once they're ordered from the supplier.
              </Text>
            ) : (
              toDo.map((row) => <WindowCard key={row.windowId} row={row} />)
            )}
            {arrived.length > 0 ? (
              <>
                <SectionTitle>Invoiced</SectionTitle>
                {arrived.map((row) => (
                  <WindowCard key={row.windowId} row={row} />
                ))}
              </>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mt-2 font-sans-semibold text-brand-gold-ink text-xs uppercase tracking-[2px]">
      {children}
    </Text>
  );
}

function WindowCard({ row }: { row: Row }) {
  const done = row.stage === "arrived";
  const invoices = row.invoices;
  const open = (pathname: "/arrivals/record" | "/arrivals/late") =>
    router.push({ pathname, params: { windowId: row.windowId } });

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <View>
        <Text className="font-sans-semibold text-base text-foreground">
          {row.productName} · W{row.number}
        </Text>
        <Text className="font-sans text-muted text-xs">
          {done
            ? `Arrived ${shortDate(row.at)} · ${row.arrived ?? 0} of ${row.expected} units`
            : `${stageLabel[row.stage]} · ${row.expected} units expected`}
        </Text>
        {invoices?.issued ? (
          <View className="mt-2 gap-1">
            <View className="h-1.5 overflow-hidden rounded-full bg-border">
              <View
                className="h-full bg-success"
                style={{
                  width: `${invoices.count === 0 ? 100 : (invoices.paid / invoices.count) * 100}%`,
                }}
              />
            </View>
            <Text className="font-sans text-foreground text-xs">
              {invoices.paid}/{invoices.count} paid · {formatGhs(invoices.outstanding)} outstanding
            </Text>
          </View>
        ) : null}
      </View>
      {done && !invoices?.issued ? (
        <View className="gap-2">
          <Button onPress={() => open("/arrivals/record")}>
            <Button.Label>Confirm fee & issue invoices</Button.Label>
          </Button>
          <Button variant="secondary" size="sm" onPress={() => open("/arrivals/late")}>
            <Button.Label>Add late arrival</Button.Label>
          </Button>
        </View>
      ) : done ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            size="sm"
            onPress={() => open("/arrivals/record")}
          >
            <Button.Label>Invoices</Button.Label>
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            size="sm"
            onPress={() => open("/arrivals/late")}
          >
            <Button.Label>Add late arrival</Button.Label>
          </Button>
        </View>
      ) : (
        <Button onPress={() => open("/arrivals/record")}>
          <Button.Label>Record arrival</Button.Label>
        </Button>
      )}
    </View>
  );
}
