import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import {
  MAX_OPTIONS,
  onlyPricesMissing,
  type PublishCheck,
  publishChecklist,
  suggestSku,
} from "@emblish_workspace/backend/convex/model/catalog";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button, Input, Label, Spinner, Switch, TextArea, TextField } from "heroui-native";
import { type PropsWithChildren, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { formatGhs, ghsText, parseGhs } from "@/lib/money";
import { pickPhotos, uploadPhoto } from "@/lib/photos";

import {
  completeOptions,
  type DraftPhoto,
  type DraftUpdate,
  type DraftVariant,
  type ProductDraft,
  publishCandidate,
  variantLabel,
  variantsFor,
} from "./draft";

export const STEPS = ["Basics", "Photos", "Options", "Variants", "Review"] as const;

type StepProps = {
  draft: ProductDraft;
  update: DraftUpdate;
};

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="font-display text-2xl text-foreground">{title}</Text>
      {hint ? <Text className="mt-1 font-sans text-muted text-sm">{hint}</Text> : null}
    </View>
  );
}

function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <View className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>
      {children}
    </View>
  );
}

// ---------- 1. Basics ----------

export function BasicsStep({ draft, update }: StepProps) {
  const categories = useQuery(api.backOffice.categories.list);

  return (
    <View className="gap-4">
      <StepTitle
        title="What are you selling?"
        hint="Customers see the name and description on the Storefront."
      />
      <TextField>
        <Label>Product name</Label>
        <Input
          value={draft.name}
          onChangeText={(name) => update({ name })}
          placeholder="e.g. Kente Weekend Tote"
        />
      </TextField>
      <View>
        <Text className="mb-1.5 font-sans-semibold text-foreground text-sm">Category</Text>
        {categories === undefined ? (
          <Spinner />
        ) : (
          <View
            className="overflow-hidden rounded-2xl border border-border bg-surface"
            accessibilityRole="radiogroup"
          >
            {categories.map((category) => {
              const on = draft.categoryId === category._id;
              return (
                <Pressable
                  key={category._id}
                  onPress={() => update({ categoryId: category._id })}
                  accessibilityRole="radio"
                  aria-checked={on}
                  className={`h-14 flex-row items-center justify-between border-border border-t px-4 first:border-t-0 ${on ? "bg-brand-purple-mist" : ""}`}
                >
                  <Text
                    className={`text-base ${on ? "font-sans-semibold text-brand-purple" : "font-sans text-foreground"}`}
                  >
                    {category.name}
                  </Text>
                  <Ionicons
                    name={on ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={on ? brand.purple : brand["ink-muted"]}
                  />
                </Pressable>
              );
            })}
            <Link href="/categories" asChild>
              <Pressable
                accessibilityRole="link"
                className="h-12 flex-row items-center gap-2 border-border border-t px-4"
              >
                <Ionicons name="add" size={18} color={brand.purple} />
                <Text className="font-sans-semibold text-brand-purple text-sm">
                  {categories.length ? "Add or reorder Categories" : "Add a Category"}
                </Text>
              </Pressable>
            </Link>
          </View>
        )}
        <Text className="mt-1.5 font-sans text-muted text-xs">
          One Category per Product. The list is flat.
        </Text>
      </View>
      <TextField>
        <Label>Description</Label>
        <TextArea
          value={draft.description}
          onChangeText={(description) => update({ description })}
          placeholder="Materials, sizing, care…"
        />
      </TextField>
    </View>
  );
}

// ---------- 2. Photos ----------

export function PhotosStep({ draft, update }: StepProps) {
  const generateUploadUrl = useMutation(api.backOffice.products.generateUploadUrl);
  const [uploading, setUploading] = useState(0);

  const add = async (source: "camera" | "library") => {
    try {
      const picked = await pickPhotos(source);
      setUploading((n) => n + picked.length);
      const added: DraftPhoto[] = [];
      for (const photo of picked) {
        const storageId = await uploadPhoto(await generateUploadUrl(), photo);
        added.push({ storageId, url: photo.uri });
        setUploading((n) => n - 1);
      }
      // From the latest draft, so a Remove or a reorder during the upload isn't lost.
      update((latest) => ({ gallery: [...latest.gallery, ...added] }));
    } catch (error) {
      Alert.alert("Couldn't add the photo", error instanceof Error ? error.message : undefined);
    } finally {
      setUploading(0);
    }
  };

  const remove = (storageId: Id<"_storage">) =>
    update((latest) => ({
      gallery: latest.gallery.filter((photo) => photo.storageId !== storageId),
      variants: latest.variants.map((variant) =>
        variant.imageId === storageId ? { ...variant, imageId: undefined } : variant,
      ),
    }));

  /** Moves a photo to another place in the gallery; place 0 makes it the cover. */
  const moveTo = (storageId: Id<"_storage">, place: number) =>
    update((latest) => {
      const photo = latest.gallery.find((p) => p.storageId === storageId);
      if (!photo) return {};
      const rest = latest.gallery.filter((p) => p.storageId !== storageId);
      return { gallery: [...rest.slice(0, place), photo, ...rest.slice(place)] };
    });

  return (
    <View>
      <StepTitle
        title="Photos"
        hint="The first photo is the cover. You'll pick a photo for each Variant later."
      />
      <View className="-mx-1.5 flex-row flex-wrap">
        {draft.gallery.map((photo, index) => (
          <View key={photo.storageId} className="w-1/2 p-1.5">
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <Image
                source={{ uri: photo.url }}
                className="h-36 w-full bg-brand-muted"
                accessibilityIgnoresInvertColors
              />
              {index === 0 ? (
                <View className="absolute top-2 left-2 rounded-full bg-surface px-2 py-0.5">
                  <Text className="font-sans-bold text-[10px] text-brand-purple">COVER</Text>
                </View>
              ) : null}
              <View className="absolute top-1 right-1 flex-row">
                {(
                  [
                    { icon: "chevron-back", label: "earlier", place: index - 1 },
                    { icon: "chevron-forward", label: "later", place: index + 1 },
                  ] as const
                ).map(({ icon, label, place }) =>
                  place < 0 || place >= draft.gallery.length ? null : (
                    <Pressable
                      key={label}
                      onPress={() => moveTo(photo.storageId, place)}
                      accessibilityRole="button"
                      accessibilityLabel={`Move photo ${index + 1} ${label}`}
                      className="m-0.5 size-9 items-center justify-center rounded-full bg-surface/90"
                    >
                      <Ionicons name={icon} size={16} color={brand.purple} />
                    </Pressable>
                  ),
                )}
              </View>
              <View className="flex-row">
                <Pressable
                  disabled={index === 0}
                  onPress={() => moveTo(photo.storageId, 0)}
                  accessibilityRole="button"
                  className="h-11 flex-1 items-center justify-center border-border border-r"
                >
                  <Text
                    className={`font-sans-semibold text-xs ${index === 0 ? "text-muted" : "text-brand-purple"}`}
                  >
                    Make cover
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => remove(photo.storageId)}
                  accessibilityRole="button"
                  className="h-11 flex-1 items-center justify-center"
                >
                  <Text className="font-sans-semibold text-danger text-xs">Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        <View className="w-1/2 p-1.5">
          <View className="h-[188px] items-center justify-center gap-2 rounded-2xl border-2 border-border border-dashed bg-surface p-3">
            {uploading > 0 ? (
              <>
                <Spinner />
                <Text className="font-sans text-muted text-xs">Uploading {uploading}…</Text>
              </>
            ) : (
              <>
                <Text className="font-sans-semibold text-foreground">Add photo</Text>
                <Button size="sm" variant="secondary" onPress={() => add("camera")}>
                  <Ionicons name="camera" size={16} color={brand.purple} />
                  <Button.Label>Camera</Button.Label>
                </Button>
                <Button size="sm" variant="secondary" onPress={() => add("library")}>
                  <Ionicons name="images" size={16} color={brand.purple} />
                  <Button.Label>Library</Button.Label>
                </Button>
              </>
            )}
          </View>
        </View>
      </View>
      {draft.gallery.length === 0 ? (
        <Card className="mt-3 border-brand-gold bg-brand-gold-mist">
          <Text className="font-sans text-brand-gold-ink text-sm">
            You can skip this, but a Product needs at least one photo to be Published.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

// ---------- 3. Options ----------

export function OptionsStep({ draft, update }: StepProps) {
  const [newValue, setNewValue] = useState<Record<number, string>>({});
  const hasOptions = draft.options.length > 0;

  const setOptions = (options: ProductDraft["options"]) =>
    update({ options, variants: variantsFor(options, draft.variants) });

  const addValue = (index: number) => {
    const value = (newValue[index] ?? "").trim();
    const option = draft.options[index];
    if (!value || option.values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    setOptions(
      draft.options.map((o, i) => (i === index ? { ...o, values: [...o.values, value] } : o)),
    );
    setNewValue({ ...newValue, [index]: "" });
  };

  return (
    <View>
      <StepTitle
        title="Does this product come in options?"
        hint="Like size or colour. Each combination becomes a Variant with its own SKU and price."
      />
      <View className="flex-row gap-3" accessibilityRole="radiogroup">
        {[
          { yes: false, title: "No, just one", detail: "One Variant" },
          { yes: true, title: "Yes", detail: `Up to ${MAX_OPTIONS} options` },
        ].map((choice) => {
          const on = hasOptions === choice.yes;
          return (
            <Pressable
              key={choice.title}
              accessibilityRole="radio"
              aria-checked={on}
              onPress={() =>
                setOptions(
                  choice.yes ? (hasOptions ? draft.options : [{ name: "Size", values: [] }]) : [],
                )
              }
              className={`flex-1 rounded-2xl border-2 p-4 ${on ? "border-brand-purple bg-brand-purple-mist" : "border-border bg-surface"}`}
            >
              <Text
                className={`font-sans-bold text-base ${on ? "text-brand-purple" : "text-foreground"}`}
              >
                {choice.title}
              </Text>
              <Text className="mt-1 font-sans text-muted text-xs">{choice.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      {hasOptions ? (
        <View className="mt-5 gap-3">
          {draft.options.map((option, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: options have no id and are only appended or removed
            <Card key={index} className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-bold text-muted text-xs uppercase">
                  Option {index + 1}
                </Text>
                <Pressable
                  onPress={() => setOptions(draft.options.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text className="font-sans-semibold text-danger text-xs">Remove option</Text>
                </Pressable>
              </View>
              <TextField>
                <Input
                  value={option.name}
                  onChangeText={(name) =>
                    setOptions(draft.options.map((o, i) => (i === index ? { ...o, name } : o)))
                  }
                  placeholder="Option name (e.g. Colour)"
                  accessibilityLabel={`Option ${index + 1} name`}
                />
              </TextField>
              <View className="flex-row flex-wrap gap-2">
                {option.values.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${value}`}
                    onPress={() =>
                      setOptions(
                        draft.options.map((o, i) =>
                          i === index ? { ...o, values: o.values.filter((v) => v !== value) } : o,
                        ),
                      )
                    }
                    className="h-9 flex-row items-center rounded-full bg-brand-purple-mist pr-2 pl-3"
                  >
                    <Text className="font-sans-semibold text-brand-purple">{value}</Text>
                    <Ionicons
                      name="close"
                      size={14}
                      color={brand.purple}
                      style={{ marginLeft: 6 }}
                    />
                  </Pressable>
                ))}
              </View>
              <View className="flex-row gap-2">
                <TextField className="flex-1">
                  <Input
                    value={newValue[index] ?? ""}
                    onChangeText={(text) => setNewValue({ ...newValue, [index]: text })}
                    onSubmitEditing={() => addValue(index)}
                    submitBehavior="submit"
                    placeholder="Add a value"
                    accessibilityLabel={`Add a value to option ${index + 1}`}
                  />
                </TextField>
                <Button variant="secondary" onPress={() => addValue(index)}>
                  <Button.Label>Add</Button.Label>
                </Button>
              </View>
            </Card>
          ))}
          {draft.options.length < MAX_OPTIONS ? (
            <Button
              variant="ghost"
              onPress={() => setOptions([...draft.options, { name: "", values: [] }])}
            >
              <Ionicons name="add" size={18} color={brand.purple} />
              <Button.Label>Add another option</Button.Label>
            </Button>
          ) : null}
        </View>
      ) : null}

      <View className="mt-5 rounded-2xl bg-brand-purple-deep p-4">
        <Text className="font-sans-bold text-base text-white">
          This makes {draft.variants.length} Variant{draft.variants.length === 1 ? "" : "s"}
        </Text>
        <Text className="mt-1 font-sans text-sm text-white/80" numberOfLines={3}>
          {draft.variants.map(variantLabel).join(", ")}
        </Text>
        {draft.options.length > completeOptions(draft.options).length ? (
          <Text className="mt-2 font-sans text-brand-gold-bright text-xs">
            Options without a name or values don't count yet.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------- 4. Variants ----------

export function VariantsStep({ draft, update, isOwner }: StepProps & { isOwner: boolean }) {
  const [index, setIndex] = useState(0);
  const [priceText, setPriceText] = useState<Record<string, string>>({});
  const current = Math.min(index, draft.variants.length - 1);
  const variant = draft.variants[current];
  if (!variant) return null;
  const variantKey = variant.optionValues.join("/");
  const previous = draft.variants[current - 1];

  const patch = (fields: Partial<DraftVariant>) =>
    update({
      variants: draft.variants.map((v, i) => (i === current ? { ...v, ...fields } : v)),
    });
  const suggestion = suggestSku(draft.name, variant.optionValues);
  const priced = draft.variants.filter((v) => v.storePrice !== undefined).length;
  const photo = draft.gallery.find((p) => p.storageId === variant.imageId) ?? draft.gallery[0];
  const typed = priceText[variantKey] ?? ghsText(variant.storePrice);
  const priceInvalid = Number.isNaN(parseGhs(typed)) || parseGhs(typed) === 0;

  const setPrice = (text: string) => {
    setPriceText({ ...priceText, [variantKey]: text });
    const pesewas = parseGhs(text);
    patch({ storePrice: pesewas && !Number.isNaN(pesewas) ? pesewas : undefined });
  };

  return (
    <View>
      <StepTitle
        title="Set up each Variant"
        hint={`${priced} of ${draft.variants.length} have a Store Price.`}
      />

      <View className="mb-3 flex-row items-center justify-between">
        <PagerButton
          icon="chevron-back"
          label="Previous Variant"
          disabled={current === 0}
          onPress={() => setIndex(current - 1)}
        />
        <View className="items-center">
          <Text className="font-sans-semibold text-foreground">
            Variant {current + 1} of {draft.variants.length}
          </Text>
          <View className="mt-1.5 flex-row gap-1.5">
            {draft.variants.map((v, i) => {
              const incomplete = !v.sku.trim() || v.storePrice === undefined;
              return (
                <Pressable
                  key={v.optionValues.join("/")}
                  onPress={() => setIndex(i)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`${variantLabel(v)}${incomplete ? ", needs a SKU or price" : ""}`}
                >
                  <View
                    className={`h-2 rounded-full ${i === current ? "w-5 bg-brand-purple" : incomplete ? "w-2 bg-brand-gold" : "w-2 bg-brand-border"}`}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
        <PagerButton
          icon="chevron-forward"
          label="Next Variant"
          disabled={current === draft.variants.length - 1}
          onPress={() => setIndex(current + 1)}
        />
      </View>

      <View className="overflow-hidden rounded-3xl border border-border bg-surface">
        <View className="h-40 items-center justify-center bg-brand-purple-deep">
          {photo ? (
            <Image
              source={{ uri: photo.url }}
              className="absolute inset-0 opacity-70"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Text className="font-display text-white text-xl">{variantLabel(variant)}</Text>
          <Text className="mt-1 font-sans text-white/80 text-xs">
            {variant.imageId ? "Its own photo" : "Uses the cover photo"}
          </Text>
        </View>
        <View className="gap-5 p-4">
          <View>
            <Text className="mb-2 font-sans-semibold text-foreground text-sm">
              Photo for this Variant
            </Text>
            {draft.gallery.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {draft.gallery.map((p) => {
                    const on = p.storageId === variant.imageId;
                    return (
                      <Pressable
                        key={p.storageId}
                        onPress={() => patch({ imageId: on ? undefined : p.storageId })}
                        accessibilityRole="button"
                        aria-selected={on}
                        className={`size-16 overflow-hidden rounded-xl ${on ? "border-4 border-brand-purple" : ""}`}
                      >
                        <Image
                          source={{ uri: p.url }}
                          className="size-full"
                          accessibilityIgnoresInvertColors
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <Text className="font-sans text-muted text-sm">
                Add photos in step 2 to pick one here.
              </Text>
            )}
          </View>

          <View>
            <TextField>
              <Label>SKU</Label>
              <Input
                value={variant.sku}
                onChangeText={(sku) => patch({ sku: sku.toUpperCase() })}
                placeholder={suggestion}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </TextField>
            {variant.sku !== suggestion ? (
              <Pressable
                onPress={() => patch({ sku: suggestion })}
                accessibilityRole="button"
                className="mt-2 self-start rounded-full bg-brand-muted px-3 py-1.5"
              >
                <Text className="font-sans text-foreground text-xs">
                  Use suggested: <Text className="font-sans-bold">{suggestion}</Text>
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View>
            <Text className="mb-1.5 font-sans-semibold text-foreground text-sm">Store Price</Text>
            {isOwner ? (
              <View>
                <TextField isInvalid={priceInvalid}>
                  <Input
                    value={typed}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    accessibilityLabel="Store Price in cedis"
                  />
                </TextField>
                <Text className="mt-1.5 font-sans text-muted text-xs">
                  {priceInvalid
                    ? "Enter an amount in cedis, like 450 or 450.50."
                    : "In cedis. What this Variant sells for In-stock; Pre-order prices are set on each Order Window."}
                </Text>
                {previous?.storePrice !== undefined && variant.storePrice === undefined ? (
                  <Pressable
                    onPress={() => setPrice(ghsText(previous.storePrice))}
                    accessibilityRole="button"
                    className="mt-2 self-start rounded-full bg-brand-purple-mist px-3 py-1.5"
                  >
                    <Text className="font-sans-semibold text-brand-purple text-xs">
                      Same as previous: {formatGhs(previous.storePrice)}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="flex-row gap-3 rounded-xl bg-brand-muted p-4">
                <Ionicons name="lock-closed" size={20} color={brand["ink-muted"]} />
                <View className="flex-1">
                  <Text className="font-sans-semibold text-foreground">
                    {variant.storePrice !== undefined
                      ? formatGhs(variant.storePrice)
                      : "Not priced yet"}
                  </Text>
                  <Text className="mt-1 font-sans text-muted text-sm">
                    The Owner sets the Store Price. You can save this as a Draft and they'll price
                    it.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      {current < draft.variants.length - 1 ? (
        <Button variant="ghost" className="mt-3" onPress={() => setIndex(current + 1)}>
          <Button.Label>Next Variant: {variantLabel(draft.variants[current + 1])}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="size-11 items-center justify-center rounded-full border border-border bg-surface"
    >
      <Ionicons name={icon} size={20} color={disabled ? brand.border : brand.ink} />
    </Pressable>
  );
}

// ---------- 5. Review ----------

/** Which step fixes each checklist item. */
const fixStep: Record<PublishCheck["key"], number> = {
  name: 0,
  category: 0,
  photo: 1,
  sku: 3,
  storePrice: 3,
  sellInStock: 4,
};

export function ReviewStep({
  draft,
  update,
  isOwner,
  goTo,
}: StepProps & { isOwner: boolean; goTo: (step: number) => void }) {
  const categories = useQuery(api.backOffice.categories.list);
  const candidate = publishCandidate(draft);
  const checks = publishChecklist(candidate);
  const category = categories?.find((c) => c._id === draft.categoryId)?.name;

  return (
    <View className="gap-3">
      <StepTitle title="Review" hint="Check everything, then publish or save a Draft." />

      <Section title="Basics" onEdit={() => goTo(0)}>
        <Text className="font-sans-semibold text-base text-foreground">
          {draft.name || "Untitled"}
        </Text>
        <Text className="font-sans text-muted text-sm">{category ?? "No Category"}</Text>
        {draft.description ? (
          <Text className="mt-1 font-sans text-foreground text-sm" numberOfLines={2}>
            {draft.description}
          </Text>
        ) : null}
      </Section>

      <Section title={`Photos (${draft.gallery.length})`} onEdit={() => goTo(1)}>
        <View className="flex-row flex-wrap gap-1.5">
          {draft.gallery.map((photo) => (
            <Image
              key={photo.storageId}
              source={{ uri: photo.url }}
              className="size-11 rounded-lg bg-brand-muted"
              accessibilityIgnoresInvertColors
            />
          ))}
          {draft.gallery.length === 0 ? (
            <Text className="font-sans text-muted text-sm">None</Text>
          ) : null}
        </View>
      </Section>

      <Section title={`Variants (${draft.variants.length})`} onEdit={() => goTo(3)}>
        {draft.variants.map((variant) => (
          <View
            key={variant.optionValues.join("/")}
            className="flex-row items-center border-border border-b py-1.5 last:border-b-0"
          >
            <Text className="flex-1 font-sans text-foreground text-sm">
              {variantLabel(variant)}
            </Text>
            <Text className="mr-3 font-sans text-muted text-xs">{variant.sku || "no SKU"}</Text>
            <Text
              className={`font-sans-semibold text-sm ${variant.storePrice === undefined ? "text-brand-gold-ink" : "text-foreground"}`}
            >
              {variant.storePrice === undefined ? "Unpriced" : formatGhs(variant.storePrice)}
            </Text>
          </View>
        ))}
      </Section>

      <Card className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Text className="font-sans-semibold text-foreground">
            Sell In-stock on the Storefront
          </Text>
          <Text className="mt-0.5 font-sans text-muted text-xs">
            Off means Pre-order only, through Order Windows. On needs a Store Price on every
            Variant.
          </Text>
        </View>
        <Switch
          isSelected={draft.sellInStock}
          onSelectedChange={(sellInStock) => update({ sellInStock })}
          accessibilityLabel="Sell In-stock on the Storefront"
        />
      </Card>

      <Card>
        <Text className="mb-2 font-sans-semibold text-foreground">Ready to publish?</Text>
        {checks.map((check) => (
          <Pressable
            key={check.key}
            disabled={check.ok}
            onPress={() => goTo(fixStep[check.key])}
            accessibilityRole={check.ok ? "text" : "button"}
            accessibilityLabel={`${check.label}: ${check.ok ? "done" : "missing, fix"}`}
            className="flex-row items-center py-2"
          >
            <Ionicons
              name={check.ok ? "checkmark-circle" : "close-circle"}
              size={22}
              color={check.ok ? brand.success : brand.danger}
            />
            <Text
              className={`ml-3 flex-1 text-sm ${check.ok ? "font-sans text-muted" : "font-sans-semibold text-foreground"}`}
            >
              {check.label}
            </Text>
            {check.ok ? null : (
              <Text className="font-sans-semibold text-brand-purple text-xs">Fix ›</Text>
            )}
          </Pressable>
        ))}
        {draft.sellInStock ? null : (
          <Text className="mt-1 font-sans text-muted text-xs">
            A Pre-order-only Product is published when its first Order Window opens.
          </Text>
        )}
      </Card>

      {!isOwner && onlyPricesMissing(candidate) ? (
        <Card className="border-brand-gold bg-brand-gold-mist">
          <Text className="font-sans-semibold text-brand-gold-ink">Only prices are missing</Text>
          <Text className="mt-1 font-sans text-foreground text-sm">
            Save it as a Draft. The Owner prices it, then anyone can publish it.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

function Section({
  title,
  onEdit,
  children,
}: PropsWithChildren<{ title: string; onEdit: () => void }>) {
  return (
    <Card>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-sans-bold text-muted text-xs uppercase tracking-wider">{title}</Text>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button">
          <Text className="font-sans-semibold text-brand-purple text-sm">Edit</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}
