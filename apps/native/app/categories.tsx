import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Button, FieldError, Input, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { refusalMessage } from "@/lib/form-errors";

/** More → Products → Categories: the flat list Customers browse by, in Storefront order. */
export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const categories = useQuery(api.backOffice.categories.list);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Categories" backLabel="Back" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <AddCategory />
        {categories === undefined ? (
          <Spinner />
        ) : categories.length === 0 ? (
          <Text className="font-sans text-muted text-sm">
            No Categories yet. Every Product needs one before it's published.
          </Text>
        ) : (
          <View className="rounded-2xl border border-border bg-surface">
            <Text className="px-4 pt-4 font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
              Shown on the Storefront in this order
            </Text>
            {categories.map((category, index) => (
              <CategoryRow
                key={category._id}
                category={category}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function AddCategory() {
  const create = useMutation(api.backOffice.categories.create);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      await create({ name });
      setName("");
    } catch (refused) {
      setError(refusalMessage(refused));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-semibold text-base text-foreground">Add a Category</Text>
      <FieldError isInvalid={!!error}>{error}</FieldError>
      <View className="flex-row gap-2">
        <TextField className="flex-1">
          <Input
            value={name}
            onChangeText={setName}
            onSubmitEditing={add}
            placeholder="e.g. Hair & wigs"
            accessibilityLabel="New Category name"
          />
        </TextField>
        <Button onPress={add} isDisabled={saving || !name.trim()}>
          <Button.Label>Add</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: { _id: Id<"categories">; name: string };
  isFirst: boolean;
  isLast: boolean;
}) {
  const move = useMutation(api.backOffice.categories.move);
  const rename = useMutation(api.backOffice.categories.rename);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (editing === null) return;
    try {
      await rename({ categoryId: category._id, name: editing });
      setEditing(null);
      setError(null);
    } catch (refused) {
      setError(refusalMessage(refused));
    }
  };

  if (editing !== null) {
    return (
      <View className="gap-2 border-border border-t p-4 first:border-t-0">
        <FieldError isInvalid={!!error}>{error}</FieldError>
        <TextField>
          <Input
            value={editing}
            onChangeText={setEditing}
            onSubmitEditing={save}
            autoFocus
            accessibilityLabel={`Rename ${category.name}`}
          />
        </TextField>
        <View className="flex-row gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onPress={() => setEditing(null)}>
            <Button.Label>Cancel</Button.Label>
          </Button>
          <Button size="sm" className="flex-1" onPress={save}>
            <Button.Label>Save</Button.Label>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1 border-border border-t py-2 pr-2 pl-4 first:border-t-0">
      <Pressable
        className="flex-1 py-2"
        onPress={() => setEditing(category.name)}
        accessibilityRole="button"
        accessibilityHint="Rename this Category"
      >
        <Text className="font-sans-semibold text-base text-foreground">{category.name}</Text>
      </Pressable>
      {(["up", "down"] as const).map((direction) => {
        const disabled = direction === "up" ? isFirst : isLast;
        return (
          <Pressable
            key={direction}
            disabled={disabled}
            onPress={() => move({ categoryId: category._id, direction })}
            accessibilityRole="button"
            accessibilityLabel={`Move ${category.name} ${direction}`}
            className="size-11 items-center justify-center"
          >
            <Ionicons
              name={direction === "up" ? "arrow-up" : "arrow-down"}
              size={20}
              color={disabled ? brand.border : brand.purple}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
