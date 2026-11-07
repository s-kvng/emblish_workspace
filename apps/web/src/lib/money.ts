/** Pesewas as Customers read them: whole cedis when it's even, e.g. 45000 → "GH₵ 450". */
export function cedi(pesewas: number) {
  const whole = pesewas % 100 === 0;
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
