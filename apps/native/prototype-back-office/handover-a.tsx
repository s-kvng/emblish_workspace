// PROTOTYPE (wayfinder #17): handover variant A, "Today queues".
// Home-first. A Today tab with one search box (phone or Pickup Code) for handover, and queue cards underneath
// (Ready for Pickup, To dispatch, Out for delivery, Quote, Uncollected, Refunds of every kind, Needs prices).
// Orders open as a full-screen detail with one primary action and a "⋯ More" sheet. More tab: Stock, zones, Staff.
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, fmtDate, ghs, useBO, variantLabel, type Role } from "./bo-data";
import { ArrivalsList, Inbox, Wizard } from "./arrival-b";
import {
  UNCOLLECTED_AFTER,
  collect,
  daysWaiting,
  deliver,
  dispatch,
  failDelivery,
  isHandedOver,
  priceGaps,
  search,
  useOrders,
  useRefundQueue,
  useStock,
  type HOrder,
} from "./handover-data";
import {
  CancelForm,
  Chips,
  CodeDigits,
  DfStatus,
  Field,
  GhostBtn,
  HandoverPeek,
  Ledger,
  Lines,
  NeedsPrices,
  PrimaryBtn,
  QuoteForm,
  RefundForm,
  RefundRow,
  Sheet,
  StaffManager,
  StatePill,
  StockEntry,
  SwitchForm,
  Timeline,
  UncollectedDots,
  ZonesEditor,
  fulfilmentLabel,
} from "./handover-ui";

type Tab = "today" | "arrivals" | "invoices" | "more";
type QueueKey = "pickup" | "dispatch" | "out" | "quote" | "awaiting" | "uncollected" | "refunds" | "prices";
type Screen =
  | { kind: "queue"; key: QueueKey }
  | { kind: "order"; id: string }
  | { kind: "more"; key: "stock" | "zones" | "staff" | "prices" }
  | { kind: "variant"; productId: string; variantId: string };

const OVERRIDE_REASONS = ["Lost the SMS", "Collecting for someone else", "Phone dead", "Other"] as const;
const FAIL_REASONS = ["Customer not reachable", "Wrong address", "Customer refused", "Rider issue"] as const;

const QUEUES: { key: QueueKey; title: string; icon: string; owner?: boolean; test: (o: HOrder) => boolean }[] = [
  { key: "pickup", title: "Ready for Pickup", icon: "🛍", test: (o) => o.state === "Ready for handover" && o.fulfilment.kind === "Pickup" },
  { key: "dispatch", title: "To dispatch", icon: "🛵", test: (o) => o.state === "Ready for handover" && o.fulfilment.kind === "Delivery" },
  { key: "out", title: "Out for delivery", icon: "📍", test: (o) => o.state === "Dispatched" },
  { key: "quote", title: "Quote Delivery Fee", icon: "💬", test: (o) => o.state === "Needs Delivery Fee quote" },
  { key: "awaiting", title: "Awaiting payment", icon: "⏳", test: (o) => o.state === "Awaiting payment" || o.state === "Awaiting Delivery Fee" },
  {
    key: "uncollected",
    title: `Uncollected ${UNCOLLECTED_AFTER}+ days`,
    icon: "📦",
    test: (o) => o.state === "Ready for handover" && o.fulfilment.kind === "Pickup" && daysWaiting(o) >= UNCOLLECTED_AFTER,
  },
];

export default function HandoverA({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>("today");
  const [stack, setStack] = useState<Screen[]>([]);
  const [wizard, setWizard] = useState<string | null>(null);
  const push = (s: Screen) => setStack([...stack, s]);
  const pop = () => setStack(stack.slice(0, -1));
  const top = stack.at(-1);
  const title = { today: "Today", arrivals: "Arrivals", invoices: "Invoices", more: "More" }[tab];

  return (
    <View className="flex-1 bg-zinc-100">
      {top ? (
        <Pushed screen={top} role={role} onBack={pop} push={push} />
      ) : (
        <>
          <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
            <View className="px-4 pb-2 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-zinc-900">{title}</Text>
              <Text className="text-xs text-zinc-500">{ME[role]}</Text>
            </View>
          </View>
          {tab === "today" && <Today role={role} push={push} />}
          {tab === "arrivals" && <ArrivalsList onOpen={setWizard} />}
          {tab === "invoices" && <Inbox role={role} />}
          {tab === "more" && <More role={role} push={push} />}
          <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 flex-row" style={{ paddingBottom: 18 }}>
            {(
              [
                ["today", "🏠", "Today"],
                ["arrivals", "📦", "Arrivals"],
                ["invoices", "🧾", "Invoices"],
                ["more", "☰", "More"],
              ] as [Tab, string, string][]
            ).map(([t, icon, label]) => (
              <Pressable key={t} onPress={() => setTab(t)} className="flex-1 items-center pt-2.5">
                <Text className={`text-lg ${tab === t ? "" : "opacity-40"}`}>{icon}</Text>
                <Text className={`text-[11px] font-semibold ${tab === t ? "text-[#6d28d9]" : "text-zinc-500"}`}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {wizard && <Wizard windowId={wizard} role={role} onClose={() => setWizard(null)} />}
      <HandoverPeek />
    </View>
  );
}

// ---------------------------------------------------------------- pushed screens

function Pushed({ screen, role, onBack, push }: { screen: Screen; role: Role; onBack: () => void; push: (s: Screen) => void }) {
  const { products } = useBO();
  let title = "";
  let body: React.ReactNode = null;
  if (screen.kind === "queue") {
    title = screen.key === "refunds" ? "Refunds to make" : screen.key === "prices" ? "Needs prices" : QUEUES.find((q) => q.key === screen.key)!.title;
    body = <QueueScreen k={screen.key} role={role} push={push} />;
  } else if (screen.kind === "order") {
    return <OrderDetail id={screen.id} role={role} onBack={onBack} />;
  } else if (screen.kind === "more") {
    title = { stock: "Stock", zones: "Delivery Zones", staff: "Staff", prices: "Needs prices" }[screen.key];
    body =
      screen.key === "stock" ? (
        <StockProducts push={push} />
      ) : screen.key === "zones" ? (
        <ZonesEditor role={role} />
      ) : screen.key === "staff" ? (
        <StaffManager />
      ) : (
        <NeedsPrices role={role} />
      );
  } else {
    const p = products.find((x) => x.id === screen.productId)!;
    const v = p.variants.find((x) => x.id === screen.variantId)!;
    title = `${p.name} · ${variantLabel(v)}`;
    body = <VariantScreen base={v.stock} variantId={v.id} sku={v.sku} role={role} />;
  }
  return (
    <View className="flex-1">
      <Header title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
      <View className="px-2 pb-2 flex-row items-center gap-1">
        <Pressable onPress={onBack} className="px-2 py-1">
          <Text className="text-xl text-[#6d28d9]">‹</Text>
        </Pressable>
        <Text className="text-base font-bold text-zinc-900 flex-1" numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Today

function Today({ role, push }: { role: Role; push: (s: Screen) => void }) {
  const [q, setQ] = useState("");
  const orders = useOrders();
  const refunds = useRefundQueue().filter((r) => r.status === "To refund");
  const { products, windows } = useBO();
  const gaps = priceGaps(products, windows);
  const owner = role === "owner";
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center bg-white border-2 border-[#6d28d9] rounded-2xl px-3">
        <Text className="text-base">🔍</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Phone or Pickup Code" keyboardType="number-pad" className="flex-1 px-2 py-3 text-base text-zinc-900" />
        {!!q && (
          <Pressable onPress={() => setQ("")} className="px-1">
            <Text className="text-zinc-400">✕</Text>
          </Pressable>
        )}
      </View>
      {q ? (
        <SearchResults key={q} q={q} orders={orders} role={role} push={push} onDone={() => setQ("")} />
      ) : (
        <>
          <Text className="text-[11px] uppercase font-bold text-zinc-500 mt-4 mb-2">Today's queues</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {QUEUES.map((qu) => {
              const n = orders.filter(qu.test).length;
              return <QueueCard key={qu.key} icon={qu.icon} title={qu.title} n={n} urgent={qu.key === "uncollected" || qu.key === "quote"} onPress={() => push({ kind: "queue", key: qu.key })} />;
            })}
            <QueueCard
              icon="↩️"
              title="Refunds to make"
              n={refunds.length}
              urgent
              sub={owner ? ghs(refunds.reduce((s, r) => s + r.amount, 0)) : "🔒 Owner refunds"}
              onPress={() => push({ kind: "queue", key: "refunds" })}
            />
            {owner && <QueueCard icon="🏷" title="Needs prices" n={gaps.length} urgent onPress={() => push({ kind: "queue", key: "prices" })} />}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function QueueCard({ icon, title, n, sub, urgent, onPress }: { icon: string; title: string; n: number; sub?: string; urgent?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: "48.5%" }} className={`bg-white rounded-2xl border p-3 ${n && urgent ? "border-amber-300" : "border-zinc-200"}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg">{icon}</Text>
        <Text className={`text-2xl font-black ${n ? (urgent ? "text-amber-700" : "text-zinc-900") : "text-zinc-300"}`}>{n}</Text>
      </View>
      <Text className="text-xs font-bold text-zinc-800 mt-1">{title}</Text>
      {sub && <Text className="text-[10px] text-zinc-500">{sub}</Text>}
    </Pressable>
  );
}

// ---------------------------------------------------------------- search → multi-order handover

function SearchResults({ q, orders, role, push, onDone }: { q: string; orders: HOrder[]; role: Role; push: (s: Screen) => void; onDone: () => void }) {
  const { byCode, customerOrders } = search(orders, q);
  const ready = customerOrders.filter((o) => o.state === "Ready for handover");
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => Object.fromEntries(ready.map((o) => [o.id, true])));
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [riders, setRiders] = useState<Record<string, string>>({});

  if (!customerOrders.length)
    return <Text className="text-xs text-zinc-500 mt-4 text-center">{q.replace(/\D/g, "").length < 4 ? "Keep typing…" : "No Customer or Pickup Code matches."}</Text>;

  const c = customerOrders[0];
  const pickups = ready.filter((o) => ticked[o.id] && o.fulfilment.kind === "Pickup");
  const deliveries = ready.filter((o) => ticked[o.id] && o.fulfilment.kind === "Delivery");
  const verified = (o: HOrder) => byCode?.id === o.id || codes[o.id] === o.pickupCode;
  const okToGo = (o: HOrder) => verified(o) || !!overrides[o.id];
  const allOk = pickups.every(okToGo);

  return (
    <View className="mt-3">
      <View className="bg-zinc-900 rounded-2xl p-3 mb-2">
        <Text className="text-white text-base font-bold">{c.customer}</Text>
        <Text className="text-zinc-400 text-xs">
          {c.phone} · {customerOrders.length} order(s) · {ready.length} ready
        </Text>
        {byCode && <Text className="text-emerald-400 text-xs font-bold mt-1">✓ Code matches {byCode.ref}</Text>}
      </View>
      {customerOrders.map((o) => {
        const isReady = o.state === "Ready for handover";
        const on = !!ticked[o.id];
        return (
          <View key={o.id} className={`bg-white rounded-xl border p-3 mb-2 ${on ? "border-[#6d28d9]" : "border-zinc-200"}`}>
            <View className="flex-row items-center gap-2">
              {isReady && (
                <Pressable onPress={() => setTicked({ ...ticked, [o.id]: !on })}>
                  <Text className="text-lg">{on ? "☑" : "☐"}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => push({ kind: "order", id: o.id })} className="flex-1">
                <Text className="text-sm font-bold text-zinc-900">
                  {o.ref} <Text className="text-[11px] font-normal text-zinc-500">· {o.kind}{o.windowLabel ? ` · ${o.windowLabel}` : ""}</Text>
                </Text>
              </Pressable>
              <StatePill s={o.state} />
            </View>
            <View className="mt-1">
              <Lines o={o} />
            </View>
            <Text className="text-[11px] text-zinc-500 mt-1">{fulfilmentLabel(o.fulfilment)}{o.blocker ? ` · ${o.blocker}` : ""}</Text>
            {isReady && on && o.fulfilment.kind === "Pickup" && byCode?.id !== o.id && (
              <View className="mt-2 bg-zinc-50 rounded-lg p-2">
                {overrides[o.id] === undefined || overrides[o.id] === null ? (
                  <>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={codes[o.id] ?? ""}
                        onChangeText={(t) => setCodes({ ...codes, [o.id]: t.replace(/\D/g, "").slice(0, 6) })}
                        placeholder="Pickup Code"
                        keyboardType="number-pad"
                        className={`flex-1 border rounded-lg px-3 py-2 text-base font-bold tracking-widest bg-white ${verified(o) ? "border-emerald-500" : (codes[o.id] ?? "").length === 6 ? "border-red-500" : "border-zinc-300"}`}
                      />
                      <Text className="text-xs font-bold">{verified(o) ? "✓" : (codes[o.id] ?? "").length === 6 ? "✗ wrong" : ""}</Text>
                    </View>
                    {!verified(o) && (
                      <Pressable onPress={() => setOverrides({ ...overrides, [o.id]: "" })} className="mt-1.5">
                        <Text className="text-[11px] text-[#6d28d9] font-semibold">No code? Override…</Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <View>
                    <Text className="text-[11px] text-amber-800 mb-1">Check the Customer's name and phone, then pick why there's no code. It's recorded with your name.</Text>
                    <Chips options={OVERRIDE_REASONS} value={(overrides[o.id] || "") as (typeof OVERRIDE_REASONS)[number]} onChange={(r) => setOverrides({ ...overrides, [o.id]: r })} />
                    <Pressable onPress={() => setOverrides({ ...overrides, [o.id]: null })} className="mt-1">
                      <Text className="text-[11px] text-zinc-500">← Type the code instead</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            {isReady && on && o.fulfilment.kind === "Delivery" && (
              <View className="mt-2">
                <Field label="Rider (optional)" value={riders[o.id] ?? ""} onChange={(t) => setRiders({ ...riders, [o.id]: t })} placeholder="e.g. Musah (Bolt)" />
              </View>
            )}
          </View>
        );
      })}
      {pickups.length > 0 && (
        <PrimaryBtn
          label={allOk ? `Hand over ${pickups.length} order${pickups.length > 1 ? "s" : ""}` : "Check every code (or override)"}
          disabled={!allOk}
          onPress={() => {
            pickups.forEach((o) => collect(o, role, verified(o) ? undefined : (overrides[o.id] ?? undefined)));
            deliveries.forEach((o) => dispatch(o, role, riders[o.id] || undefined));
            onDone();
          }}
        />
      )}
      {pickups.length === 0 && deliveries.length > 0 && (
        <PrimaryBtn
          tone="dark"
          label={`Dispatch ${deliveries.length} order${deliveries.length > 1 ? "s" : ""}`}
          onPress={() => (deliveries.forEach((o) => dispatch(o, role, riders[o.id] || undefined)), onDone())}
        />
      )}
      {pickups.length > 0 && deliveries.length > 0 && <Text className="text-[11px] text-zinc-500 mt-1 text-center">…and dispatch {deliveries.length} Delivery order(s)</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- queues

function QueueScreen({ k, role, push }: { k: QueueKey; role: Role; push: (s: Screen) => void }) {
  const orders = useOrders();
  const refunds = useRefundQueue();
  if (k === "prices") return <NeedsPrices role={role} />;
  if (k === "refunds") {
    const todo = refunds.filter((r) => r.status === "To refund");
    const done = refunds.filter((r) => r.status === "Refunded");
    return (
      <View>
        <Text className="text-xs text-zinc-500 mb-2">
          Every refund in one place: Shortfalls, late-paid units, cancelled lines, fulfilment switches and refunds after handover.
          {role !== "owner" ? " Only an Owner can pay them out." : ""}
        </Text>
        {todo.map((r) => (
          <RefundRow key={r.id} q={r} role={role} onOpenOrder={() => push({ kind: "order", id: r.orderId })} />
        ))}
        {!todo.length && <Text className="text-xs text-zinc-500 mb-2">Nothing to refund.</Text>}
        {done.length > 0 && <Text className="text-[11px] uppercase font-bold text-zinc-500 mt-3 mb-2">Refunded</Text>}
        {done.map((r) => (
          <RefundRow key={r.id} q={r} role={role} onOpenOrder={() => push({ kind: "order", id: r.orderId })} />
        ))}
      </View>
    );
  }
  const qu = QUEUES.find((x) => x.key === k)!;
  const list = orders.filter(qu.test).sort((a, b) => daysWaiting(b) - daysWaiting(a));
  if (!list.length) return <Text className="text-xs text-zinc-500">Nothing here right now.</Text>;
  return (
    <View>
      {list.map((o) => (
        <Pressable key={o.id} onPress={() => push({ kind: "order", id: o.id })} className="bg-white rounded-xl border border-zinc-200 p-3 mb-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-zinc-900">
              {o.customer} · {o.ref}
            </Text>
            <StatePill s={o.state} />
          </View>
          <Text className="text-[11px] text-zinc-500 mt-0.5">
            {o.phone} · {fulfilmentLabel(o.fulfilment)}
            {o.blocker ? ` · ${o.blocker}` : ""}
          </Text>
          {k === "uncollected" && (
            <View className="flex-row items-center justify-between mt-2">
              <View>
                <Text className="text-xs font-bold text-amber-800">Waiting {daysWaiting(o)} days</Text>
                <UncollectedDots o={o} />
              </View>
              <Text className="text-xs font-semibold text-[#6d28d9]">📞 Call</Text>
            </View>
          )}
          {k === "out" && (
            <Text className="text-[11px] text-sky-700 mt-1">
              Dispatched {fmtDate(o.record.dispatchedAt)}
              {o.record.rider ? ` with ${o.record.rider}` : ""}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- order detail

type SheetKey = null | "handover" | "quote" | "more" | "switch" | "cancel" | "refund" | "fail" | "dispatch";

function OrderDetail({ id, role, onBack }: { id: string; role: Role; onBack: () => void }) {
  const o = useOrders().find((x) => x.id === id);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [code, setCode] = useState("");
  const [override, setOverride] = useState<string | null>(null);
  const [rider, setRider] = useState("");
  const [fail, setFail] = useState<string>("");
  if (!o) return null;
  const close = () => setSheet(null);
  const handed = isHandedOver(o);
  const canSwitch = !["Dispatched", "Collected", "Delivered", "Cancelled", "Forfeited"].includes(o.state);
  const canCancel = o.kind === "Store Order" && !handed && o.state !== "Cancelled";

  const primary: { label: string; tone?: "violet" | "red" | "dark" | "green"; onPress: () => void } | null =
    o.state === "Ready for handover" && o.fulfilment.kind === "Pickup"
      ? { label: "Hand over", onPress: () => setSheet("handover") }
      : o.state === "Ready for handover"
        ? { label: "Dispatch", tone: "dark", onPress: () => setSheet("dispatch") }
        : o.state === "Dispatched"
          ? { label: "Mark delivered", tone: "green", onPress: () => deliver(o, role) }
          : o.state === "Needs Delivery Fee quote"
            ? { label: "Quote Delivery Fee", onPress: () => setSheet("quote") }
            : null;

  return (
    <View className="flex-1">
      <Header title={`${o.ref} · ${o.customer}`} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 170 }}>
        <View className="flex-row items-center gap-2 mb-2">
          <StatePill s={o.state} />
          <Text className="text-[11px] text-zinc-500">
            {o.kind}
            {o.windowLabel ? ` · ${o.windowLabel}` : ""} · placed {fmtDate(o.placedAt)}
          </Text>
        </View>
        {o.blocker && <Text className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 mb-2">{o.blocker}</Text>}
        <Card title="Customer">
          <Text className="text-sm font-bold text-zinc-900">{o.customer}</Text>
          <Text className="text-xs text-zinc-500">{o.phone} · 📞 Call</Text>
        </Card>
        <Card title="Pickup Code">
          <CodeDigits code={o.pickupCode} />
          {o.readyAt && o.state === "Ready for handover" && <Text className="text-[11px] text-zinc-500 mt-1">Ready since {fmtDate(o.readyAt)} · {daysWaiting(o)} days</Text>}
        </Card>
        <Card title="Items">
          <Lines o={o} />
          <Text className="text-[11px] text-zinc-500 mt-1">Paid so far {ghs(o.paid)}</Text>
        </Card>
        <Card title="Fulfilment">
          <Text className="text-xs text-zinc-800">{fulfilmentLabel(o.fulfilment)}</Text>
          <DfStatus o={o} />
          {o.record.rider && <Text className="text-[11px] text-zinc-500">Rider: {o.record.rider}</Text>}
          {o.record.failed.map((f, i) => (
            <Text key={i} className="text-[11px] text-red-700">
              ✗ Delivery failed {fmtDate(f.at)} · {f.reason}
            </Text>
          ))}
        </Card>
        {o.kind === "Pre-order" && (
          <Card title="Shipping Fee Invoice">
            <Text className="text-xs text-zinc-800">
              {o.shippingInvoice ? `${o.shippingInvoice.number} · ${ghs(o.shippingInvoice.total)} · ${o.shippingInvoice.status}${o.shippingInvoice.paidAt ? ` ${fmtDate(o.shippingInvoice.paidAt)}` : ""}` : "Not invoiced yet"}
            </Text>
          </Card>
        )}
        <Card title="History">
          <Timeline o={o} />
        </Card>
      </ScrollView>

      {/* sticky action bar */}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 px-4 pt-3 flex-row gap-2" style={{ paddingBottom: 24 }}>
        <View className="flex-1">
          {primary ? <PrimaryBtn label={primary.label} tone={primary.tone} onPress={primary.onPress} /> : <Text className="text-xs text-zinc-400 py-3 text-center">Nothing to do on this order now</Text>}
        </View>
        {o.state === "Dispatched" && (
          <Pressable onPress={() => setSheet("fail")} className="border border-red-300 rounded-xl px-3 justify-center">
            <Text className="text-xs font-bold text-red-700">Failed</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setSheet("more")} className="border border-zinc-300 rounded-xl px-4 justify-center">
          <Text className="text-base font-bold text-zinc-700">⋯</Text>
        </Pressable>
      </View>

      <Sheet open={sheet === "handover"} onClose={close} title={`Hand over ${o.ref}`}>
        <Lines o={o} />
        {override === null ? (
          <View className="mt-3">
            <Text className="text-xs text-zinc-600 mb-1">Ask {o.customer.split(" ")[0]} for their 6-digit Pickup Code.</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              keyboardType="number-pad"
              className={`border-2 rounded-xl px-3 py-3 text-2xl font-black tracking-widest text-center ${code === o.pickupCode ? "border-emerald-500" : code.length === 6 ? "border-red-500" : "border-zinc-300"}`}
            />
            {code.length === 6 && code !== o.pickupCode && <Text className="text-xs text-red-700 mt-1">That code doesn't match {o.ref}.</Text>}
            <Pressable onPress={() => setOverride("")} className="mt-2">
              <Text className="text-xs text-[#6d28d9] font-semibold">No code? Override…</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-3">
            <Text className="text-xs text-amber-800 mb-2">Check name and phone ({o.phone}). The reason is recorded with your name.</Text>
            <Chips options={OVERRIDE_REASONS} value={override as (typeof OVERRIDE_REASONS)[number]} onChange={setOverride} />
            <Pressable onPress={() => setOverride(null)} className="mt-2">
              <Text className="text-xs text-zinc-500">← Type the code instead</Text>
            </Pressable>
          </View>
        )}
        <View className="mt-3">
          <PrimaryBtn
            label={code === o.pickupCode ? "✓ Code matches · Mark Collected" : override ? `Mark Collected (${override})` : "Enter the code or pick a reason"}
            disabled={code !== o.pickupCode && !override}
            onPress={() => (collect(o, role, code === o.pickupCode ? undefined : (override ?? undefined)), close())}
          />
        </View>
      </Sheet>

      <Sheet open={sheet === "dispatch"} onClose={close} title={`Dispatch ${o.ref}`}>
        <Text className="text-xs text-zinc-600 mb-2">To {fulfilmentLabel(o.fulfilment)}. The Customer gets the dispatched SMS.</Text>
        <Field label="Rider (optional)" value={rider} onChange={setRider} placeholder="e.g. Musah (Bolt)" />
        <PrimaryBtn tone="dark" label="Mark Dispatched" onPress={() => (dispatch(o, role, rider || undefined), close())} />
      </Sheet>

      <Sheet open={sheet === "fail"} onClose={close} title="Delivery failed">
        <Text className="text-xs text-zinc-600 mb-2">The order goes back to Ready for handover with this attempt on record. No new fee is charged.</Text>
        <Chips options={FAIL_REASONS} value={fail as (typeof FAIL_REASONS)[number]} onChange={setFail} />
        <View className="mt-3">
          <PrimaryBtn tone="red" label="Record failed delivery" disabled={!fail} onPress={() => (failDelivery(o, role, fail), close())} />
        </View>
      </Sheet>

      <Sheet open={sheet === "quote"} onClose={close} title="Quote Delivery Fee">
        <QuoteForm o={o} role={role} onDone={close} />
      </Sheet>

      <Sheet open={sheet === "more"} onClose={close} title={`${o.ref} actions`}>
        <View className="gap-2">
          {canSwitch && <GhostBtn label="Switch Pickup / Delivery" onPress={() => setSheet("switch")} />}
          {canCancel && <GhostBtn label="Cancel units…" onPress={() => setSheet("cancel")} />}
          {handed && <GhostBtn label="Refund…" locked={role !== "owner"} onPress={() => setSheet("refund")} />}
          {!canSwitch && !canCancel && !handed && <Text className="text-xs text-zinc-500">No other actions for this order.</Text>}
          {!canSwitch && !handed && o.state !== "Cancelled" && <Text className="text-[11px] text-zinc-400">Switching closes at dispatch.</Text>}
        </View>
      </Sheet>
      <Sheet open={sheet === "switch"} onClose={close} title="Switch Pickup / Delivery">
        <SwitchForm o={o} role={role} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "cancel"} onClose={close} title={`Cancel units on ${o.ref}`}>
        <CancelForm o={o} role={role} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "refund"} onClose={close} title={`Refund ${o.ref}`}>
        <RefundForm o={o} role={role} onDone={close} />
      </Sheet>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-xl border border-zinc-200 p-3 mb-2">
      <Text className="text-[10px] uppercase font-bold text-zinc-500 mb-1">{title}</Text>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- More tab

function More({ role, push }: { role: Role; push: (s: Screen) => void }) {
  const owner = role === "owner";
  const rows: { key: "stock" | "zones" | "staff" | "prices"; icon: string; label: string; sub: string; show: boolean }[] = [
    { key: "stock", icon: "🏷", label: "Stock", sub: "Counts, history, Adjustment, Sold offline", show: true },
    { key: "zones", icon: "🗺", label: "Delivery Zones", sub: owner ? "Zones and flat fees" : "View only", show: true },
    { key: "prices", icon: "💲", label: "Needs prices", sub: "Variants and windows waiting for a price", show: owner },
    { key: "staff", icon: "👥", label: "Staff", sub: "Invite, roles, deactivate", show: owner },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <Pressable key={r.key} onPress={() => push({ kind: "more", key: r.key })} className="flex-row items-center gap-3 bg-white rounded-xl border border-zinc-200 px-3 py-3 mb-2">
            <Text className="text-xl">{r.icon}</Text>
            <View className="flex-1">
              <Text className="text-sm font-bold text-zinc-900">{r.label}</Text>
              <Text className="text-[11px] text-zinc-500">{r.sub}</Text>
            </View>
            <Text className="text-zinc-400">›</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

function StockProducts({ push }: { push: (s: Screen) => void }) {
  const { products } = useBO();
  return (
    <View>
      {products.map((p) => (
        <View key={p.id} className="bg-white rounded-xl border border-zinc-200 p-3 mb-2">
          <View className="flex-row items-center gap-2 mb-1">
            <View className="w-6 h-6 rounded" style={{ backgroundColor: p.images[0]?.color ?? "#e4e4e7" }} />
            <Text className="text-sm font-bold text-zinc-900">{p.name}</Text>
          </View>
          {p.variants
            .filter((v) => !v.archived)
            .map((v) => (
              <StockRow key={v.id} label={variantLabel(v)} sku={v.sku} base={v.stock} variantId={v.id} onPress={() => push({ kind: "variant", productId: p.id, variantId: v.id })} />
            ))}
        </View>
      ))}
    </View>
  );
}

function StockRow({ label, sku, base, variantId, onPress }: { label: string; sku: string; base: number; variantId: string; onPress: () => void }) {
  const { current } = useStock(variantId, base);
  return (
    <Pressable onPress={onPress} className="flex-row items-center py-2 border-t border-zinc-100">
      <Text className="text-xs text-zinc-800 flex-1">
        {label} <Text className="text-zinc-400">· {sku}</Text>
      </Text>
      <Text className={`text-sm font-bold ${current ? "text-zinc-900" : "text-zinc-300"}`}>{current}</Text>
      <Text className="text-zinc-400 ml-2">›</Text>
    </Pressable>
  );
}

function VariantScreen({ base, variantId, sku, role }: { base: number; variantId: string; sku: string; role: Role }) {
  const { current } = useStock(variantId, base);
  return (
    <View>
      <View className="bg-white rounded-xl border border-zinc-200 p-3 mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[10px] uppercase font-bold text-zinc-500">In Stock</Text>
          <Text className="text-3xl font-black text-zinc-900">{current}</Text>
        </View>
        <Text className="text-xs text-zinc-400">{sku}</Text>
      </View>
      <View className="bg-white rounded-xl border border-zinc-200 p-3 mb-3">
        <StockEntry variantId={variantId} role={role} />
      </View>
      <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-1">Stock Movements</Text>
      <View className="bg-white rounded-xl border border-zinc-200 px-3 py-1">
        <Ledger variantId={variantId} base={base} />
      </View>
    </View>
  );
}
