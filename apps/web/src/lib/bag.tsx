"use client";
// The Bag lives in this browser until Pay submits it as a Checkout.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** A Variant bought In-stock, or Pre-ordered in the Order Window `windowId`. */
export type BagLine = {
  variantId: string;
  slug: string;
  quantity: number;
  windowId?: string;
};

type Bag = {
  lines: BagLine[];
  count: number;
  /** Adds units of a Variant (In-stock, or in one window), never more than `limit` of it in all. */
  add: (line: BagLine, limit: number) => { added: number; inBag: number };
  /** Sets a line's quantity; 0 removes it. A Pre-order line is picked out by its window. */
  setQuantity: (variantId: string, quantity: number, windowId?: string) => void;
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

/** The same Variant In-stock and Pre-ordered are separate lines. */
function sameLine(variantId: string, windowId: string | undefined) {
  return (line: BagLine) => line.variantId === variantId && line.windowId === windowId;
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
    const same = sameLine(line.variantId, line.windowId);
    const held = lines.find(same)?.quantity ?? 0;
    const quantity = Math.max(held, Math.min(limit, held + line.quantity));
    save([...lines.filter((current) => !same(current)), { ...line, quantity }]);
    return { added: Math.max(0, quantity - held), inBag: quantity };
  };

  const setQuantity: Bag["setQuantity"] = (variantId, quantity, windowId) => {
    const same = sameLine(variantId, windowId);
    save(
      quantity > 0
        ? lines.map((line) => (same(line) ? { ...line, quantity } : line))
        : lines.filter((line) => !same(line)),
    );
  };

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
