// PROTOTYPE (wayfinder #15): Variant A, "One long form". Throwaway, never merged.
// The whole Product editor is one scrolling screen with stacked sections and a sticky save bar.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import {
  addImage,
  CATEGORIES,
  fmtDate,
  fmtRange,
  ghs,
  ME,
  newProduct,
  parseGhs,
  publishBlockers,
  regenerateVariants,
  saveProduct,
  useBO,
  variantLabel,
  type Product,
  type ProductOption,
  type ProductStatus,
  type Role,
  type Variant,
} from "./bo-data";

const PURPLE = "#6d28d9";

function notify(title: string, msg: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

/** Staff can't set prices, so price blockers read as a request to the Owner. */
function blockerText(b: string, role: Role) {
  if (role === "staff" && b.includes("Store Price")) return `${b.replace(" (Owner)", "")}. Ask the Owner to set prices.`;
  return b;
}

function SectionHeader({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <View className="mb-2 mt-6 flex-row items-end justify-between px-4">
      <View className="flex-1">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</Text>
        {hint ? <Text className="mt-0.5 text-xs text-zinc-400">{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="mx-4 rounded-xl border border-zinc-200 bg-white">{children}</View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="border-b border-zinc-100 px-3 py-2.5">
      <Text className="mb-1 text-[11px] font-semibold text-zinc-500">{label}</Text>
      {children}
    </View>
  );
}

export default function ProductA({ role }: { role: Role }) {
  const bo = useBO();
  const [selectedId, setSelectedId] = useState<string>(bo.products[0]?.id ?? "");
  const [draft, setDraft] = useState<Product>(() => structuredClone(bo.products[0] ?? newProduct()));
  const [dirty, setDirty] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState<ProductStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const pick = (id: string | "new") => {
    if (id === "new") {
      const p = newProduct();
      setSelectedId(p.id);
      setDraft(p);
    } else {
      const p = bo.products.find((x) => x.id === id);
      if (!p) return;
      setSelectedId(id);
      setDraft(structuredClone(p));
    }
    setDirty(false);
    setStatusAttempt(null);
    setSelectedImage(null);
    setNewValue({});
  };

  const update = (patch: Partial<Product>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const blockers = useMemo(() => publishBlockers(draft, bo.windows), [draft, bo.windows]);
  const isNew = !bo.products.some((p) => p.id === draft.id);
  const windows = bo.windows.filter((w) => w.productId === draft.id);
  const liveVariants = draft.variants.filter((v) => !v.archived);
  const archivedVariants = draft.variants.filter((v) => v.archived);

  const setStatus = (s: ProductStatus) => {
    if (s === "Published" && blockers.length) {
      setStatusAttempt("Published");
      return;
    }
    setStatusAttempt(null);
    update({ status: s });
  };

  const setOptions = (options: ProductOption[]) => {
    setDraft((d) => ({ ...d, options, variants: regenerateVariants(d, options) }));
    setDirty(true);
  };

  const updateVariant = (id: string, patch: Partial<Variant>) => {
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
    setDirty(true);
  };

  const save = () => {
    // A Published Product that picked up blockers while editing drops back to Draft on save.
    let p = draft;
    if (p.status === "Published" && blockers.length) p = { ...p, status: "Draft" };
    saveProduct(p, ME[role]);
    setDraft(p);
    setSelectedId(p.id);
    setDirty(false);
    setToast(
      p.status === draft.status
        ? `Saved ${p.name || "new product"}`
        : `Saved as Draft: ${blockers.length} blocker${blockers.length > 1 ? "s" : ""} before publishing`,
    );
  };

  // ---------- photos ----------
  const moveImage = (id: string, d: -1 | 1) => {
    const imgs = [...draft.images];
    const i = imgs.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    update({ images: imgs });
  };
  const removeImage = (id: string) => {
    update({
      images: draft.images.filter((x) => x.id !== id),
      variants: draft.variants.map((v) => (v.imageId === id ? { ...v, imageId: undefined } : v)),
    });
    setSelectedImage(null);
  };
  const cycleVariantImage = (v: Variant) => {
    const ids = [undefined, ...draft.images.map((i) => i.id)];
    const next = ids[(ids.indexOf(v.imageId) + 1) % ids.length];
    updateVariant(v.id, { imageId: next });
  };

  const statusColor: Record<ProductStatus, string> = {
    Draft: "bg-zinc-200 text-zinc-700",
    Published: "bg-emerald-100 text-emerald-800",
    Archived: "bg-zinc-800 text-white",
  };

  return (
    <View className="flex-1 bg-zinc-100">
      {/* App bar */}
      <View className="flex-row items-center border-b border-zinc-200 bg-white px-2 pb-2 pt-12">
        <Pressable onPress={() => router.canGoBack() && router.back()} className="px-2 py-1">
          <Text className="text-2xl text-zinc-700">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-base font-bold text-zinc-900">{isNew ? "New product" : "Edit product"}</Text>
          <Text className="text-[11px] text-zinc-500">
            Signed in as {ME[role]}
            {dirty ? " · unsaved changes" : ""}
          </Text>
        </View>
        <Pressable onPress={save} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: dirty ? PURPLE : "#d4d4d8" }}>
          <Text className="text-sm font-bold text-white">Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Product picker (prototype affordance) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {bo.products.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => pick(p.id)}
              className={`rounded-full border px-3 py-1.5 ${selectedId === p.id ? "border-[#6d28d9] bg-[#ede9fe]" : "border-zinc-300 bg-white"}`}
            >
              <Text className="text-xs font-semibold text-zinc-800">
                {p.name || "Untitled"} <Text className="text-zinc-400">· {p.status}</Text>
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => pick("new")} className="rounded-full border border-dashed border-zinc-400 px-3 py-1.5">
            <Text className="text-xs font-semibold text-[#6d28d9]">＋ New product</Text>
          </Pressable>
        </ScrollView>

        {/* Status */}
        <View className="mx-4 rounded-xl border border-zinc-200 bg-white p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Status</Text>
            <View className={`rounded-full px-2 py-0.5 ${statusColor[draft.status]}`}>
              <Text className={`text-[10px] font-bold ${statusColor[draft.status].split(" ")[1]}`}>{draft.status.toUpperCase()}</Text>
            </View>
          </View>
          <View className="flex-row rounded-lg bg-zinc-100 p-1">
            {(["Draft", "Published", "Archived"] as ProductStatus[]).map((s) => {
              const on = draft.status === s;
              const blocked = s === "Published" && blockers.length > 0;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  className={`flex-1 items-center rounded-md py-1.5 ${on ? "bg-white" : ""}`}
                  style={on ? { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3 } : undefined}
                >
                  <Text className={`text-xs font-semibold ${on ? "text-zinc-900" : blocked ? "text-zinc-400" : "text-zinc-600"}`}>
                    {blocked ? "🔒 " : ""}
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {statusAttempt === "Published" && blockers.length > 0 ? (
            <View className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <Text className="mb-1 text-xs font-bold text-red-800">Can't publish yet</Text>
              {blockers.map((b) => (
                <Text key={b} className="text-xs leading-5 text-red-700">
                  • {blockerText(b, role)}
                </Text>
              ))}
            </View>
          ) : draft.status === "Archived" ? (
            <Text className="mt-2 text-xs text-zinc-500">Hidden from the Storefront. Past orders keep their lines.</Text>
          ) : draft.status === "Draft" ? (
            <Text className="mt-2 text-xs text-zinc-500">Only Staff can see Drafts.</Text>
          ) : (
            <Text className="mt-2 text-xs text-zinc-500">Live on the Storefront.</Text>
          )}
        </View>

        {/* Basics */}
        <SectionHeader title="Basics" />
        <Card>
          <Field label="Name">
            <TextInput
              value={draft.name}
              onChangeText={(name) => update({ name })}
              placeholder="e.g. Kente Weekend Tote"
              className="text-[15px] text-zinc-900"
            />
          </Field>
          <Field label="Category">
            <View className="flex-row flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const on = draft.categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => update({ categoryId: c.id })}
                    className={`rounded-full border px-2.5 py-1 ${on ? "border-[#6d28d9] bg-[#6d28d9]" : "border-zinc-300"}`}
                  >
                    <Text className={`text-xs ${on ? "font-semibold text-white" : "text-zinc-700"}`}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <View className="px-3 py-2.5">
            <Text className="mb-1 text-[11px] font-semibold text-zinc-500">Description</Text>
            <TextInput
              value={draft.description}
              onChangeText={(description) => update({ description })}
              placeholder="What it is, materials, sizing…"
              multiline
              className="min-h-[64px] text-sm text-zinc-900"
              style={{ textAlignVertical: "top" }}
            />
          </View>
        </Card>

        {/* Photos */}
        <SectionHeader title="Photos" hint="First photo is the cover. Tap a photo for options." right={<Text className="text-xs text-zinc-500">{draft.images.length} photos</Text>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {draft.images.map((img, i) => {
            const sel = selectedImage === img.id;
            return (
              <View key={img.id} className="items-center">
                <Pressable
                  onPress={() => setSelectedImage(sel ? null : img.id)}
                  className={`h-24 w-24 items-center justify-center rounded-lg ${sel ? "border-2 border-[#6d28d9]" : ""}`}
                  style={{ backgroundColor: img.color }}
                >
                  <Text className="text-[11px] font-semibold text-white">{img.label}</Text>
                  {i === 0 ? (
                    <View className="absolute left-1 top-1 rounded bg-black/60 px-1">
                      <Text className="text-[9px] font-bold text-white">COVER</Text>
                    </View>
                  ) : null}
                </Pressable>
                {sel ? (
                  <View className="mt-1 flex-row gap-1">
                    <Pressable onPress={() => moveImage(img.id, -1)} className="rounded bg-white px-1.5 py-0.5">
                      <Text className="text-xs">◀</Text>
                    </Pressable>
                    {i !== 0 ? (
                      <Pressable
                        onPress={() => update({ images: [img, ...draft.images.filter((x) => x.id !== img.id)] })}
                        className="rounded bg-white px-1.5 py-0.5"
                      >
                        <Text className="text-[10px] font-semibold text-[#6d28d9]">Cover</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => removeImage(img.id)} className="rounded bg-white px-1.5 py-0.5">
                      <Text className="text-xs text-red-600">✕</Text>
                    </Pressable>
                    <Pressable onPress={() => moveImage(img.id, 1)} className="rounded bg-white px-1.5 py-0.5">
                      <Text className="text-xs">▶</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          <Pressable
            onPress={() => update({ images: [...draft.images, addImage(draft)] })}
            className="h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-white"
          >
            <Text className="text-2xl text-zinc-400">＋</Text>
            <Text className="text-[10px] text-zinc-500">Camera / library</Text>
          </Pressable>
        </ScrollView>

        {/* Options */}
        <SectionHeader
          title="Options"
          hint="Up to 3, e.g. Colour × Size. Every combination is a Variant."
          right={<Text className="text-xs font-semibold text-[#6d28d9]">{liveVariants.length} Variant{liveVariants.length === 1 ? "" : "s"}</Text>}
        />
        <Card>
          {draft.options.length === 0 ? (
            <Text className="px-3 py-3 text-xs text-zinc-500">No options: this Product has one default Variant.</Text>
          ) : null}
          {draft.options.map((o, oi) => (
            <View key={oi} className="border-b border-zinc-100 px-3 py-2.5">
              <View className="mb-2 flex-row items-center gap-2">
                <TextInput
                  value={o.name}
                  onChangeText={(name) => setOptions(draft.options.map((x, i) => (i === oi ? { ...x, name } : x)))}
                  placeholder="Option name"
                  className="flex-1 rounded-md bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-900"
                />
                <Pressable onPress={() => setOptions(draft.options.filter((_, i) => i !== oi))}>
                  <Text className="text-xs text-red-600">Remove</Text>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap items-center gap-1.5">
                {o.values.map((v) => (
                  <View key={v} className="flex-row items-center rounded-full bg-[#ede9fe] pl-2.5 pr-1 py-0.5">
                    <Text className="text-xs text-[#4c1d95]">{v}</Text>
                    <Pressable
                      onPress={() =>
                        setOptions(draft.options.map((x, i) => (i === oi ? { ...x, values: x.values.filter((y) => y !== v) } : x)))
                      }
                      className="ml-1 px-1"
                    >
                      <Text className="text-xs text-[#6d28d9]">×</Text>
                    </Pressable>
                  </View>
                ))}
                <TextInput
                  value={newValue[oi] ?? ""}
                  onChangeText={(t) => setNewValue((n) => ({ ...n, [oi]: t }))}
                  onSubmitEditing={() => {
                    const t = (newValue[oi] ?? "").trim();
                    if (!t || o.values.includes(t)) return;
                    setOptions(draft.options.map((x, i) => (i === oi ? { ...x, values: [...x.values, t] } : x)));
                    setNewValue((n) => ({ ...n, [oi]: "" }));
                  }}
                  placeholder="+ value, Enter"
                  className="min-w-[90px] rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs"
                />
              </View>
            </View>
          ))}
          {draft.options.length < 3 ? (
            <Pressable onPress={() => setOptions([...draft.options, { name: "", values: [] }])} className="px-3 py-2.5">
              <Text className="text-sm font-semibold text-[#6d28d9]">＋ Add option</Text>
            </Pressable>
          ) : (
            <Text className="px-3 py-2.5 text-xs text-zinc-400">Maximum of 3 options.</Text>
          )}
        </Card>

        {/* Variants table */}
        <SectionHeader
          title="Variants"
          hint={role === "owner" ? "Tap the swatch to pick a photo. Prices in GH₵." : "Store Prices are set by the Owner."}
        />
        <View className="mx-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <View className="flex-row bg-zinc-50 px-2 py-1.5">
            <Text className="w-9 text-[10px] font-bold text-zinc-500">IMG</Text>
            <Text className="flex-1 text-[10px] font-bold text-zinc-500">VARIANT · SKU</Text>
            <Text className="w-[84px] text-right text-[10px] font-bold text-zinc-500">STORE PRICE</Text>
            <Text className="w-10 text-right text-[10px] font-bold text-zinc-500">STOCK</Text>
          </View>
          {liveVariants.map((v) => {
            const img = draft.images.find((i) => i.id === v.imageId);
            return (
              <View key={v.id} className="flex-row items-center border-t border-zinc-100 px-2 py-1.5">
                <Pressable
                  onPress={() => cycleVariantImage(v)}
                  className="mr-2 h-7 w-7 items-center justify-center rounded border border-zinc-200"
                  style={{ backgroundColor: img?.color ?? "#fafafa" }}
                >
                  {!img ? <Text className="text-[10px] text-zinc-400">＋</Text> : null}
                </Pressable>
                <View className="flex-1 pr-1">
                  <Text className="text-xs font-semibold text-zinc-900" numberOfLines={1}>
                    {variantLabel(v)}
                  </Text>
                  <TextInput
                    value={v.sku}
                    onChangeText={(sku) => updateVariant(v.id, { sku })}
                    placeholder="SKU required"
                    className={`text-[11px] ${v.sku ? "text-zinc-500" : "text-red-500"}`}
                    style={{ fontFamily: Platform.OS === "web" ? "monospace" : undefined }}
                  />
                </View>
                <View className="w-[84px] items-end">
                  {role === "owner" ? (
                    <View className={`flex-row items-center rounded border px-1 ${v.storePrice == null && draft.sellInStock ? "border-amber-400 bg-amber-50" : "border-zinc-200"}`}>
                      <Text className="text-[10px] text-zinc-400">GH₵</Text>
                      <TextInput
                        defaultValue={v.storePrice != null ? String(v.storePrice / 100) : ""}
                        onChangeText={(t) => updateVariant(v.id, { storePrice: t.trim() ? parseGhs(t) : undefined })}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        className="w-12 py-1 text-right text-xs font-semibold text-zinc-900"
                      />
                    </View>
                  ) : v.storePrice != null ? (
                    <Text className="text-xs font-semibold text-zinc-800">{ghs(v.storePrice)}</Text>
                  ) : (
                    <Text className="text-[10px] font-semibold text-[#d97706]">🔒 Owner sets</Text>
                  )}
                </View>
                <Text className={`w-10 text-right text-xs ${v.stock ? "text-zinc-800" : "text-zinc-400"}`}>{v.stock}</Text>
              </View>
            );
          })}
          {archivedVariants.map((v) => (
            <View key={v.id} className="flex-row items-center border-t border-zinc-100 bg-zinc-50 px-2 py-1.5 opacity-60">
              <View className="mr-2 h-7 w-7 rounded bg-zinc-200" />
              <View className="flex-1">
                <Text className="text-xs text-zinc-600 line-through">{variantLabel(v)}</Text>
                <Text className="text-[10px] text-zinc-500">Archived (has stock/orders) · {v.sku}</Text>
              </View>
              <Text className="w-10 text-right text-xs text-zinc-500">{v.stock}</Text>
            </View>
          ))}
        </View>
        <Text className="mx-4 mt-1.5 text-[11px] text-zinc-400">
          Stock changes come from Stock Movements (arrivals, sales, Adjustments), not this screen.
        </Text>

        {/* Selling */}
        <SectionHeader title="Selling" />
        <Card>
          <View className="flex-row items-center px-3 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-zinc-900">Sell In-stock on the Storefront</Text>
              <Text className="text-xs text-zinc-500">
                Variants with Stock can be bought now at their Store Price. Off = Pre-order only.
              </Text>
            </View>
            <Switch
              value={draft.sellInStock}
              onValueChange={(sellInStock) => update({ sellInStock })}
              trackColor={{ true: PURPLE, false: "#d4d4d8" }}
            />
          </View>
        </Card>

        {/* Order Windows */}
        <SectionHeader title="Order Windows" hint="Pre-order prices, caps and dates live on each window." />
        <Card>
          {windows.length === 0 ? <Text className="px-3 py-3 text-xs text-zinc-500">No Order Windows yet.</Text> : null}
          {windows.map((w) => (
            <View key={w.id} className="flex-row items-center border-b border-zinc-100 px-3 py-2.5">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-zinc-900">Window {w.number}</Text>
                <Text className="text-xs text-zinc-500">
                  {w.draft ? "Not opened yet" : `${fmtDate(w.opensAt)} → closes ${fmtDate(w.closesAt)}`} · ETA{" "}
                  {fmtRange(w.expectedFrom, w.expectedTo)}
                </Text>
              </View>
              <View className={`rounded-full px-2 py-0.5 ${w.draft ? "bg-zinc-200" : w.stage === "Open" ? "bg-emerald-100" : "bg-sky-100"}`}>
                <Text className="text-[10px] font-bold text-zinc-800">{w.draft ? "DRAFT" : w.stage.toUpperCase()}</Text>
              </View>
            </View>
          ))}
          <Pressable
            onPress={() => notify("Open a new Order Window", "See /prototype/back-office/window")}
            className="px-3 py-2.5"
          >
            <Text className="text-sm font-semibold text-[#6d28d9]">＋ Open a new Order Window</Text>
          </Pressable>
        </Card>

        {bo.log.length ? (
          <>
            <SectionHeader title="Activity (prototype)" />
            <View className="mx-4">
              {bo.log.slice(0, 5).map((l, i) => (
                <Text key={i} className="text-[11px] text-zinc-500">
                  {l}
                </Text>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Sticky save bar */}
      <View className="absolute bottom-0 left-0 right-0 flex-row items-center border-t border-zinc-200 bg-white px-4 pb-6 pt-3">
        <View className="flex-1 pr-3">
          {blockers.length ? (
            <Text className="text-xs font-semibold text-[#d97706]">
              ⚠ {blockers.length} blocker{blockers.length > 1 ? "s" : ""} before publishing
            </Text>
          ) : (
            <Text className="text-xs font-semibold text-emerald-700">✓ Ready to publish</Text>
          )}
          <Text className="text-[11px] text-zinc-500">
            {draft.status} · {liveVariants.length} Variant{liveVariants.length === 1 ? "" : "s"} · {draft.images.length} photo
            {draft.images.length === 1 ? "" : "s"}
          </Text>
        </View>
        <Pressable onPress={save} className="rounded-xl px-6 py-3" style={{ backgroundColor: PURPLE }}>
          <Text className="text-sm font-bold text-white">Save</Text>
        </Pressable>
      </View>

      {toast ? (
        <View className="absolute left-6 right-6 items-center rounded-xl bg-zinc-900 px-4 py-3" style={{ bottom: 96 }}>
          <Text className="text-sm text-white">{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}
