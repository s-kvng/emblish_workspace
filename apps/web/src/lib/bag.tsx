"use client";
// The Bag lives in this browser until Pay submits it as a Checkout.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type BagLine = { variantId: string; slug: string; quantity: number };

type Bag = {
  lines: BagLine[];
  count: number;
  /** Adds units of a Variant, never more than `limit` of it in all. */
  add: (line: BagLine, limit: number) => { added: number; inBag: number };
  /** Sets a line's quantity; 0 removes it. */
  setQuantity: (variantId: string, quantity: number) => void;
  /** Empties the Bag, once a payment has turned it into an order. */
  clear: () => void;
};

const STORAGE_KEY = "emblish.bag";
const BagContext = createContext<Bag | null>(null);

function readStored(): BagLine[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function BagProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<BagLine[]>([]);

  useEffect(() => setLines(readStored()), []);

  const save = useCallback((next: BagLine[]) => {
    setLines(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private windows can refuse storage; the Bag still works until the page reloads.
    }
  }, []);

  const add: Bag["add"] = (line, limit) => {
    const held = lines.find((current) => current.variantId === line.variantId)?.quantity ?? 0;
    const quantity = Math.min(limit, held + line.quantity);
    save([
      ...lines.filter((current) => current.variantId !== line.variantId),
      { ...line, quantity },
    ]);
    return { added: Math.max(0, quantity - held), inBag: quantity };
  };

  const setQuantity: Bag["setQuantity"] = (variantId, quantity) =>
    save(
      quantity > 0
        ? lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line))
        : lines.filter((line) => line.variantId !== variantId),
    );

  // Stable, so an effect can depend on it without re-running on every render.
  const clear = useCallback(() => save([]), [save]);

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return <BagContext value={{ lines, count, add, setQuantity, clear }}>{children}</BagContext>;
}

export function useBag(): Bag {
  const bag = useContext(BagContext);
  if (!bag) throw new Error("useBag needs a BagProvider above it.");
  return bag;
}
