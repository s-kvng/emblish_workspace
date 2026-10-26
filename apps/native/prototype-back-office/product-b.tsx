// PROTOTYPE (wayfinder #15): Product editor, variant B — step-by-step wizard. Throwaway.
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import {
  CATEGORIES,
  ME,
  addImage,
  ghs,
  newProduct,
  parseGhs,
  publishBlockers,
  regenerateVariants,
  saveProduct,
  useBO,
  variantLabel,
  type Product,
  type ProductOption,
  type Role,
  type Variant,
} from "./bo-data";

const STEPS = ["Basics", "Photos", "Options", "Variants", "Review"] as const;
const PURPLE = "#6d28d9";

function suggestSku(name: string, v: Variant): string {
  const base = (name || "NEW")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const tail = Object.values(v.values)
    .map((x) => x.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase())
    .join("-");
  return tail ? `${base}-${tail}` : `${base}-STD`;
}

export default function ProductB({ role }: { role: Role }) {
  const { products, windows } = useBO();
  const [draft, setDraft] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<null | { published: boolean; name: string }>(null);

  if (done) {
    return (
      <Done
        published={done.published}
        name={done.name}
        role={role}
        onAgain={() => {
          setDone(null);
          setDraft(null);
          setStep(0);
        }}
      />
    );
  }

  if (!draft) {
    return (
      <Start
        products={products}
        role={role}
        onNew={() => {
          setDraft(newProduct());
          setIsNew(true);
          setStep(0);
        }}
        onEdit={(p) => {
          setDraft(structuredClone(p));
          setIsNew(false);
          setStep(0);
        }}
      />
    );
  }

  const p = draft;
  const update = (patch: Partial<Product>) => setDraft({ ...p, ...patch });
  const blockers = publishBlockers(p, windows);

  const save = (publish: boolean) => {
    // Saving with blockers always lands as a Draft, even if it was Published before.
    const out: Product = { ...p, status: publish ? "Published" : "Draft" };
    saveProduct(out, ME[role]);
    setDone({ published: out.status === "Published", name: out.name || "Untitled product" });
  };

  const canNext = step === 0 ? p.name.trim().length > 0 : true;

  return (
    <View className="flex-1 bg-zinc-50">
      {/* header */}
      <View className="bg-white border-b border-zinc-200 px-4 pt-12 pb-3">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => setDraft(null)} hitSlop={10}>
            <Text className="text-zinc-500 text-base">✕ Close</Text>
          </Pressable>
          <Text className="text-zinc-900 font-semibold text-base" numberOfLines={1}>
            {isNew ? "New product" : p.name}
          </Text>
          <Text className="text-zinc-400 text-sm">
            {step + 1}/{STEPS.length}
          </Text>
        </View>
        <View className="h-1.5 bg-zinc-200 rounded-full mt-3 overflow-hidden">
          <View className="h-1.5 rounded-full bg-violet-700" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </View>
        <View className="flex-row justify-between mt-2">
          {STEPS.map((s, i) => (
            <Pressable key={s} onPress={() => (i <= step || !isNew ? setStep(i) : undefined)} className="items-center flex-1">
              <View
                className={`w-6 h-6 rounded-full items-center justify-center ${
                  i < step ? "bg-violet-700" : i === step ? "bg-white border-2 border-violet-700" : "bg-zinc-200"
                }`}
              >
                <Text className={`text-[11px] font-bold ${i < step ? "text-white" : i === step ? "text-violet-700" : "text-zinc-500"}`}>
                  {i < step ? "✓" : i + 1}
                </Text>
              </View>
              <Text className={`text-[10px] mt-1 ${i === step ? "text-violet-700 font-semibold" : "text-zinc-500"}`}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {step === 0 && <StepBasics p={p} update={update} />}
        {step === 1 && <StepPhotos p={p} update={update} />}
        {step === 2 && <StepOptions p={p} update={update} />}
        {step === 3 && <StepVariants p={p} update={update} role={role} />}
        {step === 4 && <StepReview p={p} update={update} role={role} blockers={blockers} goTo={setStep} />}
      </ScrollView>

      {/* pinned footer */}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-zinc-200 px-4 pt-3 pb-6 flex-row gap-3">
        <Pressable
          onPress={() => (step === 0 ? setDraft(null) : setStep(step - 1))}
          className="flex-1 h-14 rounded-xl border border-zinc-300 items-center justify-center"
        >
          <Text className="text-zinc-800 font-semibold text-base">{step === 0 ? "Cancel" : "‹ Back"}</Text>
        </Pressable>
        {step < STEPS.length - 1 ? (
          <Pressable
            disabled={!canNext}
            onPress={() => setStep(step + 1)}
            className={`flex-[2] h-14 rounded-xl items-center justify-center ${canNext ? "bg-violet-700" : "bg-zinc-300"}`}
          >
            <Text className="text-white font-semibold text-base">Next: {STEPS[step + 1]} ›</Text>
          </Pressable>
        ) : (
          <ReviewAction blockers={blockers} role={role} onSave={save} wasPublished={p.status === "Published"} />
        )}
      </View>
    </View>
  );
}

// ---------- start ----------

function Start({
  products,
  role,
  onNew,
  onEdit,
}: {
  products: Product[];
  role: Role;
  onNew: () => void;
  onEdit: (p: Product) => void;
}) {
  const { windows } = useBO();
  return (
    <ScrollView className="flex-1 bg-zinc-50" contentContainerStyle={{ padding: 16, paddingTop: 56 }}>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider">Back Office · Catalog</Text>
      <Text className="text-zinc-900 text-2xl font-bold mt-1">Products</Text>
      <Text className="text-zinc-500 text-sm mt-1">Signed in as {ME[role]}</Text>

      <Pressable onPress={onNew} className="mt-5 h-16 rounded-2xl bg-violet-700 flex-row items-center justify-center gap-2">
        <Text className="text-white text-2xl">＋</Text>
        <Text className="text-white font-semibold text-lg">New product</Text>
      </Pressable>

      <Text className="text-zinc-500 text-xs uppercase tracking-wider mt-8 mb-2">Or edit an existing one</Text>
      {products.map((p) => {
        const b = publishBlockers(p, windows);
        const needsPrice = b.some((x) => x.includes("Store Price"));
        const cover = p.images[0];
        return (
          <Pressable key={p.id} onPress={() => onEdit(p)} className="bg-white rounded-2xl border border-zinc-200 p-3 mb-3 flex-row items-center gap-3">
            <View className="w-14 h-14 rounded-xl items-center justify-center" style={{ backgroundColor: cover?.color ?? "#e4e4e7" }}>
              <Text className="text-white text-[10px] font-semibold">{cover?.label ?? "No photo"}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-zinc-900 font-semibold text-base">{p.name}</Text>
              <Text className="text-zinc-500 text-xs mt-0.5">
                {CATEGORIES.find((c) => c.id === p.categoryId)?.name ?? "No Category"} · {p.variants.filter((v) => !v.archived).length} Variants
              </Text>
              <View className="flex-row gap-1.5 mt-1.5">
                <StatusPill status={p.status} />
                {needsPrice && (
                  <View className="px-2 py-0.5 rounded-full bg-amber-100">
                    <Text className="text-[10px] font-bold text-amber-600">NEEDS PRICES</Text>
                  </View>
                )}
              </View>
            </View>
            <Text className="text-zinc-400 text-xl">›</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function StatusPill({ status }: { status: Product["status"] }) {
  const cls =
    status === "Published" ? "bg-green-100 text-green-700" : status === "Draft" ? "bg-zinc-200 text-zinc-700" : "bg-zinc-800 text-white";
  const [bg, fg] = cls.split(" ");
  return (
    <View className={`px-2 py-0.5 rounded-full ${bg}`}>
      <Text className={`text-[10px] font-bold ${fg}`}>{status.toUpperCase()}</Text>
    </View>
  );
}

// ---------- steps ----------

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="text-zinc-900 text-xl font-bold">{title}</Text>
      {hint ? <Text className="text-zinc-500 text-sm mt-1">{hint}</Text> : null}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text className="text-zinc-700 text-sm font-semibold mb-1.5 mt-4">{children}</Text>;
}

function StepBasics({ p, update }: { p: Product; update: (x: Partial<Product>) => void }) {
  return (
    <View>
      <StepTitle title="What are you selling?" hint="Customers see the name and description on the Storefront." />
      <Label>Product name</Label>
      <TextInput
        value={p.name}
        onChangeText={(name) => update({ name })}
        placeholder="e.g. Kente Weekend Tote"
        className="bg-white border border-zinc-300 rounded-xl h-14 px-4 text-base text-zinc-900"
      />
      <Label>Category</Label>
      <View className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {CATEGORIES.map((c, i) => {
          const on = p.categoryId === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => update({ categoryId: c.id })}
              className={`h-14 px-4 flex-row items-center justify-between ${i ? "border-t border-zinc-100" : ""} ${on ? "bg-violet-50" : ""}`}
            >
              <Text className={`text-base ${on ? "text-violet-700 font-semibold" : "text-zinc-800"}`}>{c.name}</Text>
              <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${on ? "border-violet-700" : "border-zinc-300"}`}>
                {on && <View className="w-3 h-3 rounded-full bg-violet-700" />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-zinc-400 text-xs mt-1.5">One Category per Product. The list is flat.</Text>
      <Label>Description</Label>
      <TextInput
        value={p.description}
        onChangeText={(description) => update({ description })}
        placeholder="Materials, sizing, care…"
        multiline
        className="bg-white border border-zinc-300 rounded-xl min-h-28 px-4 py-3 text-base text-zinc-900"
        style={{ textAlignVertical: "top" }}
      />
    </View>
  );
}

function StepPhotos({ p, update }: { p: Product; update: (x: Partial<Product>) => void }) {
  const remove = (id: string) =>
    update({
      images: p.images.filter((i) => i.id !== id),
      variants: p.variants.map((v) => (v.imageId === id ? { ...v, imageId: undefined } : v)),
    });
  const makeCover = (id: string) => {
    const img = p.images.find((i) => i.id === id)!;
    update({ images: [img, ...p.images.filter((i) => i.id !== id)] });
  };
  return (
    <View>
      <StepTitle title="Photos" hint="The first photo is the cover. You'll pick a photo for each Variant later." />
      <View className="flex-row flex-wrap -mx-1.5">
        {p.images.map((img, i) => (
          <View key={img.id} className="w-1/2 p-1.5">
            <View className="rounded-2xl overflow-hidden border border-zinc-200 bg-white">
              <View className="h-36 items-center justify-center" style={{ backgroundColor: img.color }}>
                <Text className="text-white font-semibold">{img.label}</Text>
                {i === 0 && (
                  <View className="absolute top-2 left-2 bg-white rounded-full px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-violet-700">COVER</Text>
                  </View>
                )}
              </View>
              <View className="flex-row">
                <Pressable
                  disabled={i === 0}
                  onPress={() => makeCover(img.id)}
                  className="flex-1 h-11 items-center justify-center border-r border-zinc-100"
                >
                  <Text className={`text-xs font-semibold ${i === 0 ? "text-zinc-300" : "text-violet-700"}`}>Make cover</Text>
                </Pressable>
                <Pressable onPress={() => remove(img.id)} className="flex-1 h-11 items-center justify-center">
                  <Text className="text-xs font-semibold text-red-600">Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        <View className="w-1/2 p-1.5">
          <Pressable
            onPress={() => update({ images: [...p.images, addImage(p)] })}
            className="h-[188px] rounded-2xl border-2 border-dashed border-zinc-300 items-center justify-center bg-white"
          >
            <Text className="text-3xl text-zinc-400">＋</Text>
            <Text className="text-zinc-600 font-semibold mt-1">Add photo</Text>
            <Text className="text-zinc-400 text-xs mt-0.5">Camera or library</Text>
          </Pressable>
        </View>
      </View>
      {!p.images.length && (
        <View className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Text className="text-amber-600 text-sm">You can skip this, but a Product needs at least one photo to be Published.</Text>
        </View>
      )}
    </View>
  );
}

function StepOptions({ p, update }: { p: Product; update: (x: Partial<Product>) => void }) {
  const hasOptions = p.options.length > 0;
  const [newValue, setNewValue] = useState<Record<number, string>>({});

  const setOptions = (options: ProductOption[]) => update({ options, variants: regenerateVariants(p, options) });

  const addValue = (i: number) => {
    const val = (newValue[i] ?? "").trim();
    if (!val || p.options[i].values.includes(val)) return;
    setOptions(p.options.map((o, j) => (j === i ? { ...o, values: [...o.values, val] } : o)));
    setNewValue({ ...newValue, [i]: "" });
  };

  const live = p.variants.filter((v) => !v.archived);
  const archived = p.variants.filter((v) => v.archived);

  return (
    <View>
      <StepTitle title="Does this product come in options?" hint="Like size or colour. Each combination becomes a Variant with its own SKU and price." />
      <View className="flex-row gap-3">
        {[
          { yes: false, t: "No, just one", d: "One Variant" },
          { yes: true, t: "Yes", d: "Up to 3 options" },
        ].map((o) => {
          const on = hasOptions === o.yes;
          return (
            <Pressable
              key={o.t}
              onPress={() => setOptions(o.yes ? (hasOptions ? p.options : [{ name: "Size", values: [] }]) : [])}
              className={`flex-1 rounded-2xl border-2 p-4 ${on ? "border-violet-700 bg-violet-50" : "border-zinc-200 bg-white"}`}
            >
              <Text className={`text-base font-bold ${on ? "text-violet-700" : "text-zinc-800"}`}>{o.t}</Text>
              <Text className="text-zinc-500 text-xs mt-1">{o.d}</Text>
            </Pressable>
          );
        })}
      </View>

      {hasOptions && (
        <View className="mt-5">
          {p.options.map((o, i) => (
            <View key={i} className="bg-white rounded-2xl border border-zinc-200 p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-zinc-400 text-xs font-bold uppercase">Option {i + 1}</Text>
                <Pressable onPress={() => setOptions(p.options.filter((_, j) => j !== i))} hitSlop={8}>
                  <Text className="text-red-600 text-xs font-semibold">Remove option</Text>
                </Pressable>
              </View>
              <TextInput
                value={o.name}
                onChangeText={(name) => setOptions(p.options.map((x, j) => (j === i ? { ...x, name } : x)))}
                placeholder="Option name (e.g. Colour)"
                className="mt-2 border border-zinc-300 rounded-xl h-12 px-3 text-base text-zinc-900"
              />
              <View className="flex-row flex-wrap gap-2 mt-3">
                {o.values.map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setOptions(p.options.map((x, j) => (j === i ? { ...x, values: x.values.filter((y) => y !== v) } : x)))}
                    className="flex-row items-center bg-violet-100 rounded-full pl-3 pr-2 h-9"
                  >
                    <Text className="text-violet-700 font-semibold">{v}</Text>
                    <Text className="text-violet-400 ml-1.5">✕</Text>
                  </Pressable>
                ))}
              </View>
              <View className="flex-row gap-2 mt-3">
                <TextInput
                  value={newValue[i] ?? ""}
                  onChangeText={(t) => setNewValue({ ...newValue, [i]: t })}
                  onSubmitEditing={() => addValue(i)}
                  placeholder="Add a value"
                  className="flex-1 border border-zinc-300 rounded-xl h-11 px-3 text-base text-zinc-900"
                />
                <Pressable onPress={() => addValue(i)} className="h-11 px-4 rounded-xl bg-zinc-900 items-center justify-center">
                  <Text className="text-white font-semibold">Add</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {p.options.length < 3 && (
            <Pressable
              onPress={() => setOptions([...p.options, { name: "", values: [] }])}
              className="h-12 rounded-xl border-2 border-dashed border-zinc-300 items-center justify-center"
            >
              <Text className="text-zinc-600 font-semibold">＋ Add another option</Text>
            </Pressable>
          )}
        </View>
      )}

      <View className="mt-5 bg-zinc-900 rounded-2xl p-4">
        <Text className="text-white font-bold text-base">
          This makes {live.length} Variant{live.length === 1 ? "" : "s"}
        </Text>
        <Text className="text-zinc-300 text-sm mt-1" numberOfLines={3}>
          {live.map(variantLabel).join(", ")}
        </Text>
        {archived.length > 0 && (
          <Text className="text-amber-300 text-xs mt-2">
            {archived.length} Variant{archived.length > 1 ? "s" : ""} with Stock ({archived.map(variantLabel).join(", ")}) will be archived, not deleted.
          </Text>
        )}
      </View>
    </View>
  );
}

function StepVariants({ p, update, role }: { p: Product; update: (x: Partial<Product>) => void; role: Role }) {
  const live = p.variants.filter((v) => !v.archived);
  const [idx, setIdx] = useState(0);
  const i = Math.min(idx, live.length - 1);
  const v = live[i];
  const [priceText, setPriceText] = useState<Record<string, string>>({});
  if (!v) return null;

  const patch = (x: Partial<Variant>) => update({ variants: p.variants.map((y) => (y.id === v.id ? { ...y, ...x } : y)) });
  const suggestion = suggestSku(p.name, v);
  const priced = live.filter((x) => x.storePrice != null).length;
  const img = p.images.find((x) => x.id === v.imageId);

  return (
    <View>
      <StepTitle title="Set up each Variant" hint={`${priced} of ${live.length} have a Store Price.`} />

      {/* pager dots */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable disabled={i === 0} onPress={() => setIdx(i - 1)} className="w-11 h-11 rounded-full bg-white border border-zinc-200 items-center justify-center">
          <Text className={i === 0 ? "text-zinc-300 text-lg" : "text-zinc-800 text-lg"}>‹</Text>
        </Pressable>
        <View className="items-center">
          <Text className="text-zinc-900 font-semibold">
            Variant {i + 1} of {live.length}
          </Text>
          <View className="flex-row gap-1.5 mt-1.5">
            {live.map((x, j) => (
              <Pressable key={x.id} onPress={() => setIdx(j)} hitSlop={4}>
                <View
                  className={`h-2 rounded-full ${j === i ? "w-5 bg-violet-700" : x.storePrice == null || !x.sku ? "w-2 bg-amber-400" : "w-2 bg-zinc-300"}`}
                />
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          disabled={i === live.length - 1}
          onPress={() => setIdx(i + 1)}
          className="w-11 h-11 rounded-full bg-white border border-zinc-200 items-center justify-center"
        >
          <Text className={i === live.length - 1 ? "text-zinc-300 text-lg" : "text-zinc-800 text-lg"}>›</Text>
        </Pressable>
      </View>

      {/* the card */}
      <View className="bg-white rounded-3xl border border-zinc-200 overflow-hidden">
        <View className="h-40 items-center justify-center" style={{ backgroundColor: img?.color ?? "#e4e4e7" }}>
          <Text className="text-white text-xl font-bold">{variantLabel(v)}</Text>
          <Text className="text-white/80 text-xs mt-1">{img ? img.label : "No photo chosen (uses cover)"}</Text>
          <View className="absolute top-3 right-3 bg-white/90 rounded-full px-2 py-0.5">
            <Text className="text-[10px] font-bold text-zinc-700">Stock {v.stock}</Text>
          </View>
        </View>
        <View className="p-4">
          <Text className="text-zinc-700 text-sm font-semibold mb-2">Photo for this Variant</Text>
          {p.images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {p.images.map((im) => {
                  const on = im.id === v.imageId;
                  return (
                    <Pressable
                      key={im.id}
                      onPress={() => patch({ imageId: on ? undefined : im.id })}
                      className={`w-16 h-16 rounded-xl items-center justify-center ${on ? "border-4 border-violet-700" : ""}`}
                      style={{ backgroundColor: im.color }}
                    >
                      <Text className="text-white text-[9px] font-semibold text-center">{im.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text className="text-zinc-400 text-sm">Add photos in step 2 to pick one here.</Text>
          )}

          <Text className="text-zinc-700 text-sm font-semibold mb-1.5 mt-5">SKU</Text>
          <TextInput
            value={v.sku}
            onChangeText={(sku) => patch({ sku: sku.toUpperCase() })}
            placeholder={suggestion}
            autoCapitalize="characters"
            className="border border-zinc-300 rounded-xl h-12 px-3 text-base text-zinc-900 font-mono"
          />
          {v.sku !== suggestion && (
            <Pressable onPress={() => patch({ sku: suggestion })} className="mt-2 self-start bg-zinc-100 rounded-full px-3 py-1.5">
              <Text className="text-zinc-700 text-xs">
                Use suggested: <Text className="font-mono font-bold">{suggestion}</Text>
              </Text>
            </Pressable>
          )}

          <Text className="text-zinc-700 text-sm font-semibold mb-1.5 mt-5">Store Price</Text>
          {role === "owner" ? (
            <View>
              <View className="flex-row items-center border border-zinc-300 rounded-xl h-14 px-3">
                <Text className="text-zinc-500 text-base mr-2">GH₵</Text>
                <TextInput
                  value={priceText[v.id] ?? (v.storePrice != null ? String(v.storePrice / 100) : "")}
                  onChangeText={(t) => {
                    setPriceText({ ...priceText, [v.id]: t });
                    patch({ storePrice: parseGhs(t) });
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  className="flex-1 text-xl font-semibold text-zinc-900"
                />
              </View>
              <Text className="text-zinc-400 text-xs mt-1.5">What this Variant sells for In-stock. Pre-order prices are set on each Order Window.</Text>
              {i > 0 && v.storePrice == null && live[i - 1].storePrice != null && (
                <Pressable
                  onPress={() => {
                    setPriceText({ ...priceText, [v.id]: String(live[i - 1].storePrice! / 100) });
                    patch({ storePrice: live[i - 1].storePrice });
                  }}
                  className="mt-2 self-start bg-violet-50 rounded-full px-3 py-1.5"
                >
                  <Text className="text-violet-700 text-xs font-semibold">Same as previous: {ghs(live[i - 1].storePrice)}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View className="bg-zinc-100 rounded-xl p-4 flex-row gap-3">
              <Text className="text-xl">🔒</Text>
              <View className="flex-1">
                <Text className="text-zinc-900 font-semibold">{v.storePrice != null ? ghs(v.storePrice) : "Not priced yet"}</Text>
                <Text className="text-zinc-600 text-sm mt-1">
                  The Owner sets the Store Price. You can save this as a Draft and they'll price it.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {i < live.length - 1 && (
        <Pressable onPress={() => setIdx(i + 1)} className="mt-3 h-12 rounded-xl bg-violet-50 items-center justify-center">
          <Text className="text-violet-700 font-semibold">Next Variant: {variantLabel(live[i + 1])} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

function StepReview({
  p,
  update,
  role,
  blockers,
  goTo,
}: {
  p: Product;
  update: (x: Partial<Product>) => void;
  role: Role;
  blockers: string[];
  goTo: (n: number) => void;
}) {
  const live = p.variants.filter((v) => !v.archived);
  const cat = CATEGORIES.find((c) => c.id === p.categoryId)?.name;
  // A fixed checklist so passed checks show as ✓ too.
  const checks: { label: string; ok: boolean; step: number }[] = [
    { label: "Name", ok: !!p.name.trim(), step: 0 },
    { label: "Category", ok: !!p.categoryId, step: 0 },
    { label: "At least one photo", ok: p.images.length > 0, step: 1 },
    { label: "Every Variant has a SKU", ok: live.every((v) => v.sku.trim()), step: 3 },
    ...(p.sellInStock
      ? [{ label: "Every Variant has a Store Price (Owner)", ok: live.every((v) => v.storePrice != null), step: 3 }]
      : []),
  ];
  const nothingToSell = blockers.find((b) => b.startsWith("Not sold In-stock"));

  return (
    <View>
      <StepTitle title="Review" hint="Check everything, then publish or save a Draft." />

      <Section title="Basics" onEdit={() => goTo(0)}>
        <Text className="text-zinc-900 font-semibold text-base">{p.name || "Untitled"}</Text>
        <Text className="text-zinc-500 text-sm">{cat ?? "No Category"}</Text>
        {p.description ? (
          <Text className="text-zinc-600 text-sm mt-1" numberOfLines={2}>
            {p.description}
          </Text>
        ) : null}
      </Section>

      <Section title={`Photos (${p.images.length})`} onEdit={() => goTo(1)}>
        <View className="flex-row gap-1.5">
          {p.images.map((im) => (
            <View key={im.id} className="w-11 h-11 rounded-lg" style={{ backgroundColor: im.color }} />
          ))}
          {!p.images.length && <Text className="text-zinc-400 text-sm">None</Text>}
        </View>
      </Section>

      <Section title={`Variants (${live.length})`} onEdit={() => goTo(3)}>
        {live.map((v) => (
          <View key={v.id} className="flex-row items-center py-1.5 border-b border-zinc-100">
            <View className="w-5 h-5 rounded mr-2" style={{ backgroundColor: p.images.find((x) => x.id === v.imageId)?.color ?? "#e4e4e7" }} />
            <Text className="flex-1 text-zinc-800 text-sm">{variantLabel(v)}</Text>
            <Text className="text-zinc-400 text-xs font-mono mr-3">{v.sku || "no SKU"}</Text>
            <Text className={`text-sm font-semibold ${v.storePrice == null ? "text-amber-600" : "text-zinc-900"}`}>
              {v.storePrice == null ? "Unpriced" : ghs(v.storePrice)}
            </Text>
          </View>
        ))}
      </Section>

      <View className="bg-white rounded-2xl border border-zinc-200 p-4 mb-3 flex-row items-center">
        <View className="flex-1 pr-3">
          <Text className="text-zinc-900 font-semibold">Sell In-stock on the Storefront</Text>
          <Text className="text-zinc-500 text-xs mt-0.5">Off = Pre-order only (through Order Windows). On needs a Store Price on every Variant.</Text>
        </View>
        <Switch value={p.sellInStock} onValueChange={(sellInStock) => update({ sellInStock })} trackColor={{ true: PURPLE, false: "#d4d4d8" }} />
      </View>

      <View className="bg-white rounded-2xl border border-zinc-200 p-4">
        <Text className="text-zinc-900 font-semibold mb-2">Ready to publish?</Text>
        {checks.map((c) => (
          <Pressable key={c.label} onPress={() => !c.ok && goTo(c.step)} className="flex-row items-center py-2">
            <View className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${c.ok ? "bg-green-100" : "bg-red-100"}`}>
              <Text className={`text-xs font-bold ${c.ok ? "text-green-700" : "text-red-600"}`}>{c.ok ? "✓" : "✗"}</Text>
            </View>
            <Text className={`flex-1 text-sm ${c.ok ? "text-zinc-700" : "text-zinc-900 font-semibold"}`}>{c.label}</Text>
            {!c.ok && <Text className="text-violet-700 text-xs font-semibold">Fix ›</Text>}
          </Pressable>
        ))}
        {nothingToSell && (
          <View className="flex-row items-center py-2">
            <View className="w-6 h-6 rounded-full items-center justify-center mr-3 bg-red-100">
              <Text className="text-xs font-bold text-red-600">✗</Text>
            </View>
            <Text className="flex-1 text-sm text-zinc-900 font-semibold">{nothingToSell}</Text>
          </View>
        )}
        {nothingToSell && (
          <Text className="text-zinc-500 text-xs mt-1">Open an Order Window for it, and the Product is published with the window.</Text>
        )}
      </View>

      {role === "staff" && blockers.length > 0 && blockers.every((b) => b.includes("Store Price")) && (
        <View className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <Text className="text-amber-600 font-semibold">Only prices are missing</Text>
          <Text className="text-zinc-700 text-sm mt-1">
            Save it as a Draft. The Owner sees it in their "Needs prices" list, prices it and publishes.
          </Text>
        </View>
      )}
    </View>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl border border-zinc-200 p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider">{title}</Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text className="text-violet-700 text-sm font-semibold">Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ReviewAction({
  blockers,
  role,
  onSave,
  wasPublished,
}: {
  blockers: string[];
  role: Role;
  onSave: (publish: boolean) => void;
  wasPublished: boolean;
}) {
  if (!blockers.length) {
    return (
      <Pressable onPress={() => onSave(true)} className="flex-[2] h-14 rounded-xl bg-green-600 items-center justify-center">
        <Text className="text-white font-bold text-base">{wasPublished ? "Save & keep Published" : "Publish"}</Text>
      </Pressable>
    );
  }
  const onlyPrices = blockers.every((b) => b.includes("Store Price"));
  return (
    <Pressable onPress={() => onSave(false)} className="flex-[2] h-14 rounded-xl bg-zinc-900 items-center justify-center px-2">
      <Text className="text-white font-bold text-sm text-center">
        {role === "staff" && onlyPrices ? "Save as Draft — waiting for Owner prices" : "Save as Draft"}
      </Text>
      <Text className="text-zinc-400 text-[10px]">
        {blockers.length} thing{blockers.length > 1 ? "s" : ""} block publishing
      </Text>
    </Pressable>
  );
}

function Done({ published, name, role, onAgain }: { published: boolean; name: string; role: Role; onAgain: () => void }) {
  return (
    <View className="flex-1 bg-zinc-50 items-center justify-center px-8">
      <View className={`w-20 h-20 rounded-full items-center justify-center ${published ? "bg-green-100" : "bg-zinc-200"}`}>
        <Text className={`text-4xl ${published ? "text-green-700" : "text-zinc-700"}`}>{published ? "✓" : "✎"}</Text>
      </View>
      <Text className="text-zinc-900 text-2xl font-bold mt-5 text-center">{published ? "Published" : "Saved as Draft"}</Text>
      <Text className="text-zinc-600 text-base mt-2 text-center">
        {published
          ? `${name} is live on the Storefront.`
          : role === "staff"
            ? `${name} is waiting in the Owner's "Needs prices" list.`
            : `${name} stays hidden from Customers until it's published.`}
      </Text>
      <Text className="text-zinc-400 text-xs mt-2">Saved by {ME[role]}</Text>
      <Pressable onPress={onAgain} className="mt-8 h-14 px-8 rounded-xl bg-violet-700 items-center justify-center">
        <Text className="text-white font-semibold text-base">Back to Products</Text>
      </Pressable>
    </View>
  );
}
