"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { useBag } from "@/lib/bag";

/** The header's Bag with its unit count; it opens the Checkout's first step. */
export default function BagButton() {
  const { count } = useBag();
  return (
    <Link
      href="/checkout"
      aria-label={count > 0 ? `Bag, ${count} in it` : "Bag"}
      className="relative grid size-10 place-items-center rounded-full hover:bg-secondary"
    >
      <ShoppingBag className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-brand-gold px-1 font-semibold text-[9px] text-brand-purple-deep">
          {count}
        </span>
      )}
    </Link>
  );
}
