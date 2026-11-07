/** Pesewas as Staff read them, e.g. 45000 → "GH₵450.00". */
export function formatGhs(pesewas: number) {
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Typed cedis as whole pesewas: undefined when blank, NaN when it isn't an amount. */
export function parseGhs(text: string): number | undefined {
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return undefined;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

/** Pesewas back into the text a price field shows, e.g. 45000 → "450". */
export function ghsText(pesewas: number | undefined) {
  if (pesewas === undefined) return "";
  return pesewas % 100 === 0 ? String(pesewas / 100) : (pesewas / 100).toFixed(2);
}
