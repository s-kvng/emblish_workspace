// PROTOTYPE (wayfinder #15): Order Window variant A, "Detail page + forms".
// A list of windows, a dense detail page with a ⋯ action menu, and full-screen forms
// for opening/editing a window and updating its tracking. Throwaway, never merged.
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

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
} from "./bo-data";

type Screen =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "form"; draft: OrderWindow; isNew: boolean }
  | { kind: "tracking"; id: string };

function stagePill(w: OrderWindow) {
  if (w.draft) return { label: "Draft", cls: "bg-zinc-200", text: "text-zinc-700" };
  const map: Record<TrackingStage, { cls: string; text: string }> = {
    Open: { cls: "bg-emerald-100", text: "text-emerald-800" },
    Closed: { cls: "bg-zinc-200", text: "text-zinc-700" },
    "Ordered from supplier": { cls: "bg-sky-100", text: "text-sky-800" },
    "In transit": { cls: "bg-violet-100", text: "text-violet-800" },
    Arrived: { cls: "bg-amber-100", text: "text-amber-800" },
  };
  return { label: w.stage, ...map[w.stage] };
}

function Pill({ w }: { w: OrderWindow }) {
  const p = stagePill(w);
  return (
    <View className={`rounded-full px-2 py-0.5 ${p.cls}`}>
      <Text className={`text-[10px] font-bold ${p.text}`}>{p.label.toUpperCase()}</Text>
    </View>
  );
}

function Header({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-zinc-200 bg-white px-3 pb-3 pt-12">
      {onBack && (
        <Pressable onPress={onBack} className="pr-2">
          <Text className="text-xl text-zinc-700">‹</Text>
        </Pressable>
      )}
      <View className="flex-1">
        <Text className="text-base font-bold text-zinc-900" numberOfLines={1}>
          {title}
        </Text>
        {sub ? <Text className="text-xs text-zinc-500">{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="mx-3 mt-3 rounded-xl border border-zinc-200 bg-white">
      <View className="flex-row items-center justify-between border-b border-zinc-100 px-3 py-2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</Text>
        {right}
      </View>
      <View className="px-3 py-2">{children}</View>
    </View>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="flex-row items-start justify-between py-1.5">
      <Text className="text-sm text-zinc-600">{label}</Text>
      <View className="items-end">
        <Text className="text-sm font-semibold text-zinc-900">{value}</Text>
        {hint ? <Text className="text-[11px] text-zinc-400">{hint}</Text> : null}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  locked,
  lockText,
  hint,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  numeric?: boolean;
  locked?: boolean;
  lockText?: string;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold text-zinc-600">{label}</Text>
      {locked ? (
        <View className="flex-row items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5">
          <Text className="text-sm">🔒</Text>
          <Text className="text-sm text-zinc-500">{lockText ?? "Owner sets"}</Text>
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#a1a1aa"
          keyboardType={numeric ? "numeric" : "default"}
          multiline={multiline}
          maxLength={maxLength}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900"
          style={multiline ? { minHeight: 64, textAlignVertical: "top" } : undefined}
        />
      )}
      {hint ? <Text className="mt-1 text-[11px] text-zinc-400">{hint}</Text> : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1 ${on ? "border-[#6d28d9] bg-[#6d28d9]" : "border-zinc-300 bg-white"}`}
    >
      <Text className={`text-xs font-semibold ${on ? "text-white" : "text-zinc-700"}`}>{label}</Text>
    </Pressable>
  );
}

function PrimaryBar({ label, onPress, disabled, sub }: { label: string; onPress: () => void; disabled?: boolean; sub?: string }) {
  return (
    <View className="border-t border-zinc-200 bg-white px-3 pb-5 pt-3">
      {sub ? <Text className="mb-2 text-center text-[11px] text-zinc-500">{sub}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={onPress}
        className={`items-center rounded-xl py-3.5 ${disabled ? "bg-zinc-300" : "bg-[#6d28d9]"}`}
      >
        <Text className="text-sm font-bold text-white">{label}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- list

function WindowList({
  role,
  onOpen,
  onNew,
}: {
  role: Role;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { products, windows, log } = useBO();
  const prod = (id: string) => products.find((p) => p.id === id)!;
  const groups: { title: string; items: OrderWindow[] }[] = [
    { title: "Open", items: windows.filter((w) => !w.draft && w.stage === "Open") },
    { title: "Drafts", items: windows.filter((w) => w.draft) },
    { title: "On the way", items: windows.filter((w) => !w.draft && w.stage !== "Open" && w.stage !== "Arrived") },
    { title: "Arrived", items: windows.filter((w) => !w.draft && w.stage === "Arrived") },
  ];
  return (
    <View className="flex-1 bg-zinc-100">
      <Header
        title="Order Windows"
        sub={`Signed in as ${ME[role]}`}
        right={
          <Pressable onPress={onNew} className="rounded-lg bg-[#6d28d9] px-3 py-2">
            <Text className="text-xs font-bold text-white">+ Open a window</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <View key={g.title}>
              <Text className="mx-4 mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                {g.title} · {g.items.length}
              </Text>
              <View className="mx-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {g.items.map((w, i) => {
                  const p = prod(w.productId);
                  const t = windowTotals(w);
                  const img = p.images[0];
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => onOpen(w.id)}
                      className={`flex-row items-center gap-3 px-3 py-3 ${i ? "border-t border-zinc-100" : ""}`}
                    >
                      <View className="h-10 w-10 rounded-lg" style={{ backgroundColor: img?.color ?? "#d4d4d8" }} />
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="flex-1 text-sm font-semibold text-zinc-900" numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Pill w={w} />
                        </View>
                        <Text className="mt-0.5 text-xs text-zinc-500">
                          Window {w.number} ·{" "}
                          {w.stage === "Open"
                            ? w.draft
                              ? `opens ${fmtDate(w.opensAt)}`
                              : `closes ${fmtDate(w.closesAt)} (${t.daysLeft}d) · ${t.ordered} units`
                            : `expected ${fmtRange(w.expectedFrom, w.expectedTo)}`}
                        </Text>
                      </View>
                      <Text className="text-lg text-zinc-300">›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        {log.length ? (
          <View className="mx-4 mt-6">
            <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">This session</Text>
            {log.map((l, i) => (
              <Text key={i} className="text-[11px] text-zinc-500">
                • {l}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PickProduct({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (p: Product) => void;
}) {
  const { products, windows } = useBO();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/40">
        <Pressable className="rounded-t-2xl bg-white px-4 pb-8 pt-4">
          <Text className="text-base font-bold text-zinc-900">Open a window for…</Text>
          <Text className="mb-3 text-xs text-zinc-500">One open Order Window per Product at a time.</Text>
          {products
            .filter((p) => p.status !== "Archived")
            .map((p) => {
              const busy = windows.find((w) => w.productId === p.id && w.stage === "Open");
              return (
                <Pressable
                  key={p.id}
                  disabled={!!busy}
                  onPress={() => onPick(p)}
                  className={`flex-row items-center gap-3 border-t border-zinc-100 py-3 ${busy ? "opacity-50" : ""}`}
                >
                  <View className="h-9 w-9 rounded-lg" style={{ backgroundColor: p.images[0]?.color ?? "#d4d4d8" }} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-zinc-900">{p.name}</Text>
                    <Text className="text-xs text-zinc-500">
                      {busy
                        ? `Window ${busy.number} is ${busy.draft ? "a draft" : "open"}. Close it first.`
                        : `${p.variants.filter((v) => !v.archived).length} Variants · ${p.status}`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail

function WindowDetail({
  role,
  id,
  onBack,
  onEdit,
  onTracking,
}: {
  role: Role;
  id: string;
  onBack: () => void;
  onEdit: (w: OrderWindow) => void;
  onTracking: () => void;
}) {
  const { products, windows } = useBO();
  const w = windows.find((x) => x.id === id)!;
  const p = products.find((x) => x.id === w.productId)!;
  const t = windowTotals(w);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "close" | "extend">(null);
  const [extendBy, setExtendBy] = useState(7);
  const showStore = STAGES.indexOf(w.stage) >= STAGES.indexOf("Ordered from supplier");
  const isOpen = w.stage === "Open" && !w.draft;
  const vById = (vid: string) => p.variants.find((v) => v.id === vid)!;

  const closeEarly = () => {
    saveWindow(
      {
        ...w,
        stage: "Closed",
        closesAt: TODAY,
        history: [...w.history, { stage: "Closed", at: TODAY, by: ME[role], note: "Closed early" }],
      },
      ME[role],
      "closed early",
    );
    setDialog(null);
  };
  const extend = () => {
    saveWindow({ ...w, closesAt: addDays(w.closesAt, extendBy) }, ME[role], `extended by ${extendBy} days`);
    setDialog(null);
  };

  const actions: { label: string; sub: string; on: () => void; show: boolean; danger?: boolean }[] = [
    { label: "Update tracking", sub: "Stage, expected dates, note. Texts every Customer.", on: onTracking, show: !w.draft && w.stage !== "Open" && w.stage !== "Arrived" },
    { label: "Edit window", sub: "Variants, caps, dates, fees", on: () => onEdit(w), show: w.stage === "Open" },
    { label: "Extend", sub: `Currently closes ${fmtDate(w.closesAt)}`, on: () => setDialog("extend"), show: isOpen },
    { label: "Close early", sub: "Stop taking Pre-orders now", on: () => setDialog("close"), show: isOpen, danger: true },
  ];

  return (
    <View className="flex-1 bg-zinc-100">
      <Header
        title={p.name}
        sub={`Window ${w.number}`}
        onBack={onBack}
        right={
          <Pressable onPress={() => setMenu(true)} className="rounded-lg border border-zinc-300 px-3 py-1.5">
            <Text className="text-base font-bold text-zinc-700">⋯</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mx-3 mt-3 flex-row items-center gap-2">
          <Pill w={w} />
          <Text className="text-xs text-zinc-500">
            {w.draft
              ? "Not open yet. Customers can't see it."
              : isOpen
                ? `Closes ${fmtDate(w.closesAt)} · ${t.daysLeft} days left`
                : `Expected ${fmtRange(w.expectedFrom, w.expectedTo)}`}
          </Text>
        </View>

        <View className="mx-3 mt-3 flex-row overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {[
            { k: "Units ordered", v: String(t.ordered) },
            { k: "Customers", v: String(w.preorders) },
            { k: isOpen ? "Days left" : "Closed", v: isOpen ? String(t.daysLeft) : fmtDate(w.closesAt) },
            { k: "Min. order", v: w.minimumOrderQuantity ? `${w.minimumOrderQuantity} units` : "None" },
          ].map((s, i) => (
            <View key={s.k} className={`flex-1 items-center py-3 ${i ? "border-l border-zinc-100" : ""}`}>
              <Text className="text-lg font-bold text-zinc-900">{s.v}</Text>
              <Text className="text-[10px] text-zinc-500">{s.k}</Text>
            </View>
          ))}
        </View>

        <Section title={`Offered Variants · ${w.offers.length} of ${p.variants.filter((v) => !v.archived).length}`}>
          <View className="flex-row border-b border-zinc-100 pb-1">
            <Text className="flex-[2] text-[10px] font-bold text-zinc-400">VARIANT</Text>
            <Text className="flex-1 text-right text-[10px] font-bold text-zinc-400">PRICE</Text>
            <Text className="flex-[1.4] text-right text-[10px] font-bold text-zinc-400">ORDERED</Text>
            {showStore && <Text className="w-12 text-right text-[10px] font-bold text-zinc-400">STORE</Text>}
          </View>
          {w.offers.map((o) => {
            const v = vById(o.variantId);
            const soldOut = o.cap != null && o.ordered >= o.cap;
            const pct = o.cap ? Math.min(1, o.ordered / o.cap) : 0;
            return (
              <View key={o.variantId} className="flex-row items-center border-b border-zinc-50 py-2">
                <View className="flex-[2]">
                  <Text className="text-sm font-medium text-zinc-900">{variantLabel(v)}</Text>
                  <Text className="text-[10px] text-zinc-400">{v.sku}</Text>
                </View>
                <Text className={`flex-1 text-right text-sm ${o.preorderPrice == null ? "text-[#d97706]" : "text-zinc-900"}`}>
                  {o.preorderPrice == null ? "Unpriced" : ghs(o.preorderPrice)}
                </Text>
                <View className="flex-[1.4] items-end">
                  <View className="flex-row items-center gap-1">
                    {soldOut && (
                      <View className="rounded bg-red-100 px-1">
                        <Text className="text-[9px] font-bold text-red-700">SOLD OUT</Text>
                      </View>
                    )}
                    <Text className="text-sm text-zinc-900">
                      {o.ordered}
                      {o.cap != null ? <Text className="text-zinc-400"> / {o.cap}</Text> : null}
                    </Text>
                  </View>
                  {o.cap != null && (
                    <View className="mt-1 h-1 w-16 overflow-hidden rounded bg-zinc-100">
                      <View
                        className={soldOut ? "h-1 bg-red-500" : "h-1 bg-[#6d28d9]"}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </View>
                  )}
                </View>
                {showStore && <Text className="w-12 text-right text-sm text-zinc-900">{o.storeQuantity ?? 0}</Text>}
              </View>
            );
          })}
          {!w.offers.some((o) => o.cap != null) ? (
            <Text className="mt-1 text-[11px] text-zinc-400">No caps: every Variant takes unlimited Pre-orders.</Text>
          ) : null}
          {showStore && (
            <Text className="mt-1 text-[11px] text-zinc-400">
              Supplier order = {t.ordered} pre-ordered + {w.offers.reduce((s, o) => s + (o.storeQuantity ?? 0), 0)} Store Quantity
            </Text>
          )}
        </Section>

        <Section title="Dates & fees">
          <Row label="Opens" value={fmtDate(w.opensAt)} />
          <Row label="Closes" value={fmtDate(w.closesAt)} hint={`${daysBetween(w.opensAt, w.closesAt)}-day window`} />
          <Row
            label="Shipping Fee estimate"
            value={w.shippingFeeEstimate == null ? "Not shown" : `${ghs(w.shippingFeeEstimate)} / unit`}
            hint="Confirmed on arrival"
          />
          <Row
            label="Minimum Order Quantity"
            value={w.minimumOrderQuantity ? `${w.minimumOrderQuantity} units` : "None"}
            hint="Counted across Variants"
          />
        </Section>

        <Section
          title="Tracking"
          right={
            !w.draft && w.stage !== "Open" && w.stage !== "Arrived" ? (
              <Pressable onPress={onTracking}>
                <Text className="text-xs font-bold text-[#6d28d9]">Update</Text>
              </Pressable>
            ) : null
          }
        >
          <View className="mb-2 flex-row gap-1">
            {STAGES.map((s, i) => {
              const done = i <= STAGES.indexOf(w.stage) && !w.draft;
              return <View key={s} className={`h-1.5 flex-1 rounded ${done ? "bg-[#6d28d9]" : "bg-zinc-200"}`} />;
            })}
          </View>
          <Row label="Stage" value={w.draft ? "Not open" : w.stage} />
          <Row label="Expected" value={fmtRange(w.expectedFrom, w.expectedTo)} />
          {w.note ? <Text className="mt-1 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700">“{w.note}”</Text> : null}
          {isOpen ? (
            <Text className="mt-2 text-[11px] text-zinc-400">
              Closes automatically on {fmtDate(w.closesAt)}. Tracking updates start from Closed.
            </Text>
          ) : null}
          <Text className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">History</Text>
          {w.history.length === 0 ? <Text className="text-xs text-zinc-400">Nothing yet.</Text> : null}
          {[...w.history].reverse().map((h, i) => (
            <View key={i} className="flex-row gap-2 border-t border-zinc-50 py-1.5">
              <Text className="w-12 text-[11px] text-zinc-400">{fmtDate(h.at)}</Text>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-zinc-800">
                  {h.stage}
                  {h.note ? <Text className="font-normal text-zinc-500"> · {h.note}</Text> : null}
                </Text>
                <Text className="text-[10px] text-zinc-400">
                  {h.by}
                  {h.expectedFrom || h.expectedTo ? ` · expected ${fmtRange(h.expectedFrom, h.expectedTo)}` : ""}
                  {h.smsTo ? ` · texted ${h.smsTo} Customers` : ""}
                </Text>
              </View>
            </View>
          ))}
        </Section>

        {w.draft ? (
          <Pressable onPress={() => onEdit(w)} className="mx-3 mt-4 items-center rounded-xl bg-[#6d28d9] py-3.5">
            <Text className="text-sm font-bold text-white">Continue setting up</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* ⋯ action menu */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable onPress={() => setMenu(false)} className="flex-1 justify-end bg-black/40">
          <View className="mx-3 mb-6 overflow-hidden rounded-2xl bg-white">
            {actions.filter((a) => a.show).length === 0 ? (
              <Text className="p-4 text-sm text-zinc-500">No actions at this stage.</Text>
            ) : null}
            {actions
              .filter((a) => a.show)
              .map((a, i) => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    setMenu(false);
                    a.on();
                  }}
                  className={`px-4 py-3.5 ${i ? "border-t border-zinc-100" : ""}`}
                >
                  <Text className={`text-sm font-semibold ${a.danger ? "text-red-600" : "text-zinc-900"}`}>{a.label}</Text>
                  <Text className="text-xs text-zinc-500">{a.sub}</Text>
                </Pressable>
              ))}
          </View>
        </Pressable>
      </Modal>

      {/* Confirm dialogs */}
      <Modal visible={dialog != null} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-2xl bg-white p-4">
            {dialog === "close" ? (
              <>
                <Text className="text-base font-bold text-zinc-900">Close Window {w.number} now?</Text>
                <Text className="mt-2 text-sm text-zinc-600">
                  It stops taking Pre-orders for all {w.offers.length} Variants right away, {t.daysLeft} days early. The{" "}
                  {w.preorders} Customers who already ordered keep their Pre-orders.
                </Text>
                <Text className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-[#92400e]">
                  No SMS is sent for closing. Customers next hear from you at “Ordered from supplier”.
                </Text>
                <View className="mt-4 flex-row gap-2">
                  <Pressable onPress={() => setDialog(null)} className="flex-1 items-center rounded-xl border border-zinc-300 py-3">
                    <Text className="text-sm font-semibold text-zinc-700">Keep open</Text>
                  </Pressable>
                  <Pressable onPress={closeEarly} className="flex-1 items-center rounded-xl bg-red-600 py-3">
                    <Text className="text-sm font-bold text-white">Close now</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text className="text-base font-bold text-zinc-900">Extend Window {w.number}</Text>
                <Text className="mt-1 text-sm text-zinc-600">Closes {fmtDate(w.closesAt)} now.</Text>
                <View className="mt-3 flex-row gap-2">
                  {[3, 7, 14].map((n) => (
                    <Chip key={n} label={`+${n} days`} on={extendBy === n} onPress={() => setExtendBy(n)} />
                  ))}
                </View>
                <Text className="mt-3 text-sm text-zinc-900">
                  New close date: <Text className="font-bold">{fmtDate(addDays(w.closesAt, extendBy))}</Text>
                </Text>
                <Text className="mt-1 text-[11px] text-zinc-400">
                  The Storefront countdown updates. Expected arrival dates don't move by themselves.
                </Text>
                <View className="mt-4 flex-row gap-2">
                  <Pressable onPress={() => setDialog(null)} className="flex-1 items-center rounded-xl border border-zinc-300 py-3">
                    <Text className="text-sm font-semibold text-zinc-700">Cancel</Text>
                  </Pressable>
                  <Pressable onPress={extend} className="flex-1 items-center rounded-xl bg-[#6d28d9] py-3">
                    <Text className="text-sm font-bold text-white">Extend</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------- open / edit form

function WindowForm({
  role,
  initial,
  isNew,
  onDone,
}: {
  role: Role;
  initial: OrderWindow;
  isNew: boolean;
  onDone: (id?: string) => void;
}) {
  const { products } = useBO();
  const p = products.find((x) => x.id === initial.productId)!;
  const [w, setW] = useState<OrderWindow>(initial);
  const [text, setText] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    for (const o of initial.offers) {
      t[`price_${o.variantId}`] = o.preorderPrice != null ? String(o.preorderPrice / 100) : "";
      t[`cap_${o.variantId}`] = o.cap != null ? String(o.cap) : "";
    }
    t.fee = initial.shippingFeeEstimate != null ? String(initial.shippingFeeEstimate / 100) : "";
    t.moq = initial.minimumOrderQuantity != null ? String(initial.minimumOrderQuantity) : "";
    return t;
  });
  const owner = role === "owner";
  const live = p.variants.filter((v) => !v.archived);
  const alreadyOpen = !initial.draft && initial.stage === "Open";

  const toggle = (vid: string) => {
    const on = w.offers.some((o) => o.variantId === vid);
    const existing = w.offers.find((o) => o.variantId === vid);
    if (on && existing && existing.ordered > 0) return; // can't drop a Variant with Pre-orders
    setW({
      ...w,
      offers: on ? w.offers.filter((o) => o.variantId !== vid) : [...w.offers, { variantId: vid, ordered: 0 }],
    });
  };
  const setOffer = (vid: string, key: "price" | "cap", val: string) => {
    setText({ ...text, [`${key}_${vid}`]: val });
    setW({
      ...w,
      offers: w.offers.map((o) =>
        o.variantId !== vid
          ? o
          : key === "price"
            ? { ...o, preorderPrice: parseGhs(val) }
            : { ...o, cap: val.trim() ? Number.parseInt(val, 10) || undefined : undefined },
      ),
    });
  };

  const blockers = openBlockers(w, p);
  const priceOnly = blockers.length > 0 && blockers.every((b) => b.includes("(Owner)"));
  const staffDraft = !owner && priceOnly;

  const commit = (open: boolean) => {
    const opened = open && !alreadyOpen;
    const next: OrderWindow = {
      ...w,
      draft: open ? false : w.draft,
      history: opened ? [...w.history, { stage: "Open", at: TODAY, by: ME[role] }] : w.history,
    };
    if (opened && p.status === "Draft") saveProduct({ ...p, status: "Published" }, ME[role]);
    saveWindow(next, ME[role], opened ? "opened" : alreadyOpen ? "edited" : "saved draft of");
    onDone(next.id);
  };

  return (
    <View className="flex-1 bg-zinc-100">
      <Header
        title={isNew ? `Open Window ${w.number}` : `Edit Window ${w.number}`}
        sub={p.name}
        onBack={() => onDone(isNew ? undefined : initial.id)}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Section title="Variants offered">
          <Text className="mb-2 text-[11px] text-zinc-500">
            Tick the Variants Customers can Pre-order in this window. {owner ? "" : "The Owner sets Pre-order prices."}
          </Text>
          {live.map((v) => {
            const o = w.offers.find((x) => x.variantId === v.id);
            return (
              <View key={v.id} className="border-t border-zinc-100 py-2">
                <Pressable onPress={() => toggle(v.id)} className="flex-row items-center gap-3">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border ${o ? "border-[#6d28d9] bg-[#6d28d9]" : "border-zinc-300 bg-white"}`}
                  >
                    {o ? <Text className="text-xs font-bold text-white">✓</Text> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-zinc-900">{variantLabel(v)}</Text>
                    <Text className="text-[10px] text-zinc-400">
                      {v.sku} · Store Price {ghs(v.storePrice)}
                      {o && o.ordered ? ` · ${o.ordered} pre-ordered` : ""}
                    </Text>
                  </View>
                </Pressable>
                {o ? (
                  <View className="mt-2 flex-row gap-2 pl-8">
                    <View className="flex-1">
                      <Field
                        label="Pre-order price (GH₵)"
                        value={text[`price_${v.id}`] ?? ""}
                        onChange={(t) => setOffer(v.id, "price", t)}
                        placeholder="e.g. 290"
                        numeric
                        locked={!owner}
                        lockText={o.preorderPrice != null ? `${ghs(o.preorderPrice)} · Owner sets` : "Owner sets"}
                      />
                    </View>
                    <View className="w-24">
                      <Field
                        label="Cap"
                        value={text[`cap_${v.id}`] ?? ""}
                        onChange={(t) => setOffer(v.id, "cap", t)}
                        placeholder="No cap"
                        numeric
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Section>

        <Section title="Dates">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field
                label="Opens"
                value={w.opensAt}
                onChange={(t) => setW({ ...w, opensAt: t })}
                placeholder="YYYY-MM-DD"
                locked={alreadyOpen}
                lockText={`${fmtDate(w.opensAt)} · already open`}
              />
            </View>
            <View className="flex-1">
              <Field label="Closes" value={w.closesAt} onChange={(t) => setW({ ...w, closesAt: t })} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {[7, 14, 21, 30].map((n) => (
              <Chip
                key={n}
                label={`${n} days`}
                on={daysBetween(w.opensAt, w.closesAt) === n}
                onPress={() => setW({ ...w, closesAt: addDays(w.opensAt, n) })}
              />
            ))}
          </View>
          <Text className="mt-2 text-[11px] text-zinc-400">
            {fmtDate(w.opensAt)} → {fmtDate(w.closesAt)} · closes automatically at the end of the day.
          </Text>
        </Section>

        <Section title="Fees & minimum">
          <Field
            label="Shipping Fee estimate per unit (GH₵, optional)"
            value={text.fee ?? ""}
            onChange={(t) => {
              setText({ ...text, fee: t });
              setW({ ...w, shippingFeeEstimate: t.trim() ? parseGhs(t) : undefined });
            }}
            placeholder="Not shown to Customers"
            numeric
            hint="Shown on the product page as an estimate. You confirm the real fee on arrival."
          />
          <Field
            label="Minimum Order Quantity (optional)"
            value={text.moq ?? ""}
            onChange={(t) => {
              setText({ ...text, moq: t });
              setW({ ...w, minimumOrderQuantity: t.trim() ? Number.parseInt(t, 10) || undefined : undefined });
            }}
            placeholder="No minimum"
            numeric
            hint="Fewest units per Pre-order, counted across Variants (2 Gold + 1 Green meets 3)."
          />
        </Section>

        {blockers.length ? (
          <View className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <Text className="mb-1 text-xs font-bold text-[#92400e]">
              {alreadyOpen ? "Fix before saving" : "Before this window can open"}
            </Text>
            {blockers.map((b) => (
              <Text key={b} className="text-xs text-[#92400e]">
                • {b}
              </Text>
            ))}
          </View>
        ) : p.status === "Draft" ? (
          <View className="mx-3 mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <Text className="text-xs text-violet-900">
              {p.name} is a Draft. Opening this window publishes it on the Storefront too.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {alreadyOpen ? (
        <PrimaryBar label="Save changes" disabled={blockers.length > 0} onPress={() => commit(true)} />
      ) : staffDraft ? (
        <PrimaryBar
          label="Save draft — Owner sets prices"
          sub="The Owner gets it in their Drafts and opens it once priced."
          onPress={() => commit(false)}
        />
      ) : (
        <View>
          <PrimaryBar
            label={`Open window · closes ${fmtDate(w.closesAt)}`}
            disabled={blockers.length > 0}
            onPress={() => commit(true)}
            sub={blockers.length ? undefined : "Customers can Pre-order straight away. No SMS is sent."}
          />
          <Pressable onPress={() => commit(false)} className="items-center bg-white pb-4">
            <Text className="text-xs font-semibold text-zinc-500">Save as draft</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- tracking form

function TrackingForm({ role, id, onDone }: { role: Role; id: string; onDone: () => void }) {
  const { products, windows } = useBO();
  const w = windows.find((x) => x.id === id)!;
  const p = products.find((x) => x.id === w.productId)!;
  const forward = STAGES.slice(STAGES.indexOf(w.stage));
  const [stage, setStage] = useState<TrackingStage>(nextStage(w.stage) ?? w.stage);
  const [from, setFrom] = useState(w.expectedFrom ?? "");
  const [to, setTo] = useState(w.expectedTo ?? "");
  const [note, setNote] = useState("");
  const [store, setStore] = useState<Record<string, string>>(() =>
    Object.fromEntries(w.offers.map((o) => [o.variantId, String(o.storeQuantity ?? 0)])),
  );
  const changed = stage !== w.stage || from !== (w.expectedFrom ?? "") || to !== (w.expectedTo ?? "") || note.trim() !== "";
  const sms = trackingSms(p, w, stage, from || undefined, to || undefined, note.trim() || undefined);
  const askStore = stage === "Ordered from supplier";

  const save = () => {
    const offers = askStore
      ? w.offers.map((o) => ({ ...o, storeQuantity: Number.parseInt(store[o.variantId] ?? "0", 10) || 0 }))
      : w.offers;
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
          {
            stage,
            at: TODAY,
            by: ME[role],
            expectedFrom: from || undefined,
            expectedTo: to || undefined,
            note: note.trim() || (stage === w.stage ? "Dates changed" : undefined),
            smsTo: w.preorders,
          },
        ],
      },
      ME[role],
      stage === w.stage ? "updated dates on" : `moved to ${stage}:`,
    );
    onDone();
  };

  return (
    <View className="flex-1 bg-zinc-100">
      <Header title="Update tracking" sub={`${p.name} · Window ${w.number}`} onBack={onDone} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Section title="Stage">
          {forward.map((s) => (
            <Pressable key={s} onPress={() => setStage(s)} className="flex-row items-center gap-3 py-2">
              <View
                className={`h-5 w-5 items-center justify-center rounded-full border-2 ${stage === s ? "border-[#6d28d9]" : "border-zinc-300"}`}
              >
                {stage === s ? <View className="h-2.5 w-2.5 rounded-full bg-[#6d28d9]" /> : null}
              </View>
              <Text className="flex-1 text-sm text-zinc-900">{s}</Text>
              {s === w.stage ? <Text className="text-[10px] text-zinc-400">current · dates only</Text> : null}
            </Pressable>
          ))}
          {stage === "Arrived" ? (
            <Text className="mt-1 rounded-lg bg-amber-50 p-2 text-[11px] text-[#92400e]">
              Arrived is where you record arrived units per Variant and confirm the Shipping Fee (not in this prototype).
            </Text>
          ) : null}
        </Section>

        <Section title="Expected arrival">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="From" value={from} onChange={setFrom} placeholder="YYYY-MM-DD" />
            </View>
            <View className="flex-1">
              <Field label="To" value={to} onChange={setTo} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {[7, 14, 21].map((n) => (
              <Chip
                key={n}
                label={`+${n}d`}
                onPress={() => {
                  setFrom(addDays(from || TODAY, n));
                  setTo(addDays(to || addDays(TODAY, 7), n));
                }}
              />
            ))}
          </View>
        </Section>

        {askStore ? (
          <Section title="Store Quantity">
            <Text className="mb-2 text-[11px] text-zinc-500">
              Extra units added to the supplier order to sell In-stock. Editable until arrival.
            </Text>
            {w.offers.map((o) => {
              const v = p.variants.find((x) => x.id === o.variantId)!;
              return (
                <View key={o.variantId} className="flex-row items-center gap-2 border-t border-zinc-100 py-1.5">
                  <Text className="flex-1 text-sm text-zinc-900">{variantLabel(v)}</Text>
                  <Text className="w-20 text-right text-[11px] text-zinc-400">{o.ordered} pre-ordered +</Text>
                  <TextInput
                    value={store[o.variantId]}
                    onChangeText={(t) => setStore({ ...store, [o.variantId]: t })}
                    keyboardType="numeric"
                    className="w-14 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm text-zinc-900"
                  />
                </View>
              );
            })}
          </Section>
        ) : null}

        <Section title="Note to Customers (optional)">
          <Field label="" value={note} onChange={setNote} placeholder="e.g. Container left Guangzhou." multiline maxLength={160} />
          <Text className="-mt-2 text-right text-[10px] text-zinc-400">{note.length}/160</Text>
        </Section>

        <Section title={`SMS preview · to ${w.preorders} Customers`}>
          <View className="self-start rounded-2xl rounded-bl-sm bg-zinc-200 px-3 py-2" style={{ maxWidth: "92%" }}>
            <Text className="text-[13px] text-zinc-900">{sms}</Text>
          </View>
          <Text className="mt-1 text-[10px] text-zinc-400">
            {sms.length} characters · {Math.ceil(sms.length / 160)} SMS each · sent via Arkesel
          </Text>
        </Section>
      </ScrollView>
      <PrimaryBar
        label={`Update & text ${w.preorders} Customers`}
        disabled={!changed}
        onPress={save}
        sub={changed ? undefined : "Change the stage, dates or note to send an update."}
      />
    </View>
  );
}

// ---------------------------------------------------------------- root

export default function WindowA({ role }: { role: Role }) {
  const { windows } = useBO();
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [picking, setPicking] = useState(false);

  return (
    <View className="flex-1 bg-zinc-100">
      {screen.kind === "list" && (
        <WindowList role={role} onOpen={(id) => setScreen({ kind: "detail", id })} onNew={() => setPicking(true)} />
      )}
      {screen.kind === "detail" && (
        <WindowDetail
          role={role}
          id={screen.id}
          onBack={() => setScreen({ kind: "list" })}
          onEdit={(w) => setScreen({ kind: "form", draft: w, isNew: false })}
          onTracking={() => setScreen({ kind: "tracking", id: screen.id })}
        />
      )}
      {screen.kind === "form" && (
        <WindowForm
          role={role}
          initial={screen.draft}
          isNew={screen.isNew}
          onDone={(id) => setScreen(id ? { kind: "detail", id } : { kind: "list" })}
        />
      )}
      {screen.kind === "tracking" && (
        <TrackingForm role={role} id={screen.id} onDone={() => setScreen({ kind: "detail", id: screen.id })} />
      )}
      <PickProduct
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          setScreen({ kind: "form", draft: newWindow(p, windows), isNew: true });
        }}
      />
    </View>
  );
}
