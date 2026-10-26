// PROTOTYPE (wayfinder #15): Variant C, "Catalog + product hub". Throwaway, never merged.
// Catalog list -> Product hub (settings-style rows) -> focused sub-screens; Variant editor in a bottom sheet.
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import {
  CATEGORIES,
  ME,
  type OrderWindow,
  type Product,
  type ProductOption,
  type ProductStatus,
  type Role,
  type Variant,
  addImage,
  fmtDate,
  ghs,
  newProduct,
  parseGhs,
  publishBlockers,
  regenerateVariants,
  saveProduct,
  useBO,
  variantLabel,
  windowTotals,
} from "./bo-data";

type Sub = "details" | "photos" | "options" | "variants" | "windows";
type Screen = { name: "catalog" } | { name: "hub"; id: string } | { name: "sub"; id: string; which: Sub };
type Filter = "All" | ProductStatus | "Needs prices";

const PURPLE = "#6d28d9";

// ---------- helpers ----------

function unpriced(p: Product): Variant[] {
  if (!p.sellInStock) return [];
  return p.variants.filter((v) => !v.archived && v.storePrice == null);
}
function categoryName(id?: string) {
  return CATEGORIES.find((c) => c.id === id)?.name ?? "No Category";
}
function openWindow(p: Product, windows: OrderWindow[]) {
  return windows.find((w) => w.productId === p.id && w.stage === "Open" && !w.draft);
}
function checklist(p: Product, windows: OrderWindow[]) {
  const live = p.variants.filter((v) => !v.archived);
  return [
    { label: "Name and Category", done: !!p.name.trim() && !!p.categoryId },
    { label: "At least one photo", done: p.images.length > 0 },
    { label: "A SKU on every Variant", done: live.every((v) => v.sku.trim()) },
    {
      label: p.sellInStock ? "Store Price on every Variant (Owner)" : "Store Prices (not sold In-stock)",
      done: unpriced(p).length === 0,
    },
    { label: "Something to sell: In-stock or an open Order Window", done: p.sellInStock || !!openWindow(p, windows) },
  ];
}

function StatusPill({ status }: { status: ProductStatus }) {
  const cls =
    status === "Published"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Draft"
        ? "bg-zinc-200 text-zinc-700"
        : "bg-zinc-800 text-zinc-100";
  return <Text className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{status}</Text>;
}

function Swatch({ color, label, size = 44 }: { color?: string; label?: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, backgroundColor: color ?? "#e4e4e7", borderRadius: 8 }}
      className="items-center justify-center"
    >
      {label ? (
        <Text className="text-center text-[9px] font-semibold text-white" numberOfLines={2}>
          {label}
        </Text>
      ) : (
        <Text className="text-zinc-400">▢</Text>
      )}
    </View>
  );
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center border-b border-zinc-200 bg-white px-3 pb-2 pt-12">
      {onBack ? (
        <Pressable onPress={onBack} className="pr-3">
          <Text className="text-2xl text-[#6d28d9]">‹</Text>
        </Pressable>
      ) : null}
      <Text className="flex-1 text-lg font-bold text-zinc-900" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

// ---------- root ----------

export default function ProductC({ role }: { role: Role }) {
  const [stack, setStack] = useState<Screen[]>([{ name: "catalog" }]);
  const [toast, setToast] = useState<string | null>(null);
  const top = stack[stack.length - 1];
  const push = (s: Screen) => setStack((st) => [...st, s]);
  const pop = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <View className="flex-1 bg-zinc-100">
      {top.name === "catalog" && <Catalog role={role} open={(id) => push({ name: "hub", id })} />}
      {top.name === "hub" && (
        <Hub role={role} id={top.id} onBack={pop} open={(which) => push({ name: "sub", id: top.id, which })} />
      )}
      {top.name === "sub" && <SubScreen role={role} id={top.id} which={top.which} onDone={pop} toast={setToast} />}
      {toast ? (
        <View className="absolute bottom-24 left-6 right-6 items-center">
          <Text className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white">{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- catalog ----------

function Catalog({ role, open }: { role: Role; open: (id: string) => void }) {
  const { products, windows } = useBO();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [creating, setCreating] = useState(false);

  const needs = products.filter((p) => p.status !== "Archived" && unpriced(p).length);
  const unpricedCount = needs.reduce((s, p) => s + unpriced(p).length, 0);

  const shown = products.filter((p) => {
    if (q && !`${p.name} ${p.variants.map((v) => v.sku).join(" ")}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (filter === "All") return p.status !== "Archived";
    if (filter === "Needs prices") return unpriced(p).length > 0;
    return p.status === filter;
  });

  const filters: Filter[] = ["All", "Draft", "Published", "Archived", "Needs prices"];

  return (
    <View className="flex-1">
      <Header title="Catalog" right={<Text className="text-xs text-zinc-500">{role === "owner" ? ME.owner : ME.staff}</Text>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {role === "owner" && unpricedCount > 0 ? (
          <Pressable
            onPress={() => setFilter("Needs prices")}
            className="mx-3 mt-3 flex-row items-center rounded-xl border border-amber-300 bg-amber-50 p-3"
          >
            <Text className="mr-2 text-xl">🏷️</Text>
            <View className="flex-1">
              <Text className="font-bold text-amber-900">
                {unpricedCount} Variants need a Store Price
              </Text>
              <Text className="text-xs text-amber-800">
                Across {needs.length} Product{needs.length > 1 ? "s" : ""}. Only you can set prices; Staff can't publish
                until you do.
              </Text>
            </View>
            <Text className="text-xl text-amber-700">›</Text>
          </Pressable>
        ) : null}

        <View className="mx-3 mt-3 flex-row items-center rounded-xl bg-white px-3">
          <Text className="text-zinc-400">⌕</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search name or SKU"
            className="flex-1 px-2 py-2.5 text-sm text-zinc-900"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 6 }}>
          {filters.map((f) => {
            const count =
              f === "All"
                ? products.filter((p) => p.status !== "Archived").length
                : f === "Needs prices"
                  ? needs.length
                  : products.filter((p) => p.status === f).length;
            const on = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 ${on ? "border-[#6d28d9] bg-[#6d28d9]" : "border-zinc-300 bg-white"}`}
              >
                <Text className={`text-xs font-semibold ${on ? "text-white" : f === "Needs prices" ? "text-amber-700" : "text-zinc-700"}`}>
                  {f} {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="mx-3 overflow-hidden rounded-xl bg-white">
          {shown.length === 0 ? <Text className="p-6 text-center text-zinc-500">No Products here.</Text> : null}
          {shown.map((p, i) => {
            const cover = p.images[0];
            const up = unpriced(p).length;
            const inStock = p.sellInStock && p.variants.some((v) => v.stock > 0);
            const pre = openWindow(p, windows);
            return (
              <Pressable
                key={p.id}
                onPress={() => open(p.id)}
                className={`flex-row items-center px-3 py-3 ${i ? "border-t border-zinc-100" : ""}`}
              >
                <Swatch color={cover?.color} label={cover?.label} size={48} />
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-shrink font-semibold text-zinc-900" numberOfLines={1}>
                      {p.name || "Untitled Product"}
                    </Text>
                    <StatusPill status={p.status} />
                  </View>
                  <Text className="text-xs text-zinc-500">
                    {categoryName(p.categoryId)} · {p.variants.filter((v) => !v.archived).length} Variants
                  </Text>
                  <View className="mt-1 flex-row flex-wrap gap-1">
                    {inStock ? (
                      <Text className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">In-stock</Text>
                    ) : null}
                    {pre ? (
                      <Text className="rounded bg-violet-50 px-1.5 text-[10px] font-semibold text-violet-700">
                        Pre-order · W{pre.number}
                      </Text>
                    ) : null}
                    {up ? (
                      <Text className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{up} unpriced</Text>
                    ) : null}
                  </View>
                </View>
                <Text className="text-xl text-zinc-300">›</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => setCreating(true)}
        style={{ backgroundColor: PURPLE }}
        className="absolute bottom-8 right-5 h-14 w-14 items-center justify-center rounded-full shadow-lg"
      >
        <Text className="text-3xl text-white">+</Text>
      </Pressable>

      <NewProductSheet
        visible={creating}
        role={role}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          open(id);
        }}
      />
    </View>
  );
}

function NewProductSheet({
  visible,
  role,
  onClose,
  onCreated,
}: {
  visible: boolean;
  role: Role;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | undefined>();
  const create = () => {
    const p = newProduct();
    p.name = name.trim();
    p.categoryId = cat;
    p.variants = regenerateVariants(p, []);
    saveProduct(p, ME[role]);
    setName("");
    setCat(undefined);
    onCreated(p.id);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="New Product">
      <Text className="mb-1 text-xs font-semibold text-zinc-500">NAME</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Ankara Bucket Hat"
        className="rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
      />
      <Text className="mb-1 mt-4 text-xs font-semibold text-zinc-500">CATEGORY</Text>
      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCat(c.id)}
            className={`rounded-full border px-3 py-1.5 ${cat === c.id ? "border-[#6d28d9] bg-violet-50" : "border-zinc-300"}`}
          >
            <Text className={`text-sm ${cat === c.id ? "font-semibold text-[#6d28d9]" : "text-zinc-700"}`}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-4 text-xs text-zinc-500">
        It starts as a Draft with one default Variant. Add photos, options and prices from the Product page.
      </Text>
      <Pressable
        disabled={!name.trim()}
        onPress={create}
        className={`mt-4 items-center rounded-xl py-3 ${name.trim() ? "bg-[#6d28d9]" : "bg-zinc-300"}`}
      >
        <Text className="font-bold text-white">Create Draft</Text>
      </Pressable>
    </Sheet>
  );
}

// ---------- hub ----------

function Hub({ role, id, onBack, open }: { role: Role; id: string; onBack: () => void; open: (s: Sub) => void }) {
  const { products, windows } = useBO();
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  const by = ME[role];
  const update = (patch: Partial<Product>) => saveProduct({ ...p, ...patch }, by);

  const checks = checklist(p, windows);
  const done = checks.filter((c) => c.done).length;
  const blockers = publishBlockers(p, windows);
  const live = p.variants.filter((v) => !v.archived);
  const up = unpriced(p).length;
  const myWindows = windows.filter((w) => w.productId === p.id);
  const ow = openWindow(p, windows);

  const rows: { key: Sub; label: string; summary: string; warn?: boolean }[] = [
    {
      key: "details",
      label: "Details",
      summary: `${categoryName(p.categoryId)} · ${p.description ? `${p.description.slice(0, 28)}…` : "No description"}`,
      warn: !p.categoryId,
    },
    { key: "photos", label: `Photos (${p.images.length})`, summary: p.images.length ? "First photo is the cover" : "None yet", warn: !p.images.length },
    {
      key: "options",
      label: "Options",
      summary: p.options.length ? p.options.map((o) => o.name).join(" × ") : "None (one default Variant)",
    },
    {
      key: "variants",
      label: `Variants (${live.length})`,
      summary: up ? `${up} unpriced` : `${live.reduce((s, v) => s + v.stock, 0)} in Stock`,
      warn: up > 0,
    },
    {
      key: "windows",
      label: `Order Windows (${myWindows.length})`,
      summary: ow ? `Window ${ow.number} open · closes ${fmtDate(ow.closesAt)}` : "None open",
    },
  ];

  return (
    <View className="flex-1">
      <Header title={p.name || "Untitled Product"} onBack={onBack} right={<StatusPill status={p.status} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {p.images.length ? (
            p.images.map((im) => <Swatch key={im.id} color={im.color} label={im.label} size={96} />)
          ) : (
            <Pressable onPress={() => open("photos")} className="h-24 w-48 items-center justify-center rounded-lg border border-dashed border-zinc-400">
              <Text className="text-zinc-500">+ Add photos</Text>
            </Pressable>
          )}
        </ScrollView>

        {p.status !== "Published" ? (
          <View className="mx-3 rounded-xl bg-white p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-zinc-900">Ready to publish?</Text>
              <Text className={`text-sm font-bold ${done === checks.length ? "text-emerald-700" : "text-amber-700"}`}>
                {done} of {checks.length}
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <View style={{ width: `${(done / checks.length) * 100}%`, backgroundColor: done === checks.length ? "#059669" : "#d97706" }} className="h-full" />
            </View>
            {checks.map((c) => (
              <View key={c.label} className="mt-2 flex-row items-center">
                <Text className={`mr-2 ${c.done ? "text-emerald-600" : "text-zinc-400"}`}>{c.done ? "✓" : "○"}</Text>
                <Text className={`text-sm ${c.done ? "text-zinc-500 line-through" : "text-zinc-800"}`}>{c.label}</Text>
              </View>
            ))}
            {role === "staff" && up > 0 ? (
              <Text className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                You can finish everything else. The Owner sets the {up} missing Store Price{up > 1 ? "s" : ""}.
              </Text>
            ) : null}
          </View>
        ) : up > 0 ? (
          <View className="mx-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <Text className="text-sm text-amber-900">
              Published, but {up} Variant{up > 1 ? "s are" : " is"} hidden from In-stock sale until priced.
            </Text>
          </View>
        ) : null}

        <View className="mx-3 mt-3 overflow-hidden rounded-xl bg-white">
          {rows.map((r, i) => (
            <Pressable key={r.key} onPress={() => open(r.key)} className={`flex-row items-center px-3 py-3.5 ${i ? "border-t border-zinc-100" : ""}`}>
              <View className="flex-1">
                <Text className="font-semibold text-zinc-900">{r.label}</Text>
                <Text className={`text-xs ${r.warn ? "text-amber-700" : "text-zinc-500"}`} numberOfLines={1}>
                  {r.summary}
                </Text>
              </View>
              <Text className="text-xl text-zinc-300">›</Text>
            </Pressable>
          ))}
          <View className="flex-row items-center border-t border-zinc-100 px-3 py-3">
            <View className="flex-1">
              <Text className="font-semibold text-zinc-900">Sell In-stock</Text>
              <Text className="text-xs text-zinc-500">Buy now on the Storefront whenever a Variant has Stock</Text>
            </View>
            <Switch value={p.sellInStock} onValueChange={(v) => update({ sellInStock: v })} trackColor={{ true: PURPLE }} />
          </View>
        </View>

        <Text className="mx-4 mt-3 text-[11px] text-zinc-400">Changes save as you go. Last edit by {by}.</Text>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-zinc-200 bg-white px-3 pb-6 pt-3">
        {p.status === "Draft" ? (
          <>
            <Pressable
              disabled={blockers.length > 0}
              onPress={() => update({ status: "Published" })}
              className={`items-center rounded-xl py-3 ${blockers.length ? "bg-zinc-300" : "bg-[#6d28d9]"}`}
            >
              <Text className="font-bold text-white">Publish</Text>
            </Pressable>
            {blockers.length ? <Text className="mt-1 text-center text-xs text-amber-700">{blockers[0]}</Text> : null}
          </>
        ) : p.status === "Published" ? (
          <View className="flex-row gap-2">
            <Pressable onPress={() => update({ status: "Draft" })} className="flex-1 items-center rounded-xl border border-zinc-300 py-3">
              <Text className="font-semibold text-zinc-800">Unpublish to Draft</Text>
            </Pressable>
            <Pressable onPress={() => update({ status: "Archived" })} className="flex-1 items-center rounded-xl border border-red-300 py-3">
              <Text className="font-semibold text-red-700">Archive</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => update({ status: "Draft" })} className="items-center rounded-xl border border-zinc-300 py-3">
            <Text className="font-semibold text-zinc-800">Restore to Draft</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------- sub-screens ----------

function SubScreen({
  role,
  id,
  which,
  onDone,
  toast,
}: {
  role: Role;
  id: string;
  which: Sub;
  onDone: () => void;
  toast: (s: string) => void;
}) {
  const { products, windows } = useBO();
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  const save = (next: Product) => saveProduct(next, ME[role]);
  const title = { details: "Details", photos: "Photos", options: "Options", variants: "Variants", windows: "Order Windows" }[which];

  return (
    <View className="flex-1">
      <Header
        title={title}
        onBack={onDone}
        right={
          <Pressable onPress={onDone}>
            <Text className="font-bold text-[#6d28d9]">Done</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
        {which === "details" && <DetailsEdit p={p} save={save} />}
        {which === "photos" && <PhotosEdit p={p} save={save} />}
        {which === "options" && <OptionsEdit p={p} save={save} />}
        {which === "variants" && <VariantsList p={p} save={save} role={role} toast={toast} />}
        {which === "windows" && <WindowsList p={p} windows={windows} />}
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-semibold uppercase text-zinc-500">{label}</Text>
      {children}
    </View>
  );
}

function DetailsEdit({ p, save }: { p: Product; save: (p: Product) => void }) {
  return (
    <View className="rounded-xl bg-white p-3">
      <Field label="Name">
        <TextInput value={p.name} onChangeText={(name) => save({ ...p, name })} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900" />
      </Field>
      <Field label="Description">
        <TextInput
          value={p.description}
          onChangeText={(description) => save({ ...p, description })}
          multiline
          numberOfLines={4}
          className="min-h-24 rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
        />
      </Field>
      <Field label="Category (one per Product)">
        {CATEGORIES.map((c) => (
          <Pressable key={c.id} onPress={() => save({ ...p, categoryId: c.id })} className="flex-row items-center border-b border-zinc-100 py-2.5">
            <Text className="flex-1 text-zinc-800">{c.name}</Text>
            {p.categoryId === c.id ? <Text className="font-bold text-[#6d28d9]">✓</Text> : null}
          </Pressable>
        ))}
      </Field>
    </View>
  );
}

function PhotosEdit({ p, save }: { p: Product; save: (p: Product) => void }) {
  return (
    <View>
      <Text className="mb-2 text-xs text-zinc-500">Tap a photo to make it the cover. Variants pick their photo from this gallery.</Text>
      <View className="flex-row flex-wrap gap-2">
        {p.images.map((im, i) => (
          <Pressable
            key={im.id}
            onPress={() => save({ ...p, images: [im, ...p.images.filter((x) => x.id !== im.id)] })}
            className="relative"
          >
            <Swatch color={im.color} label={im.label} size={104} />
            {i === 0 ? <Text className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] font-bold text-zinc-900">COVER</Text> : null}
            <Pressable
              onPress={() =>
                save({
                  ...p,
                  images: p.images.filter((x) => x.id !== im.id),
                  variants: p.variants.map((v) => (v.imageId === im.id ? { ...v, imageId: undefined } : v)),
                })
              }
              className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
            >
              <Text className="text-xs text-white">×</Text>
            </Pressable>
            <Text className="mt-1 text-center text-[10px] text-zinc-500">
              {p.variants.filter((v) => v.imageId === im.id).length} Variants
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => save({ ...p, images: [...p.images, addImage(p)] })}
          className="h-[104px] w-[104px] items-center justify-center rounded-lg border border-dashed border-zinc-400 bg-white"
        >
          <Text className="text-2xl text-zinc-400">+</Text>
          <Text className="text-xs text-zinc-500">Camera / library</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionsEdit({ p, save }: { p: Product; save: (p: Product) => void }) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const apply = (options: ProductOption[]) => save({ ...p, options, variants: regenerateVariants(p, options) });
  const count = useMemo(
    () => p.options.filter((o) => o.values.length).reduce((n, o) => n * o.values.length, 1),
    [p.options],
  );
  return (
    <View>
      <Text className="mb-3 rounded-lg bg-violet-50 p-2 text-xs text-violet-900">
        Up to 3 options. Every combination becomes a Variant ({count} now). Removing a value archives Variants that have Stock
        instead of deleting them.
      </Text>
      {p.options.map((o, i) => (
        <View key={i} className="mb-3 rounded-xl bg-white p-3">
          <View className="flex-row items-center">
            <TextInput
              value={o.name}
              onChangeText={(name) => apply(p.options.map((x, j) => (j === i ? { ...x, name } : x)))}
              className="flex-1 text-base font-bold text-zinc-900"
            />
            <Pressable onPress={() => apply(p.options.filter((_, j) => j !== i))}>
              <Text className="text-xs text-red-600">Remove</Text>
            </Pressable>
          </View>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {o.values.map((v) => (
              <Pressable
                key={v}
                onPress={() => apply(p.options.map((x, j) => (j === i ? { ...x, values: x.values.filter((y) => y !== v) } : x)))}
                className="flex-row items-center rounded-full bg-zinc-100 px-2.5 py-1"
              >
                <Text className="text-sm text-zinc-800">{v}</Text>
                <Text className="ml-1 text-xs text-zinc-400">×</Text>
              </Pressable>
            ))}
            <TextInput
              value={draft[i] ?? ""}
              onChangeText={(t) => setDraft({ ...draft, [i]: t })}
              onSubmitEditing={() => {
                const t = (draft[i] ?? "").trim();
                if (!t || o.values.includes(t)) return;
                apply(p.options.map((x, j) => (j === i ? { ...x, values: [...x.values, t] } : x)));
                setDraft({ ...draft, [i]: "" });
              }}
              placeholder="+ value, Enter"
              className="min-w-24 rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-sm"
            />
          </View>
        </View>
      ))}
      {p.options.length < 3 ? (
        <Pressable
          onPress={() => apply([...p.options, { name: p.options.length ? "Material" : "Colour", values: [] }])}
          className="items-center rounded-xl border border-dashed border-zinc-400 py-3"
        >
          <Text className="font-semibold text-[#6d28d9]">+ Add option</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function VariantsList({ p, save, role, toast }: { p: Product; save: (p: Product) => void; role: Role; toast: (s: string) => void }) {
  const [editing, setEditing] = useState<Variant | null>(null);
  const live = p.variants.filter((v) => !v.archived);
  const archived = p.variants.filter((v) => v.archived);
  const img = (v: Variant) => p.images.find((i) => i.id === v.imageId);
  return (
    <View>
      {!p.sellInStock ? (
        <Text className="mb-2 rounded-lg bg-zinc-200 p-2 text-xs text-zinc-700">
          Not sold In-stock, so Store Prices are optional. Pre-order prices are set per Order Window.
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-xl bg-white">
        {live.map((v, i) => (
          <Pressable key={v.id} onPress={() => setEditing(v)} className={`flex-row items-center px-3 py-3 ${i ? "border-t border-zinc-100" : ""}`}>
            <Swatch color={img(v)?.color} size={36} />
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-zinc-900">{variantLabel(v)}</Text>
              <Text className="text-xs text-zinc-500">{v.sku || "No SKU"} · Stock {v.stock}</Text>
            </View>
            {v.storePrice != null ? (
              <Text className="font-semibold text-zinc-900">{ghs(v.storePrice)}</Text>
            ) : (
              <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Unpriced</Text>
            )}
            <Text className="ml-2 text-xl text-zinc-300">›</Text>
          </Pressable>
        ))}
      </View>
      {archived.length ? (
        <>
          <Text className="mb-1 mt-4 text-xs font-semibold uppercase text-zinc-500">Archived (has Stock or orders)</Text>
          {archived.map((v) => (
            <Text key={v.id} className="text-sm text-zinc-500">
              {variantLabel(v)} · {v.sku} · Stock {v.stock}
            </Text>
          ))}
        </>
      ) : null}
      <VariantSheet
        p={p}
        v={editing}
        role={role}
        onClose={() => setEditing(null)}
        onSave={(nv) => {
          save({ ...p, variants: p.variants.map((x) => (x.id === nv.id ? nv : x)) });
          setEditing(null);
        }}
        toast={toast}
      />
    </View>
  );
}

function VariantSheet({
  p,
  v,
  role,
  onClose,
  onSave,
  toast,
}: {
  p: Product;
  v: Variant | null;
  role: Role;
  onClose: () => void;
  onSave: (v: Variant) => void;
  toast: (s: string) => void;
}) {
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [imageId, setImageId] = useState<string | undefined>();
  useEffect(() => {
    if (!v) return;
    setSku(v.sku);
    setPrice(v.storePrice != null ? String(v.storePrice / 100) : "");
    setImageId(v.imageId);
  }, [v]);
  if (!v) return null;
  return (
    <Sheet visible onClose={onClose} title={variantLabel(v)}>
      <Text className="mb-1 text-xs font-semibold uppercase text-zinc-500">Photo</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 6 }} className="mb-4">
        {p.images.map((im) => (
          <Pressable
            key={im.id}
            onPress={() => setImageId(im.id)}
            style={{ borderWidth: 3, borderColor: imageId === im.id ? PURPLE : "transparent", borderRadius: 11 }}
          >
            <Swatch color={im.color} label={im.label} size={56} />
          </Pressable>
        ))}
        {!p.images.length ? <Text className="text-xs text-zinc-500">Add photos to the Product first.</Text> : null}
      </ScrollView>
      <Text className="mb-1 text-xs font-semibold uppercase text-zinc-500">SKU</Text>
      <TextInput value={sku} onChangeText={setSku} autoCapitalize="characters" className="mb-4 rounded-lg border border-zinc-300 px-3 py-2.5 font-mono text-zinc-900" />
      <Text className="mb-1 text-xs font-semibold uppercase text-zinc-500">Store Price</Text>
      {role === "owner" ? (
        <View className="mb-1 flex-row items-center rounded-lg border border-zinc-300 px-3">
          <Text className="text-zinc-500">GH₵</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" className="flex-1 px-2 py-2.5 text-lg font-semibold text-zinc-900" />
        </View>
      ) : (
        <View className="mb-1 flex-row items-center rounded-lg bg-zinc-100 p-3">
          <Text className="mr-2">🔒</Text>
          <View className="flex-1">
            <Text className="font-semibold text-zinc-800">{v.storePrice != null ? ghs(v.storePrice) : "Not priced yet"}</Text>
            <Text className="text-xs text-zinc-500">Only the Owner can set prices.</Text>
          </View>
          {v.storePrice == null ? (
            <Pressable onPress={() => toast(`Reminder sent to ${ME.owner}`)} className="rounded-lg bg-white px-2.5 py-1.5">
              <Text className="text-xs font-semibold text-[#6d28d9]">Remind Owner</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <Text className="mb-4 text-[11px] text-zinc-400">Stock {v.stock}. Stock changes through Stock Movements, not here.</Text>
      <Pressable
        onPress={() => onSave({ ...v, sku: sku.trim(), imageId, storePrice: role === "owner" ? parseGhs(price) : v.storePrice })}
        className="items-center rounded-xl bg-[#6d28d9] py-3"
      >
        <Text className="font-bold text-white">Save Variant</Text>
      </Pressable>
    </Sheet>
  );
}

function WindowsList({ p, windows }: { p: Product; windows: OrderWindow[] }) {
  const mine = windows.filter((w) => w.productId === p.id).sort((a, b) => b.number - a.number);
  return (
    <View>
      {mine.length === 0 ? <Text className="p-4 text-center text-zinc-500">No Order Windows yet.</Text> : null}
      {mine.map((w) => {
        const t = windowTotals(w);
        return (
          <View key={w.id} className="mb-2 rounded-xl bg-white p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-zinc-900">Window {w.number}</Text>
              <Text className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${w.draft ? "bg-zinc-200 text-zinc-700" : "bg-violet-100 text-violet-800"}`}>
                {w.draft ? "NOT OPENED" : w.stage.toUpperCase()}
              </Text>
            </View>
            <Text className="text-xs text-zinc-500">
              {fmtDate(w.opensAt)} – {fmtDate(w.closesAt)} · {w.offers.length} Variants offered · {t.ordered} units ordered
            </Text>
          </View>
        );
      })}
      <Text className="mt-2 text-xs text-zinc-500">Open, extend and track windows from the Order Windows screen.</Text>
    </View>
  );
}

// ---------- sheet ----------

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/40" />
      <View className="rounded-t-2xl bg-white px-4 pb-8 pt-3">
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-zinc-300" />
        <View className="mb-3 flex-row items-center">
          <Text className="flex-1 text-lg font-bold text-zinc-900">{title}</Text>
          <Pressable onPress={onClose}>
            <Text className="text-zinc-500">Cancel</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}
