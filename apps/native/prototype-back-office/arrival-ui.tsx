// PROTOTYPE (wayfinder #16): small pieces shared by the arrival variants. Layout stays per variant.
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, fmtDate, ghs, parseGhs, useBO, variantLabel, type Product, type Role } from "./bo-data";
import {
  FORFEIT_DAY,
  REMINDER_DAYS,
  allocatedUnits,
  forfeit,
  forfeitEligible,
  invoiceDay,
  isOverdue,
  simulatePayment,
  useArrivals,
  voidAndReissue,
  type Invoice,
  type Preorder,
  type VariantAllocation,
} from "./arrival-data";

export const VIOLET = "#6d28d9";

/** Pre-orders | Store Quantity | Surplus | Shortfall, as one bar against what was expected. */
export function AllocBar({ a, height = 10 }: { a: VariantAllocation; height?: number }) {
  const total = Math.max(a.expected, a.arrived, 1);
  const seg = (n: number, color: string, striped = false) =>
    n > 0 ? (
      <View
        style={{
          width: `${(n / total) * 100}%`,
          backgroundColor: color,
          opacity: striped ? 0.85 : 1,
          borderStyle: striped ? "dashed" : "solid",
          borderWidth: striped ? 1 : 0,
          borderColor: "#b91c1c",
        }}
      />
    ) : null;
  return (
    <View className="flex-row rounded-full overflow-hidden bg-zinc-200" style={{ height }}>
      {seg(a.toPreorders, VIOLET)}
      {seg(a.toStore, "#0f766e")}
      {seg(a.surplus, "#16a34a")}
      {seg(a.shortfall, "#fecaca", true)}
      {seg(Math.max(0, a.storeQuantity - a.toStore), "#e4e4e7")}
    </View>
  );
}

export function AllocLegend() {
  const item = (c: string, t: string) => (
    <View className="flex-row items-center gap-1">
      <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
      <Text className="text-[10px] text-zinc-600">{t}</Text>
    </View>
  );
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1">
      {item(VIOLET, "Pre-orders")}
      {item("#0f766e", "Store Quantity")}
      {item("#16a34a", "Surplus → Stock")}
      {item("#fecaca", "Shortfall (refund)")}
    </View>
  );
}

export function vName(p: Product, variantId: string) {
  const v = p.variants.find((x) => x.id === variantId);
  return v ? variantLabel(v) : variantId;
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center border border-zinc-300 rounded-lg overflow-hidden bg-white">
      <Pressable onPress={() => onChange(Math.max(0, value - 1))} className="px-3 py-1.5 bg-zinc-50">
        <Text className="text-base font-bold text-zinc-700">−</Text>
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={(t) => onChange(Number.parseInt(t.replace(/[^0-9]/g, "") || "0", 10))}
        keyboardType="number-pad"
        className="w-12 text-center text-base font-bold text-zinc-900 py-1"
      />
      <Pressable onPress={() => onChange(value + 1)} className="px-3 py-1.5 bg-zinc-50">
        <Text className="text-base font-bold text-zinc-700">+</Text>
      </Pressable>
    </View>
  );
}

export function statusOf(inv?: Invoice, p?: Preorder): { label: string; tone: "paid" | "due" | "overdue" | "forfeit" | "void" | "none" } {
  if (p?.forfeitedAt) return { label: "Forfeited", tone: "void" };
  if (!inv) return { label: p && allocatedUnits(p) === 0 ? "Nothing arrived" : "Not invoiced", tone: "none" };
  if (inv.status === "Paid") return { label: `Paid ${fmtDate(inv.paidAt)}`, tone: "paid" };
  if (inv.status === "Void") return { label: "Void", tone: "void" };
  if (forfeitEligible(inv)) return { label: `Day ${invoiceDay(inv)} · can Forfeit`, tone: "forfeit" };
  if (isOverdue(inv)) return { label: `Overdue · day ${invoiceDay(inv)}`, tone: "overdue" };
  return { label: `Due ${fmtDate(inv.dueAt)}`, tone: "due" };
}

export function StatusPill({ inv, p }: { inv?: Invoice; p?: Preorder }) {
  const s = statusOf(inv, p);
  const cls = {
    paid: "bg-emerald-100 text-emerald-800",
    due: "bg-zinc-100 text-zinc-700",
    overdue: "bg-amber-100 text-amber-800",
    forfeit: "bg-red-100 text-red-800",
    void: "bg-zinc-200 text-zinc-500",
    none: "bg-zinc-100 text-zinc-400",
  }[s.tone];
  return <Text className={`text-[10px] font-bold px-2 py-0.5 rounded-full overflow-hidden ${cls}`}>{s.label}</Text>;
}

export function ReminderDots({ inv }: { inv: Invoice }) {
  const day = invoiceDay(inv);
  return (
    <View className="flex-row items-center gap-1.5">
      {REMINDER_DAYS.map((d) => (
        <View key={d} className={`px-1.5 py-0.5 rounded ${day >= d && inv.status === "Unpaid" ? "bg-zinc-800" : day >= d ? "bg-zinc-300" : "border border-zinc-300"}`}>
          <Text className={`text-[9px] font-bold ${day >= d ? "text-white" : "text-zinc-400"}`}>d{d}</Text>
        </View>
      ))}
      <View className={`px-1.5 py-0.5 rounded ${day >= FORFEIT_DAY && inv.status === "Unpaid" ? "bg-red-700" : "border border-red-200"}`}>
        <Text className={`text-[9px] font-bold ${day >= FORFEIT_DAY && inv.status === "Unpaid" ? "text-white" : "text-red-300"}`}>d30</Text>
      </View>
    </View>
  );
}

/** Void & reissue + Forfeit + (prototype) simulate payment, for one Pre-order's live invoice. */
export function InvoiceActions({ inv, p, role, compact }: { inv: Invoice; p: Preorder; role: Role; compact?: boolean }) {
  const { invoices } = useArrivals();
  const [mode, setMode] = useState<"none" | "void" | "forfeit">("none");
  const [perUnit, setPerUnit] = useState(String(inv.perUnit / 100));
  const [delivery, setDelivery] = useState(inv.deliveryFee != null ? String(inv.deliveryFee / 100) : "");
  const [reason, setReason] = useState("Wrong fee");
  const history = invoices.filter((i) => i.preorderId === p.id && i.status === "Void");
  const isOwner = role === "owner";
  const eligible = forfeitEligible(inv);

  if (inv.status !== "Unpaid")
    return history.length ? <VoidHistory list={history} /> : null;

  return (
    <View className="mt-2">
      {history.length > 0 && <VoidHistory list={history} />}
      {mode === "none" && (
        <View className="flex-row flex-wrap gap-2 mt-1">
          <Pressable onPress={() => setMode("void")} className="border border-zinc-300 rounded-lg px-3 py-2">
            <Text className="text-xs font-semibold text-zinc-800">Void & reissue</Text>
          </Pressable>
          {eligible && (
            <Pressable
              onPress={() => isOwner && setMode("forfeit")}
              className={`rounded-lg px-3 py-2 ${isOwner ? "bg-red-700" : "border border-dashed border-red-300"}`}
            >
              <Text className={`text-xs font-bold ${isOwner ? "text-white" : "text-red-400"}`}>{isOwner ? "Forfeit…" : "🔒 Forfeit (Owner)"}</Text>
            </Pressable>
          )}
          {!compact && (
            <Pressable onPress={() => simulatePayment(inv.id)} className="rounded-lg px-3 py-2 border border-dashed border-sky-400">
              <Text className="text-[11px] text-sky-700">⚙ simulate paid</Text>
            </Pressable>
          )}
        </View>
      )}
      {mode === "void" && (
        <View className="bg-zinc-50 rounded-lg p-2.5 mt-1 border border-zinc-200">
          <Text className="text-xs font-bold text-zinc-800">Void {inv.number} and reissue</Text>
          <Text className="text-[11px] text-zinc-500 mb-2">The new invoice keeps the due date ({fmtDate(inv.dueAt)}) and the reminder clock.</Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-[10px] uppercase text-zinc-500">Shipping / unit</Text>
              <TextInput value={perUnit} onChangeText={setPerUnit} keyboardType="decimal-pad" className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm bg-white" />
            </View>
            {p.fulfilment.kind === "Delivery" && (
              <View className="flex-1">
                <Text className="text-[10px] uppercase text-zinc-500">Delivery Fee</Text>
                <TextInput value={delivery} onChangeText={setDelivery} keyboardType="decimal-pad" placeholder="none" className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm bg-white" />
              </View>
            )}
          </View>
          <View className="flex-row flex-wrap gap-1.5 mt-2">
            {["Wrong fee", "Wrong Delivery Zone", "Units recounted", "Other"].map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} className={`rounded-full px-2.5 py-1 border ${reason === r ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"}`}>
                <Text className={`text-[11px] ${reason === r ? "text-white" : "text-zinc-700"}`}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-[11px] text-zinc-600 mt-2">
            New total {ghs(inv.units * (parseGhs(perUnit) ?? 0) + (parseGhs(delivery) ?? 0))} (was {ghs(inv.total)}). The Customer gets a new /pay link by SMS.
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Pressable onPress={() => setMode("none")} className="flex-1 border border-zinc-300 rounded-lg py-2 items-center">
              <Text className="text-xs font-semibold text-zinc-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                voidAndReissue(inv.id, { perUnit: parseGhs(perUnit), deliveryFee: delivery ? parseGhs(delivery) : undefined }, reason, role);
                setMode("none");
              }}
              className="flex-1 bg-zinc-900 rounded-lg py-2 items-center"
            >
              <Text className="text-xs font-bold text-white">Void & reissue</Text>
            </Pressable>
          </View>
        </View>
      )}
      {mode === "forfeit" && (
        <View className="bg-red-50 rounded-lg p-2.5 mt-1 border border-red-200">
          <Text className="text-xs font-bold text-red-900">Forfeit {p.ref} ({p.customer})?</Text>
          <Text className="text-[11px] text-red-900 mt-1">
            Day {invoiceDay(inv)}, unpaid since {fmtDate(inv.firstIssuedAt)}. The Pre-order ends, {inv.number} is voided and {allocatedUnits(p)} unit(s) go back to
            Stock. The Item Payment is kept (not refunded). No SMS is sent.
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Pressable onPress={() => setMode("none")} className="flex-1 border border-red-200 rounded-lg py-2 items-center bg-white">
              <Text className="text-xs font-semibold text-zinc-700">Keep waiting</Text>
            </Pressable>
            <Pressable onPress={() => forfeit(p.id, role)} className="flex-1 bg-red-700 rounded-lg py-2 items-center">
              <Text className="text-xs font-bold text-white">Forfeit</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function VoidHistory({ list }: { list: Invoice[] }) {
  return (
    <View className="mt-1">
      {list.map((v) => (
        <Text key={v.id} className="text-[10px] text-zinc-500">
          <Text style={{ textDecorationLine: "line-through" }}>{v.number} {ghs(v.total)}</Text> void {fmtDate(v.voidedAt)} · {v.voidReason}
        </Text>
      ))}
    </View>
  );
}

/** Floating "state" button so the reviewer can see what each action changed. */
export function StatePeek() {
  const s = useArrivals();
  const { products } = useBO();
  const [open, setOpen] = useState(false);
  const all = products.flatMap((p) => p.variants.map((v) => [v.id, `${p.name.split(" ").slice(-1)[0]} ${variantLabel(v)}`] as const));
  const label = Object.fromEntries(all);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ position: "absolute", left: 10, bottom: 90, zIndex: 900 }} className="bg-sky-600 rounded-full px-3 py-1.5">
        <Text className="text-white text-[10px] font-bold">⚙ state</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center px-4" onPress={() => setOpen(false)}>
          <View className="bg-white rounded-xl p-3" style={{ maxHeight: "80%" }}>
            <ScrollView>
              <Text className="text-xs font-bold mb-1">Log (newest first)</Text>
              {s.log.map((l, i) => (
                <Text key={i} className="text-[11px] text-zinc-700">• {l}</Text>
              ))}
              <Text className="text-xs font-bold mt-3 mb-1">Stock Movements</Text>
              {s.movements.map((m, i) => (
                <Text key={i} className="text-[11px] text-zinc-700">
                  {fmtDate(m.at)} · {label[m.variantId]} · +{m.qty} {m.kind} · {m.source}
                </Text>
              ))}
              <Text className="text-xs font-bold mt-3 mb-1">Refund flags</Text>
              {s.refunds.map((r) => (
                <Text key={r.id} className="text-[11px] text-zinc-700">
                  {s.preorders.find((p) => p.id === r.preorderId)?.ref} · {r.units}u · {ghs(r.amount)} · {r.status}
                </Text>
              ))}
              <Text className="text-[10px] text-zinc-400 mt-3">Acting as {ME.owner} / {ME.staff} via the role toggle.</Text>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
