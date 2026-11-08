/** Pesewas as SMS copy writes them: always two decimals, e.g. 45000 → "GHS 450.00". */
export function ghs(pesewas: number): string {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}
