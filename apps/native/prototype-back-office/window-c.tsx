// PROTOTYPE (wayfinder #15): Order Windows variant C, "Board + action sheets".
// A stage board of window cards; every action is its own compact bottom sheet. Throwaway.
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import {
  addDays,
  daysBetween,
  fmtDate,
  fmtRange,
  ghs,
  ME,
  newWindow,
  nextStage,
  openBlockers,
  parseGhs,
  saveProduct,
  saveWindow,
  STAGES,
  TODAY,
  trackingSms,
  useBO,
  variantLabel,
  windowTotals,
  type OrderWindow,
  type Product,
  type Role,
  type TrackingStage,
  type WindowOffer,
} from "./bo-data";

const PURPLE = "#6d28d9";
const GOLD = "#d97706";

type Column = "Drafts" | TrackingStage;
const COLUMNS: { key: Column; label: string }[] = [
  { key: "Drafts", label: "Drafts" },
  { key: "Open", label: "Open" },
  { key: "Closed", label: "Closed" },
  { key: "Ordered from supplier", label: "Ordered" },
  { key: "In transit", label: "In transit" },
  { key: "Arrived", label: "Arrived" },
];

function columnOf(w: OrderWindow): Column {
  return w.draft ? "Drafts" : w.stage;
}

function attention(w: OrderWindow): string[] {
  const out: string[] = [];
  if (!w.draft && w.stage !== "Arrived" && w.expectedTo && w.expectedTo < TODAY) out.push("Expected date has passed");
  if (w.shippingFeeEstimate == null) out.push("No Shipping Fee estimate");
  if (!w.draft && w.stage !== "Open" && w.stage !== "Arrived" && !w.expectedFrom) out.push("No expected dates");
  return out;
}

type SheetState =
  | { kind: "extend"; id: string }
  | { kind: "close"; id: string }
  | { kind: "track"; id: string }
  | { kind: "offer"; id: string }
  | { kind: "new" }
  | null;

export default function WindowC({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const counts = useMemo(() => {
    const c = Object.fromEntries(COLUMNS.map((k) => [k.key, 0])) as Record<Column, number>;
    windows.forEach((w) => (c[columnOf(w)] += 1));
    return c;
  }, [windows]);
  const [col, setCol] = useState<Column>("Open");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = windows.filter((w) => columnOf(w) === col);
  const productOf = (w: OrderWindow) => products.find((p) => p.id === w.productId)!;
  const byId = (id: string) => windows.find((w) => w.id === id)!;
  const done = (msg: string) => {
    setSheet(null);
    setToast(msg);
  };

  return (
    <View className="flex-1 bg-zinc-100">
      <View className="bg-white border-b border-zinc-200 pt-12 pb-2">
        <View className="flex-row items-end justify-between px-4">
          <View>
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Back Office</Text>
            <Text className="text-2xl font-extrabold text-zinc-900">Order Windows</Text>
          </View>
          <Text className="text-xs text-zinc-500">{role === "owner" ? ME.owner : ME.staff}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="px-3 gap-2">
          {COLUMNS.map((c) => {
            const on = c.key === col;
            const flagged = windows.filter((w) => columnOf(w) === c.key && attention(w).length).length;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCol(c.key)}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${on ? "bg-[#6d28d9] border-[#6d28d9]" : "bg-white border-zinc-300"}`}
              >
                <Text className={`text-sm font-semibold ${on ? "text-white" : "text-zinc-700"}`}>{c.label}</Text>
                <View className={`rounded-full px-1.5 ${on ? "bg-white/25" : "bg-zinc-100"}`}>
                  <Text className={`text-xs font-bold ${on ? "text-white" : "text-zinc-500"}`}>{counts[c.key]}</Text>
                </View>
                {flagged > 0 && <View className="h-2 w-2 rounded-full bg-[#d97706]" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerClassName="p-3 pb-32 gap-3">
        {shown.length === 0 && (
          <View className="items-center rounded-2xl border border-dashed border-zinc-300 bg-white p-8">
            <Text className="text-zinc-500">No windows in {COLUMNS.find((c) => c.key === col)!.label}.</Text>
          </View>
        )}
        {shown.map((w) => (
          <WindowCard key={w.id} w={w} p={productOf(w)} onAction={setSheet} />
        ))}
      </ScrollView>

      <Pressable
        onPress={() => setSheet({ kind: "new" })}
        className="absolute bottom-6 right-4 flex-row items-center rounded-full bg-[#6d28d9] px-5 py-3.5"
        style={{ shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10 }}
      >
        <Text className="text-base font-bold text-white">＋ Window</Text>
      </Pressable>

      {toast && (
        <View className="absolute bottom-24 left-4 right-4 rounded-xl bg-zinc-900 px-4 py-3">
          <Text className="text-sm text-white">{toast}</Text>
        </View>
      )}

      <Sheet visible={sheet?.kind === "extend"} onClose={() => setSheet(null)} title="Extend window">
        {sheet?.kind === "extend" && <ExtendSheet w={byId(sheet.id)} role={role} onDone={done} />}
      </Sheet>
      <Sheet visible={sheet?.kind === "close"} onClose={() => setSheet(null)} title="Close window now">
        {sheet?.kind === "close" && <CloseSheet w={byId(sheet.id)} p={productOf(byId(sheet.id))} role={role} onDone={done} />}
      </Sheet>
      <Sheet visible={sheet?.kind === "track"} onClose={() => setSheet(null)} title="Update tracking">
        {sheet?.kind === "track" && <TrackSheet w={byId(sheet.id)} p={productOf(byId(sheet.id))} role={role} onDone={done} />}
      </Sheet>
      <Sheet visible={sheet?.kind === "offer"} onClose={() => setSheet(null)} title="Edit offer">
        {sheet?.kind === "offer" && <OfferSheet w={byId(sheet.id)} p={productOf(byId(sheet.id))} role={role} onDone={done} />}
      </Sheet>
      <Sheet visible={sheet?.kind === "new"} onClose={() => setSheet(null)} title="Open an Order Window">
        {sheet?.kind === "new" && <NewSheet role={role} onDone={done} />}
      </Sheet>
    </View>
  );
}

// ---------- card ----------

function WindowCard({ w, p, onAction }: { w: OrderWindow; p: Product; onAction: (s: SheetState) => void }) {
  const t = windowTotals(w);
  const flags = attention(w);
  const capTotal = w.offers.reduce((s, o) => s + (o.cap ?? 0), 0);
  const allCapped = w.offers.length > 0 && w.offers.every((o) => o.cap != null);
  const isOpen = !w.draft && w.stage === "Open";
  const last = w.history[w.history.length - 1];

  return (
    <View className={`overflow-hidden rounded-2xl border bg-white ${flags.length ? "border-[#d97706]" : "border-zinc-200"}`}>
      <View className="flex-row items-center gap-3 p-3">
        <View className="h-12 w-12 rounded-xl" style={{ backgroundColor: p.images[0]?.color ?? "#d4d4d8" }} />
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-zinc-900" numberOfLines={1}>
            {p.name}
          </Text>
          <Text className="text-xs text-zinc-500">
            Window {w.number} · {fmtDate(w.opensAt)} → {fmtDate(w.closesAt)}
            {p.status === "Draft" ? " · Product is Draft" : ""}
          </Text>
        </View>
        {isOpen ? (
          <View className="items-end">
            <Text className={`text-3xl font-black ${t.daysLeft <= 5 ? "text-[#d97706]" : "text-zinc-900"}`}>{t.daysLeft}d</Text>
            <Text className="text-[10px] font-semibold uppercase text-zinc-400">left</Text>
          </View>
        ) : (
          <View className="rounded-full bg-zinc-100 px-2 py-1">
            <Text className="text-[11px] font-bold text-zinc-600">{w.draft ? "DRAFT" : w.stage.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {flags.length > 0 && (
        <View className="mx-3 mb-2 rounded-lg bg-amber-50 px-3 py-1.5">
          {flags.map((f) => (
            <Text key={f} className="text-xs font-semibold text-[#b45309]">
              ⚠ {f}
            </Text>
          ))}
        </View>
      )}

      {(isOpen || w.draft) && (
        <View className="px-3 pb-2">
          <View>
            <Text className="text-sm font-semibold text-zinc-800">
              {t.ordered} units · {w.preorders} Pre-orders
            </Text>
            <Text className="text-xs text-zinc-500">
              {allCapped ? `of ${capTotal} capped` : "some uncapped"} · Min. {w.minimumOrderQuantity ?? 1}/Pre-order
            </Text>
          </View>
          {allCapped && (
            <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
              <View className="h-2 rounded-full bg-[#6d28d9]" style={{ width: `${Math.min(100, (t.ordered / Math.max(1, capTotal)) * 100)}%` }} />
            </View>
          )}
          <View className="mt-2 gap-1.5">
            {w.offers.map((o) => {
              const v = p.variants.find((x) => x.id === o.variantId);
              const soldOut = o.cap != null && o.ordered >= o.cap;
              return (
                <View key={o.variantId} className="flex-row items-center gap-2">
                  <Text className="w-28 text-xs text-zinc-600" numberOfLines={1}>
                    {v ? variantLabel(v) : "?"}
                  </Text>
                  <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <View
                      className={`h-1.5 rounded-full ${soldOut ? "bg-zinc-400" : "bg-[#a78bfa]"}`}
                      style={{ width: o.cap ? `${Math.min(100, (o.ordered / o.cap) * 100)}%` : o.ordered ? "100%" : "0%", opacity: o.cap ? 1 : 0.35 }}
                    />
                  </View>
                  <Text className="w-12 text-right text-xs tabular-nums text-zinc-600">
                    {o.ordered}
                    {o.cap != null ? `/${o.cap}` : ""}
                  </Text>
                  {soldOut ? (
                    <Text className="rounded bg-zinc-800 px-1 text-[9px] font-black text-white">SOLD OUT</Text>
                  ) : o.preorderPrice == null ? (
                    <Text className="rounded bg-amber-100 px-1 text-[9px] font-black text-[#b45309]">NO PRICE</Text>
                  ) : (
                    <Text className="w-14 text-right text-[11px] text-zinc-500">{ghs(o.preorderPrice)}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {!isOpen && !w.draft && (
        <View className="px-3 pb-2">
          <Text className="text-sm text-zinc-800">
            <Text className="font-semibold">Expected </Text>
            {fmtRange(w.expectedFrom, w.expectedTo)}
          </Text>
          {last && (
            <Text className="mt-0.5 text-xs text-zinc-500">
              Last update {fmtDate(last.at)} by {last.by}
              {last.smsTo ? ` · texted ${last.smsTo}` : ""}
              {w.note ? ` · “${w.note}”` : ""}
            </Text>
          )}
          <Text className="mt-0.5 text-xs text-zinc-500">
            {t.ordered} units · {w.preorders} Customers · Shipping Fee est. {ghs(w.shippingFeeEstimate)}/unit
          </Text>
        </View>
      )}

      <View className="flex-row border-t border-zinc-100">
        {isOpen && <ActionBtn icon="⏩" label="Extend" onPress={() => onAction({ kind: "extend", id: w.id })} />}
        {isOpen && <ActionBtn icon="⏹" label="Close now" onPress={() => onAction({ kind: "close", id: w.id })} />}
        {!w.draft && w.stage !== "Arrived" && (
          <ActionBtn icon="🚚" label="Tracking" onPress={() => onAction({ kind: "track", id: w.id })} />
        )}
        {(isOpen || w.draft) && (
          <ActionBtn icon="🏷" label={w.draft ? "Offer & open" : "Edit offer"} onPress={() => onAction({ kind: "offer", id: w.id })} />
        )}
        {w.stage === "Arrived" && (
          <View className="flex-1 items-center py-2.5">
            <Text className="text-xs text-zinc-400">Arrival recorded · invoices next</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center gap-0.5 py-2.5 active:bg-zinc-50">
      <Text className="text-base">{icon}</Text>
      <Text className="text-[11px] font-semibold text-[#6d28d9]">{label}</Text>
    </Pressable>
  );
}

// ---------- sheet primitives ----------

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
        <View className="max-h-[88%] rounded-t-3xl bg-white">
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-zinc-300" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
            <Text className="text-lg font-extrabold text-zinc-900">{title}</Text>
            <Pressable onPress={onClose} className="rounded-full bg-zinc-100 px-2.5 py-1">
              <Text className="text-sm text-zinc-600">✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="px-4 pb-8 gap-3" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Primary({ label, onPress, disabled, tone = "purple" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "purple" | "dark" | "gold" }) {
  const bg = disabled ? "bg-zinc-300" : tone === "dark" ? "bg-zinc-900" : tone === "gold" ? "bg-[#d97706]" : "bg-[#6d28d9]";
  return (
    <Pressable disabled={disabled} onPress={onPress} className={`items-center rounded-xl py-3.5 ${bg}`}>
      <Text className="text-base font-bold text-white">{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChange, placeholder, width, editable = true }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; width?: string; editable?: boolean }) {
  return (
    <View className={width ?? "flex-1"}>
      <Text className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        editable={editable}
        className={`rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 ${editable ? "bg-white" : "bg-zinc-100"}`}
      />
    </View>
  );
}

function Blockers({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <View className="gap-1 rounded-xl bg-amber-50 p-3">
      <Text className="text-xs font-bold uppercase text-[#b45309]">Can't open yet</Text>
      {items.map((b) => (
        <Text key={b} className="text-sm text-[#92400e]">
          • {b}
        </Text>
      ))}
    </View>
  );
}

const num = (s: string) => {
  const n = Number.parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

// ---------- extend / close ----------

function ExtendSheet({ w, role, onDone }: { w: OrderWindow; role: Role; onDone: (m: string) => void }) {
  const [days, setDays] = useState(7);
  const next = addDays(w.closesAt, days);
  return (
    <>
      <Text className="text-sm text-zinc-600">
        Window {w.number} closes {fmtDate(w.closesAt)} ({daysBetween(TODAY, w.closesAt)}d left). Extending sends no SMS; the Storefront shows the new close date.
      </Text>
      <View className="flex-row gap-2">
        {[3, 7, 14].map((d) => (
          <Pressable key={d} onPress={() => setDays(d)} className={`flex-1 items-center rounded-xl border py-3 ${d === days ? "border-[#6d28d9] bg-violet-50" : "border-zinc-300"}`}>
            <Text className={`text-base font-bold ${d === days ? "text-[#6d28d9]" : "text-zinc-700"}`}>+{d} days</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center justify-between rounded-xl bg-zinc-50 p-3">
        <Text className="text-sm text-zinc-500 line-through">{fmtDate(w.closesAt)}</Text>
        <Text className="text-zinc-400">→</Text>
        <Text className="text-lg font-extrabold text-zinc-900">Closes {fmtDate(next)}</Text>
      </View>
      {w.expectedFrom && <Text className="text-xs text-[#b45309]">Expected arrival is still {fmtRange(w.expectedFrom, w.expectedTo)}. Update tracking if that moves.</Text>}
      <Primary
        label={`Extend to ${fmtDate(next)}`}
        onPress={() => {
          saveWindow({ ...w, closesAt: next }, ME[role], `extended to ${next}:`);
          onDone(`Window ${w.number} now closes ${fmtDate(next)}`);
        }}
      />
    </>
  );
}

function CloseSheet({ w, p, role, onDone }: { w: OrderWindow; p: Product; role: Role; onDone: (m: string) => void }) {
  const t = windowTotals(w);
  return (
    <>
      <Text className="text-sm text-zinc-700">
        Close <Text className="font-bold">{p.name} · Window {w.number}</Text> today instead of {fmtDate(w.closesAt)}? The Storefront stops taking Pre-orders straight away.
      </Text>
      <View className="flex-row gap-2">
        <Stat label="Pre-orders" value={`${w.preorders}`} />
        <Stat label="Units" value={`${t.ordered}`} />
        <Stat label="Days cut" value={`${t.daysLeft}`} />
      </View>
      <View className="rounded-xl bg-zinc-50 p-3">
        <Text className="text-sm text-zinc-600">📵 No SMS is sent on closing. Customers hear from you at the next stage, "Ordered from supplier".</Text>
      </View>
      <Text className="text-xs text-zinc-500">Can't be reopened. A new window can be opened afterwards.</Text>
      <Primary
        tone="dark"
        label="Close window now"
        onPress={() => {
          saveWindow(
            { ...w, stage: "Closed", closesAt: TODAY, history: [...w.history, { stage: "Closed", at: TODAY, by: ME[role], note: "Closed early" }] },
            ME[role],
            "closed early",
          );
          onDone(`Window ${w.number} closed. No SMS sent.`);
        }}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-zinc-200 py-2">
      <Text className="text-xl font-extrabold text-zinc-900">{value}</Text>
      <Text className="text-[10px] font-semibold uppercase text-zinc-400">{label}</Text>
    </View>
  );
}

// ---------- tracking ----------

function TrackSheet({ w, p, role, onDone }: { w: OrderWindow; p: Product; role: Role; onDone: (m: string) => void }) {
  const ahead = STAGES.slice(STAGES.indexOf(w.stage) + 1).filter((s) => s !== "Closed" || w.stage === "Open");
  // From Open, closing is "Close now"; tracking moves start at Closed.
  const forward = w.stage === "Open" ? [] : ahead;
  const [stage, setStage] = useState<TrackingStage>(w.stage === "Open" ? w.stage : (nextStage(w.stage) ?? w.stage));
  const [from, setFrom] = useState(w.expectedFrom ?? "");
  const [to, setTo] = useState(w.expectedTo ?? "");
  const [note, setNote] = useState("");
  const [sq, setSq] = useState<Record<string, string>>(Object.fromEntries(w.offers.map((o) => [o.variantId, String(o.storeQuantity ?? 0)])));

  const stageChanged = stage !== w.stage;
  const datesChanged = (from || undefined) !== w.expectedFrom || (to || undefined) !== w.expectedTo;
  const texts = stageChanged || datesChanged || note.trim().length > 0;
  const sms = trackingSms(p, w, stage, from || undefined, to || undefined, note.trim() || undefined);

  return (
    <>
      <Text className="text-xs font-semibold uppercase text-zinc-500">Stage</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {STAGES.map((s) => {
          const past = STAGES.indexOf(s) < STAGES.indexOf(w.stage);
          const current = s === w.stage;
          const allowed = current || forward.includes(s);
          const on = s === stage;
          return (
            <Pressable
              key={s}
              disabled={!allowed}
              onPress={() => setStage(s)}
              className={`rounded-full border px-3 py-1.5 ${on ? "border-[#6d28d9] bg-[#6d28d9]" : allowed ? "border-zinc-300 bg-white" : "border-zinc-200 bg-zinc-100"}`}
            >
              <Text className={`text-xs font-semibold ${on ? "text-white" : allowed ? "text-zinc-700" : "text-zinc-400"}`}>
                {past ? "✓ " : ""}
                {s}
                {current ? " (now)" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {w.stage === "Open" && <Text className="text-xs text-zinc-500">Still open: use “Close now” to move on. You can change the expected dates here.</Text>}

      <View className="flex-row gap-2">
        <Field label="Expected from" value={from} onChange={setFrom} placeholder="2026-11-28" />
        <Field label="Expected to" value={to} onChange={setTo} placeholder="2026-12-05" />
      </View>
      <Field label="Note to Customers (optional)" value={note} onChange={setNote} placeholder="e.g. Container left Guangzhou" width="w-full" />

      {stage === "Ordered from supplier" && stageChanged && (
        <View className="gap-2 rounded-xl border border-zinc-200 p-3">
          <Text className="text-xs font-bold uppercase text-zinc-500">Store Quantity per Variant</Text>
          <Text className="text-xs text-zinc-500">Extra units to sell from Stock. Supplier order = Pre-ordered + Store Quantity.</Text>
          {w.offers.map((o) => {
            const v = p.variants.find((x) => x.id === o.variantId);
            const extra = num(sq[o.variantId] ?? "0") ?? 0;
            return (
              <View key={o.variantId} className="flex-row items-center gap-2">
                <Text className="flex-1 text-sm text-zinc-700">{v ? variantLabel(v) : "?"}</Text>
                <Text className="w-14 text-right text-xs text-zinc-500">{o.ordered} pre</Text>
                <TextInput
                  value={sq[o.variantId]}
                  onChangeText={(s) => setSq({ ...sq, [o.variantId]: s })}
                  keyboardType="number-pad"
                  className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-center text-sm"
                />
                <Text className="w-14 text-right text-xs font-semibold text-zinc-800">= {o.ordered + extra}</Text>
              </View>
            );
          })}
        </View>
      )}
      {stage === "Arrived" && stageChanged && (
        <Text className="rounded-lg bg-zinc-50 p-2 text-xs text-zinc-500">Next: record arrived units per Variant and confirm the Shipping Fee (not in this prototype).</Text>
      )}

      <View className="rounded-xl bg-[#ecfdf5] p-3">
        <Text className="mb-1 text-[11px] font-bold uppercase text-[#047857]">
          {texts ? `SMS to ${w.preorders} Customers` : "No SMS (nothing changed)"}
        </Text>
        <Text className={`text-sm ${texts ? "text-zinc-800" : "text-zinc-400"}`}>{sms}</Text>
        <Text className="mt-1 text-[10px] text-zinc-400">{sms.length} chars · {Math.ceil(sms.length / 160)} SMS each</Text>
      </View>

      <Primary
        disabled={!texts}
        label={texts ? `Text ${w.preorders} Customers` : "Nothing to send"}
        onPress={() => {
          const offers: WindowOffer[] =
            stage === "Ordered from supplier" && stageChanged ? w.offers.map((o) => ({ ...o, storeQuantity: num(sq[o.variantId] ?? "0") ?? 0 })) : w.offers;
          saveWindow(
            {
              ...w,
              offers,
              stage,
              expectedFrom: from || undefined,
              expectedTo: to || undefined,
              note: note.trim() || w.note,
              history: [
                ...w.history,
                { stage, at: TODAY, by: ME[role], expectedFrom: from || undefined, expectedTo: to || undefined, note: note.trim() || undefined, smsTo: w.preorders },
              ],
            },
            ME[role],
            stageChanged ? `moved to ${stage}:` : "updated dates on",
          );
          onDone(`Texted ${w.preorders} Customers · ${stage}`);
        }}
      />
    </>
  );
}

// ---------- offer editor (shared by Edit offer and New) ----------

function OfferRows({ p, w, setW, role }: { p: Product; w: OrderWindow; setW: (w: OrderWindow) => void; role: Role }) {
  const live = p.variants.filter((v) => !v.archived);
  return (
    <View className="overflow-hidden rounded-xl border border-zinc-200">
      <View className="flex-row bg-zinc-50 px-3 py-1.5">
        <Text className="flex-1 text-[10px] font-bold uppercase text-zinc-500">Variant</Text>
        <Text className="w-24 text-[10px] font-bold uppercase text-zinc-500">Pre-order price</Text>
        <Text className="w-12 text-center text-[10px] font-bold uppercase text-zinc-500">Cap</Text>
      </View>
      {live.map((v) => {
        const o = w.offers.find((x) => x.variantId === v.id);
        const update = (patch: Partial<WindowOffer>) => setW({ ...w, offers: w.offers.map((x) => (x.variantId === v.id ? { ...x, ...patch } : x)) });
        const locked = (o?.ordered ?? 0) > 0;
        return (
          <View key={v.id} className="flex-row items-center gap-2 border-t border-zinc-100 px-3 py-2">
            <Switch
              value={!!o}
              disabled={locked}
              trackColor={{ true: PURPLE, false: "#d4d4d8" }}
              onValueChange={(on) =>
                setW({ ...w, offers: on ? [...w.offers, { variantId: v.id, ordered: 0 }] : w.offers.filter((x) => x.variantId !== v.id) })
              }
            />
            <View className="flex-1">
              <Text className={`text-sm ${o ? "text-zinc-900" : "text-zinc-400"}`} numberOfLines={1}>
                {variantLabel(v)}
              </Text>
              <Text className="text-[10px] text-zinc-400">
                {v.sku}
                {locked ? ` · ${o!.ordered} ordered` : ""}
                {v.storePrice != null ? ` · Store ${ghs(v.storePrice)}` : ""}
              </Text>
            </View>
            {o ? (
              role === "owner" ? (
                <TextInput
                  defaultValue={o.preorderPrice != null ? String(o.preorderPrice / 100) : ""}
                  onChangeText={(s) => update({ preorderPrice: parseGhs(s) })}
                  placeholder="GH₵"
                  keyboardType="decimal-pad"
                  className={`w-24 rounded-lg border px-2 py-1 text-sm ${o.preorderPrice == null ? "border-[#d97706] bg-amber-50" : "border-zinc-300"}`}
                />
              ) : (
                <View className="w-24 rounded-lg bg-zinc-100 px-2 py-1">
                  <Text className={`text-xs ${o.preorderPrice == null ? "text-[#b45309]" : "text-zinc-600"}`}>
                    {o.preorderPrice == null ? "🔒 Owner sets" : `🔒 ${ghs(o.preorderPrice)}`}
                  </Text>
                </View>
              )
            ) : (
              <View className="w-24" />
            )}
            {o ? (
              <TextInput
                defaultValue={o.cap != null ? String(o.cap) : ""}
                onChangeText={(s) => update({ cap: num(s) })}
                placeholder="∞"
                keyboardType="number-pad"
                className="w-12 rounded-lg border border-zinc-300 px-1 py-1 text-center text-sm"
              />
            ) : (
              <View className="w-12" />
            )}
          </View>
        );
      })}
    </View>
  );
}

function openIt(w: OrderWindow, p: Product, role: Role, what: string) {
  if (p.status === "Draft") saveProduct({ ...p, status: "Published" }, ME[role]);
  saveWindow({ ...w, draft: false, stage: "Open", history: [...w.history, { stage: "Open", at: TODAY, by: ME[role] }] }, ME[role], what);
}

function OfferSheet({ w: initial, p, role, onDone }: { w: OrderWindow; p: Product; role: Role; onDone: (m: string) => void }) {
  const [w, setW] = useState(initial);
  const blockers = w.draft ? openBlockers(w, p) : w.offers.some((o) => o.preorderPrice == null) ? ["Every offered Variant needs a Pre-order price (Owner)"] : [];
  return (
    <>
      <Text className="text-sm text-zinc-600">
        {p.name} · Window {w.number}
        {w.draft ? " (draft)" : ` · ${w.preorders} Pre-orders so far`}. Variants with orders can't be removed.
      </Text>
      <OfferRows p={p} w={w} setW={setW} role={role} />
      {role === "staff" && <Text className="text-xs text-zinc-500">🔒 Pre-order prices are set by the Owner. You can change what's offered and the caps.</Text>}
      {w.draft && <Blockers items={blockers} />}
      {w.draft && p.status === "Draft" && blockers.length === 0 && (
        <Text className="text-xs font-semibold text-[#6d28d9]">Opening this window also publishes {p.name}.</Text>
      )}
      {w.draft ? (
        <View className="gap-2">
          <Primary label="Open window" disabled={blockers.length > 0} onPress={() => (openIt(w, p, role, "opened"), onDone(`Window ${w.number} is open`))} />
          <Pressable onPress={() => (saveWindow(w, ME[role], "saved draft"), onDone("Draft saved"))} className="items-center py-2">
            <Text className="text-sm font-semibold text-zinc-600">{role === "staff" ? "Save draft for the Owner" : "Save draft"}</Text>
          </Pressable>
        </View>
      ) : (
        <Primary label="Save offer" disabled={blockers.length > 0} onPress={() => (saveWindow(w, ME[role], "edited offer on"), onDone("Offer saved"))} />
      )}
    </>
  );
}

// ---------- new window ----------

function NewSheet({ role, onDone }: { role: Role; onDone: (m: string) => void }) {
  const { products, windows } = useBO();
  const busy = (p: Product) => windows.some((w) => w.productId === p.id && !w.draft && w.stage === "Open");
  const [pid, setPid] = useState<string | null>(null);
  const [w, setW] = useState<OrderWindow | null>(null);
  const p = products.find((x) => x.id === pid);

  const pick = (x: Product) => {
    setPid(x.id);
    setW(newWindow(x, windows));
  };

  const blockers = w && p ? openBlockers(w, p) : [];
  return (
    <>
      <Text className="text-xs font-semibold uppercase text-zinc-500">Product</Text>
      <View className="gap-1.5">
        {products
          .filter((x) => x.status !== "Archived")
          .map((x) => {
            const b = busy(x);
            const on = x.id === pid;
            return (
              <Pressable
                key={x.id}
                disabled={b}
                onPress={() => pick(x)}
                className={`flex-row items-center gap-3 rounded-xl border p-2 ${on ? "border-[#6d28d9] bg-violet-50" : "border-zinc-200"} ${b ? "opacity-50" : ""}`}
              >
                <View className="h-8 w-8 rounded-lg" style={{ backgroundColor: x.images[0]?.color ?? "#d4d4d8" }} />
                <Text className="flex-1 text-sm font-semibold text-zinc-800">{x.name}</Text>
                <Text className="text-[11px] text-zinc-500">{b ? "already open" : x.status === "Draft" ? "Draft" : `${x.variants.length} Variants`}</Text>
              </Pressable>
            );
          })}
      </View>

      {w && p && (
        <>
          <Text className="mt-1 text-xs font-semibold uppercase text-zinc-500">Window {w.number} · offered Variants</Text>
          <OfferRows p={p} w={w} setW={setW} role={role} />
          <View className="flex-row gap-2">
            <Field label="Opens" value={w.opensAt} onChange={(s) => setW({ ...w, opensAt: s })} />
            <Field label="Closes" value={w.closesAt} onChange={(s) => setW({ ...w, closesAt: s })} />
          </View>
          <View className="flex-row gap-2">
            {[7, 14, 21].map((d) => (
              <Pressable key={d} onPress={() => setW({ ...w, closesAt: addDays(w.opensAt, d) })} className="rounded-full border border-zinc-300 px-3 py-1">
                <Text className="text-xs text-zinc-600">{d} days</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Shipping Fee est. / unit</Text>
              <TextInput
                onChangeText={(s) => setW({ ...w, shippingFeeEstimate: parseGhs(s) })}
                placeholder="GH₵ (optional)"
                keyboardType="decimal-pad"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </View>
            <View className="w-36">
              <Text className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Min. Order Quantity</Text>
              <TextInput
                onChangeText={(s) => setW({ ...w, minimumOrderQuantity: num(s) })}
                placeholder="1"
                keyboardType="number-pad"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </View>
          </View>
          <Text className="text-[11px] text-zinc-500">Minimum counts units across Variants in one Pre-order. The Shipping Fee is confirmed on arrival.</Text>
          <Blockers items={blockers} />
          {p.status === "Draft" && blockers.length === 0 && (
            <Text className="text-xs font-semibold text-[#6d28d9]">Opening this window also publishes {p.name}.</Text>
          )}
          {blockers.length === 0 ? (
            <Primary label={`Open window · closes ${fmtDate(w.closesAt)}`} onPress={() => (openIt(w, p, role, "opened"), onDone(`${p.name} Window ${w.number} is open`))} />
          ) : (
            <Primary
              tone={role === "staff" ? "gold" : "purple"}
              label={role === "staff" ? "Save draft for the Owner" : "Save draft"}
              onPress={() => (saveWindow(w, ME[role], "saved draft"), onDone(role === "staff" ? "Draft saved. The Owner will set prices." : "Draft saved"))}
            />
          )}
        </>
      )}
    </>
  );
}
