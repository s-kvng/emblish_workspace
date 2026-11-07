import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import {
  onlyPricesMissing,
  publishChecklist,
} from "@emblish_workspace/backend/convex/model/catalog";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductStatusChip } from "@/components/product-status-chip";
import {
  type DraftUpdate,
  draftFromSaved,
  emptyDraft,
  type ProductDraft,
  publishCandidate,
  saveArgs,
} from "@/components/product-wizard/draft";
import {
  BasicsStep,
  OptionsStep,
  PhotosStep,
  ReviewStep,
  STEPS,
  VariantsStep,
} from "@/components/product-wizard/steps";
import { refusalMessage } from "@/lib/form-errors";
import { useStaffMember } from "@/lib/staff-member";

/** The step-by-step Product wizard: a new Product, or `?id=` to edit one. */
export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const productId = id as Id<"products"> | undefined;
  const saved = useQuery(api.backOffice.products.get, productId ? { productId } : "skip");

  if (!productId) return <Wizard initial={emptyDraft} />;
  if (saved === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  if (saved.status === "archived") return <Archived productId={saved._id} name={saved.name} />;
  // Keyed so a different Product starts a fresh wizard; later server changes don't overwrite edits.
  return <Wizard key={saved._id} initial={draftFromSaved(saved)} />;
}

type Done = { status: "draft" | "published"; name: string };

function Wizard({ initial }: { initial: ProductDraft }) {
  const insets = useSafeAreaInsets();
  const isOwner = useStaffMember()?.role === "owner";
  const save = useMutation(api.backOffice.products.save);
  const archive = useMutation(api.backOffice.products.archive);
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const isNew = !draft.productId;

  if (done) return <DoneScreen done={done} isOwner={isOwner} />;

  const update: DraftUpdate = (patch) =>
    setDraft((d) => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) }));
  const candidate = publishCandidate(draft);
  const ready = publishChecklist(candidate).every((check) => check.ok);
  const canGoOn = step > 0 || draft.name.trim() !== "";

  const submit = async (publish: boolean) => {
    setSaving(true);
    try {
      const result = await save(saveArgs(draft, publish));
      setDone({ status: result.status === "published" ? "published" : "draft", name: draft.name });
    } catch (error) {
      Alert.alert("Couldn't save", refusalMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = () => {
    const productId = draft.productId;
    if (!productId) return;
    Alert.alert(
      `Archive ${draft.name}?`,
      "It disappears from the Storefront and can't be bought. It's kept so past orders still show it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            try {
              await archive({ productId });
              router.back();
            } catch (error) {
              Alert.alert("Couldn't archive", refusalMessage(error));
            }
          },
        },
      ],
    );
  };

  const close = () =>
    Alert.alert("Leave without saving?", "Changes since the last save are lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <View className="bg-brand-purple-deep px-4 pb-3" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="-ml-2 size-11 items-center justify-center"
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <Text
            className="flex-1 px-2 text-center font-sans-semibold text-base text-white"
            numberOfLines={1}
          >
            {isNew ? "New product" : draft.name || "Untitled product"}
          </Text>
          <Text className="w-11 text-right font-sans text-sm text-white/70">
            {step + 1}/{STEPS.length}
          </Text>
        </View>
        <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
          <View
            className="h-1.5 rounded-full bg-brand-gold-bright"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </View>
        <View className="mt-2 flex-row justify-between">
          {STEPS.map((label, index) => {
            const reachable = index <= step || !isNew || canGoOn;
            return (
              <Pressable
                key={label}
                disabled={!reachable}
                onPress={() => setStep(index)}
                accessibilityRole="tab"
                aria-selected={index === step}
                accessibilityLabel={`Step ${index + 1}: ${label}`}
                className="flex-1 items-center"
              >
                <View
                  className={`size-6 items-center justify-center rounded-full ${index < step ? "bg-brand-gold-bright" : index === step ? "border-2 border-brand-gold-bright" : "bg-white/20"}`}
                >
                  {index < step ? (
                    <Ionicons name="checkmark" size={14} color={brand["purple-deep"]} />
                  ) : (
                    <Text className="font-sans-bold text-[11px] text-white">{index + 1}</Text>
                  )}
                </View>
                <Text
                  className={`mt-1 text-[10px] ${index === step ? "font-sans-semibold text-brand-gold-bright" : "font-sans text-white/70"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? <BasicsStep draft={draft} update={update} /> : null}
        {step === 1 ? <PhotosStep draft={draft} update={update} /> : null}
        {step === 2 ? <OptionsStep draft={draft} update={update} /> : null}
        {step === 3 ? <VariantsStep draft={draft} update={update} isOwner={isOwner} /> : null}
        {step === 4 ? (
          <View className="gap-3">
            <ReviewStep draft={draft} update={update} isOwner={isOwner} goTo={setStep} />
            {ready ? (
              <Button variant="ghost" isDisabled={saving} onPress={() => submit(false)}>
                <Button.Label>Save as Draft instead</Button.Label>
              </Button>
            ) : null}
            {draft.productId ? (
              <Button variant="danger-soft" isDisabled={saving} onPress={confirmArchive}>
                <Button.Label>Archive product</Button.Label>
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View
        className="flex-row gap-3 border-border border-t bg-surface px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          variant="secondary"
          className="h-14 flex-1"
          onPress={() => (step === 0 ? close() : setStep(step - 1))}
        >
          <Button.Label>{step === 0 ? "Cancel" : "Back"}</Button.Label>
        </Button>
        {step < STEPS.length - 1 ? (
          <Button className="h-14 flex-[2]" isDisabled={!canGoOn} onPress={() => setStep(step + 1)}>
            <Button.Label>Next: {STEPS[step + 1]}</Button.Label>
          </Button>
        ) : (
          <Button className="h-14 flex-[2]" isDisabled={saving} onPress={() => submit(ready)}>
            {saving ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label numberOfLines={2} className="text-center">
                {ready
                  ? draft.status === "published"
                    ? "Save & keep Published"
                    : "Publish"
                  : !isOwner && onlyPricesMissing(candidate)
                    ? "Save as Draft — waiting for Owner prices"
                    : "Save as Draft"}
              </Button.Label>
            )}
          </Button>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function DoneScreen({ done, isOwner }: { done: Done; isOwner: boolean }) {
  const published = done.status === "published";
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <View
        className={`size-20 items-center justify-center rounded-full ${published ? "bg-brand-purple-mist" : "bg-brand-muted"}`}
      >
        <Ionicons
          name={published ? "checkmark" : "create-outline"}
          size={40}
          color={published ? brand.success : brand.ink}
        />
      </View>
      <Text className="mt-5 text-center font-display text-2xl text-foreground">
        {published ? "Published" : "Saved as Draft"}
      </Text>
      <Text className="mt-2 text-center font-sans text-base text-muted">
        {published
          ? `${done.name} is live on the Storefront.`
          : isOwner
            ? `${done.name} stays hidden from Customers until it's published.`
            : `${done.name} stays hidden until an Owner prices it and it's published.`}
      </Text>
      <Button className="mt-8" onPress={() => router.back()}>
        <Button.Label>Back to Products</Button.Label>
      </Button>
    </View>
  );
}

function Archived({ productId, name }: { productId: Id<"products">; name: string }) {
  const restore = useMutation(api.backOffice.products.restore);
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <ProductStatusChip status="archived" />
      <Text className="text-center font-display text-2xl text-foreground">{name}</Text>
      <Text className="text-center font-sans text-base text-muted">
        Archived Products are hidden from the Storefront. Restore it as a Draft to edit and publish
        it again.
      </Text>
      <Button
        className="mt-4"
        onPress={() =>
          restore({ productId }).catch((error) =>
            Alert.alert("Couldn't restore", refusalMessage(error)),
          )
        }
      >
        <Button.Label>Restore as Draft</Button.Label>
      </Button>
      <Button variant="ghost" onPress={() => router.back()}>
        <Button.Label>Back to Products</Button.Label>
      </Button>
    </View>
  );
}
