import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { cedi } from "@/lib/money";

import ProductPhoto from "./product-photo";

export type ShelfCard = FunctionReturnType<typeof api.storefront.catalog.home>["inStock"][number];

/** The 2-up grid of In-stock Products: IN STOCK or SOLD OUT, and ALSO PRE-ORDER with an open window. */
export default function ShelfGrid({ cards }: { cards: ShelfCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.slug} className="overflow-hidden rounded-2xl border bg-card">
          <Link href={`/products/${card.slug}`} className="relative block">
            <ProductPhoto
              url={card.coverUrl}
              alt={card.name}
              className={`aspect-square ${card.soldOut ? "opacity-50 grayscale" : ""}`}
            />
            <span
              className={`absolute top-2 left-2 rounded-full px-2 py-0.5 font-semibold text-[10px] ${card.soldOut ? "bg-muted text-muted-foreground" : "bg-brand-purple text-white"}`}
            >
              {card.soldOut ? "SOLD OUT" : "IN STOCK"}
            </span>
            {card.alsoPreorder && (
              <span className="absolute top-8 left-2 rounded-full bg-brand-gold px-2 py-0.5 font-semibold text-[10px] text-brand-purple-deep">
                ALSO PRE-ORDER
              </span>
            )}
          </Link>
          <div className="p-3">
            <p className="truncate font-medium text-sm">{card.name}</p>
            <p className="font-semibold text-sm">{cedi(card.fromPrice)}</p>
            {card.soldOut ? (
              <span className="mt-2 flex h-8 w-full items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-xs">
                Sold out
              </span>
            ) : (
              <Link
                href={`/products/${card.slug}`}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-primary-foreground text-xs"
              >
                <ShoppingBag className="size-3.5" /> Buy now
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
