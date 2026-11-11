import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import {
  comboKey,
  type ProductOption,
  type PublishCandidate,
  variantCombinations,
} from "@emblish_workspace/backend/convex/model/catalog";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

type SavedProduct = FunctionReturnType<typeof api.backOffice.products.get>;

export type DraftPhoto = { storageId: Id<"_storage">; url?: string };

export type DraftVariant = {
  variantId?: Id<"variants">;
  optionValues: string[];
  sku: string;
  storePrice?: number;
  imageId?: Id<"_storage">;
};

/** The Product the wizard edits on the device until Review saves it in one go. */
export type ProductDraft = {
  productId?: Id<"products">;
  status: SavedProduct["status"];
  name: string;
  description: string;
  categoryId?: Id<"categories">;
  gallery: DraftPhoto[];
  /** As typed, including options still missing a name or values. */
  options: ProductOption[];
  variants: DraftVariant[];
  sellInStock: boolean;
  /** An Order Window has opened on it, which lets a Pre-order-only Product stay Published. */
  offeredForPreorder: boolean;
};

/** A change to the draft: fields to replace, or a function of the latest draft giving them. */
export type DraftUpdate = (
  patch: Partial<ProductDraft> | ((draft: ProductDraft) => Partial<ProductDraft>),
) => void;

export const emptyDraft: ProductDraft = {
  status: "draft",
  name: "",
  description: "",
  gallery: [],
  options: [],
  variants: [{ optionValues: [], sku: "" }],
  sellInStock: true,
  offeredForPreorder: false,
};

export function draftFromSaved(saved: SavedProduct): ProductDraft {
  return {
    productId: saved._id,
    status: saved.status,
    name: saved.name,
    description: saved.description,
    categoryId: saved.categoryId,
    gallery: saved.gallery,
    options: saved.options,
    variants: saved.variants.map(({ _id, sku, ...variant }) => ({
      ...variant,
      variantId: _id,
      sku: sku ?? "",
    })),
    sellInStock: saved.sellInStock,
    offeredForPreorder: saved.offeredForPreorder,
  };
}

/** Options with a name and at least one value: the ones that make Variants. */
export function completeOptions(options: ProductOption[]): ProductOption[] {
  return options
    .map((option) => ({
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((option) => option.name && option.values.length > 0);
}

/** One Variant per combination, keeping the SKU, price and photo of combinations that stay. */
export function variantsFor(options: ProductOption[], previous: DraftVariant[]): DraftVariant[] {
  const byKey = new Map(previous.map((variant) => [comboKey(variant.optionValues), variant]));
  return variantCombinations(completeOptions(options)).map(
    (optionValues) => byKey.get(comboKey(optionValues)) ?? { optionValues, sku: "" },
  );
}

export function variantLabel(variant: { optionValues: string[] }) {
  return variant.optionValues.length ? variant.optionValues.join(" / ") : "Default";
}

export function publishCandidate(draft: ProductDraft): PublishCandidate {
  return {
    name: draft.name,
    categoryId: draft.categoryId,
    photoCount: draft.gallery.length,
    sellInStock: draft.sellInStock,
    offeredForPreorder: draft.offeredForPreorder,
    variants: draft.variants,
  };
}

/** What `products.save` takes for this draft. */
export function saveArgs(
  draft: ProductDraft,
  publish: boolean,
): FunctionArgs<typeof api.backOffice.products.save> {
  return {
    productId: draft.productId,
    name: draft.name,
    description: draft.description,
    categoryId: draft.categoryId,
    gallery: draft.gallery.map((photo) => photo.storageId),
    options: completeOptions(draft.options),
    variants: draft.variants.map(({ variantId, optionValues, sku, storePrice, imageId }) => ({
      variantId,
      optionValues,
      sku: sku.trim() || undefined,
      storePrice,
      imageId,
    })),
    sellInStock: draft.sellInStock,
    publish,
  };
}
