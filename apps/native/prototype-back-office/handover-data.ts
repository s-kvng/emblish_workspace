// PROTOTYPE (wayfinder #17): in-memory handover, order actions, refunds, Stock ledger, Delivery Zones and Staff.
// Throwaway, never merged. Rules come from "Fulfilment: Pickup and Delivery" (Pickup Code, zones, Elsewhere quote,
// switch until dispatch, whole orders only, uncollected = reminders only), "In-stock purchase lifecycle" (Store Order
// statuses, Staff cancel by line until handover, Owner refunds after handover, late-paid flags), "Inventory model"
// (append-only Stock Movements, Adjustment, Sold offline) and "Staff roles" (Owner-only refunds, zones, Staff).
// Pre-orders, Shipping Fee Invoices and Shortfall refunds are read from arrival-data so both prototypes agree.
import { useSyncExternalStore } from "react";

import { ME, TODAY, addDays, daysBetween, ghs, saveProduct, saveWindow, type OrderWindow, type Product, type Role } from "./bo-data";
import { liveInvoice, markRefunded, useArrivals, type Fulfilment, type Invoice, type Preorder, type RefundFlag } from "./arrival-data";

// ---------- types ----------

export type StoreOrderLine = { variantId: string; qty: number; price: number; cancelled: number };
export type StoreOrder = {
  id: string;
  ref: string;
  customer: string;
  phone: string;
  placedAt: string;
  paidAt: string;
  lines: StoreOrderLine[];
  fulfilment: Fulfilment;
  deliveryFeePaid: boolean; // fixed-zone fees are paid at checkout; Elsewhere is quoted after
  lateFlagged?: { variantId: string; units: number }; // paid after the Stock Hold expired and Stock couldn't cover it
};

export type HandoverStatus = "Collected" | "Dispatched" | "Delivered";
export type HandoverEvent = { at: string; what: string; by: string };
export type HandoverRecord = {
  status?: HandoverStatus;
  collectedAt?: string;
  dispatchedAt?: string;
  rider?: string;
  deliveredAt?: string;
  override?: string; // reason the Pickup Code was skipped
  failed: { at: string; reason: string; by: string }[];
  events: HandoverEvent[];
  fulfilment?: Fulfilment; // set when switched
  pickupCode: string;
  readyAt?: string; // seeded for Pre-orders whose last invoice was paid before today
};

export type DeliveryFeeInvoice = {
  id: string;
  number: string;
  orderId: string;
  amount: number;
  issuedAt: string;
  status: "Unpaid" | "Paid" | "Void";
  paidAt?: string;
  by: string;
};

export type RefundKind = "Shortfall" | "Late-paid" | "Cancelled line" | "After handover" | "Fulfilment switch";
export type HRefund = {
  id: string;
  orderId: string;
  kind: Exclude<RefundKind, "Shortfall">;
  units: number;
  amount: number;
  status: "To refund" | "Refunded";
  reason: string;
  flaggedAt: string;
  flaggedBy: string;
  refundedAt?: string;
  restock?: boolean;
};

export type MovementKind = "Received" | "Sold" | "Sold offline" | "Adjustment" | "Cancelled" | "Released from Pre-order" | "Returned";
export type HMovement = { at: string; variantId: string; qty: number; kind: MovementKind; note: string; by: string };

export type Zone = { id: string; name: string; fee?: number; archived?: boolean; elsewhere?: boolean };
export type StaffMember = { id: string; name: string; email: string; role: Role; status: "Active" | "Invited" | "Deactivated"; since: string };

// ---------- seed ----------

const PICKUP: Fulfilment = { kind: "Pickup" };
const SO = (
  id: string,
  ref: string,
  customer: string,
  phone: string,
  placedAt: string,
  lines: [string, number, number][],
  fulfilment: Fulfilment,
  extra: Partial<StoreOrder> = {},
): StoreOrder => ({
  id,
  ref,
  customer,
  phone,
  placedAt,
  paidAt: placedAt,
  lines: lines.map(([variantId, qty, price]) => ({ variantId, qty, price, cancelled: 0 })),
  fulfilment,
  deliveryFeePaid: fulfilment.kind === "Delivery" && fulfilment.fee != null,
  ...extra,
});

const seedStore: StoreOrder[] = [
  SO("so1", "SO-3001", "Abena Kyei", "024 555 0401", "2026-10-24", [["v1", 1, 34000], ["s1", 1, 52000]], PICKUP),
  SO("so2", "SO-3002", "Kofi Boateng", "020 555 0102", "2026-10-25", [["s4", 1, 52000]], { kind: "Delivery", zone: "Accra Central", fee: 3000 }),
  SO("so3", "SO-3003", "Efua Owusu", "054 555 0403", "2026-10-25", [["v3", 1, 34000]], { kind: "Delivery", zone: "Elsewhere (Takoradi)" }),
  SO("so4", "SO-3004", "Yaw Darko", "024 555 0404", "2026-10-23", [["v1", 1, 34000]], { kind: "Delivery", zone: "East Legon", fee: 2500 }),
  SO("so5", "SO-3005", "Ama Mensah", "024 555 0101", "2026-10-26", [["s1", 2, 52000]], PICKUP, { lateFlagged: { variantId: "s1", units: 1 } }),
  SO("so6", "SO-3006", "Ewurama Badu", "024 555 0301", "2026-10-22", [["v3", 1, 34000]], PICKUP),
  SO("so7", "SO-2990", "Dede Tetteh", "024 555 0204", "2026-10-08", [["v1", 1, 34000], ["s2", 1, 52000]], PICKUP),
  SO("so8", "SO-2981", "Kojo Amoah", "027 555 0110", "2026-10-02", [["s4", 1, 52000]], PICKUP),
];

const code = (n: number) => String(100000 + ((n * 7919) % 899999)).replace(/(\d{3})(\d{3})/, "$1$2");
const ev = (at: string, what: string, by = ME.staff): HandoverEvent => ({ at, what, by });

function seedRecords(): Record<string, HandoverRecord> {
  const r: Record<string, HandoverRecord> = {};
  const ids = [...seedStore.map((s) => s.id), "t1a", "t1b", "t1c", "t1d", "t1e", "t1f", "t2a", "t2b", "t2c", "t2d", "t2e", "t2f", "t2g", ..."abcdefghijkl".split("").map((c) => `s2${c}`)];
  ids.forEach((id, i) => (r[id] = { failed: [], events: [], pickupCode: code(i + 3) }));
  r.so4 = { ...r.so4, status: "Dispatched", dispatchedAt: "2026-10-25", rider: "Musah (Bolt)", events: [ev("2026-10-25", "Dispatched with Musah (Bolt)")] };
  r.so7 = { ...r.so7, status: "Collected", collectedAt: "2026-10-09", events: [ev("2026-10-09", "Collected · Pickup Code checked")] };
  r.so8 = { ...r.so8, readyAt: "2026-10-02" };
  r.t1a = { ...r.t1a, status: "Collected", collectedAt: "2026-09-24", events: [ev("2026-09-24", "Collected · Pickup Code checked")] };
  r.t1b = {
    ...r.t1b,
    status: "Delivered",
    dispatchedAt: "2026-09-22",
    deliveredAt: "2026-09-23",
    rider: "Musah (Bolt)",
    failed: [{ at: "2026-09-22", reason: "Customer not reachable", by: ME.staff }],
    events: [ev("2026-09-22", "Dispatched with Musah (Bolt)"), ev("2026-09-22", "Delivery failed · Customer not reachable"), ev("2026-09-23", "Delivered")],
  };
  r.t1d = { ...r.t1d, readyAt: "2026-10-02" };
  r.t1f = { ...r.t1f, readyAt: "2026-09-25" };
  r.t2a = { ...r.t2a, readyAt: "2026-10-15" };
  r.t2b = { ...r.t2b, readyAt: "2026-10-14" };
  r.t2f = { ...r.t2f, readyAt: "2026-10-20" };
  return r;
}

const seedRefunds: HRefund[] = [
  {
    id: "hr_late",
    orderId: "so5",
    kind: "Late-paid",
    units: 1,
    amount: 52000,
    status: "To refund",
    reason: "Paid 4 min after the Stock Hold expired; only 1 of 2 left in Stock",
    flaggedAt: TODAY,
    flaggedBy: "System",
  },
];

// Ledger history. Current Stock = the Variant's seeded stock in bo-data + anything recorded in this session.
const seedLedger: HMovement[] = [
  { at: "2026-09-18", variantId: "v1", qty: 3, kind: "Received", note: "Window 1 arrival (Store Quantity 2 + Surplus 1)", by: ME.staff },
  { at: "2026-09-30", variantId: "v1", qty: -1, kind: "Sold", note: "SO-2950", by: "Storefront" },
  { at: "2026-10-08", variantId: "v1", qty: -1, kind: "Sold", note: "SO-2990", by: "Storefront" },
  { at: "2026-10-12", variantId: "v1", qty: 4, kind: "Received", note: "Window 2 arrival (Store Quantity 2 + Surplus 2)", by: ME.staff },
  { at: "2026-10-17", variantId: "v1", qty: -1, kind: "Sold offline", note: "Walk-in, cash", by: ME.staff },
  { at: "2026-10-20", variantId: "v1", qty: -1, kind: "Adjustment", note: "Damaged: handle torn", by: ME.owner },
  { at: "2026-10-23", variantId: "v1", qty: -1, kind: "Sold", note: "SO-3004", by: "Storefront" },
  { at: "2026-10-24", variantId: "v1", qty: -1, kind: "Sold", note: "SO-3001", by: "Storefront" },
  { at: "2026-10-25", variantId: "v1", qty: 3, kind: "Adjustment", note: "Recount: 3 found in back room", by: ME.staff },
  { at: "2026-10-01", variantId: "s1", qty: 6, kind: "Received", note: "Window 1 arrival", by: ME.staff },
  { at: "2026-10-10", variantId: "s1", qty: -2, kind: "Sold offline", note: "Instagram DM, MoMo", by: ME.staff },
  { at: "2026-10-24", variantId: "s1", qty: -1, kind: "Sold", note: "SO-3001", by: "Storefront" },
  { at: "2026-10-26", variantId: "s1", qty: 1, kind: "Cancelled", note: "SO-2999 line cancelled", by: ME.staff },
  { at: "2026-10-26", variantId: "s1", qty: -1, kind: "Sold", note: "SO-3005 (1 of 2 covered)", by: "Storefront" },
];

const seedZones: Zone[] = [
  { id: "z1", name: "Accra Central", fee: 3000 },
  { id: "z2", name: "East Legon", fee: 2500 },
  { id: "z3", name: "Tema", fee: 3500 },
  { id: "z4", name: "Kasoa", fee: 4000 },
  { id: "z5", name: "Spintex", fee: 3000, archived: true },
  { id: "z_else", name: "Elsewhere in Ghana", elsewhere: true },
];

const seedStaff: StaffMember[] = [
  { id: "u1", name: "Akosua Owusu-Ansah", email: "akosua@emblish.com", role: "owner", status: "Active", since: "2026-06-01" },
  { id: "u2", name: "Kwame Asare", email: "kwame@emblish.com", role: "staff", status: "Active", since: "2026-06-10" },
  { id: "u3", name: "Efia Nyarko", email: "efia@emblish.com", role: "staff", status: "Invited", since: "2026-10-24" },
  { id: "u4", name: "Kojo Mensah", email: "kojo@emblish.com", role: "staff", status: "Deactivated", since: "2026-06-10" },
];

// ---------- store ----------

type State = {
  storeOrders: StoreOrder[];
  records: Record<string, HandoverRecord>;
  dfInvoices: DeliveryFeeInvoice[];
  refunds: HRefund[];
  ledger: HMovement[];
  zones: Zone[];
  staff: StaffMember[];
  sms: string[];
  log: string[];
};

let state: State = {
  storeOrders: seedStore,
  records: seedRecords(),
  dfInvoices: [],
  refunds: seedRefunds,
  ledger: seedLedger,
  zones: seedZones,
  staff: seedStaff,
  sms: [],
  log: ["Seeded: 8 Store Orders, Tote W1/W2 Pre-orders, 1 late-paid flag"],
};
const listeners = new Set<() => void>();

export function useHandover(): State {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

function set(next: Partial<State>, logLine: string, sms?: string) {
  state = { ...state, ...next, log: [logLine, ...state.log].slice(0, 50), sms: sms ? [sms, ...state.sms].slice(0, 30) : state.sms };
  listeners.forEach((l) => l());
}
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
let dfSeq = 300;

function rec(id: string): HandoverRecord {
  return state.records[id] ?? { failed: [], events: [], pickupCode: code(Object.keys(state.records).length + 40) };
}
function patchRec(id: string, patch: Partial<HandoverRecord>, what: string, by: string) {
  const r = rec(id);
  return { ...state.records, [id]: { ...r, ...patch, events: [...r.events, { at: TODAY, what, by }] } };
}

// ---------- the unified order view ----------

export type OrderState =
  | "Awaiting goods"
  | "Awaiting payment"
  | "Needs Delivery Fee quote"
  | "Awaiting Delivery Fee"
  | "Ready for handover"
  | "Dispatched"
  | "Collected"
  | "Delivered"
  | "Cancelled"
  | "Forfeited";

export type OLine = { variantId: string; productId: string; qty: number; price: number; cancelled: number };
export type HOrder = {
  id: string;
  ref: string;
  kind: "Store Order" | "Pre-order";
  customer: string;
  phone: string;
  placedAt: string;
  lines: OLine[];
  fulfilment: Fulfilment;
  state: OrderState;
  blocker?: string; // why it isn't ready
  pickupCode: string;
  readyAt?: string;
  record: HandoverRecord;
  shippingInvoice?: Invoice;
  dfInvoice?: DeliveryFeeInvoice;
  windowLabel?: string;
  paid: number; // everything the Customer has paid on this order
};

export const isElsewhere = (f: Fulfilment) => f.kind === "Delivery" && f.fee == null;
export const digits = (s: string) => s.replace(/\D/g, "");
export const unitsOf = (o: HOrder) => o.lines.reduce((n, l) => n + l.qty - l.cancelled, 0);
export const isDone = (o: HOrder) => ["Collected", "Delivered", "Cancelled", "Forfeited"].includes(o.state);
export const isHandedOver = (o: HOrder) => ["Collected", "Dispatched", "Delivered"].includes(o.state);

/** Joins Store Orders (here) with Pre-orders (arrival-data) into one list the Back Office acts on. */
export function useOrders(): HOrder[] {
  const h = useHandover();
  const a = useArrivals();
  return buildOrders(h, a.preorders, a.invoices);
}

function productOf(variantId: string) {
  if (variantId.startsWith("v")) return "p_tote";
  if (variantId.startsWith("s")) return "p_sneak";
  return "p_wig";
}

export function buildOrders(h: State, preorders: Preorder[], invoices: Invoice[]): HOrder[] {
  const out: HOrder[] = [];
  for (const so of h.storeOrders) {
    const r = h.records[so.id] ?? { failed: [], events: [], pickupCode: "000000" };
    const f = r.fulfilment ?? so.fulfilment;
    const df = h.dfInvoices.filter((d) => d.orderId === so.id && d.status !== "Void").at(-1);
    const lines = so.lines.map((l) => ({ ...l, productId: productOf(l.variantId), qty: l.qty - (so.lateFlagged?.variantId === l.variantId ? so.lateFlagged.units : 0) }));
    const allCancelled = lines.every((l) => l.cancelled >= l.qty);
    let st: OrderState;
    let blocker: string | undefined;
    if (allCancelled) st = "Cancelled";
    else if (r.status) st = r.status;
    else if (isElsewhere(f) && !df) (st = "Needs Delivery Fee quote"), (blocker = "Elsewhere: Staff quote the Delivery Fee first");
    else if (isElsewhere(f) && df?.status === "Unpaid") (st = "Awaiting Delivery Fee"), (blocker = `Delivery Fee ${ghs(df.amount)} unpaid`);
    else st = "Ready for handover";
    const paid = lines.reduce((n, l) => n + l.qty * l.price, 0) + (f.kind === "Delivery" && f.fee != null && so.deliveryFeePaid ? f.fee : 0) + (df?.status === "Paid" ? df.amount : 0);
    out.push({
      id: so.id,
      ref: so.ref,
      kind: "Store Order",
      customer: so.customer,
      phone: so.phone,
      placedAt: so.placedAt,
      lines,
      fulfilment: f,
      state: st,
      blocker,
      pickupCode: r.pickupCode,
      readyAt: st === "Ready for handover" ? (r.readyAt ?? (df?.paidAt || so.paidAt)) : r.readyAt,
      record: r,
      dfInvoice: df,
      paid,
    });
  }
  for (const p of preorders) {
    const r = h.records[p.id] ?? { failed: [], events: [], pickupCode: "000000" };
    const f = r.fulfilment ?? p.fulfilment;
    const inv = liveInvoice(invoices, p.id);
    const df = h.dfInvoices.filter((d) => d.orderId === p.id && d.status !== "Void").at(-1);
    const units = Object.values(p.allocated ?? {}).reduce((s, n) => s + n, 0);
    const lines = p.lines.map((l) => ({ variantId: l.variantId, productId: productOf(l.variantId), qty: p.allocated ? (p.allocated[l.variantId] ?? 0) : l.qty, price: l.price, cancelled: 0 }));
    let st: OrderState;
    let blocker: string | undefined;
    if (p.forfeitedAt) st = "Forfeited";
    else if (!p.allocated) (st = "Awaiting goods"), (blocker = "Window not arrived yet");
    else if (units === 0) st = "Cancelled";
    else if (r.status) st = r.status;
    else if (!inv || inv.status !== "Paid") (st = "Awaiting payment"), (blocker = inv ? `Shipping Fee Invoice ${inv.number} unpaid` : "Shipping Fee not invoiced yet");
    else if (isElsewhere(f) && !df) (st = "Needs Delivery Fee quote"), (blocker = "Elsewhere: Staff quote the Delivery Fee first");
    else if (isElsewhere(f) && df?.status === "Unpaid") (st = "Awaiting Delivery Fee"), (blocker = `Delivery Fee ${ghs(df.amount)} unpaid`);
    else st = "Ready for handover";
    const paid = p.lines.reduce((n, l) => n + l.qty * l.price, 0) + (inv?.status === "Paid" ? inv.total : 0) + (df?.status === "Paid" ? df.amount : 0);
    out.push({
      id: p.id,
      ref: p.ref,
      kind: "Pre-order",
      customer: p.customer,
      phone: p.phone,
      placedAt: p.placedAt,
      lines,
      fulfilment: f,
      state: st,
      blocker,
      pickupCode: r.pickupCode,
      readyAt: st === "Ready for handover" ? (r.readyAt ?? df?.paidAt ?? inv?.paidAt) : r.readyAt,
      record: r,
      shippingInvoice: inv,
      dfInvoice: df,
      windowLabel: p.windowId === "ow_tote1" ? "Tote W1" : p.windowId === "ow_tote2" ? "Tote W2" : "Sneaker W2",
      paid,
    });
  }
  return out;
}

/** Phone (any formatting, last 9 digits) or a 6-digit Pickup Code. Returns every order for that Customer. */
export function search(orders: HOrder[], q: string): { byCode?: HOrder; customerOrders: HOrder[] } {
  const d = digits(q);
  if (d.length < 4) return { customerOrders: [] };
  const byCode = d.length === 6 ? orders.find((o) => o.pickupCode === d) : undefined;
  const phoneKey = d.length >= 9 ? d.slice(-9) : undefined;
  const phone = byCode?.phone ?? orders.find((o) => phoneKey && digits(o.phone).slice(-9) === phoneKey)?.phone;
  const customerOrders = phone ? orders.filter((o) => o.phone === phone) : orders.filter((o) => digits(o.phone).endsWith(d));
  return { byCode, customerOrders };
}

export function daysWaiting(o: HOrder) {
  return o.readyAt ? daysBetween(o.readyAt, TODAY) : 0;
}
export const UNCOLLECTED_AFTER = 7;
export const UNCOLLECTED_REMINDERS = [3, 7, 14, 21, 28]; // placeholder schedule; exact days belong to Notification content
export function remindersSentFor(o: HOrder) {
  const d = daysWaiting(o);
  return UNCOLLECTED_REMINDERS.filter((x) => d >= x);
}

// ---------- handover actions ----------

export function collect(o: HOrder, role: Role, override?: string) {
  const by = ME[role];
  set(
    { records: patchRec(o.id, { status: "Collected", collectedAt: TODAY, override }, override ? `Collected · code skipped: ${override}` : "Collected · Pickup Code checked", by) },
    `${by} handed over ${o.ref} (${o.customer})${override ? ` without code: ${override}` : ""}`,
  );
}

export function dispatch(o: HOrder, role: Role, rider?: string) {
  const by = ME[role];
  set(
    { records: patchRec(o.id, { status: "Dispatched", dispatchedAt: TODAY, rider }, `Dispatched${rider ? ` with ${rider}` : ""}`, by) },
    `${by} dispatched ${o.ref}${rider ? ` with ${rider}` : ""}`,
    `To ${o.phone}: Emblish: your order ${o.ref} is on its way${rider ? ` with ${rider}` : ""}.`,
  );
}

export function deliver(o: HOrder, role: Role) {
  const by = ME[role];
  set({ records: patchRec(o.id, { status: "Delivered", deliveredAt: TODAY }, "Delivered", by) }, `${by} marked ${o.ref} Delivered`);
}

/** Back to Ready for handover with the attempt on record. No new fee (assumption). */
export function failDelivery(o: HOrder, role: Role, reason: string) {
  const by = ME[role];
  const r = rec(o.id);
  set(
    {
      records: patchRec(o.id, { status: undefined, dispatchedAt: undefined, rider: undefined, readyAt: TODAY, failed: [...r.failed, { at: TODAY, reason, by }] }, `Delivery failed · ${reason}`, by),
    },
    `${by} recorded a failed delivery for ${o.ref}: ${reason}`,
  );
}

// ---------- order actions ----------

export function quoteDeliveryFee(o: HOrder, amount: number, role: Role) {
  const by = ME[role];
  const inv: DeliveryFeeInvoice = { id: rid("df"), number: `DF-${++dfSeq}`, orderId: o.id, amount, issuedAt: TODAY, status: "Unpaid", by };
  set(
    { dfInvoices: [...state.dfInvoices, inv] },
    `${by} quoted ${ghs(amount)} Delivery Fee for ${o.ref} → ${inv.number}`,
    `To ${o.phone}: Emblish: Delivery Fee to ${o.fulfilment.kind === "Delivery" ? o.fulfilment.zone.replace("Elsewhere ", "") : ""} for ${o.ref} is ${ghs(amount)}. Pay: emblish.com/pay/${inv.number}`,
  );
}

export function simulateDfPaid(o: HOrder) {
  const df = o.dfInvoice;
  if (!df) return;
  set({ dfInvoices: state.dfInvoices.map((d) => (d.id === df.id ? { ...d, status: "Paid" as const, paidAt: TODAY } : d)) }, `Customer paid ${df.number} (simulated)`);
}

export function feeOf(f: Fulfilment) {
  return f.kind === "Delivery" ? (f.fee ?? 0) : 0;
}

/** What switching from the current fulfilment would do to money. */
export function switchEffect(o: HOrder, to: Fulfilment) {
  const fromFee = feeOf(o.fulfilment);
  const toFee = feeOf(to);
  const feePaid = o.kind === "Store Order" ? o.fulfilment.kind === "Delivery" && o.fulfilment.fee != null : o.shippingInvoice?.status === "Paid";
  const diff = toFee - fromFee;
  if (isElsewhere(to)) return { diff, text: feePaid && fromFee ? `Refund ${ghs(fromFee)} (old zone fee). Staff then quote the Elsewhere fee.` : "Staff quote the Elsewhere Delivery Fee next.", kind: "quote" as const };
  if (!feePaid) return { diff, text: diff ? `Unpaid invoice is voided and reissued ${diff > 0 ? "+" : "−"}${ghs(Math.abs(diff))}` : "No money change", kind: "adjust" as const };
  if (diff > 0) return { diff, text: `Customer owes ${ghs(diff)}: a Delivery Fee Invoice is sent`, kind: "invoice" as const };
  if (diff < 0) return { diff, text: `Customer is owed ${ghs(-diff)}: flagged for an Owner refund`, kind: "refund" as const };
  return { diff, text: "No money change", kind: "none" as const };
}

export function switchFulfilment(o: HOrder, to: Fulfilment, role: Role) {
  const by = ME[role];
  const fx = switchEffect(o, to);
  const label = to.kind === "Pickup" ? "Pickup" : to.zone;
  let dfInvoices = state.dfInvoices.map((d) => (d.orderId === o.id && d.status === "Unpaid" ? { ...d, status: "Void" as const } : d));
  let refunds = state.refunds;
  if (fx.kind === "invoice") dfInvoices = [...dfInvoices, { id: rid("df"), number: `DF-${++dfSeq}`, orderId: o.id, amount: fx.diff, issuedAt: TODAY, status: "Unpaid", by }];
  if (fx.kind === "refund" || (fx.kind === "quote" && fx.text.startsWith("Refund")))
    refunds = [...refunds, { id: rid("hr"), orderId: o.id, kind: "Fulfilment switch", units: 0, amount: fx.kind === "refund" ? -fx.diff : feeOf(o.fulfilment), status: "To refund", reason: `Switched to ${label}`, flaggedAt: TODAY, flaggedBy: by }];
  set(
    { records: patchRec(o.id, { fulfilment: to }, `Switched to ${label} · ${fx.text}`, by), dfInvoices, refunds },
    `${by} switched ${o.ref} to ${label} (${fx.text})`,
    `To ${o.phone}: Emblish: ${o.ref} is now ${to.kind === "Pickup" ? "for Pickup" : `for Delivery to ${label}`}. ${fx.text}.`,
  );
}

/** Staff cancel Store Order lines until handover. Units go back to Stock; the money is flagged for an Owner refund. */
export function cancelLines(o: HOrder, qty: Record<string, number>, reason: string, role: Role) {
  const by = ME[role];
  const so = state.storeOrders.find((s) => s.id === o.id);
  if (!so) return;
  const lines = so.lines.map((l) => ({ ...l, cancelled: l.cancelled + (qty[l.variantId] ?? 0) }));
  const units = Object.values(qty).reduce((s, n) => s + n, 0);
  const amount = so.lines.reduce((s, l) => s + (qty[l.variantId] ?? 0) * l.price, 0);
  const whole = lines.every((l) => l.cancelled >= l.qty - (so.lateFlagged?.variantId === l.variantId ? so.lateFlagged.units : 0));
  const fee = whole && so.fulfilment.kind === "Delivery" && so.deliveryFeePaid ? (so.fulfilment.fee ?? 0) : 0;
  const movements = Object.entries(qty)
    .filter(([, n]) => n)
    .map<HMovement>(([variantId, n]) => ({ at: TODAY, variantId, qty: n, kind: "Cancelled", note: `${so.ref} line cancelled`, by }));
  set(
    {
      storeOrders: state.storeOrders.map((s) => (s.id === so.id ? { ...s, lines } : s)),
      ledger: [...state.ledger, ...movements],
      refunds: [...state.refunds, { id: rid("hr"), orderId: so.id, kind: "Cancelled line", units, amount: amount + fee, status: "To refund", reason: reason + (fee ? " (+ Delivery Fee)" : ""), flaggedAt: TODAY, flaggedBy: by }],
      records: patchRec(o.id, {}, `${whole ? "Order cancelled" : `${units} unit(s) cancelled`} · ${reason}`, by),
    },
    `${by} cancelled ${units} unit(s) of ${so.ref} (${reason}) · ${ghs(amount + fee)} flagged for refund`,
  );
}

/** Owner refunds a handed-over order (both types). Optional restock adds a Returned movement. */
export function refundAfterHandover(o: HOrder, qty: Record<string, number>, amount: number, reason: string, restock: boolean, role: Role) {
  if (role !== "owner") return;
  const by = ME.owner;
  const units = Object.values(qty).reduce((s, n) => s + n, 0);
  const movements = restock
    ? Object.entries(qty)
        .filter(([, n]) => n)
        .map<HMovement>(([variantId, n]) => ({ at: TODAY, variantId, qty: n, kind: "Returned", note: `${o.ref} returned · ${reason}`, by }))
    : [];
  set(
    {
      refunds: [...state.refunds, { id: rid("hr"), orderId: o.id, kind: "After handover", units, amount, status: "Refunded", reason, flaggedAt: TODAY, flaggedBy: by, refundedAt: TODAY, restock }],
      ledger: [...state.ledger, ...movements],
      records: patchRec(o.id, {}, `Refunded ${ghs(amount)} · ${reason}${restock ? " · restocked" : ""}`, by),
    },
    `${by} refunded ${ghs(amount)} on ${o.ref} via Paystack${restock ? `, ${units} unit(s) back to Stock` : ""}`,
    `To ${o.phone}: Emblish: we've refunded ${ghs(amount)} for ${o.ref}. It can take a few days to reach you.`,
  );
}

// ---------- unified refunds queue ----------

export type QueueRefund = {
  id: string;
  kind: RefundKind;
  orderId: string;
  ref: string;
  customer: string;
  phone: string;
  units: number;
  amount: number;
  status: "To refund" | "Refunded";
  reason: string;
  flaggedAt: string;
  refundedAt?: string;
};

export function useRefundQueue(): QueueRefund[] {
  const h = useHandover();
  const a = useArrivals();
  const orders = buildOrders(h, a.preorders, a.invoices);
  const find = (id: string) => orders.find((o) => o.id === id);
  const shortfall = a.refunds.map<QueueRefund>((r: RefundFlag) => {
    const o = find(r.preorderId);
    const arrivedAt = a.arrivals.find((x) => x.windowId === r.windowId)?.at ?? TODAY;
    return { id: r.id, kind: "Shortfall", orderId: r.preorderId, ref: o?.ref ?? "", customer: o?.customer ?? "", phone: o?.phone ?? "", units: r.units, amount: r.amount, status: r.status, reason: `${r.units} unit(s) didn't arrive (${o?.windowLabel})`, flaggedAt: arrivedAt, refundedAt: r.refundedAt };
  });
  const mine = h.refunds.map<QueueRefund>((r) => {
    const o = find(r.orderId);
    return { id: r.id, kind: r.kind, orderId: r.orderId, ref: o?.ref ?? "", customer: o?.customer ?? "", phone: o?.phone ?? "", units: r.units, amount: r.amount, status: r.status, reason: r.reason, flaggedAt: r.flaggedAt, refundedAt: r.refundedAt };
  });
  return [...mine, ...shortfall].sort((x, y) => (x.status === y.status ? y.flaggedAt.localeCompare(x.flaggedAt) : x.status === "To refund" ? -1 : 1));
}

/** Owner pays out a flagged refund (any kind) via Paystack. */
export function payRefund(q: QueueRefund, role: Role) {
  if (role !== "owner") return;
  if (q.kind === "Shortfall") return markRefunded(q.id, role);
  set(
    { refunds: state.refunds.map((r) => (r.id === q.id ? { ...r, status: "Refunded" as const, refundedAt: TODAY } : r)) },
    `${ME.owner} refunded ${ghs(q.amount)} (${q.kind}) on ${q.ref} via Paystack`,
    `To ${q.phone}: Emblish: we've refunded ${ghs(q.amount)} for ${q.ref}.`,
  );
}

// ---------- Stock ----------

export function useStock(variantId: string, base: number) {
  const h = useHandover();
  const a = useArrivals();
  const todayArrivals = a.movements.filter((m) => m.variantId === variantId && m.at === TODAY).reduce((n, m) => n + m.qty, 0);
  const session = h.ledger.filter((m) => m.variantId === variantId && !seedLedger.includes(m)).reduce((n, m) => n + m.qty, 0);
  const history = [
    ...h.ledger.filter((m) => m.variantId === variantId),
    ...a.movements.filter((m) => m.variantId === variantId && m.at === TODAY).map<HMovement>((m) => ({ at: m.at, variantId, qty: m.qty, kind: m.kind === "Received" ? "Received" : "Released from Pre-order", note: m.source, by: m.by })),
  ].sort((x, y) => y.at.localeCompare(x.at));
  return { current: base + todayArrivals + session, history };
}

export const ADJUST_REASONS = ["Damaged", "Lost / missing", "Recount", "Found", "Returned by Customer", "Other"];

export function adjustStock(variantId: string, qty: number, reason: string, note: string, role: Role) {
  const by = ME[role];
  set({ ledger: [...state.ledger, { at: TODAY, variantId, qty, kind: "Adjustment", note: `${reason}${note ? `: ${note}` : ""}`, by }] }, `${by} adjusted ${variantId} by ${qty > 0 ? "+" : ""}${qty} (${reason})`);
}

export function soldOffline(variantId: string, qty: number, note: string, role: Role) {
  const by = ME[role];
  set({ ledger: [...state.ledger, { at: TODAY, variantId, qty: -qty, kind: "Sold offline", note: note || "Walk-in", by }] }, `${by} recorded ${qty} sold offline (${variantId})`);
}

// ---------- Delivery Zones (Owner) ----------

export function saveZone(z: Zone, role: Role) {
  if (role !== "owner") return;
  const exists = state.zones.some((x) => x.id === z.id);
  set({ zones: exists ? state.zones.map((x) => (x.id === z.id ? z : x)) : [...state.zones.filter((x) => !x.elsewhere), z, ...state.zones.filter((x) => x.elsewhere)] }, `${ME.owner} ${exists ? "updated" : "added"} zone ${z.name} (${ghs(z.fee)})`);
}
export const newZone = (): Zone => ({ id: rid("z"), name: "", fee: undefined });

// ---------- Staff (Owner) ----------

export function invite(email: string, role: Role) {
  set(
    { staff: [...state.staff, { id: rid("u"), name: email.split("@")[0], email, role, status: "Invited", since: TODAY }] },
    `${ME.owner} invited ${email} as ${role === "owner" ? "Owner" : "Staff"}`,
  );
}
export function activeOwners() {
  return state.staff.filter((s) => s.role === "owner" && s.status === "Active").length;
}
export function changeRole(id: string, role: Role) {
  const m = state.staff.find((s) => s.id === id)!;
  if (m.role === "owner" && role === "staff" && m.status === "Active" && activeOwners() <= 1) return;
  set({ staff: state.staff.map((s) => (s.id === id ? { ...s, role } : s)) }, `${ME.owner} made ${m.name} ${role === "owner" ? "an Owner" : "Staff"}`);
}
export function setActive(id: string, active: boolean) {
  const m = state.staff.find((s) => s.id === id)!;
  if (!active && m.role === "owner" && activeOwners() <= 1) return;
  set({ staff: state.staff.map((s) => (s.id === id ? { ...s, status: active ? "Active" : "Deactivated" } : s)) }, `${ME.owner} ${active ? "reactivated" : "deactivated"} ${m.name}`);
}

// ---------- Needs prices (Owner) ----------

export type PriceGap = { key: string; product: Product; variantId: string; label: string; where: "Store Price" | "Pre-order price"; window?: OrderWindow };

export function priceGaps(products: Product[], windows: OrderWindow[]): PriceGap[] {
  const out: PriceGap[] = [];
  for (const p of products) {
    if (p.status === "Archived") continue;
    for (const v of p.variants)
      if (!v.archived && p.sellInStock && v.storePrice == null)
        out.push({ key: `${p.id}-${v.id}`, product: p, variantId: v.id, label: Object.values(v.values).join(" / ") || "Default", where: "Store Price" });
    for (const w of windows.filter((x) => x.productId === p.id && x.stage === "Open"))
      for (const o of w.offers)
        if (o.preorderPrice == null) {
          const v = p.variants.find((x) => x.id === o.variantId);
          out.push({ key: `${w.id}-${o.variantId}`, product: p, variantId: o.variantId, label: v ? Object.values(v.values).join(" / ") : o.variantId, where: "Pre-order price", window: w });
        }
  }
  return out;
}

export function setPrice(g: PriceGap, price: number, role: Role) {
  if (role !== "owner") return;
  if (g.where === "Store Price") saveProduct({ ...g.product, variants: g.product.variants.map((v) => (v.id === g.variantId ? { ...v, storePrice: price } : v)) }, ME.owner);
  else if (g.window) saveWindow({ ...g.window, offers: g.window.offers.map((o) => (o.variantId === g.variantId ? { ...o, preorderPrice: price } : o)) }, ME.owner, `priced ${g.label} on`);
  set({}, `${ME.owner} set ${g.where} for ${g.product.name} ${g.label} to ${ghs(price)}`);
}

export { addDays };
