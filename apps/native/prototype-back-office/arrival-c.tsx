// PROTOTYPE (wayfinder #16): arrival variant C, "Window ledger".
// One dense table per window: rows are Pre-orders in placement order, columns are Variants. Arrived counts
// are typed straight into the column headers, so the fill-earliest-first waterfall happens in place.
// The same table becomes the follow-up view: a Status column, filters, and multi-select bulk actions.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ME, STAGES, fmtDate, ghs, parseGhs, useBO, type OrderWindow, type Product, type Role } from "./bo-data";
import {
  FEE_WARN,
  allocate,
  feeOverEstimate,
  forfeit,
  forfeitEligible,
  invoicePlan,
  isOverdue,
  issueInvoices,
  liveInvoice,
  markRefunded,
  recordArrival,
  useArrivals,
  windowFollowUp,
} from "./arrival-data";
import { InvoiceActions, ReminderDots, StatePeek, StatusPill, vName } from "./arrival-ui";

const COL = 52;
const NAME = 118;

export default function ArrivalC({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const list = windows.filter((w) => !w.draft && STAGES.indexOf(w.stage) >= 2);
  const [id, setId] = useState("ow_sneak2");
  const w = list.find((x) => x.id === id) ?? list[0];
  const p = products.find((x) => x.id === w.productId)!;
  return (
    <View className="flex-1 bg-white">
      <View className="border-b border-zinc-200 px-3" style={{ paddingTop: 44 }}>
        <View className="flex-row items-center justify-between pb-1">
          <Text className="text-base font-bold text-zinc-900">Window ledger</Text>
          <Text className="text-[11px] text-zinc-500">{ME[role]}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
          {list.map((x) => {
            const pp = products.find((y) => y.id === x.productId)!;
            return (
              <Pressable key={x.id} onPress={() => setId(x.id)} className={`px-2.5 py-1 rounded-md ${x.id === w.id ? "bg-zinc-900" : "bg-zinc-100"}`}>
                <Text className={`text-[11px] font-semibold ${x.id === w.id ? "text-white" : "text-zinc-700"}`}>
                  {pp.name.split(" ").slice(-1)[0]} W{x.number}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <Ledger key={w.id} w={w} p={p} role={role} />
      <StatePeek />
    </View>
  );
}

type Filter = "all" | "unpaid" | "forfeit" | "short";

function Ledger({ w, p, role }: { w: OrderWindow; p: Product; role: Role }) {
  const s = useArrivals();
  const arrival = s.arrivals.find((a) => a.windowId === w.id);
  const locked = !!arrival;
  const issued = !!arrival?.invoicesIssuedAt;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fee, setFee] = useState(w.shippingFeeEstimate ? String(w.shippingFeeEstimate / 100) : "");
  const [ack, setAck] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);

  const counts: Record<string, number> = arrival?.arrived ?? Object.fromEntries(w.offers.map((o) => [o.variantId, Number.parseInt(draft[o.variantId] ?? "", 10)]).filter(([, n]) => !Number.isNaN(n)));
  const allTyped = w.offers.every((o) => counts[o.variantId] != null);
  const a = useMemo(() => allocate(w, s.preorders, counts), [w, s.preorders, counts]);
  const perUnit = parseGhs(fee);
  const over = feeOverEstimate(w, perUnit);
  const warn = over > FEE_WARN;
  const plan = locked && perUnit != null ? invoicePlan(w, s.preorders, perUnit) : undefined;
  const f = windowFollowUp(w, s);

  const rows = a.preorders.filter((x) => {
    const inv = liveInvoice(s.invoices, x.preorder.id);
    if (filter === "unpaid") return inv?.status === "Unpaid";
    if (filter === "forfeit") return inv ? forfeitEligible(inv) : false;
    if (filter === "short") return x.short > 0;
    return true;
  });
  const selectable = (pid: string) => {
    const inv = liveInvoice(s.invoices, pid);
    return !!inv && forfeitEligible(inv);
  };

  const cell = (text: string, opts: { w?: number; cls?: string; bg?: string; k?: string } = {}) => (
    <View key={opts.k} style={{ width: opts.w ?? COL, backgroundColor: opts.bg }} className="px-1 py-1.5 justify-center border-r border-zinc-100">
      <Text className={`text-[11px] text-center ${opts.cls ?? "text-zinc-800"}`} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );

  return (
    <View className="flex-1">
      {/* control strip */}
      <View className="px-3 py-2 bg-zinc-50 border-b border-zinc-200">
        <Text className="text-[12px] font-bold text-zinc-900">
          {p.name} · W{w.number} · {w.stage}
        </Text>
        {!locked && (
          <Text className="text-[11px] text-zinc-500">
            Type arrived units into the yellow cells. Rows fill earliest first. {allTyped ? "" : `${w.offers.filter((o) => counts[o.variantId] == null).length} Variant(s) left.`}
          </Text>
        )}
        {locked && !issued && (
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-[11px] text-zinc-700">Fee/unit GH₵</Text>
            <TextInput
              value={fee}
              onChangeText={(t) => {
                setFee(t);
                setAck(false);
              }}
              keyboardType="decimal-pad"
              className={`border rounded px-2 py-0.5 w-16 text-sm font-bold bg-white ${warn ? "border-[#d97706]" : "border-zinc-300"}`}
            />
            <Text className={`text-[11px] ${warn ? "text-[#92400e] font-bold" : "text-zinc-500"}`}>
              est {ghs(w.shippingFeeEstimate)} {perUnit != null && w.shippingFeeEstimate ? `(${over >= 0 ? "+" : ""}${Math.round(over * 100)}%)` : ""}
            </Text>
            {warn && (
              <Pressable onPress={() => setAck(!ack)}>
                <Text className="text-[11px] text-[#92400e]">{ack ? "☑" : "☐"} &gt;20%, confirmed</Text>
              </Pressable>
            )}
          </View>
        )}
        {issued && (
          <Text className="text-[11px] text-zinc-600">
            {ghs(arrival!.feePerUnit)}/unit · issued {fmtDate(arrival!.invoicesIssuedAt)} · {f.paid.length}/{f.live.length} paid · {ghs(f.outstanding)} outstanding
          </Text>
        )}
        <View className="flex-row gap-1.5 mt-1.5">
          {(
            [
              ["all", `All ${a.preorders.length}`],
              ["short", `Short ${allTyped ? a.preorders.filter((x) => x.short).length : "?"}`],
              ...(issued
                ? ([
                    ["unpaid", `Unpaid ${f.unpaid.length}`],
                    ["forfeit", `Forfeit-eligible ${f.eligible.length}`],
                  ] as [Filter, string][])
                : []),
            ] as [Filter, string][]
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setFilter(k)} className={`px-2 py-0.5 rounded border ${filter === k ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"}`}>
              <Text className={`text-[10px] font-semibold ${filter === k ? "text-white" : k === "forfeit" && f.eligible.length ? "text-red-700" : "text-zinc-700"}`}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <ScrollView horizontal>
          <View>
            {/* header */}
            <View className="flex-row bg-zinc-100 border-b border-zinc-300">
              {cell("#", { w: 24, cls: "text-zinc-500 font-bold" })}
              {cell("Pre-order", { w: NAME, cls: "text-zinc-500 font-bold text-left" })}
              {w.offers.map((o) => cell(vName(p, o.variantId), { k: o.variantId, cls: "font-bold text-zinc-700" }))}
              {cell(issued ? "Invoice" : "Shipping", { w: 70, cls: "text-zinc-500 font-bold" })}
              {issued && cell("Status", { w: 104, cls: "text-zinc-500 font-bold" })}
            </View>
            {/* arrived inputs */}
            <View className="flex-row border-b-2 border-zinc-300">
              {cell("", { w: 24 })}
              {cell(locked ? "🔒 ARRIVED" : "ARRIVED →", { w: NAME, cls: "font-bold text-zinc-900 text-left" })}
              {w.offers.map((o) =>
                locked ? (
                  cell(String(counts[o.variantId]), { k: o.variantId, cls: "font-bold text-zinc-900", bg: "#f4f4f5" })
                ) : (
                  <View key={o.variantId} style={{ width: COL }} className="p-0.5 bg-yellow-100 border-r border-zinc-100">
                    <TextInput
                      value={draft[o.variantId] ?? ""}
                      onChangeText={(t) => setDraft({ ...draft, [o.variantId]: t.replace(/[^0-9]/g, "") })}
                      placeholder={String(o.ordered + (o.storeQuantity ?? 0))}
                      placeholderTextColor="#a1a1aa"
                      keyboardType="number-pad"
                      className="text-center text-sm font-bold text-zinc-900 py-1"
                    />
                  </View>
                ),
              )}
              {cell("", { w: 70 })}
              {issued && cell("", { w: 104 })}
            </View>
            {/* rows */}
            {rows.map((x, i) => {
              const inv = liveInvoice(s.invoices, x.preorder.id);
              const picked = sel.includes(x.preorder.id);
              const planned = plan?.rows.find((r) => r.p.id === x.preorder.id);
              return (
                <Pressable
                  key={x.preorder.id}
                  onPress={() => (issued ? setDetail(detail === x.preorder.id ? null : x.preorder.id) : null)}
                  onLongPress={() => selectable(x.preorder.id) && setSel(picked ? sel.filter((y) => y !== x.preorder.id) : [...sel, x.preorder.id])}
                  className={`flex-row border-b border-zinc-100 ${picked ? "bg-red-50" : x.preorder.forfeitedAt ? "opacity-40" : i % 2 ? "bg-zinc-50/50" : ""}`}
                >
                  {cell(picked ? "☑" : String(a.preorders.indexOf(x) + 1), { w: 24, cls: "text-zinc-400" })}
                  <View style={{ width: NAME }} className="px-1.5 py-1 border-r border-zinc-100">
                    <Text className="text-[11px] font-semibold text-zinc-900" numberOfLines={1}>
                      {x.preorder.customer}
                    </Text>
                    <Text className="text-[9px] text-zinc-500">
                      {fmtDate(x.preorder.placedAt)} · {x.preorder.fulfilment.kind === "Pickup" ? "Pickup" : x.preorder.fulfilment.zone}
                    </Text>
                  </View>
                  {w.offers.map((o) => {
                    const line = x.preorder.lines.find((l) => l.variantId === o.variantId);
                    if (!line) return cell("", { k: o.variantId, cls: "text-zinc-300" });
                    const got = x.byVariant[o.variantId] ?? 0;
                    const known = counts[o.variantId] != null;
                    return cell(known ? (got === line.qty ? `${got}` : `${got}/${line.qty}`) : `${line.qty}`, {
                      k: o.variantId,
                      cls: !known ? "text-zinc-400" : got < line.qty ? "text-red-700 font-bold" : "text-zinc-900",
                      bg: known && got < line.qty ? "#fee2e2" : undefined,
                    });
                  })}
                  {issued
                    ? cell(inv ? `${ghs(inv.total)}` : x.short ? `refund ${ghs(x.refund)}` : "—", { w: 70, cls: inv ? "text-zinc-900" : "text-red-700" })
                    : cell(planned ? (planned.skip ? "—" : ghs(planned.total)) : x.short && allTyped ? `−${ghs(x.refund)}` : "", {
                        w: 70,
                        cls: planned && !planned.skip ? "text-zinc-900" : "text-red-700",
                      })}
                  {issued && (
                    <View style={{ width: 104 }} className="px-1 py-1 justify-center">
                      <StatusPill inv={inv} p={x.preorder} />
                    </View>
                  )}
                </Pressable>
              );
            })}
            {/* footer: where the rest went */}
            {(["Store Qty", "Surplus", "Short"] as const).map((k) => (
              <View key={k} className="flex-row bg-zinc-50 border-t border-zinc-200">
                {cell("", { w: 24 })}
                {cell(k === "Store Qty" ? "→ Store Quantity" : k === "Surplus" ? "→ Surplus (Stock)" : "Shortfall", { w: NAME, cls: "text-left text-zinc-600 font-semibold" })}
                {a.variants.map((va) =>
                  cell(
                    counts[va.variantId] == null ? "·" : k === "Store Qty" ? `${va.toStore}/${va.storeQuantity}` : k === "Surplus" ? String(va.surplus) : String(va.shortfall),
                    { k: va.variantId, cls: k === "Short" && va.shortfall ? "text-red-700 font-bold" : "text-zinc-700" },
                  ),
                )}
                {cell("", { w: 70 })}
                {issued && cell("", { w: 104 })}
              </View>
            ))}
          </View>
        </ScrollView>

        {detail && <RowDetail pid={detail} role={role} p={p} />}

        {issued && f.refunds.some((r) => r.status === "To refund") && (
          <View className="m-3 p-2.5 rounded-lg border border-red-200 bg-red-50">
            <Text className="text-xs font-bold text-red-900">Shortfall refunds to make</Text>
            {f.refunds
              .filter((r) => r.status === "To refund")
              .map((r) => (
                <View key={r.id} className="flex-row justify-between items-center mt-1">
                  <Text className="text-[11px] text-red-900">
                    {s.preorders.find((x) => x.id === r.preorderId)?.customer} · {r.units}u · {ghs(r.amount)}
                  </Text>
                  {role === "owner" ? (
                    <Pressable onPress={() => markRefunded(r.id, role)} className="bg-red-700 rounded px-2 py-0.5">
                      <Text className="text-[10px] text-white font-bold">Refund</Text>
                    </Pressable>
                  ) : (
                    <Text className="text-[10px] text-red-400">🔒 Owner</Text>
                  )}
                </View>
              ))}
          </View>
        )}
        {issued && <Text className="text-[10px] text-zinc-400 px-3 mt-1">Tap a row for its invoice. Long-press Forfeit-eligible rows to select several.</Text>}
      </ScrollView>

      {/* action bar */}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 p-3" style={{ paddingBottom: 22 }}>
        {!locked && (
          <Pressable
            disabled={!allTyped}
            onPress={() => recordArrival(w, counts, role)}
            className={`rounded-lg py-3 items-center ${allTyped ? "bg-zinc-900" : "bg-zinc-300"}`}
          >
            <Text className="text-white font-bold">
              {allTyped
                ? `Lock arrival · ${a.variants.reduce((n, v) => n + v.shortfall, 0)} short · text ${a.preorders.length}`
                : "Type every Variant's arrived count"}
            </Text>
          </Pressable>
        )}
        {locked && !issued && (
          <Pressable
            disabled={!plan || (warn && !ack)}
            onPress={() => perUnit != null && issueInvoices(w, perUnit, role)}
            className={`rounded-lg py-3 items-center ${plan && !(warn && !ack) ? "bg-zinc-900" : "bg-zinc-300"}`}
          >
            <Text className="text-white font-bold">{plan ? `Issue ${plan.count} invoices · ${ghs(plan.total)}` : "Enter the fee"}</Text>
          </Pressable>
        )}
        {issued &&
          (sel.length ? (
            <View className="flex-row gap-2">
              <Pressable onPress={() => setSel([])} className="border border-zinc-300 rounded-lg px-3 py-3">
                <Text className="text-xs font-semibold">Clear</Text>
              </Pressable>
              <Pressable
                disabled={role !== "owner"}
                onPress={() => {
                  sel.forEach((pid) => forfeit(pid, role));
                  setSel([]);
                }}
                className={`flex-1 rounded-lg py-3 items-center ${role === "owner" ? "bg-red-700" : "bg-zinc-300"}`}
              >
                <Text className="text-white font-bold">{role === "owner" ? `Forfeit ${sel.length} selected` : "🔒 Only the Owner can Forfeit"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-[11px] text-zinc-500 text-center">
              {f.overdue.length} overdue · {f.eligible.length} eligible for Forfeit · {s.invoices.filter((i) => i.windowId === w.id && isOverdue(i)).length ? "reminders run automatically" : "all on track"}
            </Text>
          ))}
      </View>
    </View>
  );
}

function RowDetail({ pid, role, p }: { pid: string; role: Role; p: Product }) {
  const s = useArrivals();
  const po = s.preorders.find((x) => x.id === pid)!;
  const inv = liveInvoice(s.invoices, pid);
  return (
    <View className="mx-3 mt-3 p-3 rounded-lg border border-zinc-300">
      <View className="flex-row justify-between">
        <Text className="text-sm font-bold text-zinc-900">
          {po.customer} · {po.ref}
        </Text>
        <Text className="text-[11px] text-zinc-500">{po.phone}</Text>
      </View>
      {inv ? (
        <>
          <Text className="text-[11px] text-zinc-600 mt-1">
            {inv.number}: {inv.units} × {ghs(inv.perUnit)}
            {inv.deliveryFee ? ` + ${ghs(inv.deliveryFee)} delivery` : ""} = {ghs(inv.total)} · due {fmtDate(inv.dueAt)}
          </Text>
          <View className="mt-1.5">
            <ReminderDots inv={inv} />
          </View>
          <InvoiceActions inv={inv} p={po} role={role} />
        </>
      ) : (
        <Text className="text-[11px] text-zinc-500 mt-1">{po.forfeitedAt ? `Forfeited ${fmtDate(po.forfeitedAt)}` : "No invoice (nothing arrived)."}</Text>
      )}
      <Text className="text-[10px] text-zinc-400 mt-1">{p.name}</Text>
    </View>
  );
}
