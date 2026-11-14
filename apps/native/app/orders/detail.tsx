import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import type { DeliveryFailureReason } from "@emblish_workspace/backend/convex/model/orders";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Input, Spinner } from "heroui-native";
import { type PropsWithChildren, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  customerLabel,
  deliveryFailureLabel,
  deliveryFailureReasons,
  lineLabel,
  orderStatusLabel,
  overrideReasonLabel,
} from "@/components/order-labels";
import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";
import { formatGhs, parseGhs } from "@/lib/money";
import { useStaffMember } from "@/lib/staff-member";

const eventLabel = {
  paid: "Paid",
  collected: "Collected",
  dispatched: "Dispatched",
  delivered: "Delivered",
  deliveryFailed: "Delivery failed",
  unitsCancelled: "Units cancelled",
  cancelled: "Order cancelled",
  arrived: "Arrived",
  refundFlagged: "Refund flagged",
  refunded: "Refunded",
  invoiced: "Invoiced",
  invoicePaid: "Invoice paid",
  invoiceReissued: "Invoice voided & reissued",
  ready: "Ready",
  deliveryQuoted: "Delivery Fee quoted",
} as const;

const invoiceStatusLabel = { unpaid: "Unpaid", paid: "Paid", void: "Void" } as const;

type Order = FunctionReturnType<typeof api.backOffice.orders.get>;

/** The status chip: "Delivery Fee due" while only a Delivery Fee Invoice is left to pay. */
function statusText(order: Order) {
  const unpaid = order.invoices.filter((invoice) => invoice.status === "unpaid");
  if (
    order.status === "paymentDue" &&
    unpaid.length > 0 &&
    unpaid.every((invoice) => invoice.kind === "deliveryFee")
  ) {
    return "Delivery Fee due";
  }
  return orderStatusLabel[order.status];
}

/** How the Delivery Fee stands, under the address. */
function deliveryFeeText(fulfilment: Extract<Order["fulfilment"], { method: "delivery" }>) {
  if (fulfilment.deliveryFee !== undefined) {
    return `Delivery Fee ${formatGhs(fulfilment.deliveryFee)}, paid at Checkout`;
  }
  if (fulfilment.quotedFee !== undefined) {
    return `Delivery Fee ${formatGhs(fulfilment.quotedFee)}, quoted (Elsewhere in Ghana)`;
  }
  return "Delivery Fee to be quoted (Elsewhere in Ghana)";
}

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
            <Chip>{order.kind === "preorder" ? "Pre-order" : "Store Order"}</Chip>
            <Chip>
              {statusText(order)}
              {order.cancelReason === "customer"
                ? " by Customer"
                : order.cancelReason === "staff"
                  ? " by Staff"
                  : order.cancelReason === "nothingArrived"
                    ? " · nothing arrived"
                    : ""}
            </Chip>
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

          {order.fulfilment.method === "pickup" ? (
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
          ) : (
            <Section title={`Delivery · ${order.fulfilment.zoneName}`}>
              <Text className="font-sans-semibold text-foreground">
                {order.fulfilment.recipientName} · {order.fulfilment.recipientPhone}
              </Text>
              <Text className="font-sans text-foreground">
                {[order.fulfilment.street, order.fulfilment.area].filter(Boolean).join(", ")}
              </Text>
              <Text className="font-sans text-foreground">Near {order.fulfilment.landmark}</Text>
              {order.fulfilment.ghanaPostGps ? (
                <Text className="font-sans text-muted text-sm">
                  GPS {order.fulfilment.ghanaPostGps}
                </Text>
              ) : null}
              <Text className="mt-2 font-sans text-muted text-sm">
                {deliveryFeeText(order.fulfilment)}
              </Text>
              {order.canQuoteDeliveryFee ? <QuoteDeliveryFee order={order} /> : null}
            </Section>
          )}

          <Section title="Items">
            {order.lines.map((line) => (
              <View key={line.orderLineId} className="py-1">
                <View className="flex-row justify-between">
                  <Text className="flex-1 font-sans text-foreground">{lineLabel(line)}</Text>
                  <Text className="font-sans text-foreground">
                    {formatGhs(line.quantity * line.unitPrice)}
                  </Text>
                </View>
                {line.refundedQuantity > 0 ? (
                  <Text className="font-sans text-muted text-xs">
                    {line.refundedQuantity} of {line.quantity} cancelled or refunded
                  </Text>
                ) : null}
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

          {order.invoices.length > 0 ? (
            <Section title="Invoices">
              {order.invoices.map((invoice) => (
                <View key={invoice.number} className="py-1">
                  <View className="flex-row justify-between">
                    <Text
                      className={`font-sans-medium text-foreground ${invoice.status === "void" ? "line-through" : ""}`}
                    >
                      {invoice.number} ·{" "}
                      {invoice.kind === "shippingFee" ? "Shipping Fee" : "Delivery Fee"}
                    </Text>
                    <Text className="font-sans-medium text-foreground">
                      {formatGhs(invoice.total)}
                    </Text>
                  </View>
                  <Text className="font-sans text-muted text-xs">
                    {invoiceStatusLabel[invoice.status]} ·{" "}
                    {invoice.paidAt !== undefined
                      ? `paid ${new Date(invoice.paidAt).toLocaleDateString("en-GH")}`
                      : `due ${new Date(invoice.dueAt).toLocaleDateString("en-GH")}`}
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}

          <OrderActions order={order} />

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
                  {event.amount !== undefined ? (
                    <Text className="font-sans text-foreground text-sm">
                      {event.units ? `${event.units} ${event.units === 1 ? "unit" : "units"} · ` : ""}
                      {formatGhs(event.amount)}
                      {event.note && !event.overrideReason && !event.failureReason
                        ? ` (${event.note})`
                        : ""}
                    </Text>
                  ) : null}
                  {event.riderName ? (
                    <Text className="font-sans text-foreground text-sm">
                      Rider: {event.riderName}
                    </Text>
                  ) : null}
                  {event.failureReason ? (
                    <Text className="font-sans text-foreground text-sm">
                      {deliveryFailureLabel(event.failureReason)}
                      {event.note ? ` (${event.note})` : ""}
                    </Text>
                  ) : null}
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
      ) : order.primaryAction === "dispatch" ? (
        <StickyBar bottom={insets.bottom}>
          <DispatchBar orderId={order.orderId} />
        </StickyBar>
      ) : order.primaryAction === "markDelivered" ? (
        <StickyBar bottom={insets.bottom}>
          <DeliveryOutcomeBar orderId={order.orderId} />
        </StickyBar>
      ) : null}
    </View>
  );
}

/**
 * Elsewhere in Ghana: Staff type the Delivery Fee they've worked out. It's texted to the Customer
 * on its own Delivery Fee Invoice, or rides on a Pre-order's coming Shipping Fee Invoice.
 */
function QuoteDeliveryFee({ order }: { order: Order }) {
  const quote = useMutation(api.backOffice.orders.quoteDeliveryFee);
  const [feeText, setFeeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = parseGhs(feeText);
  const valid = fee !== undefined && Number.isFinite(fee) && fee > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await quote({ orderId: order.orderId, fee });
      setFeeText("");
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mt-3 gap-2 border-border border-t pt-3">
      <Input
        value={feeText}
        onChangeText={setFeeText}
        placeholder="Delivery Fee in GH₵"
        accessibilityLabel="Delivery Fee in GH₵"
        keyboardType="decimal-pad"
      />
      <Text className="font-sans text-muted text-xs">
        {order.status === "awaitingArrival"
          ? "It goes on the Shipping Fee Invoice when the goods arrive."
          : "The Customer gets a Delivery Fee Invoice by SMS. It can go out once it's paid."}
      </Text>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <Button onPress={submit} isDisabled={busy || !valid}>
        <Button.Label>Quote Delivery Fee</Button.Label>
      </Button>
    </View>
  );
}

/**
 * The rest of the order's actions: Staff cancel units until handover; after it, only an Owner
 * refunds (Staff see it locked). Both flag a Refund for Refunds to make.
 */
function OrderActions({ order }: { order: Order }) {
  const isOwner = useStaffMember()?.role === "owner";
  const [open, setOpen] = useState(false);
  if (order.canCancelPreorder) {
    return (
      <Section title="Cancel Pre-order">
        {open ? (
          <CancelPreorderForm order={order} onDone={() => setOpen(false)} />
        ) : (
          <Button variant="secondary" onPress={() => setOpen(true)}>
            <Button.Label>Cancel Pre-order</Button.Label>
          </Button>
        )}
      </Section>
    );
  }
  if (order.canCancelUnits) {
    return (
      <Section title="Cancel units">
        {open ? (
          <RefundForm order={order} mode="cancel" onDone={() => setOpen(false)} />
        ) : (
          <Button variant="secondary" onPress={() => setOpen(true)}>
            <Button.Label>Cancel units</Button.Label>
          </Button>
        )}
      </Section>
    );
  }
  if (order.canRefundAfterHandover) {
    return (
      <Section title="Refund">
        {!isOwner ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed" size={16} color={brand["ink-muted"]} />
            <Text className="flex-1 font-sans text-muted text-sm">
              Only an Owner can refund an order after handover.
            </Text>
          </View>
        ) : open ? (
          <RefundForm order={order} mode="afterHandover" onDone={() => setOpen(false)} />
        ) : (
          <Button variant="secondary" onPress={() => setOpen(true)}>
            <Button.Label>Refund</Button.Label>
          </Button>
        )}
      </Section>
    );
  }
  return null;
}

/**
 * Cancels the whole Pre-order, with an optional note: its units leave the window's count and its
 * Item Payment goes on Refunds to make.
 */
function CancelPreorderForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const cancelPreorder = useMutation(api.backOffice.orders.cancelPreorder);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = order.lines.reduce(
    (sum, line) => sum + (line.quantity - line.refundedQuantity) * line.unitPrice,
    0,
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelPreorder({ orderId: order.orderId, note: note || undefined });
      onDone();
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <Input
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        accessibilityLabel="Note"
      />
      <Text className="font-sans text-muted text-xs">
        Every unit leaves the window, and the Item Payment of {formatGhs(amount)} goes on Refunds
        to make for an Owner to pay out.
      </Text>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={onDone} isDisabled={busy}>
          <Button.Label>Back</Button.Label>
        </Button>
        <Button variant="danger" className="flex-1" onPress={submit} isDisabled={busy}>
          <Button.Label>Cancel Pre-order</Button.Label>
        </Button>
      </View>
    </View>
  );
}

/**
 * Picks units per line (up to those still the Customer's), whether they go back to Stock and a
 * note. Cancelling defaults to restocking; a refund after handover defaults to not, needs a
 * reason, and can add the paid Delivery Fee.
 */
function RefundForm({
  order,
  mode,
  onDone,
}: {
  order: Order;
  mode: "cancel" | "afterHandover";
  onDone: () => void;
}) {
  const cancelUnits = useMutation(api.backOffice.orders.cancelUnits);
  const refundAfterHandover = useMutation(api.backOffice.orders.refundAfterHandover);
  const [units, setUnits] = useState<Record<string, number>>({});
  const [returnToStock, setReturnToStock] = useState(mode === "cancel");
  const [deliveryFee, setDeliveryFee] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = order.lines
    .map((line) => ({ ...line, kept: line.quantity - line.refundedQuantity }))
    .filter((line) => line.kept > 0);
  const picked = lines
    .map((line) => ({ orderLineId: line.orderLineId, quantity: units[line.orderLineId] ?? 0 }))
    .filter((line) => line.quantity > 0);
  // Cancelling every unit left cancels the order, and the server adds its paid Delivery Fee.
  const cancelsOrder =
    mode === "cancel" && lines.every((line) => (units[line.orderLineId] ?? 0) === line.kept);
  const fee =
    (mode === "afterHandover" && deliveryFee) || cancelsOrder ? order.refundableDeliveryFee : 0;
  const amount =
    lines.reduce((sum, line) => sum + (units[line.orderLineId] ?? 0) * line.unitPrice, 0) + fee;
  const ready = amount > 0 && (mode === "cancel" || note.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "cancel") {
        await cancelUnits({
          orderId: order.orderId,
          lines: picked,
          returnToStock,
          note: note || undefined,
        });
      } else {
        await refundAfterHandover({
          orderId: order.orderId,
          lines: picked,
          deliveryFee,
          returnToStock,
          note,
        });
      }
      onDone();
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  const step = (orderLineId: string, by: number, max: number) =>
    setUnits((current) => ({
      ...current,
      [orderLineId]: Math.min(max, Math.max(0, (current[orderLineId] ?? 0) + by)),
    }));

  return (
    <View className="gap-3">
      {lines.map((line) => {
        const count = units[line.orderLineId] ?? 0;
        return (
          <View key={line.orderLineId} className="flex-row items-center gap-2">
            <Text className="flex-1 font-sans text-foreground">{lineLabel(line)}</Text>
            <Stepper
              label={`${line.productName} ${line.variantLabel}`}
              value={count}
              onMinus={() => step(line.orderLineId, -1, line.kept)}
              onPlus={() => step(line.orderLineId, 1, line.kept)}
              max={line.kept}
            />
          </View>
        );
      })}
      {mode === "afterHandover" && order.refundableDeliveryFee > 0 ? (
        <Toggle
          label={`Also refund the Delivery Fee (${formatGhs(order.refundableDeliveryFee)})`}
          value={deliveryFee}
          onChange={setDeliveryFee}
        />
      ) : null}
      <Toggle
        label={mode === "cancel" ? "Put the units back in Stock" : "Goods came back: add to Stock"}
        value={returnToStock}
        onChange={setReturnToStock}
      />
      <Input
        value={note}
        onChangeText={setNote}
        placeholder={mode === "cancel" ? "Note (optional)" : "Reason for the refund"}
        accessibilityLabel={mode === "cancel" ? "Note" : "Reason for the refund"}
      />
      <Text className="font-sans text-muted text-xs">
        {formatGhs(amount)} goes on Refunds to make for an Owner to pay out.
        {mode === "cancel" ? " Cancelling every unit cancels the order and its Delivery Fee." : ""}
      </Text>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={onDone} isDisabled={busy}>
          <Button.Label>Back</Button.Label>
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          onPress={submit}
          isDisabled={busy || !ready}
        >
          <Button.Label>{mode === "cancel" ? "Cancel units" : "Flag refund"}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function Stepper({
  label,
  value,
  max,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  max: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        onPress={onMinus}
        disabled={value === 0}
        accessibilityRole="button"
        accessibilityLabel={`One fewer ${label}`}
        className="size-11 items-center justify-center rounded-full border border-border"
      >
        <Ionicons name="remove" size={18} color={brand.purple} />
      </Pressable>
      <Text className="w-8 text-center font-sans-semibold text-foreground">{value}</Text>
      <Pressable
        onPress={onPlus}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={`One more ${label}`}
        className="size-11 items-center justify-center rounded-full border border-border"
      >
        <Ionicons name="add" size={18} color={brand.purple} />
      </Pressable>
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      aria-checked={value}
      className="min-h-11 flex-row items-center gap-2"
    >
      <Ionicons
        name={value ? "checkbox" : "square-outline"}
        size={22}
        color={value ? brand.purple : brand["ink-muted"]}
      />
      <Text className="flex-1 font-sans text-foreground">{label}</Text>
    </Pressable>
  );
}

/** The bottom bar holding the order's one primary action, clear of the home indicator. */
function StickyBar({ bottom, children }: PropsWithChildren<{ bottom: number }>) {
  return (
    <View
      className="gap-2 border-border border-t bg-surface p-3"
      style={{ paddingBottom: bottom + 12 }}
    >
      {children}
    </View>
  );
}

/** Ready Delivery order: name the rider taking it, then Dispatch. */
function DispatchBar({ orderId }: { orderId: Id<"orders"> }) {
  const dispatch = useMutation(api.backOffice.orders.dispatch);
  const [riderName, setRiderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await dispatch({ orderId, riderName });
      setRiderName("");
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Input
        value={riderName}
        onChangeText={setRiderName}
        placeholder="Rider's name"
        accessibilityLabel="Rider's name"
        autoCapitalize="words"
      />
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <Button size="lg" onPress={submit} isDisabled={busy || !riderName.trim()}>
        <Ionicons name="bicycle" size={20} color="white" />
        <Button.Label>Dispatch</Button.Label>
      </Button>
    </>
  );
}

/** Out for delivery: Mark delivered, or record a failed attempt with its reason. */
function DeliveryOutcomeBar({ orderId }: { orderId: Id<"orders"> }) {
  const markDelivered = useMutation(api.backOffice.orders.markDelivered);
  const deliveryFailed = useMutation(api.backOffice.orders.deliveryFailed);
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState<DeliveryFailureReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await call();
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setBusy(false);
    }
  };

  if (failing) {
    return (
      <>
        <Text className="font-sans-semibold text-foreground">Why didn't it arrive?</Text>
        <View className="flex-row flex-wrap gap-2">
          {deliveryFailureReasons.map((option) => {
            const picked = reason === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setReason(option.value)}
                accessibilityRole="radio"
                aria-checked={picked}
                className={`min-h-11 justify-center rounded-full px-4 ${picked ? "bg-brand-purple" : "border border-border"}`}
              >
                <Text className={`font-sans-semibold ${picked ? "text-white" : "text-foreground"}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          accessibilityLabel="Note"
        />
        <Text className="font-sans text-muted text-xs">
          It goes back to Ready to dispatch again. The Customer pays no new fee.
        </Text>
        {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => setFailing(false)}
            isDisabled={busy}
          >
            <Button.Label>Back</Button.Label>
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            isDisabled={busy || !reason}
            onPress={() =>
              reason && run(() => deliveryFailed({ orderId, reason, note: note || undefined }))
            }
          >
            <Button.Label>Record failed attempt</Button.Label>
          </Button>
        </View>
      </>
    );
  }

  return (
    <>
      {error ? <Text className="font-sans-semibold text-danger text-sm">{error}</Text> : null}
      <Button size="lg" onPress={() => run(() => markDelivered({ orderId }))} isDisabled={busy}>
        <Ionicons name="checkmark-circle" size={20} color="white" />
        <Button.Label>Mark delivered</Button.Label>
      </Button>
      <Button variant="secondary" onPress={() => setFailing(true)} isDisabled={busy}>
        <Button.Label>Delivery failed</Button.Label>
      </Button>
    </>
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
