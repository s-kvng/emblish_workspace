import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Spinner } from "heroui-native";
import type { PropsWithChildren } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  customerLabel,
  lineLabel,
  orderStatusLabel,
  overrideReasonLabel,
} from "@/components/order-labels";
import { ScreenHeader } from "@/components/screen-header";
import { formatGhs } from "@/lib/money";

const eventLabel = { paid: "Paid", collected: "Collected" } as const;

// An order that's gone (or a bad link) shows the router's error screen with Retry.
export { ErrorBoundary } from "expo-router";

/** One order, full screen: lines, payment and History, with one primary action by state. */
export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useQuery(api.backOffice.orders.get, { orderId: id as Id<"orders"> });

  if (order === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }

  const name = customerLabel(order.customer);
  const paid = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow">
        <ScreenHeader title={order.reference} backLabel="Back">
          <View className="mt-2 flex-row gap-2">
            <Chip>Store Order</Chip>
            <Chip>{orderStatusLabel[order.status]}</Chip>
          </View>
        </ScreenHeader>
        <View className="gap-4 p-4">
          <Section title="Customer">
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="font-sans-semibold text-base text-foreground">{name}</Text>
                <Text className="font-sans text-muted text-sm">{order.customer.phone}</Text>
              </View>
              <Pressable
                onPress={() => Linking.openURL(`tel:${order.customer.phone}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${name}`}
                className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border px-4"
              >
                <Ionicons name="call" size={16} color={brand.purple} />
                <Text className="font-sans-semibold text-brand-purple">Call</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Pickup">
            <Text className="font-sans text-foreground">
              {order.pickupLocation || "The pickup point"}
            </Text>
            <Text className="mt-2 font-sans text-muted text-xs uppercase tracking-[1px]">
              Pickup Code
            </Text>
            <Text className="font-sans-bold text-[22px] text-brand-purple tracking-[4px]">
              {order.pickupCode}
            </Text>
          </Section>

          <Section title="Items">
            {order.lines.map((line) => (
              <View key={lineLabel(line)} className="flex-row justify-between py-1">
                <Text className="flex-1 font-sans text-foreground">{lineLabel(line)}</Text>
                <Text className="font-sans text-foreground">
                  {formatGhs(line.quantity * line.unitPrice)}
                </Text>
              </View>
            ))}
            <View className="mt-2 flex-row justify-between border-border border-t pt-2">
              <Text className="font-sans-semibold text-foreground">Paid for these</Text>
              <Text className="font-sans-semibold text-foreground">{formatGhs(paid)}</Text>
            </View>
            {order.toRefund > 0 ? (
              <Text className="mt-2 font-sans-semibold text-danger text-sm">
                {formatGhs(order.toRefund)} flagged for refund
              </Text>
            ) : null}
          </Section>

          <Section title="Payments">
            {order.payments.map((payment) => (
              <View key={payment.receiptNumber} className="py-1">
                <View className="flex-row justify-between">
                  <Text className="font-sans-medium text-foreground">{payment.receiptNumber}</Text>
                  <Text className="font-sans-medium text-foreground">
                    {formatGhs(payment.amount)}
                  </Text>
                </View>
                <Text className="font-sans text-muted text-xs">
                  {new Date(payment.paidAt).toLocaleString("en-GH")} · Seev {payment.seevReference}
                </Text>
              </View>
            ))}
          </Section>

          <Section title="History">
            {order.history.map((event) => (
              <View key={`${event.kind}-${event.at}`} className="flex-row gap-3 py-1.5">
                <View className="mt-1.5 size-2 rounded-full bg-brand-purple" />
                <View className="flex-1">
                  <Text className="font-sans-medium text-foreground">
                    {eventLabel[event.kind]} · {event.by}
                  </Text>
                  <Text className="font-sans text-muted text-xs">
                    {new Date(event.at).toLocaleString("en-GH")}
                  </Text>
                  {event.overrideReason ? (
                    <Text className="font-sans text-foreground text-sm">
                      Without code: {overrideReasonLabel(event.overrideReason)}
                      {event.note ? ` (${event.note})` : ""}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Section>
        </View>
      </ScrollView>

      {order.primaryAction === "handOver" ? (
        <View
          className="border-border border-t bg-surface p-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            size="lg"
            onPress={() =>
              router.push({ pathname: "/counter", params: { orderId: order.orderId } })
            }
          >
            <Ionicons name="keypad" size={20} color="white" />
            <Button.Label>Hand over</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-2 font-sans-semibold text-[11px] text-muted uppercase tracking-[1px]">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({ children }: PropsWithChildren) {
  return (
    <View className="rounded-full bg-white/15 px-3 py-1">
      <Text className="font-sans-semibold text-white text-xs">{children}</Text>
    </View>
  );
}
