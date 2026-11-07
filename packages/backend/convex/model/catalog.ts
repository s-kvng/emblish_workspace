// Catalog rules with no database access, shared by the server and the Back Office wizard.

export type ProductOption = { name: string; values: string[] };

/** A Product has at most this many options. */
export const MAX_OPTIONS = 3;

/** One Variant's option values as a comparable key. */
export function comboKey(optionValues: string[]) {
  return JSON.stringify(optionValues);
}

/** Every Variant's option values, one per option in option order; no options makes one default Variant. */
export function variantCombinations(options: ProductOption[]): string[][] {
  return options.reduce<string[][]>(
    (combos, option) => combos.flatMap((combo) => option.values.map((value) => [...combo, value])),
    [[]],
  );
}

/** What the publish checklist looks at: a saved Product or the wizard's unsaved one. */
export type PublishCandidate = {
  name: string;
  categoryId?: string;
  photoCount: number;
  sellInStock: boolean;
  /** The Product's live Variants, not archived ones. */
  variants: { sku?: string; storePrice?: number }[];
};

export type PublishCheck = {
  key: "name" | "category" | "photo" | "sku" | "sellInStock" | "storePrice";
  label: string;
  ok: boolean;
};

/** "Ready to publish?": every check, passed or not, in the order the wizard shows them. */
export function publishChecklist(product: PublishCandidate): PublishCheck[] {
  const checks: PublishCheck[] = [
    { key: "name", label: "Name", ok: product.name.trim() !== "" },
    {
      key: "category",
      label: "Category",
      ok: product.categoryId !== undefined,
    },
    { key: "photo", label: "At least one photo", ok: product.photoCount > 0 },
    {
      key: "sku",
      label: "Every Variant has a SKU",
      ok: product.variants.every((variant) => (variant.sku ?? "").trim() !== ""),
    },
    // A Pre-order-only Product is published by opening its first Order Window instead.
    {
      key: "sellInStock",
      label: "Sold In-stock on the Storefront",
      ok: product.sellInStock,
    },
  ];
  if (product.sellInStock) {
    checks.push({
      key: "storePrice",
      label: "Every Variant has a Store Price (Owner)",
      ok: product.variants.every((variant) => variant.storePrice !== undefined),
    });
  }
  return checks;
}

/** Whether Store Prices are all that block publishing, so Staff save a Draft for the Owner. */
export function onlyPricesMissing(product: PublishCandidate): boolean {
  const failing = publishChecklist(product).filter((check) => !check.ok);
  return failing.length > 0 && failing.every((check) => check.key === "storePrice");
}

/** The Storefront URL name for a Product; the server makes it unique across the store. */
export function slugFor(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "product";
}

/** The wizard's SKU suggestion: the name's initials, then the first 3 characters of each option value. */
export function suggestSku(productName: string, optionValues: string[]): string {
  const initials = productName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const values = optionValues.map((value) =>
    value
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase(),
  );
  return [initials || "NEW", ...(values.length ? values : ["STD"])].join("-");
}

/** SKUs are stored trimmed and upper-cased, so "kwt-red" and "KWT-RED" clash. */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}
