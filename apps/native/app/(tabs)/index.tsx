import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Link, router } from "expo-router";
import { Input, Spinner } from "heroui-native";
import { type PropsWithChildren, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pickupCodeLength } from "@emblish_workspace/backend/convex/model/orders";

import { customerLabel, orderStatusLabel } from "@/components/order-labels";
import { formatGhs } from "@/lib/money";

const emblem = require("@/assets/images/emblem.png");

/** Today, the Back Office home: the Counter banner, a phone/code search and the queues. */
export default function Today() {
  const insets = useSafeAreaInsets();
  const today = useQuery(api.backOffice.orders.today);
  const refunds = useQuery(api.backOffice.refunds.toMake);
  const [query, setQuery] = useState("");
  // A Pickup Code is the shortest thing worth searching for.
  const searching = query.trim().length >= pickupCodeLength;
  const results = useQuery(api.backOffice.orders.search, searching ? { query } : "skip");

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 16 }}>
        <Image source={emblem} className="size-7" accessibilityIgnoresInvertColors />
        <Text className="mt-3 font-display text-[28px] text-white leading-tight">Today</Text>
      </View>
      <View className="gap-4 p-4">
        <Pressable
          onPress={() => router.push("/counter")}
          accessibilityRole="button"
          accessibilityLabel={`Customer at the counter? ${today?.readyForPickup ?? 0} Pickup orders waiting`}
          className="flex-row items-center gap-3 rounded-2xl bg-brand-purple-deep p-4"
        >
          <View className="size-11 items-center justify-center rounded-full bg-brand-gold">
            <Ionicons name="keypad" size={22} color={brand["purple-deep"]} />
          </View>
          <View className="flex-1">
            <Text className="font-sans-semibold text-base text-white">
              Customer at the counter?
            </Text>
            <Text className="font-sans text-sm text-white/70">
              {today === undefined
                ? "…"
                : `${today.readyForPickup} Pickup ${today.readyForPickup === 1 ? "order" : "orders"} waiting`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="white" />
        </Pressable>

        <View className="gap-2">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search by phone or Pickup Code"
            keyboardType="phone-pad"
            accessibilityLabel="Search by phone or Pickup Code"
          />
          {searching &&
            (results === undefined ? (
              <Spinner />
            ) : results.length === 0 ? (
              <Text className="font-sans text-muted text-sm">
                No Customer with that phone number or Pickup Code.
              </Text>
            ) : (
              results.map((customer) => (
                <View key={customer.phone} className="rounded-2xl border border-border bg-surface">
                  <View className="px-4 pt-3 pb-2">
                    <Text className="font-sans-semibold text-base text-foreground">
                      {customerLabel(customer)}
                    </Text>
                    {customer.name ? (
                      <Text className="font-sans text-muted text-xs">{customer.phone}</Text>
                    ) : null}
                  </View>
                  {customer.orders.length === 0 ? (
                    <Text className="px-4 pb-3 font-sans text-muted text-sm">No orders yet.</Text>
                  ) : (
                    customer.orders.map((order) => (
                      <OrderRow
                        key={order.orderId}
                        orderId={order.orderId}
                        title={order.reference}
                        detail={orderStatusLabel[order.status]}
                      />
                    ))
                  )}
                </View>
              ))
            ))}
        </View>

        <View className="rounded-2xl border border-border bg-surface">
          <View className="flex-row items-center px-4 pt-4 pb-2">
            <Text className="flex-1 font-sans-semibold text-base text-foreground">
              Ready for pickup
            </Text>
            <Text className="font-display text-[22px] text-brand-purple">
              {today?.readyForPickup ?? "…"}
            </Text>
          </View>
          {today === undefined ? (
            <View className="p-4">
              <Spinner />
            </View>
          ) : today.ready.length === 0 ? (
            <Text className="px-4 pb-4 font-sans text-muted text-sm">
              Nothing waiting. Paid Pickup orders show here.
            </Text>
          ) : (
            today.ready.map((order) => (
              <OrderRow
                key={order.orderId}
                orderId={order.orderId}
                title={`${order.reference} · ${customerLabel({ name: order.customerName, phone: order.phone })}`}
                detail={`${order.units} ${order.units === 1 ? "item" : "items"} · ready ${waited(order.readyAt)}`}
              />
            ))
          )}
        </View>

        <Queue
          title="To dispatch"
          count={today?.toDispatch.length}
          empty="Nothing to send out. Paid Delivery orders show here."
        >
          {today?.toDispatch.map((order) => (
            <OrderRow
              key={order.orderId}
              orderId={order.orderId}
              title={`${order.reference} · ${customerLabel({ name: order.customerName, phone: order.phone })}`}
              detail={`${order.zoneName} · ${order.area} · ${order.units} ${order.units === 1 ? "item" : "items"} · ready ${waited(order.readyAt)}`}
            />
          ))}
        </Queue>

        <Queue title="Out for delivery" count={today?.outForDelivery.length} empty="No riders out.">
          {today?.outForDelivery.map((order) => (
            <OrderRow
              key={order.orderId}
              orderId={order.orderId}
              title={`${order.reference} · ${customerLabel({ name: order.customerName, phone: order.phone })}`}
              detail={`${order.zoneName} · ${order.area}${order.riderName ? ` · with ${order.riderName}` : ""}`}
            />
          ))}
        </Queue>

        <Link href="/refunds" asChild>
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center rounded-2xl border border-border bg-surface p-4"
          >
            <View className="flex-1">
              <Text className="font-sans-semibold text-base text-foreground">Refunds to make</Text>
              <Text className="font-sans text-muted text-xs">
                {refunds === undefined
                  ? "…"
                  : refunds.refunds.length === 0
                    ? "Nothing owed back."
                    : `${formatGhs(refunds.total)} owed back${refunds.canRefund ? "" : " · Owner only"}`}
              </Text>
            </View>
            <Text className="mr-2 font-display text-[22px] text-brand-purple">
              {refunds?.refunds.length ?? "…"}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

/** One of Today's queue cards: a title and count over its rows, or a line when it's empty. */
function Queue({
  title,
  count,
  empty,
  children,
}: PropsWithChildren<{ title: string; count: number | undefined; empty: string }>) {
  return (
    <View className="rounded-2xl border border-border bg-surface">
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <Text className="flex-1 font-sans-semibold text-base text-foreground">{title}</Text>
        <Text className="font-display text-[22px] text-brand-purple">{count ?? "…"}</Text>
      </View>
      {count === undefined ? (
        <View className="p-4">
          <Spinner />
        </View>
      ) : count === 0 ? (
        <Text className="px-4 pb-4 font-sans text-muted text-sm">{empty}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function OrderRow({ orderId, title, detail }: { orderId: string; title: string; detail: string }) {
  return (
    <Link href={{ pathname: "/orders/detail", params: { id: orderId } }} asChild>
      <Pressable
        accessibilityRole="button"
        className="min-h-12 flex-row items-center border-border border-t px-4 py-2"
      >
        <View className="flex-1">
          <Text className="font-sans-medium text-foreground">{title}</Text>
          <Text className="font-sans text-muted text-xs">{detail}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
      </Pressable>
    </Link>
  );
}

/** "today", "yesterday" or "5 days ago", in calendar days. */
function waited(since: number) {
  const startOf = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(Date.now()) - startOf(since)) / (24 * 60 * 60 * 1000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
