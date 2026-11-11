// Storefront rules for what a Customer can buy, with no database access; shared with the web app.

/** A Variant as the Storefront sees it. */
export type ShelfVariant = {
  /** Missing when the Variant isn't sold In-stock. */
  storePrice?: number;
  /** Units of Stock a Customer can buy now; never below zero. */
  inStock: number;
  /** Set while the Product's open Order Window offers the Variant. */
  preorder?: {
    /** Integer pesewas: the window's Pre-order price. */
    price: number;
    /** Units left under the Variant's cap; missing when it's uncapped. */
    left?: number;
  };
};

/** A Variant with the option values that pick it. */
export type PickableVariant = ShelfVariant & { optionValues: string[] };

/** Whether the Variant can be bought In-stock right now. */
export function buyableNow(variant: ShelfVariant): boolean {
  return variant.storePrice !== undefined && variant.inStock > 0;
}

/** Whether the Variant can be pre-ordered: its open window offers it and its cap isn't reached. */
export function preorderable(variant: ShelfVariant): boolean {
  const { preorder } = variant;
  return preorder !== undefined && (preorder.left === undefined || preorder.left > 0);
}

/** Which offer card the product page picks for a Variant: Buy now when it can, else Pre-order. */
export function defaultOffer(variant: ShelfVariant): "buyNow" | "preorder" | "none" {
  return buyableNow(variant) ? "buyNow" : preorderable(variant) ? "preorder" : "none";
}

/** One option value per Product option, in option order, like a Variant's `optionValues`. */
export type Picks = string[];

/**
 * The picks the product page opens on: the first Variant that can be bought now, else the
 * first that can be pre-ordered, else the first.
 */
export function startingPicks(variants: PickableVariant[]): Picks {
  return (
    (variants.find(buyableNow) ?? variants.find(preorderable) ?? variants[0])?.optionValues ?? []
  );
}

/** The Variant with exactly these picks, if the Product has one. */
export function variantFor<V extends { optionValues: string[] }>(
  variants: V[],
  picks: Picks,
): V | undefined {
  return variants.find(
    (variant) =>
      variant.optionValues.length === picks.length &&
      variant.optionValues.every((value, i) => value === picks[i]),
  );
}

/** An option value's dot: purple for In stock, gold for Pre-order only, crossed out otherwise. */
export type ValueAvailability = "inStock" | "preorder" | "unavailable";

/** Whether picking `value` for the option at `optionIndex`, keeping the other picks, can be bought. */
export function valueAvailability(
  variants: PickableVariant[],
  picks: Picks,
  optionIndex: number,
  value: string,
): ValueAvailability {
  const probe = picks.map((pick, i) => (i === optionIndex ? value : pick));
  const variant = variantFor(variants, probe);
  if (!variant) return "unavailable";
  const offer = defaultOffer(variant);
  return offer === "buyNow" ? "inStock" : offer === "preorder" ? "preorder" : "unavailable";
}
