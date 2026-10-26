// PROTOTYPE (wayfinder #17): handover variant B, "Customer counter".
// Everything hangs off the Customer: search by phone or Pickup Code, open the Customer, and hand over all their
// ready orders from one physical checklist. Every order action sits inline on that Customer page. Refunds of every
// kind live on the Invoices tab (Invoices | Refunds); Stock is its own tab with inline quick entry.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, fmtDate, ghs, useBO, variantLabel, type Product, type Role, type Variant } from "./bo-data";
import { ArrivalsList, Inbox, Wizard } from "./arrival-b";
import {
  UNCOLLECTED_AFTER,
  collect,
  daysWaiting,
  deliver,
  digits,
  dispatch,
  failDelivery,
  isHandedOver,
  isDone,
  search,
  soldOffline,
  useOrders,
  useRefundQueue,
  useStock,
  type HOrder,
  type RefundKind,
} from "./handover-data";
import {
  CancelForm,
  Chips,
  CodeDigits,
  DfStatus,
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

type Tab = "customers" | "arrivals" | "invoices" | "stock" | "settings";
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "customers", icon: "👤", label: "Customers" },
  { key: "arrivals", icon: "📦", label: "Arrivals" },
  { key: "invoices", icon: "🧾", label: "Invoices" },
  { key: "stock", icon: "🏷", label: "Stock" },
  { key: "settings", icon: "⚙", label: "Settings" },
];

const ACTIONABLE = ["Ready for handover", "Dispatched", "Needs Delivery Fee quote"];

export default function HandoverB({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>("customers");
  const [wizard, setWizard] = useState<string | null>(null);
  const [customer, setCustomer] = useState<{ phone: string; verifiedCode?: string } | null>(null);
  const refunds = useRefundQueue();
  const toRefund = refunds.filter((r) => r.status === "To refund").length;

  return (
    <View className="flex-1 bg-zinc-100">
      <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
        <View className="px-4 pb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-zinc-900">{TABS.find((t) => t.key === tab)!.label}</Text>
          <Text className="text-xs text-zinc-500">{ME[role]}</Text>
        </View>
      </View>

      {tab === "customers" && <CustomersTab onOpen={(phone, verifiedCode) => setCustomer({ phone, verifiedCode })} />}
      {tab === "arrivals" && <ArrivalsList onOpen={setWizard} />}
      {tab === "invoices" && <InvoicesTab role={role} onOpenOrder={(phone) => (setTab("customers"), setCustomer({ phone }))} />}
      {tab === "stock" && <StockTab role={role} />}
      {tab === "settings" && <SettingsTab role={role} />}

      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 flex-row" style={{ paddingBottom: 18 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} className="flex-1 items-center pt-2.5">
            <Text className={`text-lg ${tab === t.key ? "" : "opacity-40"}`}>{t.icon}</Text>
            <Text className={`text-[10px] font-semibold ${tab === t.key ? "text-[#6d28d9]" : "text-zinc-500"}`}>
              {t.label}
              {t.key === "invoices" && toRefund ? ` (${toRefund})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {customer && <CustomerPage phone={customer.phone} verifiedCode={customer.verifiedCode} role={role} onBack={() => setCustomer(null)} />}
      {wizard && <Wizard windowId={wizard} role={role} onClose={() => setWizard(null)} />}
      <HandoverPeek />
    </View>
  );
}

// ---------------------------------------------------------------- Customers tab

type Group = { phone: string; customer: string; orders: HOrder[]; waiting: number; delivery: boolean };

function groupByCustomer(orders: HOrder[]): Group[] {
  const map = new Map<string, Group>();
  for (const o of orders) {
    const g = map.get(o.phone) ?? { phone: o.phone, customer: o.customer, orders: [], waiting: 0, delivery: false };
    g.orders.push(o);
    if (o.state === "Ready for handover") g.waiting = Math.max(g.waiting, daysWaiting(o));
    if (o.fulfilment.kind === "Delivery") g.delivery = true;
    map.set(o.phone, g);
  }
  return [...map.values()];
}

function CustomersTab({ onOpen }: { onOpen: (phone: string, verifiedCode?: string) => void }) {
  const orders = useOrders();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"All" | "Uncollected" | "Delivery">("All");
  const res = search(orders, q);
  const waiting = groupByCustomer(orders.filter((o) => ACTIONABLE.includes(o.state)))
    .filter((g) => (filter === "Uncollected" ? g.waiting >= UNCOLLECTED_AFTER : filter === "Delivery" ? g.delivery : true))
    .sort((a, b) => b.waiting - a.waiting);
  const searching = digits(q).length >= 4;
  const found = groupByCustomer(res.customerOrders);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View className="bg-white border-2 border-[#6d28d9] rounded-2xl px-4 py-3 flex-row items-center gap-2">
        <Text className="text-lg">🔎</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Phone or Pickup Code" keyboardType="number-pad" className="flex-1 text-lg font-semibold text-zinc-900" />
        {q ? (
          <Pressable onPress={() => setQ("")}>
            <Text className="text-zinc-400">✕</Text>
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <View className="mt-4">
          {res.byCode && (
            <Text className="text-xs text-emerald-700 font-semibold mb-2">
              ✓ Pickup Code matches {res.byCode.ref}. It's verified when you open {res.byCode.customer.split(" ")[0]}.
            </Text>
          )}
          {found.length ? (
            found.map((g) => <CustomerRow key={g.phone} g={g} onPress={() => onOpen(g.phone, res.byCode?.pickupCode)} />)
          ) : (
            <Text className="text-sm text-zinc-500">No Customer or code matches "{q}".</Text>
          )}
        </View>
      ) : (
        <View className="mt-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] uppercase font-bold text-zinc-500">Waiting for you</Text>
            <View className="flex-row bg-zinc-200 rounded-lg p-0.5">
              {(["All", "Uncollected", "Delivery"] as const).map((f) => (
                <Pressable key={f} onPress={() => setFilter(f)} className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-white" : ""}`}>
                  <Text className={`text-[11px] font-semibold ${filter === f ? "text-zinc-900" : "text-zinc-500"}`}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {waiting.length ? waiting.map((g) => <CustomerRow key={g.phone} g={g} onPress={() => onOpen(g.phone)} />) : <Text className="text-xs text-zinc-500">Nobody waiting.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

function CustomerRow({ g, onPress }: { g: Group; onPress: () => void }) {
  const uncollected = g.waiting >= UNCOLLECTED_AFTER;
  const ready = g.orders.filter((o) => o.state === "Ready for handover");
  const counts = g.orders.reduce<Record<string, number>>((m, o) => ((m[o.state] = (m[o.state] ?? 0) + 1), m), {});
  const uncollectedOrder = ready.slice().sort((a, b) => daysWaiting(b) - daysWaiting(a))[0];
  return (
    <Pressable onPress={onPress} className={`bg-white rounded-2xl border p-3 mb-2 ${uncollected ? "border-amber-300" : "border-zinc-200"}`}>
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full bg-violet-100 items-center justify-center">
          <Text className="text-sm font-bold text-[#6d28d9]">
            {g.customer
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold text-zinc-900">{g.customer}</Text>
            {uncollected && <Text className="text-[10px] font-bold px-1.5 py-0.5 rounded overflow-hidden bg-amber-100 text-amber-800">Uncollected</Text>}
          </View>
          <Text className="text-[11px] text-zinc-500">
            {g.phone}
            {g.waiting ? ` · waiting ${g.waiting} day${g.waiting === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
        <Text className="text-zinc-300 text-lg">›</Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5 mt-2">
        {Object.entries(counts).map(([s, n]) => (
          <Text key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full overflow-hidden bg-zinc-100 text-zinc-700">
            {n} {s}
          </Text>
        ))}
      </View>
      {uncollected && uncollectedOrder && (
        <View className="mt-2">
          <UncollectedDots o={uncollectedOrder} />
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Customer page

function CustomerPage({ phone, verifiedCode, role, onBack }: { phone: string; verifiedCode?: string; role: Role; onBack: () => void }) {
  const orders = useOrders().filter((o) => o.phone === phone);
  const [handover, setHandover] = useState(false);
  const name = orders[0]?.customer ?? phone;
  const readyPickup = orders.filter((o) => o.state === "Ready for handover" && o.fulfilment.kind === "Pickup");
  const live = orders.filter((o) => !isDone(o)).sort((a, b) => (a.state === "Ready for handover" ? -1 : b.state === "Ready for handover" ? 1 : 0));
  const done = orders.filter(isDone);
  const paid = orders.reduce((s, o) => s + o.paid, 0);
  const [showDone, setShowDone] = useState(false);

  return (
    <View className="absolute inset-0 bg-zinc-100" style={{ zIndex: 50 }}>
      <View className="bg-white border-b border-zinc-200 px-4 pb-3" style={{ paddingTop: 44 }}>
        <Pressable onPress={onBack} className="mb-1">
          <Text className="text-sm text-[#6d28d9] font-semibold">‹ Customers</Text>
        </Pressable>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-bold text-zinc-900">{name}</Text>
            <Text className="text-xs text-zinc-500">
              {phone} · {orders.length} orders · {ghs(paid)} paid
            </Text>
          </View>
          <View className="rounded-full px-3 py-1.5 bg-emerald-100">
            <Text className="text-xs font-bold text-emerald-800">📞 Call</Text>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {readyPickup.length > 0 && (
          <View className="mb-4">
            <PrimaryBtn label={`Hand over everything ready (${readyPickup.length})`} onPress={() => setHandover(true)} />
            <Text className="text-[11px] text-zinc-500 text-center mt-1">
              {readyPickup.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty - l.cancelled, 0), 0)} items across {readyPickup.map((o) => o.ref).join(", ")}
            </Text>
          </View>
        )}
        {live.map((o) => (
          <OrderSection key={o.id} o={o} role={role} />
        ))}
        {done.length > 0 && (
          <Pressable onPress={() => setShowDone(!showDone)} className="py-2">
            <Text className="text-xs font-semibold text-zinc-500">
              {showDone ? "▾" : "▸"} Done ({done.length})
            </Text>
          </Pressable>
        )}
        {showDone && done.map((o) => <OrderSection key={o.id} o={o} role={role} />)}
      </ScrollView>
      <HandoverChecklist open={handover} orders={readyPickup} verifiedCode={verifiedCode} role={role} onClose={() => setHandover(false)} />
    </View>
  );
}

type Verify = { code: string; override?: string; overriding?: boolean };

function HandoverChecklist({ open, orders, verifiedCode, role, onClose }: { open: boolean; orders: HOrder[]; verifiedCode?: string; role: Role; onClose: () => void }) {
  const { products } = useBO();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [verify, setVerify] = useState<Record<string, Verify>>({});
  const units = useMemo(
    () =>
      orders.flatMap((o) =>
        o.lines.flatMap((l) => Array.from({ length: l.qty - l.cancelled }, (_, i) => ({ key: `${o.id}-${l.variantId}-${i}`, orderId: o.id, l }))),
      ),
    [orders],
  );
  const ok = (o: HOrder) => {
    const v = verify[o.id];
    return o.pickupCode === verifiedCode || v?.code === o.pickupCode || !!v?.override;
  };
  const allTicked = units.every((u) => ticked[u.key]);
  const allOk = orders.every(ok);
  const set = (id: string, patch: Partial<Verify>) => setVerify({ ...verify, [id]: { ...(verify[id] ?? { code: "" }), ...patch } });

  return (
    <Sheet open={open} onClose={onClose} title="Hand over">
      <Text className="text-xs text-zinc-600 mb-3">Tick each item as it goes over the counter. Each order needs its Pickup Code, or an override with a reason.</Text>
      {orders.map((o) => {
        const v = verify[o.id] ?? { code: "" };
        const pre = o.pickupCode === verifiedCode;
        return (
          <View key={o.id} className="border border-zinc-200 rounded-2xl p-3 mb-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-sm font-bold text-zinc-900">
                {o.ref} · {o.kind}
              </Text>
              {ok(o) && <Text className="text-[11px] font-bold text-emerald-700">✓ {v.override ? "Override" : "Code OK"}</Text>}
            </View>
            {units
              .filter((u) => u.orderId === o.id)
              .map((u) => {
                const p = products.find((x) => x.id === u.l.productId) as Product;
                const vr = p.variants.find((x) => x.id === u.l.variantId) as Variant | undefined;
                return (
                  <Pressable key={u.key} onPress={() => setTicked({ ...ticked, [u.key]: !ticked[u.key] })} className="flex-row items-center gap-2 py-1.5">
                    <Text className="text-lg">{ticked[u.key] ? "☑" : "☐"}</Text>
                    <View className="w-6 h-6 rounded" style={{ backgroundColor: p.images[0]?.color }} />
                    <Text className={`text-sm flex-1 ${ticked[u.key] ? "text-zinc-400" : "text-zinc-900"}`}>
                      {p.name} · {vr ? variantLabel(vr) : ""}
                    </Text>
                  </Pressable>
                );
              })}
            {pre ? (
              <Text className="text-[11px] text-emerald-700 mt-1">Pickup Code verified by search.</Text>
            ) : v.overriding ? (
              <View className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <Text className="text-[11px] font-bold text-amber-800 mb-1">No code: why?</Text>
                <Chips options={["Lost the SMS", "Collecting for someone", "Phone dead", "Other"] as const} value={(v.override ?? "") as "Other"} onChange={(r) => set(o.id, { override: r })} />
                <Pressable onPress={() => set(o.id, { overriding: false, override: undefined })} className="mt-1">
                  <Text className="text-[11px] text-zinc-500">Use the code instead</Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row items-center gap-2 mt-2">
                <TextInput
                  value={v.code}
                  onChangeText={(t) => set(o.id, { code: digits(t).slice(0, 6) })}
                  placeholder="Pickup Code"
                  keyboardType="number-pad"
                  maxLength={6}
                  className={`flex-1 border rounded-lg px-3 py-2 text-base font-bold tracking-[4px] ${v.code.length === 6 && v.code !== o.pickupCode ? "border-red-400 text-red-700" : "border-zinc-300 text-zinc-900"}`}
                />
                <Pressable onPress={() => set(o.id, { overriding: true })}>
                  <Text className="text-[11px] text-zinc-500 underline">No code → override</Text>
                </Pressable>
              </View>
            )}
            {v.code.length === 6 && v.code !== o.pickupCode && !v.overriding && <Text className="text-[11px] text-red-600 mt-1">That code doesn't match {o.ref}.</Text>}
          </View>
        );
      })}
      <PrimaryBtn
        tone="green"
        label={!allTicked ? `Tick all ${units.length} items` : !allOk ? "Check every Pickup Code" : `Mark ${orders.length} order${orders.length === 1 ? "" : "s"} Collected`}
        disabled={!allTicked || !allOk}
        onPress={() => {
          for (const o of orders) collect(o, role, o.pickupCode === verifiedCode || verify[o.id]?.code === o.pickupCode ? undefined : verify[o.id]?.override);
          setTicked({});
          setVerify({});
          onClose();
        }}
      />
    </Sheet>
  );
}

type SheetKind = "quote" | "switch" | "cancel" | "refund" | null;

function OrderSection({ o, role }: { o: HOrder; role: Role }) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [mode, setMode] = useState<"none" | "dispatch" | "fail">("none");
  const [rider, setRider] = useState("");
  const [reason, setReason] = useState("Customer not reachable");
  const isDelivery = o.fulfilment.kind === "Delivery";
  const ready = o.state === "Ready for handover";
  const canSwitch = !isHandedOver(o) && !isDone(o) && o.state !== "Awaiting goods";
  const canCancel = o.kind === "Store Order" && !isHandedOver(o) && !isDone(o);
  const handed = o.state === "Collected" || o.state === "Delivered" || o.state === "Dispatched";
  const close = () => setSheet(null);

  return (
    <View className={`bg-white rounded-2xl border p-3 mb-3 ${ready ? "border-violet-300" : "border-zinc-200"}`}>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-bold text-zinc-900">{o.ref}</Text>
          <Text className="text-[11px] text-zinc-500">
            {o.kind}
            {o.windowLabel ? ` · ${o.windowLabel}` : ""} · placed {fmtDate(o.placedAt)}
          </Text>
        </View>
        <StatePill s={o.state} />
      </View>
      <View className="mt-2">
        <Lines o={o} />
      </View>
      <View className="mt-2 border-t border-zinc-100 pt-2">
        <Text className="text-[11px] text-zinc-700">
          {isDelivery ? "🚚" : "🏬"} {fulfilmentLabel(o.fulfilment)}
          {o.record.rider ? ` · rider ${o.record.rider}` : ""}
        </Text>
        <DfStatus o={o} />
        {o.shippingInvoice && (
          <Text className="text-[11px] text-zinc-600 mt-0.5">
            Shipping Fee {o.shippingInvoice.number} {ghs(o.shippingInvoice.total)} · {o.shippingInvoice.status === "Paid" ? `paid ${fmtDate(o.shippingInvoice.paidAt)}` : "unpaid"}
          </Text>
        )}
        {o.blocker && <Text className="text-[11px] text-amber-700 mt-0.5">⏳ {o.blocker}</Text>}
        {ready && <Text className="text-[11px] text-zinc-500 mt-0.5">Ready {daysWaiting(o)} day(s)</Text>}
      </View>
      {(ready || o.state === "Dispatched") && (
        <View className="flex-row items-center gap-2 mt-2">
          <Text className="text-[10px] uppercase font-bold text-zinc-400">Pickup Code</Text>
          <CodeDigits code={o.pickupCode} size="sm" />
        </View>
      )}
      {o.record.failed.map((f, i) => (
        <Text key={i} className="text-[11px] text-red-600 mt-1">
          ✕ Delivery failed {fmtDate(f.at)}: {f.reason}
        </Text>
      ))}
      <View className="mt-2">
        <Timeline o={o} />
      </View>

      {/* inline actions */}
      <View className="flex-row flex-wrap gap-2 mt-3">
        {ready && isDelivery && <GhostBtn label="Dispatch" onPress={() => setMode(mode === "dispatch" ? "none" : "dispatch")} />}
        {o.state === "Dispatched" && (
          <>
            <GhostBtn label="Delivered" onPress={() => deliver(o, role)} />
            <GhostBtn label="Delivery failed" onPress={() => setMode(mode === "fail" ? "none" : "fail")} />
          </>
        )}
        {o.state === "Needs Delivery Fee quote" && <GhostBtn label="Quote fee" onPress={() => setSheet("quote")} />}
        {canSwitch && <GhostBtn label="Switch" onPress={() => setSheet("switch")} />}
        {canCancel && <GhostBtn label="Cancel units" onPress={() => setSheet("cancel")} />}
        {handed && <GhostBtn label="Refund" locked={role !== "owner"} onPress={() => setSheet("refund")} />}
      </View>

      {mode === "dispatch" && (
        <View className="mt-2 bg-sky-50 border border-sky-200 rounded-lg p-2">
          <TextInput value={rider} onChangeText={setRider} placeholder="Rider (optional), e.g. Musah (Bolt)" className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm bg-white mb-2" />
          <PrimaryBtn tone="dark" label={`Dispatch & text ${o.customer.split(" ")[0]}`} onPress={() => (dispatch(o, role, rider || undefined), setMode("none"), setRider(""))} />
        </View>
      )}
      {mode === "fail" && (
        <View className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
          <Chips options={["Customer not reachable", "Wrong address", "Customer refused", "Rider issue"] as const} value={reason as "Rider issue"} onChange={setReason} />
          <Text className="text-[11px] text-red-800 my-2">Goes back to Ready for handover. No new fee is charged.</Text>
          <PrimaryBtn tone="red" label="Record failed delivery" onPress={() => (failDelivery(o, role, reason), setMode("none"))} />
        </View>
      )}

      <Sheet open={sheet === "quote"} onClose={close} title={`Quote Delivery Fee · ${o.ref}`}>
        <QuoteForm o={o} role={role} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "switch"} onClose={close} title={`Switch fulfilment · ${o.ref}`}>
        <SwitchForm o={o} role={role} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "cancel"} onClose={close} title={`Cancel units · ${o.ref}`}>
        <CancelForm o={o} role={role} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "refund"} onClose={close} title={`Refund · ${o.ref}`}>
        <RefundForm o={o} role={role} onDone={close} />
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- Invoices tab (Invoices | Refunds)

const KINDS: ("All" | RefundKind)[] = ["All", "Shortfall", "Late-paid", "Cancelled line", "After handover", "Fulfilment switch"];

function InvoicesTab({ role, onOpenOrder }: { role: Role; onOpenOrder: (phone: string) => void }) {
  const [seg, setSeg] = useState<"Invoices" | "Refunds">("Invoices");
  const queue = useRefundQueue();
  const [kind, setKind] = useState<"All" | RefundKind>("All");
  const [status, setStatus] = useState<"To refund" | "Refunded">("To refund");
  const toRefund = queue.filter((r) => r.status === "To refund");
  const list = queue.filter((r) => r.status === status && (kind === "All" || r.kind === kind));
  const count = (k: "All" | RefundKind) => queue.filter((r) => r.status === status && (k === "All" || r.kind === k)).length;

  return (
    <View className="flex-1">
      <View className="px-4 pt-3">
        <View className="flex-row bg-zinc-200 rounded-xl p-0.5">
          {(["Invoices", "Refunds"] as const).map((s) => (
            <Pressable key={s} onPress={() => setSeg(s)} className={`flex-1 rounded-lg py-2 items-center ${seg === s ? "bg-white" : ""}`}>
              <Text className={`text-sm font-semibold ${seg === s ? "text-zinc-900" : "text-zinc-500"}`}>
                {s}
                {s === "Refunds" && toRefund.length ? ` (${toRefund.length})` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {seg === "Invoices" ? (
        <Inbox role={role} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View className="flex-row gap-2 mb-2">
            {(["To refund", "Refunded"] as const).map((s) => (
              <Pressable key={s} onPress={() => setStatus(s)} className={`rounded-full px-3 py-1 ${status === s ? "bg-[#6d28d9]" : "bg-white border border-zinc-300"}`}>
                <Text className={`text-xs font-semibold ${status === s ? "text-white" : "text-zinc-700"}`}>{s}</Text>
              </Pressable>
            ))}
            {status === "To refund" && <Text className="text-xs text-zinc-500 self-center">{ghs(toRefund.reduce((s, r) => s + r.amount, 0))} owed</Text>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            <View className="flex-row gap-1.5">
              {KINDS.map((k) => (
                <Pressable key={k} onPress={() => setKind(k)} className={`rounded-full px-2.5 py-1 border ${kind === k ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 bg-white"}`}>
                  <Text className={`text-[11px] ${kind === k ? "text-white" : "text-zinc-700"}`}>
                    {k} {count(k)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {role !== "owner" && <Text className="text-[11px] text-zinc-500 mb-2">🔒 Only an Owner pays refunds. You can see what's waiting.</Text>}
          {list.length ? list.map((q) => <RefundRow key={q.id} q={q} role={role} onOpenOrder={() => onOpenOrder(q.phone)} />) : <Text className="text-xs text-zinc-500">Nothing here.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Stock tab

function StockTab({ role }: { role: Role }) {
  const { products } = useBO();
  const [entry, setEntry] = useState<string | null>(null);
  const [ledger, setLedger] = useState<{ id: string; base: number; label: string } | null>(null);
  const live = products.filter((p) => p.status !== "Archived");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text className="text-xs text-zinc-500 mb-3">Tap a Variant for its history. "−1" records a walk-in or DM sale.</Text>
      {live.map((p) => (
        <View key={p.id} className="bg-white rounded-2xl border border-zinc-200 p-3 mb-3">
          <View className="flex-row items-center gap-3 mb-2">
            <View className="w-9 h-9 rounded-lg" style={{ backgroundColor: p.images[0]?.color ?? "#e4e4e7" }} />
            <Text className="text-sm font-bold text-zinc-900 flex-1">{p.name}</Text>
            <Text className="text-[10px] text-zinc-400">{p.status}</Text>
          </View>
          {p.variants
            .filter((v) => !v.archived)
            .map((v) => (
              <StockRow key={v.id} v={v} role={role} onEntry={() => setEntry(v.id)} onLedger={() => setLedger({ id: v.id, base: v.stock, label: `${p.name} · ${variantLabel(v)}` })} />
            ))}
        </View>
      ))}
      <Sheet open={!!entry} onClose={() => setEntry(null)} title="Stock entry">
        {entry && <StockEntry variantId={entry} role={role} onDone={() => setEntry(null)} />}
      </Sheet>
      <Sheet open={!!ledger} onClose={() => setLedger(null)} title={ledger?.label ?? ""}>
        {ledger && <Ledger variantId={ledger.id} base={ledger.base} />}
      </Sheet>
    </ScrollView>
  );
}

function StockRow({ v, role, onEntry, onLedger }: { v: Variant; role: Role; onEntry: () => void; onLedger: () => void }) {
  const { current } = useStock(v.id, v.stock);
  return (
    <View className="flex-row items-center gap-2 py-2 border-t border-zinc-100">
      <Pressable onPress={onLedger} className="flex-1">
        <Text className="text-sm text-zinc-900">{variantLabel(v)}</Text>
        <Text className="text-[10px] text-zinc-400">{v.sku}</Text>
      </Pressable>
      <Text className={`text-lg font-black w-10 text-right ${current <= 0 ? "text-red-600" : "text-zinc-900"}`}>{current}</Text>
      <Pressable onPress={() => current > 0 && soldOffline(v.id, 1, "Walk-in", role)} className={`rounded-lg px-2 py-1.5 border ${current > 0 ? "border-zinc-300" : "border-zinc-200 opacity-40"}`}>
        <Text className="text-[11px] font-semibold text-zinc-700">−1 sold offline</Text>
      </Pressable>
      <Pressable onPress={onEntry} className="rounded-lg w-8 h-8 items-center justify-center bg-zinc-900">
        <Text className="text-white font-bold">±</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Settings tab

function SettingsTab({ role }: { role: Role }) {
  const owner = role === "owner";
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2">Delivery Zones</Text>
      <ZonesEditor role={role} />
      {owner && (
        <>
          <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2 mt-6">Needs prices</Text>
          <NeedsPrices role={role} />
          <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2 mt-6">Staff</Text>
          <StaffManager />
        </>
      )}
      <View className="bg-white border border-zinc-200 rounded-xl px-3 py-3 mt-6 flex-row justify-between">
        <Text className="text-xs text-zinc-500">Signed in as</Text>
        <Text className="text-xs font-semibold text-zinc-900">{ME[role]}</Text>
      </View>
    </ScrollView>
  );
}
