// PROTOTYPE (wayfinder #17): handover variant C, "Handover desk + order board".
// Counter: a dark, code-first desk with an on-screen keypad; a matching Pickup Code jumps straight to a handover card.
// Orders: a status board of chips (Ready, To dispatch, Out, Needs quote, Awaiting pay, Uncollected, Refunds, Done);
// each order opens as a bottom sheet of big actions. Refunds are a column on the board. More: one Stock table + settings.
import { useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, fmtDate, ghs, useBO, variantLabel, type Role } from "./bo-data";
import { ArrivalsList, Inbox, Wizard } from "./arrival-b";
import {
  UNCOLLECTED_AFTER,
  collect,
  daysWaiting,
  deliver,
  digits,
  dispatch,
  failDelivery,
  isDone,
  isHandedOver,
  search,
  unitsOf,
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

type Tab = "counter" | "orders" | "arrivals" | "invoices" | "more";
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "counter", icon: "🔢", label: "Counter" },
  { key: "orders", icon: "🗂", label: "Orders" },
  { key: "arrivals", icon: "📦", label: "Arrivals" },
  { key: "invoices", icon: "🧾", label: "Invoices" },
  { key: "more", icon: "☰", label: "More" },
];

const first = (name: string) => name.split(" ")[0];
const isReadyPickup = (o: HOrder) => o.state === "Ready for handover" && o.fulfilment.kind === "Pickup";

export default function HandoverC({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>("counter");
  const [wizard, setWizard] = useState<string | null>(null);
  const orders = useOrders();
  const refunds = useRefundQueue();
  const readyCount = orders.filter((o) => o.state === "Ready for handover").length;
  const toRefund = refunds.filter((r) => r.status === "To refund").length;
  const dark = tab === "counter";

  return (
    <View className={`flex-1 ${dark ? "bg-zinc-900" : "bg-zinc-100"}`}>
      <View className={dark ? "bg-zinc-900" : "bg-white border-b border-zinc-200"} style={{ paddingTop: 44 }}>
        <View className="px-4 pb-2 flex-row items-center justify-between">
          <Text className={`text-lg font-bold ${dark ? "text-white" : "text-zinc-900"}`}>{TABS.find((t) => t.key === tab)!.label}</Text>
          <Text className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{ME[role]}</Text>
        </View>
      </View>

      {tab === "counter" && <Counter role={role} />}
      {tab === "orders" && <Board role={role} onCounter={() => setTab("counter")} />}
      {tab === "arrivals" && <ArrivalsList onOpen={setWizard} />}
      {tab === "invoices" && <Inbox role={role} />}
      {tab === "more" && <More role={role} />}

      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 flex-row" style={{ paddingBottom: 18 }}>
        {TABS.map((t) => {
          const badge = t.key === "orders" ? readyCount + (role === "owner" ? toRefund : 0) : 0;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} className="flex-1 items-center pt-2.5">
              <Text className={`text-lg ${tab === t.key ? "" : "opacity-40"}`}>{t.icon}</Text>
              <Text className={`text-[11px] font-semibold ${tab === t.key ? "text-[#6d28d9]" : "text-zinc-500"}`}>
                {t.label}
                {badge ? ` (${badge})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {wizard && <Wizard windowId={wizard} role={role} onClose={() => setWizard(null)} />}
      <HandoverPeek />
    </View>
  );
}

// ---------------------------------------------------------------- Counter (code-first desk)

type Extra = { id: string; code: string; reason?: string; open: boolean };
const OVERRIDE_REASONS = ["Lost the SMS", "Collecting for someone else", "Phone dead", "Other"] as const;

/** Also used by variant D as a full-screen overlay: `target` aims it at one order, `onExit` adds a way back. */
export function Counter({ role, target, onExit, onNext }: { role: Role; target?: HOrder; onExit?: () => void; onNext?: () => void }) {
  const orders = useOrders();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"code" | "phone">("code");
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [rider, setRider] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [done, setDone] = useState<{ name: string; refs: string[]; verb: string } | null>(null);
  const shake = useRef(new Animated.Value(0)).current;

  const reset = () => {
    setCode("");
    setPhone("");
    setPicked(null);
    setReason(null);
    setRider("");
    setExtras([]);
    setDone(null);
    setMode("code");
  };

  const matched = mode === "code" && code.length === 6 ? orders.find((o) => o.pickupCode === code) : undefined;
  const wrong = mode === "code" && code.length === 6 && !matched;

  const press = (k: string) => {
    if (k === "⌫") return setCode(code.slice(0, -1));
    if (k === "C") return setCode("");
    if (code.length >= 6) return;
    const next = code + k;
    setCode(next);
    if (next.length === 6 && !orders.some((o) => o.pickupCode === next))
      Animated.sequence([10, -10, 8, -8, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 50, useNativeDriver: true }))).start();
  };

  if (done)
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ paddingBottom: 120 }}>
        <View className="w-28 h-28 rounded-full bg-emerald-500 items-center justify-center mb-5">
          <Text className="text-white text-6xl font-black">✓</Text>
        </View>
        <Text className="text-white text-2xl font-black text-center">
          {done.verb} · {first(done.name)}
        </Text>
        <Text className="text-zinc-400 text-sm mt-1 text-center">{done.refs.join(" · ")}</Text>
        <Pressable onPress={() => (reset(), onNext?.())} className="mt-8 bg-[#facc15] rounded-2xl px-10 py-4">
          <Text className="text-zinc-900 text-lg font-black">Next customer</Text>
        </Pressable>
        {onExit && (
          <Pressable onPress={onExit} className="mt-4 py-2">
            <Text className="text-zinc-400 text-sm font-semibold">Done · back to Today</Text>
          </Pressable>
        )}
      </View>
    );

  // the order being handed over: by code, or picked from the phone search
  const main = matched ?? (mode === "phone" && picked ? orders.find((o) => o.id === picked) : undefined);
  if (main) {
    const others = orders.filter((o) => o.phone === main.phone && o.id !== main.id && isReadyPickup(o));
    const added = extras.filter((e) => others.some((o) => o.id === e.id) && (others.find((o) => o.id === e.id)!.pickupCode === e.code || e.reason));
    const needsReason = mode === "phone" && main.fulfilment.kind === "Pickup" && !reason;
    const handOver = () => {
      if (main.fulfilment.kind === "Delivery") {
        dispatch(main, role, rider || undefined);
        return setDone({ name: main.customer, refs: [main.ref], verb: "Dispatched" });
      }
      collect(main, role, mode === "phone" ? (reason ?? undefined) : undefined);
      for (const e of added) collect(others.find((o) => o.id === e.id)!, role, e.reason);
      setDone({ name: main.customer, refs: [main.ref, ...added.map((e) => others.find((o) => o.id === e.id)!.ref)], verb: "Handed over" });
    };
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Pressable onPress={reset}>
          <Text className="text-zinc-400 text-xs mb-3">‹ Back to keypad</Text>
        </Pressable>
        <View className="bg-white rounded-3xl p-5">
          <Text className="text-[11px] uppercase font-bold text-zinc-400">{main.kind}</Text>
          <Text className="text-3xl font-black text-zinc-900">{main.customer}</Text>
          <Text className="text-xs text-zinc-500 mb-2">{main.phone}</Text>
          {mode === "code" ? (
            <View className="self-start bg-emerald-100 rounded-full px-3 py-1 mb-3">
              <Text className="text-emerald-800 text-xs font-bold">✓ Code matches {main.ref}</Text>
            </View>
          ) : (
            <View className="self-start bg-amber-100 rounded-full px-3 py-1 mb-3">
              <Text className="text-amber-800 text-xs font-bold">No code · {main.ref}</Text>
            </View>
          )}
          <Lines o={main} />
          <Text className="text-[11px] text-zinc-500 mt-2">
            {fulfilmentLabel(main.fulfilment)} · {unitsOf(main)} unit(s)
          </Text>

          {main.state !== "Ready for handover" ? (
            <View className="bg-red-600 rounded-2xl p-4 mt-4">
              <Text className="text-white font-black text-base">Not ready: {main.state}</Text>
              <Text className="text-red-100 text-xs mt-1">{main.blocker ?? (isDone(main) || isHandedOver(main) ? `Already ${main.state.toLowerCase()}.` : "")}</Text>
            </View>
          ) : (
            <View className="mt-4">
              {mode === "phone" && main.fulfilment.kind === "Pickup" && (
                <View className="mb-3">
                  <Text className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Why no code? (required)</Text>
                  <Chips options={OVERRIDE_REASONS} value={(reason ?? "") as (typeof OVERRIDE_REASONS)[number]} onChange={setReason} />
                  <Text className="text-[10px] text-zinc-400 mt-1">Check their ID or name against the order. Recorded with {ME[role]}.</Text>
                </View>
              )}
              {main.fulfilment.kind === "Delivery" && <Field label="Rider (optional)" value={rider} onChange={setRider} placeholder="e.g. Musah (Bolt)" />}
              <Pressable onPress={needsReason ? undefined : handOver} className={`rounded-2xl py-5 items-center ${needsReason ? "bg-zinc-300" : main.fulfilment.kind === "Delivery" ? "bg-sky-600" : "bg-emerald-600"}`}>
                <Text className="text-white text-xl font-black">
                  {main.fulfilment.kind === "Delivery"
                    ? "Dispatch"
                    : `${mode === "phone" ? "Hand over without code" : `Hand over to ${first(main.customer)}`}${added.length ? ` (+${added.length})` : ""}`}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {main.state === "Ready for handover" && main.fulfilment.kind === "Pickup" && others.length > 0 && (
          <View className="mt-4">
            <Text className="text-white font-bold mb-2">
              Also ready for {first(main.customer)}: {others.length} more
            </Text>
            {others.map((o) => {
              const e = extras.find((x) => x.id === o.id);
              const ok = e && (e.code === o.pickupCode || e.reason);
              const upd = (patch: Partial<Extra>) => setExtras([...extras.filter((x) => x.id !== o.id), { id: o.id, code: "", open: true, ...e, ...patch }]);
              return (
                <View key={o.id} className="bg-zinc-800 rounded-2xl p-3 mb-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-white text-sm font-bold">
                        {o.ref} · {o.kind}
                      </Text>
                      <Text className="text-zinc-400 text-[11px]">{unitsOf(o)} unit(s)</Text>
                    </View>
                    {ok ? (
                      <Pressable onPress={() => setExtras(extras.filter((x) => x.id !== o.id))}>
                        <Text className="text-emerald-400 text-xs font-bold">✓ added{e?.reason ? " (no code)" : ""} ✕</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => upd({ open: !e?.open })} className="bg-[#facc15] rounded-lg px-3 py-1.5">
                        <Text className="text-zinc-900 text-xs font-black">+ add</Text>
                      </Pressable>
                    )}
                  </View>
                  {e?.open && !ok && (
                    <View className="mt-2">
                      <TextInput
                        value={e.code}
                        onChangeText={(t) => upd({ code: digits(t).slice(0, 6) })}
                        placeholder="Its 6-digit Pickup Code"
                        placeholderTextColor="#71717a"
                        keyboardType="number-pad"
                        className="bg-zinc-900 text-white rounded-lg px-3 py-2 text-base tracking-widest"
                      />
                      {e.code.length === 6 && e.code !== o.pickupCode && <Text className="text-red-400 text-[11px] mt-1">That code is for another order.</Text>}
                      <Text className="text-zinc-400 text-[10px] mt-2 mb-1">Or hand over without its code:</Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {OVERRIDE_REASONS.map((r) => (
                          <Pressable key={r} onPress={() => upd({ reason: r })} className="rounded-full px-2.5 py-1 border border-zinc-600">
                            <Text className="text-[11px] text-zinc-300">{r}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  if (mode === "phone") {
    const res = search(orders, phone).customerOrders.filter((o) => !isDone(o));
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setMode("code")}>
          <Text className="text-zinc-400 text-xs mb-3">‹ Back to code</Text>
        </Pressable>
        <Text className="text-white text-base font-bold mb-2">Find by phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          autoFocus
          placeholder="024 555 0301"
          placeholderTextColor="#71717a"
          keyboardType="phone-pad"
          className="bg-zinc-800 text-white rounded-2xl px-4 py-4 text-2xl font-bold"
        />
        {digits(phone).length >= 4 && !res.length && <Text className="text-zinc-400 text-xs mt-3">No open orders for that number.</Text>}
        {res.length > 0 && <Text className="text-zinc-400 text-xs mt-4 mb-2">{res[0].customer} · pick the order</Text>}
        {res.map((o) => (
          <Pressable key={o.id} onPress={() => setPicked(o.id)} className="bg-zinc-800 rounded-2xl p-3 mb-2 flex-row items-center">
            <View className="flex-1">
              <Text className="text-white font-bold">
                {o.ref} · {o.kind}
              </Text>
              <Text className="text-zinc-400 text-[11px]">
                {unitsOf(o)} unit(s) · {fulfilmentLabel(o.fulfilment)}
              </Text>
            </View>
            <StatePill s={o.state} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 px-6" style={{ paddingBottom: 110 }}>
      <Text className="text-zinc-400 text-center text-sm mt-2">
        {target ? `Ask ${first(target.customer)} for the code for ${target.ref}` : "Ask for the Pickup Code"}
      </Text>
      <Animated.View style={{ transform: [{ translateX: shake }] }} className="flex-row justify-center gap-2 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} className={`w-12 h-16 rounded-xl items-center justify-center border-2 ${wrong ? "border-red-500 bg-red-950" : code.length === i ? "border-[#facc15] bg-zinc-800" : "border-zinc-700 bg-zinc-800"} ${i === 3 ? "ml-2" : ""}`}>
            <Text className="text-[#facc15] text-3xl font-black">{code[i] ?? ""}</Text>
          </View>
        ))}
      </Animated.View>
      <Text className="text-red-400 text-center text-sm font-bold mt-3" style={{ minHeight: 20 }}>
        {wrong ? "No order with that code" : ""}
      </Text>
      <View className="flex-1 justify-center">
        {[
          ["1", "2", "3"],
          ["4", "5", "6"],
          ["7", "8", "9"],
          ["C", "0", "⌫"],
        ].map((row) => (
          <View key={row.join()} className="flex-row gap-3 mb-3">
            {row.map((k) => (
              <Pressable key={k} onPress={() => press(k)} className={`flex-1 h-16 rounded-2xl items-center justify-center ${k === "C" || k === "⌫" ? "bg-zinc-800" : "bg-zinc-700"}`}>
                <Text className="text-white text-2xl font-bold">{k === "C" ? "clear" : k}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => {
          setMode("phone");
          if (target) (setPhone(target.phone), setPicked(target.id));
        }}
        className="items-center py-2"
      >
        <Text className="text-[#facc15] text-sm font-semibold">Customer has no code →</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Orders board

type Col = "Ready" | "To dispatch" | "Out" | "Needs quote" | "Awaiting pay" | "Uncollected" | "Refunds" | "Done";
const COLS: Col[] = ["Ready", "To dispatch", "Out", "Needs quote", "Awaiting pay", "Uncollected", "Refunds", "Done"];

function inCol(o: HOrder, c: Col) {
  switch (c) {
    case "Ready":
      return isReadyPickup(o);
    case "To dispatch":
      return o.state === "Ready for handover" && o.fulfilment.kind === "Delivery";
    case "Out":
      return o.state === "Dispatched";
    case "Needs quote":
      return o.state === "Needs Delivery Fee quote";
    case "Awaiting pay":
      return o.state === "Awaiting payment" || o.state === "Awaiting Delivery Fee";
    case "Uncollected":
      return isReadyPickup(o) && daysWaiting(o) >= UNCOLLECTED_AFTER;
    case "Done":
      return isDone(o);
    default:
      return false;
  }
}

function Board({ role, onCounter }: { role: Role; onCounter: () => void }) {
  const orders = useOrders();
  const refunds = useRefundQueue();
  const [col, setCol] = useState<Col>("Ready");
  const [open, setOpen] = useState<string | null>(null);
  const count = (c: Col) => (c === "Refunds" ? refunds.filter((r) => r.status === "To refund").length : orders.filter((o) => inCol(o, c)).length);
  const rows = orders.filter((o) => inCol(o, col)).sort((a, b) => daysWaiting(b) - daysWaiting(a));

  return (
    <View className="flex-1">
      <View className="bg-white border-b border-zinc-200">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
          {COLS.map((c) => {
            const n = count(c);
            const hot = (c === "Refunds" || c === "Uncollected" || c === "Needs quote") && n > 0;
            return (
              <Pressable key={c} onPress={() => setCol(c)} className={`rounded-full px-3 py-1.5 border ${col === c ? "bg-zinc-900 border-zinc-900" : hot ? "border-red-300 bg-red-50" : "border-zinc-300 bg-white"}`}>
                <Text className={`text-xs font-semibold ${col === c ? "text-white" : hot ? "text-red-700" : "text-zinc-700"}`}>
                  {c} {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
        {col === "Refunds" ? (
          refunds.length ? (
            refunds.map((q) => <RefundRow key={q.id} q={q} role={role} onOpenOrder={() => setOpen(q.orderId)} />)
          ) : (
            <Text className="text-xs text-zinc-500">No refunds.</Text>
          )
        ) : rows.length ? (
          rows.map((o) => (
            <Pressable key={o.id} onPress={() => setOpen(o.id)} className="bg-white border border-zinc-200 rounded-xl px-3 py-2.5 mb-1.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-[11px] font-mono text-zinc-500 w-16">{o.ref}</Text>
                <Text className="text-sm font-semibold text-zinc-900 flex-1" numberOfLines={1}>
                  {o.customer}
                </Text>
                <Text className="text-[11px] text-zinc-500">{unitsOf(o)}u</Text>
                {o.readyAt && !isDone(o) && <Text className="text-[11px] text-zinc-500 w-8 text-right">{daysWaiting(o)}d</Text>}
                <StatePill s={o.state} />
              </View>
              {col === "Uncollected" && (
                <View className="mt-1.5 flex-row items-center gap-2">
                  <UncollectedDots o={o} />
                  <Text className="text-[10px] text-zinc-500">waiting since {fmtDate(o.readyAt)}</Text>
                </View>
              )}
            </Pressable>
          ))
        ) : (
          <Text className="text-xs text-zinc-500">Nothing here.</Text>
        )}
      </ScrollView>
      {open && <OrderSheet id={open} role={role} onClose={() => setOpen(null)} onCounter={() => (setOpen(null), onCounter())} />}
    </View>
  );
}

type Sub = null | "dispatch" | "fail" | "quote" | "switch" | "cancel" | "refund";
const FAIL_REASONS = ["Customer not reachable", "Wrong address", "Customer refused", "Rider couldn't find it"] as const;

function OrderSheet({ id, role, onClose, onCounter }: { id: string; role: Role; onClose: () => void; onCounter: () => void }) {
  const o = useOrders().find((x) => x.id === id);
  const [sub, setSub] = useState<Sub>(null);
  const [rider, setRider] = useState("");
  const [why, setWhy] = useState<string>(FAIL_REASONS[0]);
  if (!o) return null;
  const back = () => setSub(null);
  const canSwitch = !isDone(o) && !isHandedOver(o) && o.state !== "Awaiting goods";
  const canCancel = o.kind === "Store Order" && !isDone(o) && !isHandedOver(o);

  const Big = ({ label, onPress, tone = "border" }: { label: string; onPress: () => void; tone?: "violet" | "red" | "border" | "sky" | "green" }) => (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl py-4 items-center mb-2 ${{ violet: "bg-[#6d28d9]", red: "bg-red-700", sky: "bg-sky-600", green: "bg-emerald-600", border: "border border-zinc-300 bg-white" }[tone]}`}
    >
      <Text className={`text-base font-bold ${tone === "border" ? "text-zinc-900" : "text-white"}`}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet open onClose={onClose} title={sub ? "" : `${o.ref} · ${o.kind}`}>
      {sub && (
        <Pressable onPress={back} className="mb-2">
          <Text className="text-xs text-[#6d28d9] font-semibold">‹ {o.ref}</Text>
        </Pressable>
      )}
      {sub === "quote" && <QuoteForm o={o} role={role} onDone={back} />}
      {sub === "switch" && <SwitchForm o={o} role={role} onDone={back} />}
      {sub === "cancel" && <CancelForm o={o} role={role} onDone={back} />}
      {sub === "refund" && <RefundForm o={o} role={role} onDone={back} />}
      {sub === "dispatch" && (
        <View>
          <Text className="text-sm text-zinc-700 mb-2">
            Dispatch to {o.fulfilment.kind === "Delivery" ? o.fulfilment.zone : ""}. {first(o.customer)} gets an SMS.
          </Text>
          <Field label="Rider (optional)" value={rider} onChange={setRider} placeholder="e.g. Musah (Bolt)" />
          <PrimaryBtn label="Dispatch" onPress={() => (dispatch(o, role, rider || undefined), back())} />
        </View>
      )}
      {sub === "fail" && (
        <View>
          <Text className="text-sm text-zinc-700 mb-2">The order goes back to Ready for handover (To dispatch). No new fee.</Text>
          <Chips options={FAIL_REASONS} value={why as (typeof FAIL_REASONS)[number]} onChange={setWhy} />
          <View className="mt-3">
            <PrimaryBtn tone="red" label="Record failed delivery" onPress={() => (failDelivery(o, role, why), back())} />
          </View>
        </View>
      )}

      {!sub && (
        <View>
          <View className="flex-row items-center justify-between mb-1">
            <View>
              <Text className="text-lg font-black text-zinc-900">{o.customer}</Text>
              <Text className="text-xs text-zinc-500">
                {o.phone} · placed {fmtDate(o.placedAt)}
                {o.windowLabel ? ` · ${o.windowLabel}` : ""}
              </Text>
            </View>
            <StatePill s={o.state} />
          </View>
          <View className="flex-row items-center gap-2 my-2">
            <Text className="text-[10px] uppercase font-bold text-zinc-400">Pickup Code</Text>
            <CodeDigits code={o.pickupCode} size="sm" />
          </View>
          <Lines o={o} />
          <View className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 mt-2 mb-2">
            <Text className="text-xs text-zinc-800">{fulfilmentLabel(o.fulfilment)}</Text>
            <DfStatus o={o} />
            {o.shippingInvoice && (
              <Text className="text-[11px] text-zinc-600 mt-1">
                {o.shippingInvoice.number} Shipping Fee {ghs(o.shippingInvoice.total)} · {o.shippingInvoice.status === "Paid" ? `paid ${fmtDate(o.shippingInvoice.paidAt)}` : o.shippingInvoice.status.toLowerCase()}
              </Text>
            )}
            {o.blocker && <Text className="text-[11px] text-amber-700 mt-1">⏳ {o.blocker}</Text>}
            {o.record.override && <Text className="text-[11px] text-amber-700 mt-1">Handed over without code: {o.record.override}</Text>}
            {o.record.failed.map((f, i) => (
              <Text key={i} className="text-[11px] text-red-700 mt-1">
                ✕ Failed {fmtDate(f.at)}: {f.reason}
              </Text>
            ))}
          </View>
          <Timeline o={o} />
          <View className="mt-4">
            {isReadyPickup(o) && <Big tone="green" label="Hand over at the Counter →" onPress={onCounter} />}
            {o.state === "Ready for handover" && o.fulfilment.kind === "Delivery" && <Big tone="sky" label="Dispatch" onPress={() => setSub("dispatch")} />}
            {o.state === "Dispatched" && (
              <>
                <Big tone="green" label="Mark delivered" onPress={() => deliver(o, role)} />
                <Big tone="red" label="Delivery failed" onPress={() => setSub("fail")} />
              </>
            )}
            {o.state === "Needs Delivery Fee quote" && <Big tone="violet" label="Quote Delivery Fee" onPress={() => setSub("quote")} />}
            {canSwitch && <Big label="Switch fulfilment" onPress={() => setSub("switch")} />}
            {canCancel && <Big label="Cancel units" onPress={() => setSub("cancel")} />}
            {isHandedOver(o) && <Big label={role === "owner" ? "Refund" : "🔒 Refund (Owner)"} onPress={() => role === "owner" && setSub("refund")} />}
          </View>
        </View>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- More: one Stock table + settings

type Page = null | "zones" | "staff" | "prices";

function More({ role }: { role: Role }) {
  const { products } = useBO();
  const [q, setQ] = useState("");
  const [page, setPage] = useState<Page>(null);
  const [row, setRow] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ open: boolean; variantId?: string }>({ open: false });
  const all = products.flatMap((p) => p.variants.filter((v) => !v.archived).map((v) => ({ p, v, label: `${p.name} · ${variantLabel(v)}` })));
  const needle = q.toLowerCase();
  const shown = all.filter((x) => !needle || x.label.toLowerCase().includes(needle) || x.v.sku.toLowerCase().includes(needle));
  const rowItem = all.find((x) => x.v.id === row);
  const entryItem = all.find((x) => x.v.id === entry.variantId);
  const owner = role === "owner";

  if (page)
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Pressable onPress={() => setPage(null)} className="mb-3">
          <Text className="text-xs text-[#6d28d9] font-semibold">‹ More</Text>
        </Pressable>
        <Text className="text-lg font-bold text-zinc-900 mb-2">{{ zones: "Delivery Zones", staff: "Staff", prices: "Needs prices" }[page]}</Text>
        {page === "zones" && <ZonesEditor role={role} />}
        {page === "staff" && <StaffManager />}
        {page === "prices" && <NeedsPrices role={role} />}
      </ScrollView>
    );

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2">Stock</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search SKU or product" className="bg-white border border-zinc-300 rounded-xl px-3 py-2.5 text-sm mb-2" />
        <View className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <View className="flex-row px-3 py-1.5 bg-zinc-50 border-b border-zinc-200">
            <Text className="text-[10px] uppercase font-bold text-zinc-500 w-24">SKU</Text>
            <Text className="text-[10px] uppercase font-bold text-zinc-500 flex-1">Product · Variant</Text>
            <Text className="text-[10px] uppercase font-bold text-zinc-500 w-10 text-right">Stock</Text>
          </View>
          {shown.map((x) => (
            <StockRow key={x.v.id} sku={x.v.sku} label={x.label} variantId={x.v.id} base={x.v.stock} onPress={() => setRow(x.v.id)} />
          ))}
        </View>

        <Text className="text-[11px] uppercase font-bold text-zinc-500 mt-5 mb-2">Settings</Text>
        {[
          { key: "zones" as const, label: "Delivery Zones", hint: owner ? "Edit zones and fees" : "Read only", show: true },
          { key: "staff" as const, label: "Staff", hint: "Invite, roles, deactivate", show: owner },
          { key: "prices" as const, label: "Needs prices", hint: "Variants waiting for an Owner price", show: owner },
        ]
          .filter((r) => r.show)
          .map((r) => (
            <Pressable key={r.key} onPress={() => setPage(r.key)} className="bg-white border border-zinc-200 rounded-xl px-3 py-3 mb-1.5 flex-row items-center">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-zinc-900">{r.label}</Text>
                <Text className="text-[11px] text-zinc-500">{r.hint}</Text>
              </View>
              <Text className="text-zinc-400">›</Text>
            </Pressable>
          ))}
      </ScrollView>

      <Pressable onPress={() => setEntry({ open: true })} style={{ position: "absolute", right: 16, bottom: 96 }} className="bg-zinc-900 rounded-full px-4 py-3">
        <Text className="text-white font-bold text-sm">＋ Stock entry</Text>
      </Pressable>

      <Sheet open={!!rowItem} onClose={() => setRow(null)} title={rowItem?.label ?? ""}>
        {rowItem && (
          <View>
            <StockEntry variantId={rowItem.v.id} role={role} />
            <Text className="text-[11px] uppercase font-bold text-zinc-500 mt-4 mb-1">Stock Movements</Text>
            <Ledger variantId={rowItem.v.id} base={rowItem.v.stock} />
          </View>
        )}
      </Sheet>

      <Sheet open={entry.open} onClose={() => setEntry({ open: false })} title={entryItem ? entryItem.label : "Which Variant?"}>
        {entryItem ? (
          <View>
            <Pressable onPress={() => setEntry({ open: true })} className="mb-2">
              <Text className="text-xs text-[#6d28d9] font-semibold">‹ Pick another Variant</Text>
            </Pressable>
            <StockEntry variantId={entryItem.v.id} role={role} onDone={() => setEntry({ open: false })} />
          </View>
        ) : (
          all.map((x) => (
            <Pressable key={x.v.id} onPress={() => setEntry({ open: true, variantId: x.v.id })} className="flex-row items-center gap-2 py-2.5 border-b border-zinc-100">
              <View className="w-6 h-6 rounded" style={{ backgroundColor: x.p.images[0]?.color ?? "#e4e4e7" }} />
              <Text className="text-sm text-zinc-900 flex-1">{x.label}</Text>
              <Text className="text-[11px] font-mono text-zinc-400">{x.v.sku}</Text>
            </Pressable>
          ))
        )}
      </Sheet>
    </View>
  );
}

function StockRow({ sku, label, variantId, base, onPress }: { sku: string; label: string; variantId: string; base: number; onPress: () => void }) {
  const { current } = useStock(variantId, base);
  return (
    <Pressable onPress={onPress} className="flex-row items-center px-3 py-2.5 border-b border-zinc-100">
      <Text className="text-[11px] font-mono text-zinc-500 w-24" numberOfLines={1}>
        {sku}
      </Text>
      <Text className="text-xs text-zinc-800 flex-1" numberOfLines={1}>
        {label}
      </Text>
      <Text className={`text-sm font-bold w-10 text-right ${current > 0 ? "text-zinc-900" : "text-zinc-300"}`}>{current}</Text>
    </Pressable>
  );
}
