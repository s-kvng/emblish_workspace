// PROTOTYPE (wayfinder #15): Order Window variant B, "Stage timeline".
// The window detail IS a vertical timeline of tracking stages; opening a window is a 4-step wizard.
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import {
  ME,
  STAGES,
  TODAY,
  addDays,
  daysBetween,
  fmtDate,
  fmtRange,
  ghs,
  newWindow,
  openBlockers,
  parseGhs,
  saveProduct,
  saveWindow,
  trackingSms,
  useBO,
  variantLabel,
  windowTotals,
  type OrderWindow,
  type Product,
  type Role,
  type StageEvent,
  type TrackingStage,
} from "./bo-data";

function shortName(p?: Product) {
  return p ? p.name.split(" ").slice(-1)[0] : "?";
}

export default function WindowB({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const [selectedId, setSelectedId] = useState<string>("ow_tote3");
  const [creating, setCreating] = useState(false);

  const selected = windows.find((w) => w.id === selectedId);
  const showWizard = creating || selected?.draft;

  return (
    <View className="flex-1 bg-zinc-100">
      <View className="bg-white border-b border-zinc-200" style={{ paddingTop: 44 }}>
        <View className="px-4 pb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-zinc-900">Order Windows</Text>
          <Text className="text-xs text-zinc-500">{role === "owner" ? ME.owner : ME.staff}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          {windows.map((w) => {
            const p = products.find((x) => x.id === w.productId);
            const active = !creating && w.id === selectedId;
            return (
              <Pressable
                key={w.id}
                onPress={() => {
                  setCreating(false);
                  setSelectedId(w.id);
                }}
                className={`rounded-full px-3 py-1.5 border ${active ? "bg-[#6d28d9] border-[#6d28d9]" : "bg-white border-zinc-300"}`}
              >
                <Text className={`text-xs font-semibold ${active ? "text-white" : "text-zinc-700"}`}>
                  {shortName(p)} · W{w.number}
                  {w.draft ? " draft" : ""}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCreating(true)}
            className={`rounded-full px-3 py-1.5 border border-dashed ${creating ? "bg-[#6d28d9] border-[#6d28d9]" : "border-[#6d28d9]"}`}
          >
            <Text className={`text-xs font-bold ${creating ? "text-white" : "text-[#6d28d9]"}`}>+ New</Text>
          </Pressable>
        </ScrollView>
      </View>

      {showWizard ? (
        <Wizard
          key={creating ? "new" : selectedId}
          role={role}
          initial={creating ? undefined : selected}
          onDone={(id) => {
            setCreating(false);
            setSelectedId(id);
          }}
        />
      ) : selected ? (
        <Timeline key={selected.id} role={role} w={selected} p={products.find((x) => x.id === selected.productId)!} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- timeline

type SheetMode = { kind: "advance"; stage: TrackingStage } | { kind: "dates"; stage: TrackingStage };

function Timeline({ role, w, p }: { role: Role; w: OrderWindow; p: Product }) {
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const cur = STAGES.indexOf(w.stage);
  const t = windowTotals(w);
  const by = ME[role];

  const close = () => {
    saveWindow(
      { ...w, stage: "Closed", closesAt: TODAY, history: [...w.history, { stage: "Closed", at: TODAY, by, note: "Closed early" }] },
      by,
      "closed early",
    );
    setConfirmClose(false);
  };
  const extend = (days: number) => saveWindow({ ...w, closesAt: addDays(w.closesAt, days) }, by, `extended by ${days} days`);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <View className="flex-row items-center gap-3 mb-1">
          <View className="w-11 h-11 rounded-lg" style={{ backgroundColor: p.images[0]?.color ?? "#ccc" }} />
          <View className="flex-1">
            <Text className="text-base font-bold text-zinc-900">{p.name}</Text>
            <Text className="text-xs text-zinc-500">
              Window {w.number} · {fmtDate(w.opensAt)} – {fmtDate(w.closesAt)}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2 mt-2 mb-5">
          <Stat label="Customers" value={String(w.preorders)} />
          <Stat label="Units" value={String(t.ordered)} />
          <Stat label="Ship est." value={w.shippingFeeEstimate ? `${ghs(w.shippingFeeEstimate)}/u` : "—"} />
          <Stat label="Min. qty" value={w.minimumOrderQuantity ? String(w.minimumOrderQuantity) : "—"} />
        </View>

        {STAGES.map((stage, i) => {
          const events = w.history.filter((e) => e.stage === stage);
          const isLast = i === STAGES.length - 1;
          const state = i < cur ? "done" : i === cur ? "current" : i === cur + 1 ? "next" : "future";
          return (
            <View key={stage} className="flex-row">
              {/* rail */}
              <View className="items-center" style={{ width: 28 }}>
                <View
                  className={`w-5 h-5 rounded-full items-center justify-center ${
                    state === "done" ? "bg-[#6d28d9]" : state === "current" ? "bg-white border-4 border-[#6d28d9]" : "bg-white border-2 border-zinc-300"
                  }`}
                >
                  {state === "done" && <Text className="text-white text-[10px] font-bold">✓</Text>}
                </View>
                {!isLast && <View className={`flex-1 ${i < cur ? "bg-[#6d28d9]" : "bg-zinc-300"}`} style={{ width: 2, minHeight: 24 }} />}
              </View>

              <View className="flex-1 pb-4 pl-2">
                {state === "done" && <DoneNode stage={stage} events={events} />}
                {state === "current" && (
                  <View className="bg-white rounded-xl border-2 border-[#6d28d9] p-3 -mt-1">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[15px] font-bold text-zinc-900">{stage}</Text>
                      <Text className="text-[10px] font-bold text-[#6d28d9] bg-violet-100 px-2 py-0.5 rounded-full">NOW</Text>
                    </View>
                    {stage === "Open" ? (
                      <OpenControls w={w} onExtend={extend} onClose={() => setConfirmClose(true)} />
                    ) : (
                      <>
                        <Text className="text-xs text-zinc-500 mt-1">
                          Since {fmtDate(events[0]?.at)} · {events[0]?.by ?? "—"}
                        </Text>
                        <View className="mt-3 bg-zinc-50 rounded-lg p-2.5">
                          <Text className="text-[11px] uppercase text-zinc-500 font-semibold">Expected</Text>
                          <Text className="text-sm font-semibold text-zinc-900">{fmtRange(w.expectedFrom, w.expectedTo)}</Text>
                          {w.note ? <Text className="text-xs text-zinc-600 mt-1">“{w.note}”</Text> : null}
                        </View>
                        {events.length > 1 && (
                          <View className="mt-2">
                            {events.slice(1).map((e, k) => (
                              <Text key={k} className="text-[11px] text-zinc-500">
                                {fmtDate(e.at)} · dates changed to {fmtRange(e.expectedFrom, e.expectedTo)} · texted {e.smsTo ?? 0}
                              </Text>
                            ))}
                          </View>
                        )}
                        {stage === "Ordered from supplier" && <StoreQtyList w={w} p={p} />}
                        <Pressable onPress={() => setSheet({ kind: "dates", stage })} className="mt-3 border border-zinc-300 rounded-lg py-2 items-center">
                          <Text className="text-sm font-semibold text-zinc-800">Change expected dates or note</Text>
                        </Pressable>
                        {stage === "Arrived" && (
                          <Text className="text-xs text-zinc-500 mt-2">
                            Arrived units and the confirmed Shipping Fee are recorded on the arrival screen (not in this prototype).
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                )}
                {state === "next" && (
                  <View className="rounded-xl border-2 border-dashed border-zinc-300 p-3 -mt-1">
                    <Text className="text-[15px] font-semibold text-zinc-500">{stage}</Text>
                    {stage === "Closed" ? (
                      <Text className="text-xs text-zinc-500 mt-1">
                        Closes automatically on {fmtDate(w.closesAt)}. No SMS is sent on closing.
                      </Text>
                    ) : (
                      <Pressable onPress={() => setSheet({ kind: "advance", stage })} className="mt-2 bg-[#6d28d9] rounded-lg py-3 items-center">
                        <Text className="text-white font-bold">Mark as {stage}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {state === "future" && <Text className="text-[15px] text-zinc-400 -mt-0.5">{stage}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal transparent visible={confirmClose} animationType="fade" onRequestClose={() => setConfirmClose(false)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white rounded-2xl p-4 w-full">
            <Text className="text-base font-bold text-zinc-900">Close Window {w.number} now?</Text>
            <Text className="text-sm text-zinc-600 mt-2">
              {p.name} stops taking Pre-orders today instead of {fmtDate(w.closesAt)}. {w.preorders} Customers keep their Pre-orders. No SMS is
              sent.
            </Text>
            <View className="flex-row gap-2 mt-4">
              <Pressable onPress={() => setConfirmClose(false)} className="flex-1 border border-zinc-300 rounded-lg py-2.5 items-center">
                <Text className="font-semibold text-zinc-700">Keep open</Text>
              </Pressable>
              <Pressable onPress={close} className="flex-1 bg-zinc-900 rounded-lg py-2.5 items-center">
                <Text className="font-bold text-white">Close now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {sheet && <TrackingSheet mode={sheet} w={w} p={p} role={role} onClose={() => setSheet(null)} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-white rounded-lg border border-zinc-200 px-2 py-1.5">
      <Text className="text-[9px] uppercase text-zinc-500" numberOfLines={1}>{label}</Text>
      <Text className="text-sm font-bold text-zinc-900">{value}</Text>
    </View>
  );
}

function DoneNode({ stage, events }: { stage: TrackingStage; events: StageEvent[] }) {
  const first = events[0];
  return (
    <View className="-mt-0.5">
      <View className="flex-row justify-between">
        <Text className="text-[15px] font-semibold text-zinc-900">{stage}</Text>
        <Text className="text-xs text-zinc-500">{fmtDate(first?.at)}</Text>
      </View>
      <Text className="text-[11px] text-zinc-500">
        {first?.by ?? "—"}
        {first?.smsTo ? ` · texted ${first.smsTo}` : stage === "Open" || stage === "Closed" ? " · no SMS" : ""}
      </Text>
      {first?.expectedFrom && <Text className="text-[11px] text-zinc-500">Expected {fmtRange(first.expectedFrom, first.expectedTo)}</Text>}
      {first?.note && <Text className="text-[11px] text-zinc-600 italic">“{first.note}”</Text>}
    </View>
  );
}

function OpenControls({ w, onExtend, onClose }: { w: OrderWindow; onExtend: (d: number) => void; onClose: () => void }) {
  const { products } = useBO();
  const p = products.find((x) => x.id === w.productId)!;
  const t = windowTotals(w);
  const [extendOpen, setExtendOpen] = useState(false);
  return (
    <>
      <Text className="text-xs text-zinc-500 mt-1">
        Closes {fmtDate(w.closesAt)} ·{" "}
        <Text className={`font-bold ${t.daysLeft <= 3 ? "text-[#d97706]" : "text-zinc-800"}`}>
          {t.daysLeft > 0 ? `closes in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}` : "closes today"}
        </Text>
      </Text>
      <View className="mt-3 gap-2.5">
        {w.offers.map((o) => {
          const v = p.variants.find((x) => x.id === o.variantId);
          const pct = o.cap ? Math.min(100, (o.ordered / o.cap) * 100) : 0;
          const full = o.cap != null && o.ordered >= o.cap;
          return (
            <View key={o.variantId}>
              <View className="flex-row justify-between">
                <Text className="text-xs font-semibold text-zinc-800">{v ? variantLabel(v) : o.variantId}</Text>
                <Text className={`text-xs ${full ? "text-[#d97706] font-bold" : "text-zinc-600"}`}>
                  {o.ordered}
                  {o.cap != null ? ` / ${o.cap}` : " · no cap"}
                  {full ? " · SOLD OUT" : ""}
                </Text>
              </View>
              <View className="h-1.5 bg-zinc-200 rounded-full mt-1 overflow-hidden">
                <View
                  className={`h-full rounded-full ${full ? "bg-[#d97706]" : "bg-[#6d28d9]"}`}
                  style={{ width: o.cap ? `${pct}%` : `${Math.min(100, o.ordered * 4)}%`, opacity: o.cap ? 1 : 0.35 }}
                />
              </View>
            </View>
          );
        })}
      </View>
      {t.soldOut > 0 && (
        <Text className="text-[11px] text-[#d97706] mt-2">
          Sold-out Variants show as sold out; the window stays open until it closes.
        </Text>
      )}
      {extendOpen ? (
        <View className="flex-row gap-2 mt-3">
          {[3, 7, 14].map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                onExtend(d);
                setExtendOpen(false);
              }}
              className="flex-1 bg-violet-50 border border-[#6d28d9] rounded-lg py-2 items-center"
            >
              <Text className="text-xs font-bold text-[#6d28d9]">+{d} days</Text>
              <Text className="text-[10px] text-zinc-500">to {fmtDate(addDays(w.closesAt, d))}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="flex-row gap-2 mt-3">
          <Pressable onPress={() => setExtendOpen(true)} className="flex-1 border border-zinc-300 rounded-lg py-2.5 items-center">
            <Text className="text-sm font-semibold text-zinc-800">Extend</Text>
          </Pressable>
          <Pressable onPress={onClose} className="flex-1 bg-zinc-900 rounded-lg py-2.5 items-center">
            <Text className="text-sm font-bold text-white">Close now</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

function StoreQtyList({ w, p }: { w: OrderWindow; p: Product }) {
  const total = w.offers.reduce((s, o) => s + o.ordered + (o.storeQuantity ?? 0), 0);
  return (
    <View className="mt-3">
      <Text className="text-[11px] uppercase text-zinc-500 font-semibold">Supplier order · {total} units</Text>
      {w.offers.map((o) => {
        const v = p.variants.find((x) => x.id === o.variantId);
        return (
          <Text key={o.variantId} className="text-xs text-zinc-700">
            {v ? variantLabel(v) : o.variantId}: {o.ordered} pre-ordered + {o.storeQuantity ?? 0} Store Quantity
          </Text>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- tracking sheet

function TrackingSheet({ mode, w, p, role, onClose }: { mode: SheetMode; w: OrderWindow; p: Product; role: Role; onClose: () => void }) {
  const arrived = mode.stage === "Arrived";
  const [from, setFrom] = useState(arrived ? "" : (w.expectedFrom ?? ""));
  const [to, setTo] = useState(arrived ? "" : (w.expectedTo ?? ""));
  const [note, setNote] = useState(mode.kind === "dates" ? (w.note ?? "") : "");
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(w.offers.map((o) => [o.variantId, String(o.storeQuantity ?? 0)])),
  );
  const askQty = mode.kind === "advance" && mode.stage === "Ordered from supplier";
  const sms = trackingSms(p, w, mode.stage, from || undefined, to || undefined, note || undefined);
  const datesChanged = from !== (w.expectedFrom ?? "") || to !== (w.expectedTo ?? "");
  const nothingToSend = mode.kind === "dates" && !datesChanged && note === (w.note ?? "");
  // Only stage changes and expected-date changes text Customers; a note-only edit does not.
  const texts = mode.kind === "advance" || datesChanged;

  const save = () => {
    const by = ME[role];
    const offers = askQty ? w.offers.map((o) => ({ ...o, storeQuantity: Number.parseInt(qty[o.variantId] || "0", 10) || 0 })) : w.offers;
    const ev: StageEvent = {
      stage: mode.stage,
      at: TODAY,
      by,
      expectedFrom: from || undefined,
      expectedTo: to || undefined,
      note: note || undefined,
      smsTo: texts ? w.preorders : undefined,
    };
    saveWindow(
      { ...w, stage: mode.stage, offers, expectedFrom: ev.expectedFrom, expectedTo: ev.expectedTo, note: ev.note, history: [...w.history, ev] },
      by,
      mode.kind === "advance" ? `marked as ${mode.stage}` : "changed dates on",
    );
    onClose();
  };

  const setWeeks = (n: number) => {
    const f = addDays(TODAY, n * 7);
    setFrom(f);
    setTo(addDays(f, 7));
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: "88%" }}>
          <View className="items-center pt-2">
            <View className="w-10 h-1 rounded-full bg-zinc-300" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            <Text className="text-lg font-bold text-zinc-900">
              {mode.kind === "advance" ? `Mark as ${mode.stage}` : `Update ${mode.stage}`}
            </Text>
            <Text className="text-xs text-zinc-500">
              {p.name} · Window {w.number}
            </Text>

            <Text className="text-[11px] text-zinc-500 mt-4 mb-1.5" numberOfLines={1}>{arrived ? "Arrived today. No expected dates needed." : ""}</Text>
            {!arrived && (
            <>
            <Text className="text-xs font-semibold text-zinc-700 mb-1.5">Expected arrival</Text>
            <View className="flex-row gap-2">
              {[1, 2, 3, 5].map((n) => (
                <Pressable key={n} onPress={() => setWeeks(n)} className="border border-zinc-300 rounded-full px-3 py-1">
                  <Text className="text-xs font-semibold text-zinc-700">+{n}w</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  setFrom("");
                  setTo("");
                }}
                className="border border-zinc-300 rounded-full px-3 py-1"
              >
                <Text className="text-xs text-zinc-500">No date</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2 mt-2">
              <DateField label="From" value={from} onChange={setFrom} />
              <DateField label="To" value={to} onChange={setTo} />
            </View>
            <Text className="text-[11px] text-zinc-500 mt-1">{fmtRange(from || undefined, to || undefined)}</Text>
            </>
            )}

            <Text className="text-xs font-semibold text-zinc-700 mt-4 mb-1.5">Note to Customers (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Container left Guangzhou on 14 Oct."
              multiline
              className="border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 min-h-[56px]"
            />

            {askQty && (
              <>
                <Text className="text-xs font-semibold text-zinc-700 mt-4 mb-1">Store Quantity per Variant</Text>
                <Text className="text-[11px] text-zinc-500 mb-2">Extra units for Stock, added to the supplier order. Editable until arrival.</Text>
                {w.offers.map((o) => {
                  const v = p.variants.find((x) => x.id === o.variantId);
                  return (
                    <View key={o.variantId} className="flex-row items-center justify-between py-1.5 border-b border-zinc-100">
                      <View>
                        <Text className="text-sm text-zinc-800">{v ? variantLabel(v) : o.variantId}</Text>
                        <Text className="text-[11px] text-zinc-500">{o.ordered} pre-ordered</Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xs text-zinc-500">+</Text>
                        <TextInput
                          value={qty[o.variantId]}
                          onChangeText={(t) => setQty({ ...qty, [o.variantId]: t.replace(/[^0-9]/g, "") })}
                          keyboardType="number-pad"
                          className="border border-zinc-300 rounded-md w-14 px-2 py-1 text-sm text-right"
                        />
                        <Text className="text-xs text-zinc-700 w-16 text-right">
                          = {o.ordered + (Number.parseInt(qty[o.variantId] || "0", 10) || 0)} units
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <Text className="text-xs font-semibold text-zinc-700 mt-4 mb-1.5">
              {texts ? `SMS to ${w.preorders} Customers` : "No SMS (note-only change)"}
            </Text>
            <View className={`bg-zinc-100 rounded-2xl p-3 ${texts ? "" : "opacity-40"}`}>
              <Text className="text-[10px] text-zinc-500 mb-1">EMBLISH · now</Text>
              <View className="bg-white rounded-2xl rounded-tl-sm p-2.5 self-start" style={{ maxWidth: "92%" }}>
                <Text className="text-[13px] text-zinc-900">{sms}</Text>
              </View>
              <Text className="text-[10px] text-zinc-500 mt-1 text-right">{sms.length} chars · {Math.ceil(sms.length / 160)} SMS each</Text>
            </View>

            <Pressable
              disabled={nothingToSend}
              onPress={save}
              className={`mt-5 rounded-xl py-3.5 items-center ${nothingToSend ? "bg-zinc-300" : "bg-[#6d28d9]"}`}
            >
              <Text className="text-white font-bold">
                {nothingToSend ? "Nothing changed" : texts && w.preorders > 0 ? `Text ${w.preorders} Customers & save` : "Save"}
              </Text>
            </Pressable>
            <Pressable onPress={onClose} className="mt-2 py-2 items-center">
              <Text className="text-sm text-zinc-500">Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-1">
      <Text className="text-[9px] uppercase text-zinc-500" numberOfLines={1}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        className="border border-zinc-300 rounded-lg px-2.5 py-2 text-sm text-zinc-900"
      />
    </View>
  );
}

// ---------------------------------------------------------------- wizard

const STEPS = ["Variants", "Prices & caps", "Dates & fees", "Review"];

function Wizard({ role, initial, onDone }: { role: Role; initial?: OrderWindow; onDone: (id: string) => void }) {
  const { products, windows } = useBO();
  const [step, setStep] = useState(initial ? 3 : 0);
  const [w, setW] = useState<OrderWindow>(() => initial ?? newWindow(products[1], windows));
  const p = products.find((x) => x.id === w.productId)!;
  const by = ME[role];
  const isOwner = role === "owner";

  const blockers = useMemo(() => {
    const out = openBlockers(w, p);
    const clash = windows.find((x) => x.productId === p.id && x.id !== w.id && x.stage === "Open" && !x.draft);
    if (clash) out.unshift(`${p.name} already has Window ${clash.number} open (one at a time)`);
    return out;
  }, [w, p, windows]);
  const onlyPriceBlockers = blockers.length > 0 && blockers.every((b) => b.includes("Pre-order price"));

  const pickProduct = (pp: Product) => setW({ ...newWindow(pp, windows), id: w.id });
  const toggle = (variantId: string) =>
    setW({
      ...w,
      offers: w.offers.some((o) => o.variantId === variantId)
        ? w.offers.filter((o) => o.variantId !== variantId)
        : [...w.offers, { variantId, ordered: 0 }],
    });
  const patchOffer = (variantId: string, patch: Partial<OrderWindow["offers"][number]>) =>
    setW({ ...w, offers: w.offers.map((o) => (o.variantId === variantId ? { ...o, ...patch } : o)) });

  const saveDraft = () => {
    saveWindow({ ...w, draft: true }, by, "saved draft of");
    onDone(w.id);
  };
  const open = () => {
    if (p.status === "Draft") saveProduct({ ...p, status: "Published" }, by);
    saveWindow({ ...w, draft: false, stage: "Open", history: [{ stage: "Open", at: TODAY, by }] }, by, "opened");
    onDone(w.id);
  };

  return (
    <View className="flex-1">
      {/* stepper */}
      <View className="flex-row px-4 py-3 bg-white border-b border-zinc-200">
        {STEPS.map((s, i) => (
          <Pressable key={s} onPress={() => setStep(i)} className="flex-1 items-center">
            <View className={`w-6 h-6 rounded-full items-center justify-center ${i <= step ? "bg-[#6d28d9]" : "bg-zinc-200"}`}>
              <Text className={`text-[11px] font-bold ${i <= step ? "text-white" : "text-zinc-500"}`}>{i < step ? "✓" : i + 1}</Text>
            </View>
            <Text className={`text-[10px] mt-1 ${i === step ? "font-bold text-zinc-900" : "text-zinc-500"}`}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text className="text-lg font-bold text-zinc-900">
          {initial ? `Window ${w.number} (draft)` : "Open an Order Window"}
        </Text>
        <Text className="text-xs text-zinc-500 mb-4">
          {p.name} · Window {w.number}
        </Text>

        {step === 0 && (
          <>
            {!initial && (
              <>
                <Text className="text-xs font-semibold text-zinc-700 mb-1.5">Product</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {products
                    .filter((x) => x.status !== "Archived")
                    .map((x) => {
                      const busy = windows.find((ow) => ow.productId === x.id && ow.stage === "Open" && !ow.draft);
                      return (
                        <Pressable
                          key={x.id}
                          onPress={() => pickProduct(x)}
                          className={`rounded-lg border px-3 py-2 ${x.id === p.id ? "border-[#6d28d9] bg-violet-50" : "border-zinc-300 bg-white"}`}
                        >
                          <Text className="text-sm font-semibold text-zinc-800">{x.name}</Text>
                          <Text className={`text-[10px] ${busy ? "text-[#d97706]" : "text-zinc-500"}`}>
                            {busy ? `W${busy.number} open until ${fmtDate(busy.closesAt)}` : x.status}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </>
            )}
            <Text className="text-xs font-semibold text-zinc-700 mb-1.5">Which Variants can be pre-ordered?</Text>
            <View className="bg-white rounded-xl border border-zinc-200">
              {p.variants
                .filter((v) => !v.archived)
                .map((v, i) => {
                  const on = w.offers.some((o) => o.variantId === v.id);
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => toggle(v.id)}
                      className={`flex-row items-center px-3 py-3 ${i ? "border-t border-zinc-100" : ""}`}
                    >
                      <View className={`w-5 h-5 rounded border-2 items-center justify-center mr-3 ${on ? "bg-[#6d28d9] border-[#6d28d9]" : "border-zinc-400"}`}>
                        {on && <Text className="text-white text-[11px] font-bold">✓</Text>}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm text-zinc-900">{variantLabel(v)}</Text>
                        <Text className="text-[11px] text-zinc-500">
                          {v.sku} · Stock {v.stock}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
            </View>
            <Text className="text-[11px] text-zinc-500 mt-2">{w.offers.length} offered. Others stay off this window.</Text>
          </>
        )}

        {step === 1 && (
          <>
            {!isOwner && (
              <View className="bg-amber-50 border border-[#d97706] rounded-lg p-2.5 mb-3">
                <Text className="text-xs text-[#92400e]">
                  Only the Owner sets Pre-order prices. Set caps, then save a draft for the Owner to price and open.
                </Text>
              </View>
            )}
            {w.offers.map((o) => {
              const v = p.variants.find((x) => x.id === o.variantId)!;
              return (
                <View key={o.variantId} className="bg-white rounded-xl border border-zinc-200 p-3 mb-2">
                  <View className="flex-row justify-between">
                    <Text className="text-sm font-bold text-zinc-900">{variantLabel(v)}</Text>
                    <Text className="text-[11px] text-zinc-500">Store Price {ghs(v.storePrice)}</Text>
                  </View>
                  <View className="flex-row gap-2 mt-2">
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase text-zinc-500">Pre-order price</Text>
                      {isOwner ? (
                        <TextInput
                          defaultValue={o.preorderPrice != null ? String(o.preorderPrice / 100) : ""}
                          onChangeText={(t) => patchOffer(o.variantId, { preorderPrice: parseGhs(t) })}
                          placeholder="GH₵"
                          keyboardType="decimal-pad"
                          className={`border rounded-lg px-2.5 py-2 text-sm ${o.preorderPrice == null ? "border-[#d97706]" : "border-zinc-300"}`}
                        />
                      ) : (
                        <View className="border border-dashed border-zinc-300 rounded-lg px-2.5 py-2 bg-zinc-50">
                          <Text className="text-sm text-zinc-500">🔒 {o.preorderPrice != null ? ghs(o.preorderPrice) : "Owner sets"}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ width: 96 }}>
                      <Text className="text-[10px] uppercase text-zinc-500">Cap (optional)</Text>
                      <TextInput
                        defaultValue={o.cap != null ? String(o.cap) : ""}
                        onChangeText={(t) => patchOffer(o.variantId, { cap: t ? Number.parseInt(t, 10) || undefined : undefined })}
                        placeholder="No cap"
                        keyboardType="number-pad"
                        className="border border-zinc-300 rounded-lg px-2.5 py-2 text-sm"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {step === 2 && (
          <View className="gap-4">
            <View>
              <Text className="text-xs font-semibold text-zinc-700 mb-1.5">Dates</Text>
              <View className="flex-row gap-2">
                <DateField label="Opens" value={w.opensAt} onChange={(v) => setW({ ...w, opensAt: v })} />
                <DateField label="Closes" value={w.closesAt} onChange={(v) => setW({ ...w, closesAt: v })} />
              </View>
              <View className="flex-row gap-2 mt-2">
                {[7, 14, 21, 28].map((d) => (
                  <Pressable key={d} onPress={() => setW({ ...w, closesAt: addDays(w.opensAt, d) })} className="border border-zinc-300 rounded-full px-3 py-1">
                    <Text className="text-xs text-zinc-700">{d} days</Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-[11px] text-zinc-500 mt-1">
                Open for {daysBetween(w.opensAt, w.closesAt)} days. Closes automatically at the end of {fmtDate(w.closesAt)}.
              </Text>
            </View>
            <View>
              <Text className="text-xs font-semibold text-zinc-700 mb-1">Shipping Fee estimate (per unit, optional)</Text>
              <TextInput
                defaultValue={w.shippingFeeEstimate != null ? String(w.shippingFeeEstimate / 100) : ""}
                onChangeText={(t) => setW({ ...w, shippingFeeEstimate: parseGhs(t) })}
                placeholder="GH₵ e.g. 15"
                keyboardType="decimal-pad"
                className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
              <Text className="text-[11px] text-zinc-500 mt-1">Shown to Customers as an estimate. Staff confirm the real fee on arrival.</Text>
            </View>
            <View>
              <Text className="text-xs font-semibold text-zinc-700 mb-1">Minimum Order Quantity (optional)</Text>
              <TextInput
                defaultValue={w.minimumOrderQuantity != null ? String(w.minimumOrderQuantity) : ""}
                onChangeText={(t) => setW({ ...w, minimumOrderQuantity: t ? Number.parseInt(t, 10) || undefined : undefined })}
                placeholder="None"
                keyboardType="number-pad"
                className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
              <Text className="text-[11px] text-zinc-500 mt-1">Fewest units per Pre-order, counted across Variants.</Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <>
            <View className="bg-white rounded-xl border border-zinc-200 p-3">
              <Row k="Product" v={`${p.name} (${p.status})`} />
              <Row k="Dates" v={`${fmtDate(w.opensAt)} – ${fmtDate(w.closesAt)}`} />
              <Row k="Shipping Fee est." v={w.shippingFeeEstimate != null ? `${ghs(w.shippingFeeEstimate)} / unit` : "None"} />
              <Row k="Min. Order Qty" v={w.minimumOrderQuantity ? String(w.minimumOrderQuantity) : "None"} />
              <View className="border-t border-zinc-100 mt-2 pt-2">
                {w.offers.map((o) => {
                  const v = p.variants.find((x) => x.id === o.variantId)!;
                  return (
                    <View key={o.variantId} className="flex-row justify-between py-0.5">
                      <Text className="text-xs text-zinc-700">{variantLabel(v)}</Text>
                      <Text className={`text-xs ${o.preorderPrice == null ? "text-[#d97706] font-bold" : "text-zinc-900"}`}>
                        {o.preorderPrice != null ? ghs(o.preorderPrice) : "unpriced"} · {o.cap != null ? `cap ${o.cap}` : "no cap"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            {p.status === "Draft" && (
              <View className="bg-violet-50 border border-[#6d28d9] rounded-lg p-2.5 mt-3">
                <Text className="text-xs text-[#4c1d95]">Opening this window also publishes {p.name}.</Text>
              </View>
            )}
            {blockers.length > 0 ? (
              <View className="bg-amber-50 border border-[#d97706] rounded-lg p-2.5 mt-3">
                <Text className="text-xs font-bold text-[#92400e] mb-1">Can't open yet</Text>
                {blockers.map((b) => (
                  <Text key={b} className="text-xs text-[#92400e]">
                    • {b}
                  </Text>
                ))}
              </View>
            ) : (
              <Text className="text-xs text-emerald-700 mt-3">✓ Ready to open. Customers can pre-order straight away.</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* footer */}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 p-3 flex-row gap-2">
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} className="border border-zinc-300 rounded-xl px-4 py-3 items-center">
            <Text className="font-semibold text-zinc-700">Back</Text>
          </Pressable>
        ) : null}
        {step < 3 ? (
          <Pressable onPress={() => setStep(step + 1)} className="flex-1 bg-[#6d28d9] rounded-xl py-3 items-center">
            <Text className="font-bold text-white">Next: {STEPS[step + 1]}</Text>
          </Pressable>
        ) : blockers.length === 0 ? (
          <Pressable onPress={open} className="flex-1 bg-[#6d28d9] rounded-xl py-3 items-center">
            <Text className="font-bold text-white">Open window</Text>
          </Pressable>
        ) : (
          <Pressable onPress={saveDraft} className="flex-1 bg-zinc-900 rounded-xl py-3 items-center">
            <Text className="font-bold text-white">{!isOwner && onlyPriceBlockers ? "Save draft for the Owner" : "Save draft"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className="text-xs text-zinc-500">{k}</Text>
      <Text className="text-xs font-semibold text-zinc-900">{v}</Text>
    </View>
  );
}

