// Storefront rules for what a Customer can buy, with no database access; shared with the web app.

/** A Variant as the Storefront sees it. */
export type ShelfVariant = {
  /** Missing when the Variant isn't sold In-stock. */
  storePrice?: number;
  /** Units of Stock a Customer can buy now; never below zero. */
  inStock: number;
};

/** A Variant with the option values that pick it. */
export type PickableVariant = ShelfVariant & { optionValues: string[] };

/** Whether the Variant can be bought In-stock right now. */
export function buyableNow(variant: ShelfVariant): boolean {
  return variant.storePrice !== undefined && variant.inStock > 0;
}

/** One option value per Product option, in option order, like a Variant's `optionValues`. */
export type Picks = string[];

/** The picks the product page opens on: the first Variant that can be bought now, else the first. */
export function startingPicks(variants: PickableVariant[]): Picks {
  return (variants.find(buyableNow) ?? variants[0])?.optionValues ?? [];
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

/** Pre-order adds a third state once Order Windows exist. */
export type ValueAvailability = "inStock" | "unavailable";

/** Whether picking `value` for the option at `optionIndex`, keeping the other picks, can be bought. */
export function valueAvailability(
  variants: PickableVariant[],
  picks: Picks,
  optionIndex: number,
  value: string,
): ValueAvailability {
  const probe = picks.map((pick, i) => (i === optionIndex ? value : pick));
  const variant = variantFor(variants, probe);
  return variant && buyableNow(variant) ? "inStock" : "unavailable";
}
