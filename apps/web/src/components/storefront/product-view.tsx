"use client";

import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import {
  buyableNow,
  type Picks,
  startingPicks,
  valueAvailability,
  variantFor,
} from "@emblish_workspace/backend/convex/model/shelf";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useBag } from "@/lib/bag";
import { cedi } from "@/lib/money";

import ProductPhoto from "./product-photo";

type Product = NonNullable<FunctionReturnType<typeof api.storefront.catalog.product>>;

export default function ProductView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.storefront.catalog.product>;
}) {
  const product = usePreloadedQuery(preloaded);
  if (!product) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">This Product is no longer available.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-brand-purple text-sm">
          Back home
        </Link>
      </div>
    );
  }
  return <ProductDetails product={product} />;
}

function ProductDetails({ product }: { product: Product }) {
  const { variants, options, gallery } = product;
  const bag = useBag();
  const [picks, setPicks] = useState<Picks>(() => startingPicks(variants));
  const [photo, setPhoto] = useState(() => photoIndexFor(product, startingPicks(variants)));
  const [wanted, setWanted] = useState(1);

  const variant = variantFor(variants, picks) ?? variants[0];
  if (!variant) return null;
  const buyable = buyableNow(variant);
  // Stock can drop while the page is open, so the quantity never outgrows it.
  const quantity = Math.max(1, Math.min(wanted, variant.inStock));

  const pick = (optionIndex: number, value: string) => {
    const next = picks.map((current, i) => (i === optionIndex ? value : current));
    setPicks(next);
    setWanted(1);
    // The gallery follows the picked Variant's own photo, when it has one.
    const index = photoIndexFor(product, next);
    if (index !== undefined) setPhoto(index);
  };

  const addToBag = () => {
    const { added, inBag } = bag.add(
      { variantId: variant._id, slug: product.slug, quantity },
      variant.inStock,
    );
    if (added === 0) {
      toast.info(`Your Bag already has all ${inBag} we have in stock.`);
      return;
    }
    toast.success(`${product.name} added to your Bag`, {
      description:
        added < quantity
          ? `Only ${added} more could go in: that's all ${inBag} we have in stock.`
          : inBag > added
            ? `${inBag} of these in your Bag now.`
            : undefined,
    });
  };

  const shown = gallery[photo ?? 0];
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl md:grid md:grid-cols-2 md:gap-8 md:px-4">
      <div>
        <div className="px-4 py-2 md:px-0">
          <Link
            href={product.category ? `/categories/${product.category._id}` : "/"}
            className="text-muted-foreground text-sm"
          >
            ← {product.category?.name ?? "Home"}
          </Link>
        </div>
        <ProductPhoto
          url={shown?.url}
          alt={product.name}
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-square md:rounded-2xl"
        />
        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-2 md:px-0">
            {gallery.map((image, i) => (
              <button
                key={image.storageId}
                type="button"
                aria-label={`Photo ${i + 1}`}
                aria-pressed={i === (photo ?? 0)}
                onClick={() => setPhoto(i)}
                className="shrink-0"
              >
                <ProductPhoto
                  url={image.url}
                  alt=""
                  sizes="56px"
                  className={`size-14 rounded-md ${i === (photo ?? 0) ? "ring-2 ring-primary" : "opacity-70"}`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-5 px-4 md:mt-12 md:px-0">
        <div>
          {product.category && (
            <p className="text-muted-foreground text-xs">{product.category.name}</p>
          )}
          <h1 className="text-2xl">{product.name}</h1>
          {product.description && (
            <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
              {product.description}
            </p>
          )}
        </div>

        {options.map((option, optionIndex) => (
          <fieldset key={option.name}>
            <legend className="mb-1.5 text-sm">
              {option.name}: <span className="font-medium">{picks[optionIndex]}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const inStock =
                  valueAvailability(variants, picks, optionIndex, value) === "inStock";
                const picked = picks[optionIndex] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={picked}
                    aria-label={`${value}${inStock ? "" : ", unavailable"}`}
                    onClick={() => pick(optionIndex, value)}
                    className={`relative rounded-md border bg-card px-3 py-1.5 text-sm ${picked ? "border-primary ring-1 ring-primary" : ""} ${inStock ? "" : "text-muted-foreground line-through"}`}
                  >
                    {value}
                    {inStock && (
                      <span className="absolute -top-1 -right-1 size-2 rounded-full bg-brand-purple" />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {options.length > 0 && (
          <p className="flex items-center gap-1 text-muted-foreground text-xs">
            <span className="size-2 rounded-full bg-brand-purple" /> In stock
          </p>
        )}

        <div
          className={`rounded-lg border bg-card p-3 ${buyable ? "border-primary ring-1 ring-primary" : "opacity-60"}`}
        >
          <p className="font-semibold text-xs uppercase">Buy now</p>
          <p className="mt-1 font-semibold text-lg">
            {variant.storePrice !== undefined ? cedi(variant.storePrice) : "—"}
          </p>
          <p className="text-muted-foreground text-xs">
            {buyable
              ? `${variant.inStock} in stock`
              : variant.storePrice !== undefined
                ? "Sold out"
                : "Not sold in store"}
          </p>
        </div>
      </div>

      {/* Sticky, not fixed, so it stops above the footer instead of covering it. */}
      <div className="sticky bottom-0 z-10 mt-6 border-t bg-background p-3 md:col-span-2">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex items-center rounded-md border bg-card">
            <button
              type="button"
              aria-label="One fewer"
              disabled={!buyable || quantity <= 1}
              onClick={() => setWanted(quantity - 1)}
              className="grid size-10 place-items-center disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-6 text-center text-sm" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="One more"
              disabled={!buyable || quantity >= variant.inStock}
              onClick={() => setWanted(quantity + 1)}
              className="grid size-10 place-items-center disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={!buyable}
            onClick={addToBag}
            className="h-11 flex-1 rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:bg-muted disabled:text-muted-foreground"
          >
            {buyable && variant.storePrice !== undefined
              ? `Buy now · ${cedi(variant.storePrice * quantity)}`
              : variant.storePrice !== undefined
                ? "Sold out"
                : "Not sold in store"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Where the picked Variant's own photo sits in the gallery, if it has one. */
function photoIndexFor(product: Product, picks: Picks) {
  const imageId = variantFor(product.variants, picks)?.imageId;
  const index = product.gallery.findIndex((image) => image.storageId === imageId);
  return index === -1 ? undefined : index;
}
