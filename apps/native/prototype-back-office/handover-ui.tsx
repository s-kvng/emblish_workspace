// PROTOTYPE (wayfinder #17): forms and small pieces shared by the handover variants.
// The variants disagree on navigation, the handover flow, order layout and where refunds live; the forms
// behind each action are shared so the comparison is about structure, not form styling.
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, fmtDate, ghs, parseGhs, useBO, variantLabel, type Role } from "./bo-data";
import type { Fulfilment } from "./arrival-data";
import {
  ADJUST_REASONS,
  UNCOLLECTED_REMINDERS,
  adjustStock,
  cancelLines,
  changeRole,
  daysWaiting,
  feeOf,
  invite,
  isElsewhere,
  newZone,
  payRefund,
  priceGaps,
  quoteDeliveryFee,
  refundAfterHandover,
  saveZone,
  setActive,
  setPrice,
  simulateDfPaid,
  soldOffline,
  switchEffect,
  switchFulfilment,
  unitsOf,
  useHandover,
  useStock,
  type HOrder,
  type OrderState,
  type QueueRefund,
  type Zone,
} from "./handover-data";

export const VIOLET = "#6d28d9";

// ---------------------------------------------------------------- primitives

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-4 pt-3 pb-8" style={{ maxHeight: "88%" }}>
        <View className="self-center w-10 h-1 rounded-full bg-zinc-300 mb-2" />
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-base font-bold text-zinc-900">{title}</Text>
          <Pressable onPress={onClose} className="px-2 py-1">
            <Text className="text-zinc-500 text-lg">✕</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function PrimaryBtn({ label, onPress, disabled, tone = "violet" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "violet" | "red" | "dark" | "green" }) {
  const bg = { violet: "bg-[#6d28d9]", red: "bg-red-700", dark: "bg-zinc-900", green: "bg-emerald-700" }[tone];
  return (
    <Pressable onPress={disabled ? undefined : onPress} className={`rounded-xl py-3 items-center ${disabled ? "bg-zinc-300" : bg}`}>
      <Text className="text-white font-bold text-sm">{label}</Text>
    </Pressable>
  );
}

export function GhostBtn({ label, onPress, locked }: { label: string; onPress?: () => void; locked?: boolean }) {
  return (
    <Pressable onPress={locked ? undefined : onPress} className={`rounded-lg px-3 py-2 border ${locked ? "border-dashed border-zinc-300" : "border-zinc-300 bg-white"}`}>
      <Text className={`text-xs font-semibold ${locked ? "text-zinc-400" : "text-zinc-800"}`}>{locked ? `🔒 ${label} (Owner)` : label}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} className={`rounded-full px-2.5 py-1 border ${value === o ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 bg-white"}`}>
          <Text className={`text-[11px] ${value === o ? "text-white" : "text-zinc-700"}`}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, value, onChange, placeholder, keyboard }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; keyboard?: "decimal-pad" | "number-pad" | "email-address" }) {
  return (
    <View className="mb-2">
      <Text className="text-[10px] uppercase font-bold text-zinc-500 mb-1">{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboard} autoCapitalize="none" className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white text-zinc-900" />
    </View>
  );
}

const STATE_TONE: Record<OrderState, string> = {
  "Awaiting goods": "bg-zinc-100 text-zinc-500",
  "Awaiting payment": "bg-amber-100 text-amber-800",
  "Needs Delivery Fee quote": "bg-orange-100 text-orange-800",
  "Awaiting Delivery Fee": "bg-amber-100 text-amber-800",
  "Ready for handover": "bg-violet-100 text-violet-800",
  Dispatched: "bg-sky-100 text-sky-800",
  Collected: "bg-emerald-100 text-emerald-800",
  Delivered: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-zinc-200 text-zinc-500",
  Forfeited: "bg-zinc-200 text-zinc-500",
};
export function StatePill({ s }: { s: OrderState }) {
  return <Text className={`text-[10px] font-bold px-2 py-0.5 rounded-full overflow-hidden ${STATE_TONE[s]}`}>{s}</Text>;
}

export function fulfilmentLabel(f: Fulfilment) {
  if (f.kind === "Pickup") return "Pickup";
  return isElsewhere(f) ? `${f.zone} · fee quoted` : `${f.zone} · ${ghs(f.fee)}`;
}

/** "Gold / Medium ×2" style line list with product names. */
export function Lines({ o, compact }: { o: HOrder; compact?: boolean }) {
  const { products } = useBO();
  return (
    <View>
      {o.lines
        .filter((l) => l.qty > 0)
        .map((l) => {
          const p = products.find((x) => x.id === l.productId)!;
          const v = p.variants.find((x) => x.id === l.variantId);
          const live = l.qty - l.cancelled;
          return (
            <View key={l.variantId} className="flex-row items-center gap-2 py-0.5">
              <View className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.images[0]?.color }} />
              <Text className={`text-xs flex-1 ${live ? "text-zinc-800" : "text-zinc-400"}`} style={live ? undefined : { textDecorationLine: "line-through" }}>
                {compact ? "" : `${p.name} · `}
                {v ? variantLabel(v) : l.variantId} ×{l.qty}
                {l.cancelled && live ? `  (${l.cancelled} cancelled)` : ""}
              </Text>
              {!compact && <Text className="text-[11px] text-zinc-500">{ghs(l.price * live)}</Text>}
            </View>
          );
        })}
    </View>
  );
}

export function CodeDigits({ code, size = "lg" }: { code: string; size?: "lg" | "sm" }) {
  return (
    <View className="flex-row gap-1">
      {code.split("").map((c, i) => (
        <View key={i} className={`${size === "lg" ? "w-9 h-11" : "w-5 h-6"} rounded-md bg-zinc-900 items-center justify-center ${i === 3 ? "ml-1.5" : ""}`}>
          <Text className={`${size === "lg" ? "text-xl" : "text-xs"} font-black text-[#facc15]`}>{c}</Text>
        </View>
      ))}
    </View>
  );
}

export function UncollectedDots({ o }: { o: HOrder }) {
  const d = daysWaiting(o);
  return (
    <View className="flex-row items-center gap-1">
      {UNCOLLECTED_REMINDERS.map((x) => (
        <View key={x} className={`px-1 py-0.5 rounded ${d >= x ? "bg-zinc-800" : "border border-zinc-300"}`}>
          <Text className={`text-[9px] font-bold ${d >= x ? "text-white" : "text-zinc-400"}`}>d{x}</Text>
        </View>
      ))}
    </View>
  );
}

export function Timeline({ o }: { o: HOrder }) {
  if (!o.record.events.length) return <Text className="text-[11px] text-zinc-400">No handover activity yet.</Text>;
  return (
    <View>
      {o.record.events.map((e, i) => (
        <Text key={i} className="text-[11px] text-zinc-600">
          {fmtDate(e.at)} · {e.what} · <Text className="text-zinc-400">{e.by}</Text>
        </Text>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- order action forms

export function QuoteForm({ o, role, onDone }: { o: HOrder; role: Role; onDone: () => void }) {
  const [amt, setAmt] = useState("");
  const zone = o.fulfilment.kind === "Delivery" ? o.fulfilment.zone : "";
  const fee = parseGhs(amt);
  return (
    <View>
      <Text className="text-xs text-zinc-600 mb-2">
        {o.customer} wants Delivery to <Text className="font-bold">{zone.replace("Elsewhere ", "")}</Text>. Quote the Delivery Fee; they get its own Delivery Fee Invoice by SMS and the order is ready once it's paid.
      </Text>
      <Field label="Delivery Fee (GH₵)" value={amt} onChange={setAmt} placeholder="e.g. 65" keyboard="decimal-pad" />
      <View className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 mb-3">
        <Text className="text-[10px] uppercase font-bold text-zinc-500">SMS preview</Text>
        <Text className="text-[11px] text-zinc-700">
          Emblish: Delivery Fee to {zone.replace("Elsewhere ", "").replace(/[()]/g, "")} for {o.ref} is {fee ? ghs(fee) : "GH₵ —"}. Pay: emblish.com/pay/DF-…
        </Text>
      </View>
      <PrimaryBtn label={fee ? `Send ${ghs(fee)} Delivery Fee Invoice` : "Enter a fee"} disabled={!fee} onPress={() => (quoteDeliveryFee(o, fee!, role), onDone())} />
      <Text className="text-[10px] text-zinc-400 mt-2">Any Staff member can quote. A Delivery Fee Invoice never leads to Forfeit.</Text>
    </View>
  );
}

export function DfStatus({ o }: { o: HOrder }) {
  if (!o.dfInvoice) return null;
  return (
    <View className="flex-row items-center gap-2 mt-1">
      <Text className="text-[11px] text-zinc-600">
        {o.dfInvoice.number} Delivery Fee {ghs(o.dfInvoice.amount)} · {o.dfInvoice.status === "Paid" ? `paid ${fmtDate(o.dfInvoice.paidAt)}` : "unpaid"}
      </Text>
      {o.dfInvoice.status === "Unpaid" && (
        <Pressable onPress={() => simulateDfPaid(o)} className="rounded px-2 py-0.5 border border-dashed border-sky-400">
          <Text className="text-[10px] text-sky-700">⚙ simulate paid</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SwitchForm({ o, role, onDone }: { o: HOrder; role: Role; onDone: () => void }) {
  const { zones } = useHandover();
  const opts: { key: string; f: Fulfilment }[] = [
    { key: "Pickup", f: { kind: "Pickup" } },
    ...zones.filter((z) => !z.archived && !z.elsewhere).map((z) => ({ key: z.name, f: { kind: "Delivery" as const, zone: z.name, fee: z.fee } })),
    { key: "Elsewhere in Ghana", f: { kind: "Delivery" as const, zone: "Elsewhere (…)" } },
  ];
  const cur = o.fulfilment.kind === "Pickup" ? "Pickup" : isElsewhere(o.fulfilment) ? "Elsewhere in Ghana" : o.fulfilment.zone;
  const [pick, setPick] = useState(cur);
  const [town, setTown] = useState("");
  const chosen = opts.find((x) => x.key === pick)!;
  const target: Fulfilment = pick === "Elsewhere in Ghana" ? { kind: "Delivery", zone: `Elsewhere (${town || "…"})` } : chosen.f;
  const fx = switchEffect(o, target);
  return (
    <View>
      <Text className="text-xs text-zinc-600 mb-2">Allowed until dispatch. Fixed-zone fees are today's fee.</Text>
      {opts.map((x) => (
        <Pressable key={x.key} onPress={() => setPick(x.key)} className={`flex-row items-center justify-between border rounded-xl px-3 py-2.5 mb-1.5 ${pick === x.key ? "border-[#6d28d9] bg-violet-50" : "border-zinc-200"}`}>
          <Text className="text-sm text-zinc-900">
            {pick === x.key ? "◉" : "○"} {x.key}
            {x.key === cur ? "  (current)" : ""}
          </Text>
          <Text className="text-xs text-zinc-500">{x.key === "Pickup" ? "free" : x.key === "Elsewhere in Ghana" ? "quoted" : `${ghs(feeOf(x.f))} ${feeOf(x.f) - feeOf(o.fulfilment) >= 0 ? "+" : "−"}${ghs(Math.abs(feeOf(x.f) - feeOf(o.fulfilment)))}`}</Text>
        </Pressable>
      ))}
      {pick === "Elsewhere in Ghana" && <Field label="Town" value={town} onChange={setTown} placeholder="e.g. Ho" />}
      <View className="bg-amber-50 border border-amber-200 rounded-lg p-2 my-2">
        <Text className="text-[10px] uppercase font-bold text-amber-800">Money effect</Text>
        <Text className="text-xs text-amber-900">{pick === cur ? "Nothing changes." : fx.text}</Text>
      </View>
      <PrimaryBtn label={pick === cur ? "No change" : `Switch to ${pick} & text ${o.customer.split(" ")[0]}`} disabled={pick === cur || (pick === "Elsewhere in Ghana" && !town)} onPress={() => (switchFulfilment(o, target, role), onDone())} />
    </View>
  );
}

export function CancelForm({ o, role, onDone }: { o: HOrder; role: Role; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("Customer asked");
  const { products } = useBO();
  const units = Object.values(qty).reduce((s, n) => s + n, 0);
  const amount = o.lines.reduce((s, l) => s + (qty[l.variantId] ?? 0) * l.price, 0);
  return (
    <View>
      <Text className="text-xs text-zinc-600 mb-2">Cancel any units until handover. They go back to Stock, and the money is flagged for the Owner to refund.</Text>
      {o.lines.map((l) => {
        const live = l.qty - l.cancelled;
        if (live <= 0) return null;
        const p = products.find((x) => x.id === l.productId)!;
        const v = p.variants.find((x) => x.id === l.variantId);
        const n = qty[l.variantId] ?? 0;
        return (
          <View key={l.variantId} className="flex-row items-center justify-between border border-zinc-200 rounded-xl px-3 py-2 mb-1.5">
            <Text className="text-xs text-zinc-800 flex-1">
              {p.name} · {v ? variantLabel(v) : ""} ({live} left)
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => setQty({ ...qty, [l.variantId]: Math.max(0, n - 1) })} className="w-7 h-7 rounded-full border border-zinc-300 items-center justify-center">
                <Text>−</Text>
              </Pressable>
              <Text className="w-5 text-center font-bold">{n}</Text>
              <Pressable onPress={() => setQty({ ...qty, [l.variantId]: Math.min(live, n + 1) })} className="w-7 h-7 rounded-full border border-zinc-300 items-center justify-center">
                <Text>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Text className="text-[10px] uppercase font-bold text-zinc-500 mt-2 mb-1">Reason</Text>
      <Chips options={["Customer asked", "Out of stock / damaged", "Duplicate order", "Other"] as const} value={reason as "Other"} onChange={setReason} />
      <View className="mt-3">
        <PrimaryBtn tone="red" label={units ? `Cancel ${units} unit(s) · flag ${ghs(amount)} refund` : "Pick units to cancel"} disabled={!units} onPress={() => (cancelLines(o, qty, reason, role), onDone())} />
      </View>
    </View>
  );
}

/** Owner-only refund on a handed-over order. Staff see the lock. */
export function RefundForm({ o, role, onDone }: { o: HOrder; role: Role; onDone: () => void }) {
  const { products } = useBO();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("Faulty item");
  const [restock, setRestock] = useState(false);
  const [extra, setExtra] = useState("");
  const goods = o.lines.reduce((s, l) => s + (qty[l.variantId] ?? 0) * l.price, 0);
  const amount = goods + (parseGhs(extra) ?? 0);
  if (role !== "owner")
    return <Text className="text-xs text-zinc-500">🔒 Only an Owner can refund. Ask {ME.owner.split(" ")[0]} to open {o.ref}.</Text>;
  return (
    <View>
      <Text className="text-xs text-zinc-600 mb-2">
        {o.ref} was {o.state.toLowerCase()} on {fmtDate(o.record.collectedAt ?? o.record.deliveredAt ?? o.record.dispatchedAt)}. Paid in total: {ghs(o.paid)}.
      </Text>
      {o.lines.map((l) => {
        const live = l.qty - l.cancelled;
        if (live <= 0) return null;
        const p = products.find((x) => x.id === l.productId)!;
        const v = p.variants.find((x) => x.id === l.variantId);
        const n = qty[l.variantId] ?? 0;
        return (
          <View key={l.variantId} className="flex-row items-center justify-between border border-zinc-200 rounded-xl px-3 py-2 mb-1.5">
            <Text className="text-xs text-zinc-800 flex-1">
              {p.name} · {v ? variantLabel(v) : ""} · {ghs(l.price)}
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => setQty({ ...qty, [l.variantId]: Math.max(0, n - 1) })} className="w-7 h-7 rounded-full border border-zinc-300 items-center justify-center">
                <Text>−</Text>
              </Pressable>
              <Text className="w-5 text-center font-bold">{n}</Text>
              <Pressable onPress={() => setQty({ ...qty, [l.variantId]: Math.min(live, n + 1) })} className="w-7 h-7 rounded-full border border-zinc-300 items-center justify-center">
                <Text>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Field label="Plus fees refunded (Shipping / Delivery, GH₵)" value={extra} onChange={setExtra} placeholder="0" keyboard="decimal-pad" />
      <Chips options={["Faulty item", "Wrong item", "Goodwill", "Other"] as const} value={reason as "Other"} onChange={setReason} />
      <Pressable onPress={() => setRestock(!restock)} className="flex-row items-center gap-2 mt-3">
        <Text className="text-base">{restock ? "☑" : "☐"}</Text>
        <Text className="text-xs text-zinc-700">Goods came back and can be sold: add them to Stock</Text>
      </Pressable>
      <View className="mt-3">
        <PrimaryBtn tone="red" label={amount ? `Refund ${ghs(amount)} via Paystack` : "Pick what to refund"} disabled={!amount || amount > o.paid} onPress={() => (refundAfterHandover(o, qty, amount, reason, restock, role), onDone())} />
      </View>
      <Text className="text-[10px] text-zinc-400 mt-2">Paystack refunds to mobile money can take days (open caveat from the payment provider decision).</Text>
    </View>
  );
}

export function RefundRow({ q, role, onOpenOrder }: { q: QueueRefund; role: Role; onOpenOrder?: () => void }) {
  const tone = { Shortfall: "bg-red-100 text-red-800", "Late-paid": "bg-orange-100 text-orange-800", "Cancelled line": "bg-zinc-100 text-zinc-700", "After handover": "bg-sky-100 text-sky-800", "Fulfilment switch": "bg-amber-100 text-amber-800" }[q.kind];
  return (
    <View className="bg-white border border-zinc-200 rounded-xl p-3 mb-2">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onOpenOrder} className="flex-1">
          <Text className="text-sm font-bold text-zinc-900">
            {q.customer} · {q.ref}
          </Text>
        </Pressable>
        <Text className="text-sm font-bold text-zinc-900">{ghs(q.amount)}</Text>
      </View>
      <View className="flex-row items-center gap-2 mt-1">
        <Text className={`text-[10px] font-bold px-2 py-0.5 rounded-full overflow-hidden ${tone}`}>{q.kind}</Text>
        <Text className="text-[11px] text-zinc-500 flex-1" numberOfLines={2}>
          {q.reason}
        </Text>
      </View>
      {q.status === "Refunded" ? (
        <Text className="text-[11px] text-emerald-700 mt-1.5">✓ Refunded {fmtDate(q.refundedAt)}</Text>
      ) : (
        <View className="flex-row mt-2">
          {role === "owner" ? (
            <Pressable onPress={() => payRefund(q, role)} className="bg-red-700 rounded-lg px-3 py-1.5">
              <Text className="text-xs font-bold text-white">Refund {ghs(q.amount)}</Text>
            </Pressable>
          ) : (
            <Text className="text-[11px] text-zinc-400">🔒 Owner refunds · flagged {fmtDate(q.flaggedAt)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Stock

export function StockEntry({ variantId, role, mode: initial = "adjust", onDone }: { variantId: string; role: Role; mode?: "adjust" | "offline"; onDone?: () => void }) {
  const [mode, setMode] = useState(initial);
  const [n, setN] = useState(1);
  const [dir, setDir] = useState<"+" | "−">("−");
  const [reason, setReason] = useState("Damaged");
  const [note, setNote] = useState("");
  return (
    <View>
      <View className="flex-row bg-zinc-100 rounded-lg p-0.5 mb-2">
        {(["adjust", "offline"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} className={`flex-1 rounded-md py-1.5 items-center ${mode === m ? "bg-white" : ""}`}>
            <Text className={`text-xs font-semibold ${mode === m ? "text-zinc-900" : "text-zinc-500"}`}>{m === "adjust" ? "Adjustment" : "Sold offline"}</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center gap-2 mb-2">
        {mode === "adjust" && (
          <Pressable onPress={() => setDir(dir === "+" ? "−" : "+")} className={`w-10 h-10 rounded-lg items-center justify-center ${dir === "+" ? "bg-emerald-600" : "bg-red-600"}`}>
            <Text className="text-white text-lg font-black">{dir}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setN(Math.max(1, n - 1))} className="w-10 h-10 rounded-lg border border-zinc-300 items-center justify-center">
          <Text className="text-lg">−</Text>
        </Pressable>
        <Text className="text-2xl font-black w-10 text-center">{n}</Text>
        <Pressable onPress={() => setN(n + 1)} className="w-10 h-10 rounded-lg border border-zinc-300 items-center justify-center">
          <Text className="text-lg">+</Text>
        </Pressable>
      </View>
      {mode === "adjust" && <Chips options={ADJUST_REASONS} value={reason} onChange={setReason} />}
      <View className="mt-2">
        <Field label={mode === "adjust" ? "Note (optional)" : "Where / how (optional)"} value={note} onChange={setNote} placeholder={mode === "adjust" ? "e.g. zip broken" : "Walk-in, cash · Instagram DM, MoMo"} />
      </View>
      <PrimaryBtn
        tone="dark"
        label={mode === "adjust" ? `Record ${dir}${n} (${reason})` : `Record ${n} sold offline`}
        onPress={() => {
          if (mode === "adjust") adjustStock(variantId, dir === "+" ? n : -n, reason, note, role);
          else soldOffline(variantId, n, note, role);
          setN(1);
          setNote("");
          onDone?.();
        }}
      />
    </View>
  );
}

export function Ledger({ variantId, base, limit }: { variantId: string; base: number; limit?: number }) {
  const { history, current } = useStock(variantId, base);
  let running = current;
  const rows = history.map((m) => {
    const after = running;
    running -= m.qty;
    return { m, after };
  });
  return (
    <View>
      {rows.slice(0, limit).map(({ m, after }, i) => (
        <View key={i} className="flex-row items-center py-1.5 border-b border-zinc-100">
          <Text className="text-[11px] text-zinc-400 w-12">{fmtDate(m.at)}</Text>
          <View className="flex-1">
            <Text className="text-xs text-zinc-800">
              {m.kind} <Text className="text-zinc-500">· {m.note}</Text>
            </Text>
            <Text className="text-[10px] text-zinc-400">{m.by}</Text>
          </View>
          <Text className={`text-sm font-bold w-10 text-right ${m.qty > 0 ? "text-emerald-700" : "text-red-700"}`}>
            {m.qty > 0 ? "+" : ""}
            {m.qty}
          </Text>
          <Text className="text-xs text-zinc-500 w-8 text-right">{after}</Text>
        </View>
      ))}
      {!rows.length && <Text className="text-xs text-zinc-400">No movements yet.</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- Delivery Zones (Owner edits, Staff read)

export function ZonesEditor({ role }: { role: Role }) {
  const { zones } = useHandover();
  const [edit, setEdit] = useState<Zone | null>(null);
  const [fee, setFee] = useState("");
  const [name, setName] = useState("");
  const owner = role === "owner";
  const open = (z: Zone) => (setEdit(z), setFee(z.fee != null ? String(z.fee / 100) : ""), setName(z.name));
  return (
    <View>
      <Text className="text-xs text-zinc-500 mb-2">Flat fee per zone, frozen on each order at checkout. A change only affects new orders.</Text>
      {zones.map((z) => (
        <Pressable key={z.id} onPress={() => owner && !z.elsewhere && open(z)} className={`flex-row items-center justify-between bg-white border border-zinc-200 rounded-xl px-3 py-3 mb-1.5 ${z.archived ? "opacity-50" : ""}`}>
          <Text className="text-sm text-zinc-900">
            {z.name}
            {z.archived ? " · archived" : ""}
          </Text>
          <Text className="text-sm font-bold text-zinc-700">{z.elsewhere ? "Quoted by Staff" : ghs(z.fee)}</Text>
        </Pressable>
      ))}
      {owner ? (
        <Pressable onPress={() => open(newZone())} className="border border-dashed border-zinc-400 rounded-xl py-3 items-center mt-1">
          <Text className="text-sm font-semibold text-zinc-700">＋ Add zone</Text>
        </Pressable>
      ) : (
        <Text className="text-[11px] text-zinc-400 mt-1">🔒 Only an Owner can change zones and fees.</Text>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.name ? `Edit ${edit.name}` : "New zone"}>
        {edit && (
          <View>
            <Field label="Zone name" value={name} onChange={setName} placeholder="e.g. Madina" />
            <Field label="Delivery Fee (GH₵)" value={fee} onChange={setFee} placeholder="30" keyboard="decimal-pad" />
            {edit.fee != null && parseGhs(fee) !== edit.fee && <Text className="text-[11px] text-amber-700 mb-2">Orders already placed keep {ghs(edit.fee)}.</Text>}
            <PrimaryBtn label="Save zone" disabled={!name || parseGhs(fee) == null} onPress={() => (saveZone({ ...edit, name, fee: parseGhs(fee) }, role), setEdit(null))} />
            {edit.name && (
              <Pressable onPress={() => (saveZone({ ...edit, archived: !edit.archived }, role), setEdit(null))} className="items-center mt-3">
                <Text className="text-xs text-zinc-500">{edit.archived ? "Bring back" : "Archive (hide from checkout)"}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- Staff management (Owner only; hidden from Staff)

export function StaffManager() {
  const { staff } = useHandover();
  const [email, setEmail] = useState("");
  const [asOwner, setAsOwner] = useState(false);
  const owners = staff.filter((s) => s.role === "owner" && s.status === "Active").length;
  return (
    <View>
      {staff.map((m) => {
        const lastOwner = m.role === "owner" && m.status === "Active" && owners <= 1;
        return (
          <View key={m.id} className={`bg-white border border-zinc-200 rounded-xl p-3 mb-1.5 ${m.status === "Deactivated" ? "opacity-60" : ""}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm font-bold text-zinc-900">{m.name}</Text>
                <Text className="text-[11px] text-zinc-500">
                  {m.email} · {m.status === "Invited" ? `invited ${fmtDate(m.since)}` : m.status}
                </Text>
              </View>
              <Text className={`text-[10px] font-bold px-2 py-0.5 rounded-full overflow-hidden ${m.role === "owner" ? "bg-[#facc15] text-zinc-900" : "bg-zinc-100 text-zinc-700"}`}>{m.role === "owner" ? "OWNER" : "STAFF"}</Text>
            </View>
            <View className="flex-row gap-2 mt-2">
              {m.status !== "Deactivated" && (
                <GhostBtn label={m.role === "owner" ? "Make Staff" : "Make Owner"} onPress={() => changeRole(m.id, m.role === "owner" ? "staff" : "owner")} />
              )}
              <GhostBtn label={m.status === "Deactivated" ? "Reactivate" : m.status === "Invited" ? "Revoke invite" : "Deactivate"} onPress={() => setActive(m.id, m.status === "Deactivated")} />
              {m.status === "Invited" && <GhostBtn label="Resend link" />}
            </View>
            {lastOwner && <Text className="text-[10px] text-zinc-400 mt-1">Last active Owner: can't be demoted or deactivated.</Text>}
          </View>
        );
      })}
      <View className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 mt-2">
        <Text className="text-xs font-bold text-zinc-800 mb-1">Invite by email</Text>
        <Field label="Email" value={email} onChange={setEmail} placeholder="name@example.com" keyboard="email-address" />
        <Pressable onPress={() => setAsOwner(!asOwner)} className="flex-row items-center gap-2 mb-2">
          <Text>{asOwner ? "☑" : "☐"}</Text>
          <Text className="text-xs text-zinc-700">Invite as Owner</Text>
        </Pressable>
        <PrimaryBtn label="Send invite link" disabled={!email.includes("@")} onPress={() => (invite(email, asOwner ? "owner" : "staff"), setEmail(""))} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Needs prices (Owner)

export function NeedsPrices({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const gaps = priceGaps(products, windows);
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!gaps.length) return <Text className="text-xs text-zinc-500">Everything offered has a price. 🎉</Text>;
  return (
    <View>
      <Text className="text-xs text-zinc-500 mb-2">Staff saved these without prices. Publishing and opening wait on them.</Text>
      {gaps.map((g) => (
        <View key={g.key} className="flex-row items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 mb-1.5">
          <View className="w-8 h-8 rounded-md" style={{ backgroundColor: g.product.images[0]?.color ?? "#e4e4e7" }} />
          <View className="flex-1">
            <Text className="text-xs font-bold text-zinc-900">
              {g.product.name} · {g.label}
            </Text>
            <Text className="text-[10px] text-zinc-500">
              {g.where}
              {g.window ? ` · Window ${g.window.number}${g.window.draft ? " (draft)" : ""}` : ""}
            </Text>
          </View>
          {role === "owner" ? (
            <>
              <TextInput
                value={vals[g.key] ?? ""}
                onChangeText={(t) => setVals({ ...vals, [g.key]: t })}
                placeholder="GH₵"
                keyboardType="decimal-pad"
                className="w-16 border border-zinc-300 rounded-md px-2 py-1 text-sm text-right"
              />
              <Pressable onPress={() => parseGhs(vals[g.key] ?? "") && setPrice(g, parseGhs(vals[g.key])!, role)} className="bg-zinc-900 rounded-md px-2 py-1.5">
                <Text className="text-[11px] font-bold text-white">Set</Text>
              </Pressable>
            </>
          ) : (
            <Text className="text-[10px] text-zinc-400">🔒 Owner</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- state peek

export function HandoverPeek() {
  const h = useHandover();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ position: "absolute", left: 10, bottom: 96, zIndex: 900 }} className="bg-sky-600 rounded-full px-3 py-1.5">
        <Text className="text-white text-[10px] font-bold">⚙ state</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center px-4" onPress={() => setOpen(false)}>
          <View className="bg-white rounded-xl p-3" style={{ maxHeight: "80%" }}>
            <ScrollView>
              <Text className="text-xs font-bold mb-1">Log (newest first)</Text>
              {h.log.map((l, i) => (
                <Text key={i} className="text-[11px] text-zinc-700">• {l}</Text>
              ))}
              <Text className="text-xs font-bold mt-3 mb-1">SMS sent</Text>
              {h.sms.length ? h.sms.map((l, i) => <Text key={i} className="text-[11px] text-zinc-700">✉ {l}</Text>) : <Text className="text-[11px] text-zinc-400">None yet</Text>}
              <Text className="text-xs font-bold mt-3 mb-1">Delivery Fee Invoices</Text>
              {h.dfInvoices.map((d) => (
                <Text key={d.id} className="text-[11px] text-zinc-700">
                  {d.number} · {ghs(d.amount)} · {d.status}
                </Text>
              ))}
              <Text className="text-[10px] text-zinc-400 mt-3">Pickup Codes are on each order card. Try 024 555 0301 (Ewurama: a Store Order + a Pre-order ready).</Text>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export { unitsOf };
