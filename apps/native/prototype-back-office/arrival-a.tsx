// PROTOTYPE (wayfinder #16): arrival variant A, "Arrived stage card".
// Continues the winning Stage timeline: earlier stages shrink to a strip, and the Arrived stage becomes one
// long card with three numbered steps (Count → Fee → Issue) that turns into the follow-up list once issued.
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, STAGES, fmtDate, ghs, parseGhs, useBO, type OrderWindow, type Product, type Role } from "./bo-data";
import {
  FEE_WARN,
  allocate,
  feeOverEstimate,
  invoicePlan,
  issueInvoices,
  liveInvoice,
  markRefunded,
  recordArrival,
  remindersSent,
  useArrivals,
  windowFollowUp,
} from "./arrival-data";
import { AllocBar, AllocLegend, InvoiceActions, ReminderDots, StatePeek, StatusPill, Stepper, VIOLET, vName } from "./arrival-ui";

export default function ArrivalA({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const list = windows.filter((w) => !w.draft && STAGES.indexOf(w.stage) >= 2);
  const [id, setId] = useState("ow_sneak2");
  const w = list.find((x) => x.id === id) ?? list[0];
  const p = products.find((x) => x.id === w.productId)!;
  return (
    <View className="flex-1 bg-zinc-100">
      <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
        <View className="px-4 pb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-zinc-900">Order Windows</Text>
          <Text className="text-xs text-zinc-500">{ME[role]}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          {list.map((x) => {
            const pp = products.find((y) => y.id === x.productId);
            const on = x.id === w.id;
            return (
              <Pressable key={x.id} onPress={() => setId(x.id)} className={`rounded-full px-3 py-1.5 border ${on ? "bg-[#6d28d9] border-[#6d28d9]" : "bg-white border-zinc-300"}`}>
                <Text className={`text-xs font-semibold ${on ? "text-white" : "text-zinc-700"}`}>
                  {pp?.name.split(" ").slice(-1)[0]} · W{x.number} · {x.stage === "Arrived" ? "Arrived" : x.stage}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <WindowArrival key={w.id} w={w} p={p} role={role} />
      <StatePeek />
    </View>
  );
}

function WindowArrival({ w, p, role }: { w: OrderWindow; p: Product; role: Role }) {
  const s = useArrivals();
  const arrival = s.arrivals.find((a) => a.windowId === w.id);
  const locked = !!arrival;
  const issued = !!arrival?.invoicesIssuedAt;
  const step = !locked ? 1 : !issued ? 2 : 3;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-lg" style={{ backgroundColor: p.images[0]?.color ?? "#ccc" }} />
        <View className="flex-1">
          <Text className="text-base font-bold text-zinc-900">{p.name}</Text>
          <Text className="text-xs text-zinc-500">
            Window {w.number} · {s.preorders.filter((x) => x.windowId === w.id).length} Customers
          </Text>
        </View>
      </View>

      {/* earlier stages, shrunk */}
      <View className="flex-row flex-wrap gap-1.5 mt-3 mb-4">
        {STAGES.slice(0, 4).map((st) => {
          const ev = w.history.find((e) => e.stage === st);
          return (
            <View key={st} className="flex-row items-center bg-violet-50 rounded-full px-2 py-0.5">
              <Text className="text-[10px] text-[#6d28d9] font-bold">✓ {st}</Text>
              <Text className="text-[10px] text-zinc-500"> {fmtDate(ev?.at)}</Text>
            </View>
          );
        })}
      </View>

      <View className="bg-white rounded-2xl border-2 border-[#6d28d9] p-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-[16px] font-bold text-zinc-900">Arrived</Text>
          <Text className="text-[10px] font-bold text-[#6d28d9] bg-violet-100 px-2 py-0.5 rounded-full">{issued ? "FOLLOW UP" : "NOW"}</Text>
        </View>

        <StepHead n={1} title="Count what arrived" state={step === 1 ? "active" : "done"} sub={locked ? `Locked ${fmtDate(arrival!.at)} · ${arrival!.by}` : undefined} />
        {step === 1 ? <CountStep w={w} p={p} role={role} /> : <CountSummary w={w} p={p} />}

        <StepHead n={2} title="Confirm the Shipping Fee & issue invoices" state={step < 2 ? "todo" : step === 2 ? "active" : "done"} sub={issued ? `${ghs(arrival!.feePerUnit)}/unit · issued ${fmtDate(arrival!.invoicesIssuedAt)}` : undefined} />
        {step === 2 && <FeeStep w={w} p={p} role={role} />}

        <StepHead n={3} title="Follow up" state={step < 3 ? "todo" : "active"} />
        {step === 3 && <FollowUp w={w} p={p} role={role} />}
      </View>
    </ScrollView>
  );
}

function StepHead({ n, title, state, sub }: { n: number; title: string; state: "todo" | "active" | "done"; sub?: string }) {
  return (
    <View className={`flex-row items-center gap-2 mt-3 ${state === "todo" ? "opacity-40" : ""}`}>
      <View className={`w-6 h-6 rounded-full items-center justify-center ${state === "done" ? "bg-[#6d28d9]" : state === "active" ? "border-2 border-[#6d28d9]" : "border-2 border-zinc-300"}`}>
        <Text className={`text-[11px] font-bold ${state === "done" ? "text-white" : "text-[#6d28d9]"}`}>{state === "done" ? "✓" : n}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-zinc-900">{title}</Text>
        {sub && <Text className="text-[11px] text-zinc-500">{sub}</Text>}
      </View>
    </View>
  );
}

// ---------- 1. count ----------

function CountStep({ w, p, role }: { w: OrderWindow; p: Product; role: Role }) {
  const s = useArrivals();
  const [arrived, setArrived] = useState<Record<string, number>>(() =>
    Object.fromEntries(w.offers.map((o) => [o.variantId, o.ordered + (o.storeQuantity ?? 0)])),
  );
  const [confirm, setConfirm] = useState(false);
  const a = useMemo(() => allocate(w, s.preorders, arrived), [w, s.preorders, arrived]);
  const short = a.preorders.filter((x) => x.short);
  const tot = (k: "toStore" | "surplus" | "shortfall" | "arrived") => a.variants.reduce((n, v) => n + v[k], 0);

  return (
    <View className="ml-8 mt-2">
      <Text className="text-[11px] text-zinc-500 mb-2">Enter units per Variant once. Pre-filled with the supplier order; it locks when you record it.</Text>
      {a.variants.map((va) => (
        <View key={va.variantId} className="py-2 border-b border-zinc-100">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-semibold text-zinc-900">{vName(p, va.variantId)}</Text>
              <Text className="text-[11px] text-zinc-500">
                expected {va.expected} = {va.ordered} pre-ordered + {va.storeQuantity} store
              </Text>
            </View>
            <Stepper value={arrived[va.variantId] ?? 0} onChange={(n) => setArrived({ ...arrived, [va.variantId]: n })} />
          </View>
          <View className="mt-1.5">
            <AllocBar a={va} />
          </View>
          <Text className="text-[10px] text-zinc-500 mt-0.5">
            {va.toPreorders} to Pre-orders · {va.toStore}/{va.storeQuantity} Store Qty · {va.surplus} Surplus
            {va.shortfall ? <Text className="text-red-700 font-bold"> · {va.shortfall} short</Text> : null}
          </Text>
        </View>
      ))}
      <View className="mt-2">
        <AllocLegend />
      </View>

      {short.length > 0 ? (
        <View className="bg-red-50 border border-red-200 rounded-lg p-2.5 mt-3">
          <Text className="text-xs font-bold text-red-900">
            Shortfall: {tot("shortfall")} unit(s), {short.length} Customer(s) refunded for missing units
          </Text>
          <Text className="text-[11px] text-red-900 mb-1">Earliest Pre-orders were filled first. The Owner triggers each refund.</Text>
          {short.map((x) => (
            <Text key={x.preorder.id} className="text-[11px] text-red-900">
              • {x.preorder.customer} ({fmtDate(x.preorder.placedAt)}): gets {x.allocated} of {x.ordered} · refund {ghs(x.refund)}
              {x.allocated === 0 ? " · no invoice" : ""}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-xs text-emerald-700 mt-3">✓ Every Pre-order is filled.</Text>
      )}
      <Text className="text-[11px] text-zinc-600 mt-2">
        Into Stock: {tot("toStore")} Store Qty + {tot("surplus")} Surplus.
      </Text>

      <Pressable onPress={() => setConfirm(true)} className="mt-3 bg-[#6d28d9] rounded-xl py-3 items-center">
        <Text className="text-white font-bold">Record arrival · {tot("arrived")} units</Text>
      </Pressable>

      <Modal transparent visible={confirm} animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white rounded-2xl p-4 w-full">
            <Text className="text-base font-bold text-zinc-900">Record the arrival?</Text>
            <Text className="text-sm text-zinc-600 mt-2">
              The counts lock. {tot("toStore") + tot("surplus")} units go into Stock{short.length ? `, ${short.length} refunds are flagged for the Owner` : ""}, and Window{" "}
              {w.number} is marked Arrived.
            </Text>
            <View className="bg-zinc-100 rounded-xl p-2.5 mt-3">
              <Text className="text-[10px] text-zinc-500">SMS to {a.preorders.length} Customers</Text>
              <Text className="text-[12px] text-zinc-900">
                Emblish: {p.name} (Window {w.number}) has arrived in Accra. Your Shipping Fee Invoice follows. Track: emblish.com/orders
              </Text>
            </View>
            <View className="flex-row gap-2 mt-4">
              <Pressable onPress={() => setConfirm(false)} className="flex-1 border border-zinc-300 rounded-lg py-2.5 items-center">
                <Text className="font-semibold text-zinc-700">Recount</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  recordArrival(w, arrived, role);
                  setConfirm(false);
                }}
                className="flex-1 bg-[#6d28d9] rounded-lg py-2.5 items-center"
              >
                <Text className="font-bold text-white">Record & text {a.preorders.length}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CountSummary({ w, p }: { w: OrderWindow; p: Product }) {
  const s = useArrivals();
  const arrival = s.arrivals.find((a) => a.windowId === w.id)!;
  const a = allocate(w, s.preorders, arrival.arrived);
  return (
    <View className="ml-8 mt-1">
      {a.variants.map((va) => (
        <View key={va.variantId} className="flex-row items-center gap-2 py-0.5">
          <Text className="text-[11px] text-zinc-700 w-24" numberOfLines={1}>
            🔒 {vName(p, va.variantId)}
          </Text>
          <View className="flex-1">
            <AllocBar a={va} height={6} />
          </View>
          <Text className="text-[10px] text-zinc-500 w-20 text-right">
            {va.arrived}/{va.expected}
            {va.shortfall ? ` · ${va.shortfall} short` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------- 2. fee + issue ----------

function FeeStep({ w, p, role }: { w: OrderWindow; p: Product; role: Role }) {
  const s = useArrivals();
  const [fee, setFee] = useState(w.shippingFeeEstimate ? String(w.shippingFeeEstimate / 100) : "");
  const [showAll, setShowAll] = useState(false);
  const [ack, setAck] = useState(false);
  const perUnit = parseGhs(fee);
  const over = feeOverEstimate(w, perUnit);
  const warn = over > FEE_WARN;
  const plan = perUnit != null ? invoicePlan(w, s.preorders, perUnit) : undefined;
  const blocked = perUnit == null || (warn && !ack);

  return (
    <View className="ml-8 mt-2">
      <Text className="text-xs font-semibold text-zinc-700 mb-1">Actual Shipping Fee per unit</Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={fee}
          onChangeText={(t) => {
            setFee(t);
            setAck(false);
          }}
          keyboardType="decimal-pad"
          placeholder="GH₵"
          className={`border rounded-lg px-3 py-2 text-base font-bold w-28 ${warn ? "border-[#d97706]" : "border-zinc-300"}`}
        />
        <Text className="text-[11px] text-zinc-500 flex-1">
          Estimate {ghs(w.shippingFeeEstimate)}
          {perUnit != null && w.shippingFeeEstimate ? ` · ${over >= 0 ? "+" : ""}${Math.round(over * 100)}%` : ""}
        </Text>
      </View>
      {warn && (
        <Pressable onPress={() => setAck(!ack)} className="bg-amber-50 border border-[#d97706] rounded-lg p-2.5 mt-2 flex-row gap-2">
          <View className={`w-4 h-4 rounded border-2 mt-0.5 ${ack ? "bg-[#d97706] border-[#d97706]" : "border-[#d97706]"}`} />
          <Text className="text-[11px] text-[#92400e] flex-1">
            More than 20% above the estimate Customers saw. They can't cancel over it, but expect questions. Tick to confirm {ghs(perUnit)}/unit is right.
          </Text>
        </Pressable>
      )}

      {plan && (
        <View className="bg-zinc-50 rounded-lg p-2.5 mt-3">
          <Text className="text-sm font-bold text-zinc-900">
            {plan.count} invoices · {plan.units} units · {ghs(plan.total)}
          </Text>
          <Text className="text-[11px] text-zinc-500">One per Pre-order, due in 14 days. Delivery Fees are added when the zone fee is known.</Text>
          {(showAll ? plan.rows : plan.rows.slice(0, 4)).map((r) => (
            <View key={r.p.id} className="flex-row justify-between py-1 border-t border-zinc-200 mt-1">
              <View className="flex-1">
                <Text className={`text-xs ${r.skip ? "text-zinc-400" : "text-zinc-800"}`}>{r.p.customer}</Text>
                <Text className="text-[10px] text-zinc-500">
                  {r.skip ?? `${r.units} × ${ghs(perUnit)}${r.deliveryFee ? ` + ${ghs(r.deliveryFee)} delivery` : ""}`}
                  {r.deliveryLater && !r.skip ? " · Delivery Fee Invoice later (quote)" : ""}
                </Text>
              </View>
              <Text className={`text-xs font-bold ${r.skip ? "text-zinc-400" : "text-zinc-900"}`}>{r.skip ? "—" : ghs(r.total)}</Text>
            </View>
          ))}
          {plan.rows.length > 4 && (
            <Pressable onPress={() => setShowAll(!showAll)}>
              <Text className="text-xs font-semibold text-[#6d28d9] mt-1">{showAll ? "Show less" : `Show all ${plan.rows.length}`}</Text>
            </Pressable>
          )}
        </View>
      )}

      <Pressable
        disabled={blocked}
        onPress={() => perUnit != null && issueInvoices(w, perUnit, role)}
        className={`mt-3 rounded-xl py-3 items-center ${blocked ? "bg-zinc-300" : "bg-[#6d28d9]"}`}
      >
        <Text className="text-white font-bold">{plan ? `Issue ${plan.count} invoices & text Customers` : "Enter the fee"}</Text>
      </Pressable>
      <Text className="text-[10px] text-zinc-500 mt-1 text-center">Any Staff member can confirm the fee. Mistakes are fixed per invoice with Void & reissue.</Text>
    </View>
  );
}

// ---------- 3. follow up ----------

function FollowUp({ w, p, role }: { w: OrderWindow; p: Product; role: Role }) {
  const s = useArrivals();
  const f = windowFollowUp(w, s);
  const [open, setOpen] = useState<string | null>(null);
  const pos = s.preorders.filter((x) => x.windowId === w.id);
  const rank = (id: string) => {
    const inv = liveInvoice(s.invoices, id);
    const po = pos.find((x) => x.id === id)!;
    if (po.forfeitedAt) return 5;
    if (!inv) return 4;
    if (inv.status === "Paid") return 3;
    return f.eligible.includes(inv) ? 0 : f.overdue.includes(inv) ? 1 : 2;
  };
  const sorted = [...pos].sort((a, b) => rank(a.id) - rank(b.id));
  const pct = f.live.length ? f.paid.length / f.live.length : 0;

  return (
    <View className="ml-8 mt-2">
      <View className="flex-row justify-between items-end">
        <Text className="text-2xl font-bold text-zinc-900">
          {f.paid.length}
          <Text className="text-sm text-zinc-500">/{f.live.length} paid</Text>
        </Text>
        <Text className="text-[11px] text-zinc-500 text-right">
          {ghs(f.collected)} in{"\n"}
          {ghs(f.outstanding)} outstanding
        </Text>
      </View>
      <View className="h-2 bg-zinc-200 rounded-full mt-1 overflow-hidden">
        <View className="h-full bg-emerald-600" style={{ width: `${pct * 100}%` }} />
      </View>
      {f.eligible.length > 0 && (
        <Text className="text-[11px] text-red-700 font-bold mt-2">
          {f.eligible.length} eligible for Forfeit (day 30+). {role === "owner" ? "Review below." : "Only the Owner can Forfeit."}
        </Text>
      )}

      {f.refunds.length > 0 && (
        <View className="mt-3 bg-red-50 rounded-lg p-2.5 border border-red-200">
          <Text className="text-xs font-bold text-red-900">Shortfall refunds</Text>
          {f.refunds.map((r) => {
            const po = s.preorders.find((x) => x.id === r.preorderId)!;
            return (
              <View key={r.id} className="flex-row items-center justify-between mt-1.5">
                <Text className="text-[11px] text-red-900 flex-1">
                  {po.customer} · {r.units} unit(s) · {ghs(r.amount)}
                </Text>
                {r.status === "Refunded" ? (
                  <Text className="text-[10px] font-bold text-emerald-700">Refunded {fmtDate(r.refundedAt)}</Text>
                ) : role === "owner" ? (
                  <Pressable onPress={() => markRefunded(r.id, role)} className="bg-red-700 rounded-md px-2 py-1">
                    <Text className="text-[10px] font-bold text-white">Refund</Text>
                  </Pressable>
                ) : (
                  <Text className="text-[10px] text-red-400">🔒 Owner refunds</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View className="mt-3">
        {sorted.map((po) => {
          const inv = liveInvoice(s.invoices, po.id);
          const isOpen = open === po.id;
          return (
            <Pressable key={po.id} onPress={() => setOpen(isOpen ? null : po.id)} className="py-2 border-t border-zinc-100">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm text-zinc-900">{po.customer}</Text>
                  <Text className="text-[10px] text-zinc-500">
                    {po.ref}
                    {inv ? ` · ${inv.number} · ${ghs(inv.total)}` : ""}
                  </Text>
                </View>
                <StatusPill inv={inv} p={po} />
              </View>
              {isOpen && inv && (
                <View className="mt-2">
                  <Text className="text-[11px] text-zinc-600">
                    {inv.units} × {ghs(inv.perUnit)}
                    {inv.deliveryFee ? ` + ${ghs(inv.deliveryFee)} delivery (${po.fulfilment.kind === "Delivery" ? po.fulfilment.zone : ""})` : ""} · issued {fmtDate(inv.issuedAt)} · due{" "}
                    {fmtDate(inv.dueAt)} · {po.phone}
                  </Text>
                  <View className="mt-1.5 flex-row items-center gap-2">
                    <ReminderDots inv={inv} />
                    <Text className="text-[10px] text-zinc-500">{remindersSent(inv).length} reminders sent</Text>
                  </View>
                  <InvoiceActions inv={inv} p={po} role={role} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
