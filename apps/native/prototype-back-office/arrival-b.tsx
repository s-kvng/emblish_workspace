// PROTOTYPE (wayfinder #16): arrival variant B, "Wizard + Invoices inbox".
// Two tabs. Arrivals: a to-do list of windows, each opening a full-screen 4-step wizard
// (Count one Variant at a time → Check who gets what → Fee → Issue). Invoices: one cross-window inbox
// with filters (Needs action, Unpaid, Forfeit, Paid, Refunds) and an invoice detail sheet.
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, STAGES, TODAY, addDays, fmtDate, ghs, parseGhs, useBO, type OrderWindow, type Product, type Role } from "./bo-data";
import {
  FEE_WARN,
  allocate,
  feeOverEstimate,
  forfeitEligible,
  invoiceDay,
  invoicePlan,
  invoiceSms,
  isOverdue,
  issueInvoices,
  markRefunded,
  recordArrival,
  useArrivals,
  windowFollowUp,
  type Invoice,
} from "./arrival-data";
import { AllocBar, AllocLegend, InvoiceActions, ReminderDots, StatePeek, StatusPill, vName } from "./arrival-ui";

type Tab = "arrivals" | "invoices";

export default function ArrivalB({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>("arrivals");
  const [wizard, setWizard] = useState<string | null>(null);
  const s = useArrivals();
  const needs = s.invoices.filter((i) => isOverdue(i)).length + s.refunds.filter((r) => r.status === "To refund").length;

  return (
    <View className="flex-1 bg-zinc-100">
      <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
        <View className="px-4 pb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-zinc-900">{tab === "arrivals" ? "Arrivals" : "Invoices"}</Text>
          <Text className="text-xs text-zinc-500">{ME[role]}</Text>
        </View>
      </View>
      {tab === "arrivals" ? <ArrivalsList onOpen={setWizard} /> : <Inbox role={role} />}

      {/* bottom tabs */}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 flex-row" style={{ paddingBottom: 18 }}>
        {(["arrivals", "invoices"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} className="flex-1 items-center pt-2.5">
            <Text className={`text-lg ${tab === t ? "" : "opacity-40"}`}>{t === "arrivals" ? "📦" : "🧾"}</Text>
            <Text className={`text-[11px] font-semibold ${tab === t ? "text-[#6d28d9]" : "text-zinc-500"}`}>
              {t === "arrivals" ? "Arrivals" : "Invoices"}
              {t === "invoices" && needs ? ` (${needs})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {wizard && <Wizard windowId={wizard} role={role} onClose={() => setWizard(null)} />}
      <StatePeek />
    </View>
  );
}

// ---------------------------------------------------------------- arrivals list

export function ArrivalsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { products, windows } = useBO();
  const s = useArrivals();
  const list = windows.filter((w) => !w.draft && STAGES.indexOf(w.stage) >= 2);
  const card = (w: OrderWindow) => {
    const p = products.find((x) => x.id === w.productId)!;
    const arr = s.arrivals.find((a) => a.windowId === w.id);
    const f = windowFollowUp(w, s);
    const todo = !arr ? "Record arrival" : !arr.invoicesIssuedAt ? "Confirm fee & issue invoices" : undefined;
    return (
      <View key={w.id} className="bg-white rounded-2xl border border-zinc-200 p-3 mb-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-lg" style={{ backgroundColor: p.images[0]?.color }} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-zinc-900">
              {p.name} · W{w.number}
            </Text>
            <Text className="text-[11px] text-zinc-500">
              {w.stage}
              {!arr && w.expectedFrom ? ` · expected ${fmtDate(w.expectedFrom)}–${fmtDate(w.expectedTo)}` : ""}
              {arr ? ` · arrived ${fmtDate(arr.at)}` : ""}
            </Text>
          </View>
        </View>
        {todo ? (
          <Pressable onPress={() => onOpen(w.id)} className="mt-3 bg-[#6d28d9] rounded-xl py-3 items-center">
            <Text className="text-white font-bold">{todo}</Text>
          </Pressable>
        ) : (
          <View className="mt-2">
            <View className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <View className="h-full bg-emerald-600" style={{ width: `${(f.paid.length / Math.max(1, f.live.length)) * 100}%` }} />
            </View>
            <Text className="text-[11px] text-zinc-600 mt-1">
              {f.paid.length}/{f.live.length} paid · {ghs(f.outstanding)} outstanding
              {f.eligible.length ? ` · ${f.eligible.length} can be Forfeited` : ""}
            </Text>
          </View>
        )}
      </View>
    );
  };
  const todo = list.filter((w) => !s.arrivals.find((a) => a.windowId === w.id)?.invoicesIssuedAt);
  const done = list.filter((w) => s.arrivals.find((a) => a.windowId === w.id)?.invoicesIssuedAt);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2">To do</Text>
      {todo.length ? todo.map(card) : <Text className="text-xs text-zinc-500 mb-3">Nothing waiting.</Text>}
      <Text className="text-[11px] uppercase font-bold text-zinc-500 mb-2 mt-2">Invoiced</Text>
      {done.map(card)}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- wizard

const STEPS = ["Count", "Check", "Fee", "Issue"];

export function Wizard({ windowId, role, onClose }: { windowId: string; role: Role; onClose: () => void }) {
  const { products, windows } = useBO();
  const s = useArrivals();
  const w = windows.find((x) => x.id === windowId)!;
  const p = products.find((x) => x.id === w.productId)!;
  const arrival = s.arrivals.find((a) => a.windowId === w.id);
  const [step, setStep] = useState(arrival ? 2 : 0);
  const [vi, setVi] = useState(0); // which Variant we're counting
  const [arrived, setArrived] = useState<Record<string, number>>({});
  const [fee, setFee] = useState(w.shippingFeeEstimate ? String(w.shippingFeeEstimate / 100) : "");
  const [ack, setAck] = useState(false);
  const counts = arrival?.arrived ?? arrived;
  const a = useMemo(() => allocate(w, s.preorders, counts), [w, s.preorders, counts]);
  const perUnit = parseGhs(fee);
  const over = feeOverEstimate(w, perUnit);
  const warn = over > FEE_WARN;
  const plan = perUnit != null ? invoicePlan(w, s.preorders, perUnit) : undefined;
  const offer = w.offers[vi];
  const counted = w.offers.every((o) => arrived[o.variantId] != null);

  const footer = () => {
    if (step === 0)
      return (
        <Btn
          label={vi < w.offers.length - 1 ? `Next Variant (${vi + 2}/${w.offers.length})` : "Check allocation"}
          disabled={arrived[offer.variantId] == null}
          onPress={() => (vi < w.offers.length - 1 ? setVi(vi + 1) : setStep(1))}
        />
      );
    if (step === 1)
      return (
        <Btn
          label={`Lock arrival & text ${a.preorders.length} Customers`}
          disabled={!counted}
          onPress={() => {
            recordArrival(w, arrived, role);
            setStep(2);
          }}
        />
      );
    if (step === 2) return <Btn label="Preview invoices" disabled={perUnit == null || (warn && !ack)} onPress={() => setStep(3)} />;
    return (
      <Btn
        label={`Issue ${plan?.count ?? 0} invoices`}
        onPress={() => {
          if (perUnit != null) issueInvoices(w, perUnit, role);
          onClose();
        }}
      />
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white" style={{ paddingTop: 44 }}>
        <View className="flex-row items-center px-4 pb-2">
          <Pressable onPress={onClose} className="pr-3">
            <Text className="text-xl text-zinc-500">✕</Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-sm font-bold text-zinc-900">
              {p.name} · W{w.number}
            </Text>
            <Text className="text-[11px] text-zinc-500">{arrival ? `Arrival locked ${fmtDate(arrival.at)}` : "Recording arrival"}</Text>
          </View>
        </View>
        <View className="flex-row px-4 gap-1 mb-2">
          {STEPS.map((st, i) => (
            <View key={st} className="flex-1">
              <View className={`h-1 rounded-full ${i <= step ? "bg-[#6d28d9]" : "bg-zinc-200"}`} />
              <Text className={`text-[10px] mt-1 ${i === step ? "font-bold text-zinc-900" : "text-zinc-400"}`}>
                {i < 2 && arrival ? "🔒 " : ""}
                {st}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {step === 0 && (
            <View className="items-center pt-6">
              <View className="w-20 h-20 rounded-2xl mb-3" style={{ backgroundColor: p.images[0]?.color }} />
              <Text className="text-xs text-zinc-500">
                Variant {vi + 1} of {w.offers.length}
              </Text>
              <Text className="text-2xl font-bold text-zinc-900">{vName(p, offer.variantId)}</Text>
              <Text className="text-sm text-zinc-500 mt-1">How many arrived?</Text>
              <TextInput
                value={arrived[offer.variantId] != null ? String(arrived[offer.variantId]) : ""}
                onChangeText={(t) => setArrived({ ...arrived, [offer.variantId]: Number.parseInt(t.replace(/[^0-9]/g, "") || "0", 10) })}
                keyboardType="number-pad"
                placeholder="0"
                className="text-5xl font-bold text-center text-zinc-900 border-b-2 border-[#6d28d9] w-32 mt-4 pb-1"
              />
              <Text className="text-xs text-zinc-500 mt-3">
                Supplier order: {offer.ordered} pre-ordered + {offer.storeQuantity ?? 0} Store Quantity = {offer.ordered + (offer.storeQuantity ?? 0)}
              </Text>
              <Pressable
                onPress={() => setArrived({ ...arrived, [offer.variantId]: offer.ordered + (offer.storeQuantity ?? 0) })}
                className="mt-3 border border-[#6d28d9] rounded-full px-4 py-1.5"
              >
                <Text className="text-xs font-bold text-[#6d28d9]">All {offer.ordered + (offer.storeQuantity ?? 0)} arrived</Text>
              </Pressable>
              <View className="flex-row gap-1.5 mt-6">
                {w.offers.map((o, i) => (
                  <Pressable key={o.variantId} onPress={() => setVi(i)} className={`px-2 py-1 rounded-md ${i === vi ? "bg-zinc-900" : arrived[o.variantId] != null ? "bg-violet-100" : "bg-zinc-100"}`}>
                    <Text className={`text-[10px] font-bold ${i === vi ? "text-white" : "text-zinc-600"}`}>
                      {vName(p, o.variantId)} {arrived[o.variantId] != null ? `· ${arrived[o.variantId]}` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {step === 1 && (
            <>
              <Text className="text-lg font-bold text-zinc-900">Who gets what</Text>
              <Text className="text-xs text-zinc-500 mb-3">Earliest Pre-orders first, then Store Quantity, the rest is Surplus into Stock.</Text>
              {a.variants.map((va) => (
                <View key={va.variantId} className="mb-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs font-semibold text-zinc-800">{vName(p, va.variantId)}</Text>
                    <Text className="text-[11px] text-zinc-500">
                      {va.arrived} arrived · {va.toStore} store · {va.surplus} surplus{va.shortfall ? ` · ${va.shortfall} short` : ""}
                    </Text>
                  </View>
                  <AllocBar a={va} height={8} />
                </View>
              ))}
              <AllocLegend />
              <View className="mt-4 border border-zinc-200 rounded-xl overflow-hidden">
                {a.preorders.map((x, i) => (
                  <View key={x.preorder.id} className={`flex-row items-center px-3 py-2 ${i ? "border-t border-zinc-100" : ""} ${x.short ? "bg-red-50" : ""}`}>
                    <Text className="text-[10px] text-zinc-400 w-5">{i + 1}</Text>
                    <View className="flex-1">
                      <Text className="text-sm text-zinc-900">{x.preorder.customer}</Text>
                      <Text className="text-[10px] text-zinc-500">
                        placed {fmtDate(x.preorder.placedAt)} ·{" "}
                        {x.preorder.lines.map((l) => `${vName(p, l.variantId)} ${x.byVariant[l.variantId] ?? 0}/${l.qty}`).join(", ")}
                      </Text>
                    </View>
                    {x.short ? (
                      <Text className="text-[10px] font-bold text-red-700 text-right">
                        {x.allocated}/{x.ordered}
                        {"\n"}refund {ghs(x.refund)}
                      </Text>
                    ) : (
                      <Text className="text-[11px] font-bold text-emerald-700">✓ {x.allocated}</Text>
                    )}
                  </View>
                ))}
              </View>
              <Text className="text-[11px] text-zinc-500 mt-3">
                Locking can't be undone. Units that turn up later are added as Surplus from the Stock screen.
              </Text>
            </>
          )}

          {step === 2 && (
            <View className="items-center pt-4">
              <Text className="text-sm text-zinc-500">Actual Shipping Fee per unit</Text>
              <View className="flex-row items-center mt-2">
                <Text className="text-3xl font-bold text-zinc-400 mr-1">GH₵</Text>
                <TextInput
                  value={fee}
                  onChangeText={(t) => {
                    setFee(t);
                    setAck(false);
                  }}
                  keyboardType="decimal-pad"
                  className={`text-5xl font-bold text-zinc-900 border-b-2 w-36 text-center ${warn ? "border-[#d97706]" : "border-[#6d28d9]"}`}
                />
              </View>
              <Text className="text-xs text-zinc-500 mt-2">
                Customers saw {ghs(w.shippingFeeEstimate)} as the estimate
                {perUnit != null && w.shippingFeeEstimate ? ` (${over >= 0 ? "+" : ""}${Math.round(over * 100)}%)` : ""}
              </Text>
              {warn && (
                <Pressable onPress={() => setAck(!ack)} className="bg-amber-50 border border-[#d97706] rounded-xl p-3 mt-4 w-full">
                  <Text className="text-xs font-bold text-[#92400e]">⚠ {Math.round(over * 100)}% above the estimate</Text>
                  <Text className="text-[11px] text-[#92400e] mt-1">Customers can't cancel over it. {ack ? "☑" : "☐"} I've checked the supplier's bill.</Text>
                </Pressable>
              )}
              {plan && (
                <View className="flex-row gap-2 mt-6 w-full">
                  <Big label="Invoices" value={String(plan.count)} />
                  <Big label="Units" value={String(plan.units)} />
                  <Big label="To collect" value={ghs(plan.total)} />
                </View>
              )}
            </View>
          )}

          {step === 3 && plan && perUnit != null && (
            <>
              <Text className="text-lg font-bold text-zinc-900">Ready to issue</Text>
              <Text className="text-xs text-zinc-500 mb-3">Each Customer gets an SMS with their own /pay link. Due {fmtDate(addDays(TODAY, 14))}.</Text>
              <View className="bg-zinc-100 rounded-2xl p-3 mb-3">
                <Text className="text-[10px] text-zinc-500 mb-1">Example SMS · {plan.rows.find((r) => !r.skip)?.p.customer}</Text>
                <Text className="text-[12px] text-zinc-900">
                  {(() => {
                    const r = plan.rows.find((x) => !x.skip)!;
                    return invoiceSms({ units: r.units, perUnit, deliveryFee: r.deliveryFee, total: r.total, dueAt: addDays(TODAY, 14), number: "INV-…" } as Invoice, p, w);
                  })()}
                </Text>
              </View>
              {plan.rows.map((r) => (
                <View key={r.p.id} className="flex-row justify-between py-1.5 border-b border-zinc-100">
                  <View className="flex-1">
                    <Text className={`text-sm ${r.skip ? "text-zinc-400" : "text-zinc-900"}`}>{r.p.customer}</Text>
                    <Text className="text-[10px] text-zinc-500">
                      {r.skip ?? `${r.units} × ${ghs(perUnit)}${r.deliveryFee ? ` + ${ghs(r.deliveryFee)} delivery` : ""}${r.deliveryLater ? " · Delivery Fee quoted later" : ""}`}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-zinc-900">{r.skip ? "—" : ghs(r.total)}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 p-3 flex-row gap-2" style={{ paddingBottom: 24 }}>
          {step > 0 && !(arrival && step === 2) && (
            <Pressable onPress={() => (step === 0 ? null : setStep(step - 1))} className="border border-zinc-300 rounded-xl px-4 py-3">
              <Text className="font-semibold text-zinc-700">Back</Text>
            </Pressable>
          )}
          {footer()}
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} className={`flex-1 rounded-xl py-3 items-center ${disabled ? "bg-zinc-300" : "bg-[#6d28d9]"}`}>
      <Text className="font-bold text-white">{label}</Text>
    </Pressable>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-zinc-50 rounded-xl p-2.5 items-center">
      <Text className="text-[10px] uppercase text-zinc-500">{label}</Text>
      <Text className="text-base font-bold text-zinc-900">{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- inbox

type Filter = "action" | "unpaid" | "forfeit" | "paid" | "refunds" | "void";

export function Inbox({ role }: { role: Role }) {
  const s = useArrivals();
  const { products, windows } = useBO();
  const [filter, setFilter] = useState<Filter>("action");
  const [open, setOpen] = useState<Invoice | null>(null);
  const live = s.invoices.filter((i) => i.status !== "Void");
  const lists: Record<Exclude<Filter, "refunds">, Invoice[]> = {
    action: live.filter((i) => isOverdue(i)),
    unpaid: live.filter((i) => i.status === "Unpaid"),
    forfeit: live.filter(forfeitEligible),
    paid: live.filter((i) => i.status === "Paid"),
    void: s.invoices.filter((i) => i.status === "Void"),
  };
  const toRefund = s.refunds.filter((r) => r.status === "To refund");
  const chips: [Filter, string, number][] = [
    ["action", "Overdue", lists.action.length],
    ["forfeit", "Eligible for Forfeit", lists.forfeit.length],
    ["unpaid", "Unpaid", lists.unpaid.length],
    ["refunds", "Refunds", toRefund.length],
    ["paid", "Paid", lists.paid.length],
    ["void", "Void", lists.void.length],
  ];
  const winName = (id: string) => {
    const w = windows.find((x) => x.id === id)!;
    return `${products.find((p) => p.id === w.productId)!.name.split(" ").slice(-1)[0]} W${w.number}`;
  };

  return (
    <>
      <View className="bg-white border-b border-zinc-200">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10, gap: 6 }}>
          {chips.map(([k, l, n]) => (
            <Pressable key={k} onPress={() => setFilter(k)} className={`rounded-full px-3 py-1.5 border ${filter === k ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"}`}>
              <Text className={`text-xs font-semibold ${filter === k ? "text-white" : k === "forfeit" && n ? "text-red-700" : "text-zinc-700"}`}>
                {l} {n}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
        {filter === "forfeit" && (
          <Text className="text-[11px] text-zinc-500 mb-2">Unpaid 30+ days after first issue. No SMS goes to the Customer. {role === "owner" ? "" : "Only the Owner can Forfeit."}</Text>
        )}
        {filter === "refunds"
          ? toRefund.map((r) => {
              const po = s.preorders.find((x) => x.id === r.preorderId)!;
              return (
                <View key={r.id} className="bg-white rounded-xl border border-zinc-200 p-3 mb-2 flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-zinc-900">{po.customer}</Text>
                    <Text className="text-[11px] text-zinc-500">
                      Shortfall · {winName(r.windowId)} · {r.units} unit(s) · {ghs(r.amount)}
                    </Text>
                  </View>
                  {role === "owner" ? (
                    <Pressable onPress={() => markRefunded(r.id, role)} className="bg-red-700 rounded-lg px-3 py-2">
                      <Text className="text-xs font-bold text-white">Refund</Text>
                    </Pressable>
                  ) : (
                    <Text className="text-[10px] text-zinc-400">🔒 Owner</Text>
                  )}
                </View>
              );
            })
          : lists[filter].map((inv) => {
              const po = s.preorders.find((x) => x.id === inv.preorderId)!;
              return (
                <Pressable key={inv.id} onPress={() => setOpen(inv)} className="bg-white rounded-xl border border-zinc-200 p-3 mb-2">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-zinc-900">{po.customer}</Text>
                    <Text className="text-sm font-bold text-zinc-900">{ghs(inv.total)}</Text>
                  </View>
                  <View className="flex-row justify-between items-center mt-1">
                    <Text className="text-[11px] text-zinc-500">
                      {inv.number} · {winName(inv.windowId)}
                    </Text>
                    <StatusPill inv={inv} p={po} />
                  </View>
                </Pressable>
              );
            })}
        {filter !== "refunds" && !lists[filter].length && <Text className="text-xs text-zinc-500 text-center mt-8">Nothing here.</Text>}
      </ScrollView>
      {open && <InvoiceSheet invId={open.id} role={role} onClose={() => setOpen(null)} />}
    </>
  );
}

function InvoiceSheet({ invId, role, onClose }: { invId: string; role: Role; onClose: () => void }) {
  const s = useArrivals();
  const { products, windows } = useBO();
  // follow a reissue to its replacement
  let inv = s.invoices.find((i) => i.id === invId)!;
  while (inv.replacedById) inv = s.invoices.find((i) => i.id === inv.replacedById)!;
  const po = s.preorders.find((x) => x.id === inv.preorderId)!;
  const w = windows.find((x) => x.id === inv.windowId)!;
  const p: Product = products.find((x) => x.id === w.productId)!;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="bg-white rounded-t-3xl p-4" style={{ maxHeight: "85%" }}>
          <ScrollView>
            <View className="flex-row justify-between items-start">
              <View>
                <Text className="text-[10px] uppercase tracking-widest text-zinc-400">Shipping Fee Invoice</Text>
                <Text className="text-lg font-bold text-zinc-900">{inv.number}</Text>
              </View>
              <StatusPill inv={inv} p={po} />
            </View>
            <Text className="text-sm text-zinc-800 mt-2">
              {po.customer} · {po.phone}
            </Text>
            <Text className="text-[11px] text-zinc-500">
              {po.ref} · {p.name} W{w.number} · {po.fulfilment.kind === "Pickup" ? "Pickup" : `Delivery: ${po.fulfilment.zone}`}
            </Text>
            <View className="border-t border-b border-zinc-200 my-3 py-2">
              {Object.entries(po.allocated ?? {})
                .filter(([, n]) => n)
                .map(([v, n]) => (
                  <View key={v} className="flex-row justify-between">
                    <Text className="text-xs text-zinc-700">
                      Shipping · {vName(p, v)} × {n}
                    </Text>
                    <Text className="text-xs text-zinc-900">{ghs(n * inv.perUnit)}</Text>
                  </View>
                ))}
              {inv.deliveryFee ? (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-zinc-700">Delivery Fee</Text>
                  <Text className="text-xs text-zinc-900">{ghs(inv.deliveryFee)}</Text>
                </View>
              ) : null}
              <View className="flex-row justify-between mt-1">
                <Text className="text-sm font-bold">Total</Text>
                <Text className="text-sm font-bold">{ghs(inv.total)}</Text>
              </View>
            </View>
            <Text className="text-[11px] text-zinc-500">
              Issued {fmtDate(inv.firstIssuedAt)}
              {inv.replacesId ? ` (reissued ${fmtDate(inv.issuedAt)})` : ""} · due {fmtDate(inv.dueAt)} · day {invoiceDay(inv)}
            </Text>
            <View className="mt-2">
              <ReminderDots inv={inv} />
            </View>
            <InvoiceActions inv={inv} p={po} role={role} />
            <Pressable onPress={onClose} className="mt-4 py-2 items-center">
              <Text className="text-sm text-zinc-500">Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

