"use client";
// A placeholder Bag kept in this browser until the Checkout ticket gives it a server side.

import { createContext, useContext, useEffect, useState } from "react";

export type BagLine = { variantId: string; slug: string; quantity: number };

type Bag = {
  lines: BagLine[];
  count: number;
  /** Adds units of a Variant, never more than `limit` of it in all. */
  add: (line: BagLine, limit: number) => { added: number; inBag: number };
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

  const add: Bag["add"] = (line, limit) => {
    const held = lines.find((current) => current.variantId === line.variantId)?.quantity ?? 0;
    const quantity = Math.min(limit, held + line.quantity);
    const next = [
      ...lines.filter((current) => current.variantId !== line.variantId),
      { ...line, quantity },
    ];
    setLines(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private windows can refuse storage; the Bag still works until the page reloads.
    }
    return { added: Math.max(0, quantity - held), inBag: quantity };
  };

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return <BagContext value={{ lines, count, add }}>{children}</BagContext>;
}

export function useBag(): Bag {
  const bag = useContext(BagContext);
  if (!bag) throw new Error("useBag needs a BagProvider above it.");
  return bag;
}
