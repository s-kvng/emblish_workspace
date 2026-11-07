"use client";

import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import Link from "next/link";

import ShelfGrid from "./shelf-grid";

export default function CategoryView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.storefront.catalog.category>;
}) {
  const category = usePreloadedQuery(preloaded);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-12">
      <Link href="/" className="text-muted-foreground text-sm">
        ← Home
      </Link>
      {category ? (
        <>
          <h1 className="mt-2 text-3xl">{category.name}</h1>
          {category.products.length > 0 ? (
            <div className="mt-4">
              <ShelfGrid cards={category.products} />
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
              Nothing here just now. Check back soon.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-muted-foreground text-sm">This Category is no longer here.</p>
      )}
    </div>
  );
}
