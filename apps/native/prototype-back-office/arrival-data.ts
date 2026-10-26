// PROTOTYPE (wayfinder #16): in-memory arrival, Shipping Fee Invoice and Forfeit data. Throwaway, never merged.
// Rules come from "Inventory model" (allocation order), "How the Shipping Fee is calculated and invoiced"
// (per arrived unit, one invoice per Pre-order, due in 14 days, reminders, day-30 Forfeit) and "Staff roles"
// (Forfeit and refunds are Owner-only). Nothing persists.
import { useSyncExternalStore } from "react";

import { ME, TODAY, addDays, daysBetween, saveWindow, type OrderWindow, type Product, type Role } from "./bo-data";

export type Fulfilment = { kind: "Pickup" } | { kind: "Delivery"; zone: string; fee?: number }; // fee undefined = "Elsewhere", quoted later

export type PreorderLine = { variantId: string; qty: number; price: number };
export type Preorder = {
  id: string;
  ref: string;
  windowId: string;
  customer: string;
  phone: string;
  placedAt: string;
  lines: PreorderLine[];
  fulfilment: Fulfilment;
  allocated?: Record<string, number>; // set once the arrival is recorded
  forfeitedAt?: string;
};

export type InvoiceStatus = "Unpaid" | "Paid" | "Void";
export type Invoice = {
  id: string;
  number: string;
  preorderId: string;
  windowId: string;
  issuedAt: string;
  firstIssuedAt: string; // a reissue keeps the original due date and Forfeit clock
  dueAt: string;
  units: number;
  perUnit: number;
  deliveryFee?: number;
  total: number;
  status: InvoiceStatus;
  paidAt?: string;
  voidedAt?: string;
  voidReason?: string;
  replacesId?: string;
  replacedById?: string;
  by: string;
};

export type RefundFlag = {
  id: string;
  preorderId: string;
  windowId: string;
  units: number;
  amount: number;
  status: "To refund" | "Refunded";
  refundedAt?: string;
};

export type Arrival = {
  windowId: string;
  at: string;
  by: string;
  arrived: Record<string, number>;
  feePerUnit?: number;
  invoicesIssuedAt?: string;
};

export type Movement = {
  at: string;
  variantId: string;
  qty: number;
  kind: "Received" | "Released from Pre-order";
  source: string;
  by: string;
};

export const REMINDER_DAYS = [7, 13, 15, 28];
export const FORFEIT_DAY = 30;
export const FEE_WARN = 0.2;

// ---------- allocation ----------

export type VariantAllocation = {
  variantId: string;
  ordered: number;
  storeQuantity: number;
  expected: number;
  arrived: number;
  toPreorders: number;
  toStore: number;
  surplus: number;
  shortfall: number;
};
export type PreorderAllocation = {
  preorder: Preorder;
  ordered: number;
  allocated: number;
  short: number;
  refund: number;
  byVariant: Record<string, number>;
};

export function byPlaced(a: Preorder, b: Preorder) {
  return a.placedAt.localeCompare(b.placedAt) || a.ref.localeCompare(b.ref);
}

/** Pre-orders earliest first, then Store Quantity, then Surplus. */
export function allocate(w: OrderWindow, pos: Preorder[], arrived: Record<string, number>) {
  const sorted = pos.filter((p) => p.windowId === w.id).sort(byPlaced);
  const per: Record<string, Record<string, number>> = Object.fromEntries(sorted.map((p) => [p.id, {}]));
  const variants: VariantAllocation[] = w.offers.map((o) => {
    let left = arrived[o.variantId] ?? 0;
    const start = left;
    let ordered = 0;
    let shortfall = 0;
    for (const p of sorted) {
      const line = p.lines.find((l) => l.variantId === o.variantId);
      if (!line) continue;
      const give = Math.min(left, line.qty);
      per[p.id][o.variantId] = give;
      left -= give;
      ordered += line.qty;
      shortfall += line.qty - give;
    }
    const storeQuantity = o.storeQuantity ?? 0;
    const toStore = Math.min(left, storeQuantity);
    return {
      variantId: o.variantId,
      ordered,
      storeQuantity,
      expected: ordered + storeQuantity,
      arrived: start,
      toPreorders: start - left,
      toStore,
      surplus: left - toStore,
      shortfall,
    };
  });
  const preorders: PreorderAllocation[] = sorted.map((p) => {
    const ordered = p.lines.reduce((s, l) => s + l.qty, 0);
    const allocated = Object.values(per[p.id]).reduce((s, n) => s + n, 0);
    const refund = p.lines.reduce((s, l) => s + (l.qty - (per[p.id][l.variantId] ?? 0)) * l.price, 0);
    return { preorder: p, ordered, allocated, short: ordered - allocated, refund, byVariant: per[p.id] };
  });
  return { variants, preorders };
}

export function allocatedUnits(p: Preorder) {
  return Object.values(p.allocated ?? {}).reduce((s, n) => s + n, 0);
}
export function orderedUnits(p: Preorder) {
  return p.lines.reduce((s, l) => s + l.qty, 0);
}

// ---------- invoice helpers ----------

export function invoiceDay(inv: Invoice) {
  return daysBetween(inv.firstIssuedAt, TODAY);
}
export function remindersSent(inv: Invoice) {
  return REMINDER_DAYS.filter((d) => invoiceDay(inv) >= d);
}
export function isOverdue(inv: Invoice) {
  return inv.status === "Unpaid" && TODAY > inv.dueAt;
}
export function forfeitEligible(inv: Invoice) {
  return inv.status === "Unpaid" && invoiceDay(inv) >= FORFEIT_DAY;
}
export function invoiceTotal(units: number, perUnit: number, f: Fulfilment) {
  const deliveryFee = f.kind === "Delivery" ? f.fee : undefined;
  return { deliveryFee, total: units * perUnit + (deliveryFee ?? 0) };
}
export function feeOverEstimate(w: OrderWindow, perUnit?: number) {
  if (!w.shippingFeeEstimate || perUnit == null) return 0;
  return (perUnit - w.shippingFeeEstimate) / w.shippingFeeEstimate;
}

/** What one-action issuing would create for this window right now. */
export function invoicePlan(w: OrderWindow, pos: Preorder[], perUnit: number) {
  const rows = pos
    .filter((p) => p.windowId === w.id && !p.forfeitedAt)
    .sort(byPlaced)
    .map((p) => {
      const units = allocatedUnits(p);
      const { deliveryFee, total } = invoiceTotal(units, perUnit, p.fulfilment);
      const skip: string | undefined = units === 0 ? "Nothing arrived: fully refunded" : total === 0 ? "GH₵ 0: straight to Ready for handover" : undefined;
      return { p, units, deliveryFee, total, skip, deliveryLater: p.fulfilment.kind === "Delivery" && p.fulfilment.fee == null };
    });
  const issued = rows.filter((r) => !r.skip);
  return { rows, count: issued.length, units: issued.reduce((s, r) => s + r.units, 0), total: issued.reduce((s, r) => s + r.total, 0) };
}

// ---------- seed ----------

const P = (
  id: string,
  ref: string,
  windowId: string,
  customer: string,
  phone: string,
  placedAt: string,
  lines: [string, number, number][],
  fulfilment: Fulfilment,
): Preorder => ({ id, ref, windowId, customer, phone, placedAt, lines: lines.map(([variantId, qty, price]) => ({ variantId, qty, price })), fulfilment });

const PICKUP: Fulfilment = { kind: "Pickup" };
const ACCRA: Fulfilment = { kind: "Delivery", zone: "Accra Central", fee: 3000 };
const LEGON: Fulfilment = { kind: "Delivery", zone: "East Legon", fee: 2500 };

const S = 45000; // sneaker W2 Pre-order price
const seedPreorders: Preorder[] = [
  // Court Low Sneaker · Window 2 (In transit, arrival not yet recorded)
  P("s2a", "PO-2201", "ow_sneak2", "Ama Mensah", "024 555 0101", "2026-09-01", [["s1", 2, S], ["s2", 1, S]], PICKUP),
  P("s2b", "PO-2202", "ow_sneak2", "Kofi Boateng", "020 555 0102", "2026-09-01", [["s0", 1, S]], ACCRA),
  P("s2c", "PO-2203", "ow_sneak2", "Efua Asante", "054 555 0103", "2026-09-02", [["s2", 2, S]], PICKUP),
  P("s2d", "PO-2204", "ow_sneak2", "Yaw Owusu", "024 555 0104", "2026-09-03", [["s1", 1, S], ["s3", 1, S]], { kind: "Delivery", zone: "Elsewhere (Kumasi)" }),
  P("s2e", "PO-2205", "ow_sneak2", "Abena Darko", "055 555 0105", "2026-09-04", [["s0", 2, S]], PICKUP),
  P("s2f", "PO-2206", "ow_sneak2", "Kwesi Appiah", "026 555 0106", "2026-09-05", [["s2", 3, S]], LEGON),
  P("s2g", "PO-2207", "ow_sneak2", "Adwoa Ofori", "024 555 0107", "2026-09-07", [["s1", 2, S]], PICKUP),
  P("s2h", "PO-2208", "ow_sneak2", "Nana Agyei", "050 555 0108", "2026-09-09", [["s3", 2, S]], PICKUP),
  P("s2i", "PO-2209", "ow_sneak2", "Akua Sarpong", "024 555 0109", "2026-09-12", [["s0", 1, S], ["s1", 1, S]], PICKUP),
  P("s2j", "PO-2210", "ow_sneak2", "Kojo Amoah", "027 555 0110", "2026-09-15", [["s2", 2, S], ["s1", 1, S]], ACCRA),
  P("s2k", "PO-2211", "ow_sneak2", "Esi Quaye", "024 555 0111", "2026-09-18", [["s0", 1, S], ["s1", 1, S], ["s2", 1, S]], PICKUP),
  P("s2l", "PO-2212", "ow_sneak2", "Selorm Agbeko", "059 555 0112", "2026-09-20", [["s3", 1, S]], PICKUP),
  // Kente Weekend Tote · Window 1 (invoiced 20 Sep: day 36, two unpaid = eligible for Forfeit)
  P("t1a", "PO-1101", "ow_tote1", "Akosua Frimpong", "024 555 0201", "2026-07-01", [["v1", 2, 28000]], PICKUP),
  P("t1b", "PO-1102", "ow_tote1", "Yaa Asantewaa", "020 555 0202", "2026-07-02", [["v3", 1, 28000]], ACCRA),
  P("t1c", "PO-1103", "ow_tote1", "Kobby Nkansah", "054 555 0203", "2026-07-04", [["v1", 1, 28000]], PICKUP),
  P("t1d", "PO-1104", "ow_tote1", "Dede Tetteh", "024 555 0204", "2026-07-08", [["v1", 1, 28000], ["v3", 1, 28000]], PICKUP),
  P("t1e", "PO-1105", "ow_tote1", "Mawuli Kpodo", "026 555 0205", "2026-07-12", [["v3", 1, 28000]], LEGON),
  P("t1f", "PO-1106", "ow_tote1", "Afia Pokuaa", "055 555 0206", "2026-07-15", [["v1", 1, 28000]], PICKUP),
  // Kente Weekend Tote · Window 2 (invoiced 14 Oct: day 12; 2 units of Green short)
  P("t2a", "PO-1201", "ow_tote2", "Ewurama Badu", "024 555 0301", "2026-08-10", [["v1", 2, 29000]], PICKUP),
  P("t2b", "PO-1202", "ow_tote2", "Kwabena Osei", "020 555 0302", "2026-08-11", [["v3", 1, 29000]], PICKUP),
  P("t2c", "PO-1203", "ow_tote2", "Naa Adjeley", "054 555 0303", "2026-08-12", [["v1", 1, 29000], ["v3", 1, 29000]], ACCRA),
  P("t2d", "PO-1204", "ow_tote2", "Kweku Mensah", "024 555 0304", "2026-08-15", [["v1", 2, 29000]], { kind: "Delivery", zone: "Elsewhere (Tamale)" }),
  P("t2e", "PO-1205", "ow_tote2", "Adjoa Boakye", "026 555 0305", "2026-08-20", [["v3", 1, 29000]], PICKUP),
  P("t2f", "PO-1206", "ow_tote2", "Senyo Dzidzienyo", "055 555 0306", "2026-08-24", [["v1", 1, 29000]], PICKUP),
  P("t2g", "PO-1207", "ow_tote2", "Enyonam Ahiable", "024 555 0307", "2026-08-28", [["v3", 1, 29000]], PICKUP),
];

type State = {
  preorders: Preorder[];
  invoices: Invoice[];
  refunds: RefundFlag[];
  arrivals: Arrival[];
  movements: Movement[];
  log: string[];
};

let seq = 140;
const nextNumber = () => `INV-${String(++seq).padStart(4, "0")}`;
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

function seed(): State {
  const st: State = { preorders: seedPreorders, invoices: [], refunds: [], arrivals: [], movements: [], log: [] };
  const tote1 = { id: "ow_tote1", offers: [{ variantId: "v1", storeQuantity: 2 }, { variantId: "v3", storeQuantity: 1 }] } as OrderWindow;
  const tote2 = { id: "ow_tote2", offers: [{ variantId: "v1", storeQuantity: 2 }, { variantId: "v3", storeQuantity: 0 }] } as OrderWindow;
  const past: [OrderWindow, Record<string, number>, string, string, number, Record<string, string>][] = [
    [tote1, { v1: 7, v3: 4 }, "2026-09-18", "2026-09-20", 1800, { t1a: "2026-09-22", t1b: "2026-09-21", t1d: "2026-10-02", t1f: "2026-09-25" }],
    [tote2, { v1: 9, v3: 2 }, "2026-10-12", "2026-10-14", 1600, { t2a: "2026-10-15", t2b: "2026-10-14", t2f: "2026-10-20" }],
  ];
  for (const [w, arrived, at, issuedAt, perUnit, paid] of past) {
    const a = allocate(w, st.preorders, arrived);
    st.preorders = st.preorders.map((p) => {
      const pa = a.preorders.find((x) => x.preorder.id === p.id);
      return pa ? { ...p, allocated: pa.byVariant } : p;
    });
    for (const pa of a.preorders) if (pa.short) st.refunds.push({ id: rid("rf"), preorderId: pa.preorder.id, windowId: w.id, units: pa.short, amount: pa.refund, status: "To refund" });
    for (const va of a.variants)
      if (va.toStore + va.surplus) st.movements.push({ at, variantId: va.variantId, qty: va.toStore + va.surplus, kind: "Received", source: `Window arrival`, by: ME.staff });
    st.arrivals.push({ windowId: w.id, at, by: ME.staff, arrived, feePerUnit: perUnit, invoicesIssuedAt: issuedAt });
    for (const p of st.preorders.filter((x) => x.windowId === w.id)) {
      const units = allocatedUnits(p);
      if (!units) continue;
      const { deliveryFee, total } = invoiceTotal(units, perUnit, p.fulfilment);
      st.invoices.push({
        id: rid("inv"),
        number: nextNumber(),
        preorderId: p.id,
        windowId: w.id,
        issuedAt,
        firstIssuedAt: issuedAt,
        dueAt: addDays(issuedAt, 14),
        units,
        perUnit,
        deliveryFee,
        total,
        status: paid[p.id] ? "Paid" : "Unpaid",
        paidAt: paid[p.id],
        by: ME.staff,
      });
    }
  }
  // Naa Adjeley's invoice was voided (wrong Delivery Fee) and reissued, keeping its due date.
  const old = st.invoices.find((i) => i.preorderId === "t2c")!;
  const wrong = { ...old, deliveryFee: 4000, total: old.units * old.perUnit + 4000, status: "Void" as const, voidedAt: "2026-10-16", voidReason: "Wrong Delivery Zone fee", by: ME.staff };
  const re = { ...old, id: rid("inv"), number: nextNumber(), issuedAt: "2026-10-16", replacesId: wrong.id, by: ME.staff };
  wrong.replacedById = re.id;
  st.invoices = st.invoices.map((i) => (i.id === old.id ? wrong : i)).concat(re);
  st.log = ["Seeded: Tote W1 and W2 invoiced, Sneaker W2 in transit"];
  return st;
}

let state: State = seed();
const listeners = new Set<() => void>();

export function useArrivals(): State {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

function set(next: Partial<State>, logLine: string) {
  state = { ...state, ...next, log: [logLine, ...state.log].slice(0, 40) };
  listeners.forEach((l) => l());
}

// ---------- actions ----------

/** Records arrived units once; locks the arrival, marks the window Arrived and texts every Customer. */
export function recordArrival(w: OrderWindow, arrived: Record<string, number>, role: Role) {
  const by = ME[role];
  const a = allocate(w, state.preorders, arrived);
  const preorders = state.preorders.map((p) => {
    const pa = a.preorders.find((x) => x.preorder.id === p.id);
    return pa ? { ...p, allocated: pa.byVariant } : p;
  });
  const refunds = a.preorders
    .filter((pa) => pa.short)
    .map<RefundFlag>((pa) => ({ id: rid("rf"), preorderId: pa.preorder.id, windowId: w.id, units: pa.short, amount: pa.refund, status: "To refund" }));
  const movements = a.variants
    .filter((va) => va.toStore + va.surplus)
    .map<Movement>((va) => ({ at: TODAY, variantId: va.variantId, qty: va.toStore + va.surplus, kind: "Received", source: `Window ${w.number} arrival`, by }));
  const customers = a.preorders.length;
  saveWindow(
    { ...w, stage: "Arrived", expectedFrom: undefined, expectedTo: undefined, history: [...w.history, { stage: "Arrived", at: TODAY, by, smsTo: customers }] },
    by,
    "marked as Arrived",
  );
  set(
    {
      preorders,
      refunds: [...state.refunds, ...refunds],
      movements: [...state.movements, ...movements],
      arrivals: [...state.arrivals.filter((x) => x.windowId !== w.id), { windowId: w.id, at: TODAY, by, arrived }],
    },
    `${by} recorded Window ${w.number} arrival · ${refunds.length} refunds flagged · texted ${customers}`,
  );
}

/** One action: confirm the per-unit fee and issue every invoice for the window. */
export function issueInvoices(w: OrderWindow, perUnit: number, role: Role) {
  const by = ME[role];
  const plan = invoicePlan(w, state.preorders, perUnit);
  const created = plan.rows
    .filter((r) => !r.skip)
    .map<Invoice>((r) => ({
      id: rid("inv"),
      number: nextNumber(),
      preorderId: r.p.id,
      windowId: w.id,
      issuedAt: TODAY,
      firstIssuedAt: TODAY,
      dueAt: addDays(TODAY, 14),
      units: r.units,
      perUnit,
      deliveryFee: r.deliveryFee,
      total: r.total,
      status: "Unpaid",
      by,
    }));
  set(
    {
      invoices: [...state.invoices, ...created],
      arrivals: state.arrivals.map((a) => (a.windowId === w.id ? { ...a, feePerUnit: perUnit, invoicesIssuedAt: TODAY } : a)),
    },
    `${by} confirmed GH₵ ${perUnit / 100}/unit and issued ${created.length} invoices for Window ${w.number}`,
  );
}

export function voidAndReissue(invoiceId: string, patch: { perUnit?: number; deliveryFee?: number }, reason: string, role: Role) {
  const by = ME[role];
  const old = state.invoices.find((i) => i.id === invoiceId)!;
  const perUnit = patch.perUnit ?? old.perUnit;
  const deliveryFee = "deliveryFee" in patch ? patch.deliveryFee : old.deliveryFee;
  const re: Invoice = {
    ...old,
    id: rid("inv"),
    number: nextNumber(),
    issuedAt: TODAY,
    perUnit,
    deliveryFee,
    total: old.units * perUnit + (deliveryFee ?? 0),
    replacesId: old.id,
    replacedById: undefined,
    by,
  };
  set(
    {
      invoices: state.invoices
        .map((i) => (i.id === old.id ? { ...i, status: "Void" as const, voidedAt: TODAY, voidReason: reason, replacedById: re.id } : i))
        .concat(re),
    },
    `${by} voided ${old.number} (${reason}) and reissued as ${re.number}, due ${old.dueAt}`,
  );
}

/** Owner-only. Ends the Pre-order, voids its invoice, releases its units to Stock. Item Payment is kept. */
export function forfeit(preorderId: string, role: Role) {
  if (role !== "owner") return;
  const by = ME.owner;
  const p = state.preorders.find((x) => x.id === preorderId)!;
  const movements = Object.entries(p.allocated ?? {})
    .filter(([, n]) => n)
    .map<Movement>(([variantId, qty]) => ({ at: TODAY, variantId, qty, kind: "Released from Pre-order", source: `${p.ref} Forfeited`, by }));
  set(
    {
      preorders: state.preorders.map((x) => (x.id === preorderId ? { ...x, forfeitedAt: TODAY } : x)),
      invoices: state.invoices.map((i) => (i.preorderId === preorderId && i.status === "Unpaid" ? { ...i, status: "Void" as const, voidedAt: TODAY, voidReason: "Forfeited" } : i)),
      movements: [...state.movements, ...movements],
    },
    `${by} Forfeited ${p.ref} (${p.customer}) · ${allocatedUnits(p)} units released to Stock`,
  );
}

export function markRefunded(flagId: string, role: Role) {
  if (role !== "owner") return;
  const f = state.refunds.find((x) => x.id === flagId)!;
  set({ refunds: state.refunds.map((x) => (x.id === flagId ? { ...x, status: "Refunded" as const, refundedAt: TODAY } : x)) }, `${ME.owner} refunded ${f.units} unit(s) via Paystack`);
}

/** Prototype helper: pretend the Customer paid on /pay. */
export function simulatePayment(invoiceId: string) {
  const inv = state.invoices.find((i) => i.id === invoiceId)!;
  set({ invoices: state.invoices.map((i) => (i.id === invoiceId ? { ...i, status: "Paid" as const, paidAt: TODAY } : i)) }, `Customer paid ${inv.number} (simulated)`);
}

// ---------- read helpers ----------

export function liveInvoice(invoices: Invoice[], preorderId: string) {
  return invoices.find((i) => i.preorderId === preorderId && i.status !== "Void");
}

export function windowFollowUp(w: OrderWindow, s: State) {
  const live = s.invoices.filter((i) => i.windowId === w.id && i.status !== "Void");
  const paid = live.filter((i) => i.status === "Paid");
  const unpaid = live.filter((i) => i.status === "Unpaid");
  return {
    live,
    paid,
    unpaid,
    overdue: unpaid.filter(isOverdue),
    eligible: unpaid.filter(forfeitEligible),
    collected: paid.reduce((s2, i) => s2 + i.total, 0),
    outstanding: unpaid.reduce((s2, i) => s2 + i.total, 0),
    refunds: s.refunds.filter((r) => r.windowId === w.id),
    issued: s.arrivals.find((a) => a.windowId === w.id)?.invoicesIssuedAt,
  };
}

export function stockOf(p: Product, variantId: string, s: State) {
  const base = p.variants.find((v) => v.id === variantId)?.stock ?? 0;
  return base + s.movements.filter((m) => m.variantId === variantId && m.at === TODAY).reduce((n, m) => n + m.qty, 0);
}

export function invoiceSms(inv: Invoice, p: Product, w: OrderWindow) {
  return `Emblish: your ${p.name} (Window ${w.number}) has arrived. Shipping Fee ${inv.units} × GH₵ ${inv.perUnit / 100}${
    inv.deliveryFee ? ` + Delivery GH₵ ${inv.deliveryFee / 100}` : ""
  } = GH₵ ${inv.total / 100}, due ${inv.dueAt.slice(8)}/${inv.dueAt.slice(5, 7)}. Pay: emblish.com/pay/${inv.number}`;
}
