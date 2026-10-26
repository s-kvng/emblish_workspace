// PROTOTYPE (wayfinder #15): in-memory Back Office data. Throwaway, never merged.
// Money is integer pesewas, as decided in "Catalog model". Nothing persists.
import { useSyncExternalStore } from "react";

export type Role = "owner" | "staff";
export type ProductStatus = "Draft" | "Published" | "Archived";

export type Category = { id: string; name: string };
export const CATEGORIES: Category[] = [
  { id: "bags", name: "Bags" },
  { id: "shoes", name: "Shoes" },
  { id: "hair", name: "Hair & wigs" },
  { id: "beauty", name: "Beauty" },
  { id: "home", name: "Home" },
];

// Images are coloured swatches standing in for photos.
export type ProductImage = { id: string; label: string; color: string };

export type ProductOption = { name: string; values: string[] };

export type Variant = {
  id: string;
  values: Record<string, string>; // option name -> value
  sku: string;
  imageId?: string;
  storePrice?: number; // pesewas; Owner-only to set
  stock: number; // read-only here (Stock is a ledger, edited elsewhere)
  archived?: boolean; // ever-ordered Variants are archived, never deleted
};

export type Product = {
  id: string;
  name: string;
  description: string;
  categoryId?: string;
  status: ProductStatus;
  images: ProductImage[];
  options: ProductOption[];
  variants: Variant[];
  sellInStock: boolean; // offered In-stock on the Storefront when it has Stock
};

export type TrackingStage = "Open" | "Closed" | "Ordered from supplier" | "In transit" | "Arrived";
export const STAGES: TrackingStage[] = ["Open", "Closed", "Ordered from supplier", "In transit", "Arrived"];

export type WindowOffer = {
  variantId: string;
  preorderPrice?: number; // pesewas; Owner-only to set
  cap?: number; // optional per-Variant cap
  ordered: number; // units in paid Pre-orders
  storeQuantity?: number; // set when marking "Ordered from supplier"
};

export type StageEvent = {
  stage: TrackingStage;
  at: string; // ISO date
  by: string;
  expectedFrom?: string;
  expectedTo?: string;
  note?: string;
  smsTo?: number;
};

export type OrderWindow = {
  id: string;
  productId: string;
  number: number; // "Window 3"
  opensAt: string;
  closesAt: string;
  offers: WindowOffer[];
  shippingFeeEstimate?: number; // per unit, pesewas
  minimumOrderQuantity?: number;
  preorders: number; // paid Pre-orders (= Customers to text)
  stage: TrackingStage;
  expectedFrom?: string;
  expectedTo?: string;
  note?: string;
  history: StageEvent[];
  draft?: boolean; // not yet opened
};

export const TODAY = "2026-10-26";
export const ME = { owner: "Akosua (Owner)", staff: "Kwame (Staff)" };

// ---------- seed ----------

const SWATCH = ["#7c3aed", "#d97706", "#0f766e", "#be123c", "#1d4ed8", "#4d7c0f", "#a16207", "#475569"];

function cartesian(options: ProductOption[]): Record<string, string>[] {
  const live = options.filter((o) => o.name.trim() && o.values.length);
  if (!live.length) return [{}];
  return live.reduce<Record<string, string>[]>(
    (acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))),
    [{}],
  );
}

export function variantLabel(v: Variant): string {
  const vals = Object.values(v.values);
  return vals.length ? vals.join(" / ") : "Default";
}

function skuFor(productName: string, values: Record<string, string>): string {
  const base = productName
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const tail = Object.values(values)
    .map((v) => v.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase())
    .join("-");
  return tail ? `${base}-${tail}` : `${base}-STD`;
}

/** Regenerate Variants from options, keeping SKU/price/image of combos that survive. */
export function regenerateVariants(p: Product, options: ProductOption[]): Variant[] {
  const combos = cartesian(options);
  const key = (vals: Record<string, string>) => JSON.stringify(Object.entries(vals).sort());
  const existing = new Map(p.variants.map((v) => [key(v.values), v]));
  const next = combos.map((vals) => {
    const keep = existing.get(key(vals));
    return (
      keep ?? {
        id: `v_${Math.random().toString(36).slice(2, 8)}`,
        values: vals,
        sku: skuFor(p.name || "New", vals),
        stock: 0,
      }
    );
  });
  // Ever-stocked Variants that dropped out are archived, not deleted.
  const dropped = p.variants
    .filter((v) => !combos.some((c) => key(c) === key(v.values)) && v.stock > 0)
    .map((v) => ({ ...v, archived: true }));
  return [...next, ...dropped];
}

const tote: Product = {
  id: "p_tote",
  name: "Kente Weekend Tote",
  description: "Hand-woven kente panels on a canvas tote. Inner zip pocket, leather handles.",
  categoryId: "bags",
  status: "Published",
  images: [
    { id: "i1", label: "Front", color: SWATCH[0] },
    { id: "i2", label: "Gold side", color: SWATCH[1] },
    { id: "i3", label: "Green side", color: SWATCH[2] },
    { id: "i4", label: "Inside", color: SWATCH[7] },
  ],
  options: [
    { name: "Colour", values: ["Gold", "Green"] },
    { name: "Size", values: ["Medium", "Large"] },
  ],
  variants: [],
  sellInStock: true,
};
tote.variants = [
  { id: "v1", values: { Colour: "Gold", Size: "Medium" }, sku: "KWT-GOL-MED", imageId: "i2", storePrice: 34000, stock: 4 },
  { id: "v2", values: { Colour: "Gold", Size: "Large" }, sku: "KWT-GOL-LAR", imageId: "i2", storePrice: 39000, stock: 0 },
  { id: "v3", values: { Colour: "Green", Size: "Medium" }, sku: "KWT-GRE-MED", imageId: "i3", storePrice: 34000, stock: 2 },
  { id: "v4", values: { Colour: "Green", Size: "Large" }, sku: "KWT-GRE-LAR", imageId: "i3", stock: 0 },
];

const wig: Product = {
  id: "p_wig",
  name: "Body Wave Lace Wig",
  description: "13x4 lace front, 180% density, pre-plucked hairline.",
  categoryId: "hair",
  status: "Draft",
  images: [{ id: "i5", label: "Front", color: SWATCH[3] }],
  options: [{ name: "Length", values: ['18"', '22"', '26"'] }],
  variants: [],
  sellInStock: false,
};
wig.variants = [
  { id: "w1", values: { Length: '18"' }, sku: "BWLW-18", stock: 0 },
  { id: "w2", values: { Length: '22"' }, sku: "BWLW-22", stock: 0 },
  { id: "w3", values: { Length: '26"' }, sku: "BWLW-26", stock: 0 },
];

const sneaker: Product = {
  id: "p_sneak",
  name: "Court Low Sneaker",
  description: "Leather upper, gum sole.",
  categoryId: "shoes",
  status: "Published",
  images: [
    { id: "i6", label: "Side", color: SWATCH[4] },
    { id: "i7", label: "Sole", color: SWATCH[6] },
  ],
  options: [{ name: "Size", values: ["40", "41", "42", "43", "44"] }],
  variants: [],
  sellInStock: true,
};
sneaker.variants = ["40", "41", "42", "43", "44"].map((s, i) => ({
  id: `s${i}`,
  values: { Size: s },
  sku: `CLS-${s}`,
  imageId: "i6",
  storePrice: 52000,
  stock: [0, 3, 1, 0, 2][i],
}));

const windows: OrderWindow[] = [
  {
    id: "ow_tote3",
    productId: "p_tote",
    number: 3,
    opensAt: "2026-10-12",
    closesAt: "2026-10-31",
    offers: [
      { variantId: "v1", preorderPrice: 29000, cap: 20, ordered: 14 },
      { variantId: "v2", preorderPrice: 33000, cap: 10, ordered: 10 },
      { variantId: "v3", preorderPrice: 29000, ordered: 6 },
    ],
    shippingFeeEstimate: 1500,
    minimumOrderQuantity: 2,
    preorders: 13,
    stage: "Open",
    expectedFrom: "2026-11-28",
    expectedTo: "2026-12-05",
    history: [{ stage: "Open", at: "2026-10-12", by: ME.owner }],
  },
  {
    id: "ow_sneak2",
    productId: "p_sneak",
    number: 2,
    opensAt: "2026-09-01",
    closesAt: "2026-09-21",
    offers: [
      { variantId: "s0", preorderPrice: 45000, ordered: 5, storeQuantity: 2 },
      { variantId: "s1", preorderPrice: 45000, ordered: 8, storeQuantity: 2 },
      { variantId: "s2", preorderPrice: 45000, ordered: 9, storeQuantity: 3 },
      { variantId: "s3", preorderPrice: 45000, ordered: 4, storeQuantity: 0 },
    ],
    shippingFeeEstimate: 2500,
    preorders: 21,
    stage: "In transit",
    expectedFrom: "2026-11-03",
    expectedTo: "2026-11-10",
    note: "Container left Guangzhou on 14 Oct.",
    history: [
      { stage: "Open", at: "2026-09-01", by: ME.owner },
      { stage: "Closed", at: "2026-09-21", by: "System" },
      { stage: "Ordered from supplier", at: "2026-09-24", by: ME.staff, expectedFrom: "2026-10-30", expectedTo: "2026-11-10", smsTo: 21 },
      { stage: "In transit", at: "2026-10-14", by: ME.staff, expectedFrom: "2026-11-03", expectedTo: "2026-11-10", note: "Container left Guangzhou on 14 Oct.", smsTo: 21 },
    ],
  },
  {
    id: "ow_wig1",
    productId: "p_wig",
    number: 1,
    opensAt: "2026-10-28",
    closesAt: "2026-11-15",
    offers: [
      { variantId: "w1", ordered: 0, cap: 15 },
      { variantId: "w2", ordered: 0, cap: 15 },
    ],
    minimumOrderQuantity: 1,
    preorders: 0,
    stage: "Open",
    history: [],
    draft: true,
  },
];

// ---------- store ----------

type State = { products: Product[]; windows: OrderWindow[]; log: string[] };
let state: State = { products: [tote, wig, sneaker], windows, log: [] };
const listeners = new Set<() => void>();

export function useBO(): State {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

function set(next: Partial<State>, logLine?: string) {
  state = { ...state, ...next, log: logLine ? [logLine, ...state.log].slice(0, 30) : state.log };
  listeners.forEach((l) => l());
}

export function saveProduct(p: Product, by: string) {
  const exists = state.products.some((x) => x.id === p.id);
  set(
    { products: exists ? state.products.map((x) => (x.id === p.id ? p : x)) : [p, ...state.products] },
    `${by} saved ${p.name || "a new product"}`,
  );
}

export function saveWindow(w: OrderWindow, by: string, what = "saved") {
  const exists = state.windows.some((x) => x.id === w.id);
  set(
    { windows: exists ? state.windows.map((x) => (x.id === w.id ? w : x)) : [w, ...state.windows] },
    `${by} ${what} Window ${w.number}`,
  );
}

export function newProduct(): Product {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
    status: "Draft",
    images: [],
    options: [],
    variants: [{ id: "v_default", values: {}, sku: "", stock: 0 }],
    sellInStock: true,
  };
}

export function newWindow(p: Product, existing: OrderWindow[]): OrderWindow {
  const n = Math.max(0, ...existing.filter((w) => w.productId === p.id).map((w) => w.number)) + 1;
  return {
    id: `ow_${Math.random().toString(36).slice(2, 8)}`,
    productId: p.id,
    number: n,
    opensAt: TODAY,
    closesAt: addDays(TODAY, 14),
    offers: p.variants.filter((v) => !v.archived).map((v) => ({ variantId: v.id, ordered: 0 })),
    preorders: 0,
    stage: "Open",
    history: [],
    draft: true,
  };
}

export function addImage(p: Product): ProductImage {
  const i = p.images.length;
  return { id: `i_${Math.random().toString(36).slice(2, 6)}`, label: `Photo ${i + 1}`, color: SWATCH[i % SWATCH.length] };
}

// ---------- rules ----------

export function ghs(pesewas?: number): string {
  if (pesewas == null) return "—";
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: pesewas % 100 ? 2 : 0 })}`;
}
export function parseGhs(text: string): number | undefined {
  const n = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}
export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
export function fmtRange(a?: string, b?: string): string {
  if (!a && !b) return "No date yet";
  if (a && b) return `${fmtDate(a)} – ${fmtDate(b)}`;
  return fmtDate(a ?? b);
}

/** Why a Product can't be Published. "Publishing needs every offered Variant priced first." */
export function publishBlockers(p: Product, windows: OrderWindow[]): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Add a name");
  if (!p.categoryId) out.push("Pick a Category");
  if (!p.images.length) out.push("Add at least one photo");
  const live = p.variants.filter((v) => !v.archived);
  if (live.some((v) => !v.sku.trim())) out.push("Every Variant needs a SKU");
  if (p.sellInStock) {
    const unpriced = live.filter((v) => v.storePrice == null);
    if (unpriced.length) out.push(`${unpriced.length} Variant${unpriced.length > 1 ? "s" : ""} need a Store Price (Owner)`);
  }
  const open = windows.find((w) => w.productId === p.id && w.stage === "Open" && !w.draft);
  if (!p.sellInStock && !open) out.push("Not sold In-stock and no open Order Window: nothing to sell");
  return out;
}

/** Why a window can't be opened. */
export function openBlockers(w: OrderWindow, p: Product): string[] {
  const out: string[] = [];
  if (!w.offers.length) out.push("Offer at least one Variant");
  const unpriced = w.offers.filter((o) => o.preorderPrice == null);
  if (unpriced.length) out.push(`${unpriced.length} offered Variant${unpriced.length > 1 ? "s" : ""} need a Pre-order price (Owner)`);
  if (daysBetween(w.opensAt, w.closesAt) < 1) out.push("Close date must be after open date");
  // Opening a window on a Draft publishes the Product with it, so its own blockers apply too.
  if (p.status === "Draft") {
    out.push(...publishBlockers(p, []).filter((b) => !b.startsWith("Not sold In-stock")));
  }
  if (p.status === "Archived") out.push("Product is Archived");
  return out;
}

export function windowTotals(w: OrderWindow) {
  const ordered = w.offers.reduce((s, o) => s + o.ordered, 0);
  const capped = w.offers.filter((o) => o.cap != null);
  const soldOut = w.offers.filter((o) => o.cap != null && o.ordered >= o.cap!).length;
  return { ordered, capped: capped.length, soldOut, daysLeft: daysBetween(TODAY, w.closesAt) };
}

export function nextStage(s: TrackingStage): TrackingStage | undefined {
  return STAGES[STAGES.indexOf(s) + 1];
}

/** The SMS each Customer in the window gets on a stage or date change. */
export function trackingSms(p: Product, w: OrderWindow, stage: TrackingStage, from?: string, to?: string, note?: string) {
  const lead: Record<TrackingStage, string> = {
    Open: "is open for Pre-orders",
    Closed: "has closed. Thanks for your Pre-order",
    "Ordered from supplier": "has been ordered from our supplier",
    "In transit": "is on its way to Ghana",
    Arrived: "has arrived in Accra. Your Shipping Fee Invoice follows",
  };
  const eta = from || to ? ` Expected ${fmtRange(from, to)}.` : "";
  return `Emblish: ${p.name} (Window ${w.number}) ${lead[stage]}.${eta}${note ? ` ${note}` : ""} Track: emblish.com/orders`;
}
