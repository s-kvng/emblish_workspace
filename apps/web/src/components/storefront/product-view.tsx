"use client";

import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import {
  buyableNow,
  defaultOffer,
  type Picks,
  preorderable,
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

type Offer = "buyNow" | "preorder";

/** Most units of an uncapped Pre-order the stepper offers in one go. */
const UNCAPPED_STEP_LIMIT = 99;

function ProductDetails({ product }: { product: Product }) {
  const { variants, options, gallery, window } = product;
  const bag = useBag();
  const [picks, setPicks] = useState<Picks>(() => startingPicks(variants));
  const [photo, setPhoto] = useState(() => photoIndexFor(product, startingPicks(variants)));
  const [wanted, setWanted] = useState(1);
  const [chosen, setChosen] = useState<Offer | undefined>();

  const variant = variantFor(variants, picks) ?? variants[0];
  if (!variant) return null;
  const buyable = buyableNow(variant);
  const canPreorder = preorderable(variant) && window !== null;
  // The Customer's pick holds while it's still possible; otherwise Buy now when it's available.
  const fallback = defaultOffer(variant);
  const offer: Offer | undefined =
    chosen === "buyNow" && buyable
      ? "buyNow"
      : chosen === "preorder" && canPreorder
        ? "preorder"
        : fallback === "none"
          ? undefined
          : fallback;
  const limit =
    offer === "buyNow"
      ? variant.inStock
      : offer === "preorder"
        ? (variant.preorder?.left ?? UNCAPPED_STEP_LIMIT)
        : 0;
  const unitPrice = offer === "buyNow" ? variant.storePrice : variant.preorder?.price;
  // Stock and caps can drop while the page is open, so the quantity never outgrows them.
  const quantity = Math.max(1, Math.min(wanted, limit));

  const pick = (optionIndex: number, value: string) => {
    const next = picks.map((current, i) => (i === optionIndex ? value : current));
    setPicks(next);
    setWanted(1);
    // The gallery follows the picked Variant's own photo, when it has one.
    const index = photoIndexFor(product, next);
    if (index !== undefined) setPhoto(index);
  };

  const choose = (next: Offer) => {
    setChosen(next);
    setWanted(1);
  };

  const addToBag = () => {
    if (!offer) return;
    const preorder = offer === "preorder" && window;
    const { added, inBag } = bag.add(
      {
        variantId: variant._id,
        slug: product.slug,
        quantity,
        ...(preorder ? { windowId: window.windowId } : {}),
      },
      limit,
    );
    const allOf = preorder
      ? `that's all ${inBag} left in this window`
      : `that's all ${inBag} we have in stock`;
    if (added === 0) {
      toast.info(
        preorder
          ? `Your Bag already has all ${inBag} left in this window.`
          : `Your Bag already has all ${inBag} we have in stock.`,
      );
      return;
    }
    toast.success(`${product.name}${preorder ? " Pre-order" : ""} added to your Bag`, {
      description:
        added < quantity
          ? `Only ${added} more could go in: ${allOf}.`
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
                const availability = valueAvailability(variants, picks, optionIndex, value);
                const picked = picks[optionIndex] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={picked}
                    aria-label={`${value}${availability === "inStock" ? "" : availability === "preorder" ? ", Pre-order only" : ", unavailable"}`}
                    onClick={() => pick(optionIndex, value)}
                    className={`relative rounded-md border bg-card px-3 py-1.5 text-sm ${picked ? "border-primary ring-1 ring-primary" : ""} ${availability === "unavailable" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {value}
                    {availability !== "unavailable" && (
                      <span
                        className={`absolute -top-1 -right-1 size-2 rounded-full ${availability === "inStock" ? "bg-brand-purple" : "bg-brand-gold"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {options.length > 0 && (
          <p className="flex items-center gap-3 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-brand-purple" /> In stock
            </span>
            {window && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-brand-gold" /> Pre-order
              </span>
            )}
          </p>
        )}

        <div className={`grid gap-3 ${window ? "grid-cols-2" : ""}`}>
          <OfferCard
            title="Buy now"
            price={variant.storePrice}
            selected={offer === "buyNow"}
            disabled={!buyable}
            onSelect={() => choose("buyNow")}
            note={
              buyable
                ? `${variant.inStock} in stock`
                : variant.storePrice !== undefined
                  ? "Sold out"
                  : "Not sold in store"
            }
          />
          {window && (
            <OfferCard
              title="Pre-order"
              price={variant.preorder?.price}
              selected={offer === "preorder"}
              disabled={!canPreorder}
              onSelect={() => choose("preorder")}
              note={
                !variant.preorder
                  ? "Not in this window"
                  : !canPreorder
                    ? "Pre-order full for this option"
                    : window.shippingFeeEstimate !== undefined
                      ? `+ shipping ~${cedi(window.shippingFeeEstimate)}`
                      : "+ shipping, on arrival"
              }
            />
          )}
        </div>

        {offer === "preorder" && window && (
          <PreorderFacts window={window} left={variant.preorder?.left} />
        )}
      </div>

      {/* Sticky, not fixed, so it stops above the footer instead of covering it. */}
      <div className="sticky bottom-0 z-10 mt-6 border-t bg-background p-3 md:col-span-2">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex items-center rounded-md border bg-card">
            <button
              type="button"
              aria-label="One fewer"
              disabled={!offer || quantity <= 1}
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
              disabled={!offer || quantity >= limit}
              onClick={() => setWanted(quantity + 1)}
              className="grid size-10 place-items-center disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={!offer}
            onClick={addToBag}
            className="h-11 flex-1 rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:bg-muted disabled:text-muted-foreground"
          >
            {offer && unitPrice !== undefined
              ? `${offer === "buyNow" ? "Buy now" : "Pre-order"} · ${cedi(unitPrice * quantity)}`
              : variant.storePrice !== undefined || variant.preorder
                ? "Sold out"
                : "Not sold in store"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One of the side-by-side offers for the picked Variant; the Customer picks one. */
function OfferCard({
  title,
  price,
  note,
  selected,
  disabled,
  onSelect,
}: {
  title: string;
  price: number | undefined;
  note: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-lg border bg-card p-3 text-left ${selected ? "border-primary ring-1 ring-primary" : ""} ${disabled ? "opacity-60" : ""}`}
    >
      <p className="font-semibold text-xs uppercase">{title}</p>
      <p className="mt-1 font-semibold text-lg">{price !== undefined ? cedi(price) : "—"}</p>
      <p className="text-muted-foreground text-xs">{note}</p>
    </button>
  );
}

const DAY = 24 * 60 * 60 * 1000;

/** The Pre-order facts: when orders close, arrival, the Shipping Fee, the minimum and the cap. */
function PreorderFacts({
  window,
  left,
}: {
  window: NonNullable<Product["window"]>;
  left: number | undefined;
}) {
  const daysLeft = Math.max(0, Math.ceil((window.closesAt - Date.now()) / DAY));
  const closes = new Date(window.closesAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const facts: [string, string][] = [
    [
      "Orders close",
      `${closes} · ${daysLeft === 0 ? "today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}`,
    ],
    ["Expected arrival", "We text you the dates once it's ordered from the supplier"],
    [
      "Shipping Fee",
      window.shippingFeeEstimate !== undefined
        ? `About ${cedi(window.shippingFeeEstimate)} per unit, confirmed on arrival`
        : "Confirmed on arrival",
    ],
  ];
  if (window.minimumOrderQuantity !== undefined && window.minimumOrderQuantity > 1) {
    facts.push(["Minimum", `${window.minimumOrderQuantity} units per Pre-order, across options`]);
  }
  return (
    <div className="rounded-lg border border-brand-gold/40 bg-brand-gold-mist p-4 text-sm">
      <dl className="space-y-2">
        {facts.map(([term, detail]) => (
          <div key={term} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="text-right font-medium">{detail}</dd>
          </div>
        ))}
      </dl>
      {left !== undefined && (
        <p className="mt-3 font-semibold text-brand-purple text-xs">
          Only {left} left in this window
        </p>
      )}
      <p className="mt-3 text-muted-foreground text-xs">
        You pay for the goods now and the Shipping Fee when they arrive.
      </p>
    </div>
  );
}

/** Where the picked Variant's own photo sits in the gallery, if it has one. */
function photoIndexFor(product: Product, picks: Picks) {
  const imageId = variantFor(product.variants, picks)?.imageId;
  const index = product.gallery.findIndex((image) => image.storageId === imageId);
  return index === -1 ? undefined : index;
}
