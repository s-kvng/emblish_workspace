"use client";

import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { ArrowRight, CreditCard, MapPin, MessageSquare, Wallet } from "lucide-react";
import Link from "next/link";

import ProductPhoto from "./product-photo";
import ShelfGrid from "./shelf-grid";

const reassurances = [
  {
    Icon: Wallet,
    title: "Pay now, ship later",
    sub: "Shipping Fee billed on arrival",
  },
  {
    Icon: CreditCard,
    title: "Mobile money & card",
    sub: "Pay the way you like",
  },
  {
    Icon: MapPin,
    title: "Pickup or Delivery",
    sub: "Collect it or have it brought",
  },
  { Icon: MessageSquare, title: "SMS updates", sub: "At every stage" },
] as const;

const preOrderSteps = [
  ["Order before the window closes", "Pay for the goods. We place one order with the supplier."],
  ["We ship it to Ghana", "You get SMS updates at every stage."],
  ["Pay the Shipping Fee, then collect", "Pick it up or have it delivered."],
] as const;

/** Tile tints, cycled across the Categories. */
const tints = ["bg-brand-purple-mist", "bg-brand-gold-mist", "bg-brand-muted"] as const;

export default function HomeView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.storefront.catalog.home>;
}) {
  const { categories, inStock } = usePreloadedQuery(preloaded);
  const featured = inStock.find((card) => !card.soldOut);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl pb-12">
      {/* Hero */}
      <section className="mx-4 overflow-hidden rounded-3xl bg-linear-135 from-brand-purple-deep via-brand-purple to-brand-purple-glow text-white">
        <div className="px-6 pt-7 pb-6">
          <p className="eyebrow text-brand-gold-bright">Pre-order · In stock</p>
          <h1 className="mt-2 text-[2rem] leading-[1.1]">
            Bring it home <em className="text-brand-gold-bright">before</em> it lands.
          </h1>
          <p className="mt-3 max-w-sm text-sm text-white/75">
            Order from our next shipment and pay the shipping when it arrives, or take home what's
            already here.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href="#in-stock"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-gold px-4 py-2.5 font-semibold text-brand-purple-deep text-sm"
            >
              In stock now <ArrowRight className="size-4" />
            </a>
            <a
              href="#how-pre-order-works"
              className="whitespace-nowrap rounded-full border border-white/30 px-4 py-2.5 text-sm"
            >
              How Pre-order works
            </a>
          </div>
        </div>
        {featured && (
          <Link href={`/products/${featured.slug}`} className="relative block h-44">
            <ProductPhoto
              url={featured.coverUrl}
              alt={featured.name}
              priority
              sizes="(min-width: 768px) 50vw, 90vw"
              className="absolute inset-x-10 bottom-0 h-40 rounded-t-[2rem]"
            />
            <span className="absolute right-6 bottom-4 rounded-full bg-white px-3 py-1 font-semibold text-brand-purple text-xs shadow-lg">
              {featured.name} · ready now
            </span>
          </Link>
        )}
      </section>

      {/* Reassurance strip */}
      <section className="mx-4 mt-6 grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border bg-card p-4 md:grid-cols-4">
        {reassurances.map(({ Icon, title, sub }) => (
          <div key={title} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand-gold" strokeWidth={1.6} />
            <div>
              <p className="font-semibold text-xs">{title}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Category tiles */}
      {categories.length > 0 && (
        <section className="mt-8">
          <h2 className="px-4 text-xl">Shop by category</h2>
          <ul className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
            {categories.map((category, i) => (
              <li key={category._id} className="shrink-0">
                <Link
                  href={`/categories/${category._id}`}
                  className={`relative block h-36 w-32 overflow-hidden rounded-2xl p-3 ${tints[i % tints.length]}`}
                >
                  <p className="font-semibold text-sm">{category.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-purple">
                    Shop now <ArrowRight className="size-3" />
                  </p>
                  <ProductPhoto
                    url={category.coverUrl}
                    alt=""
                    sizes="96px"
                    className="absolute -right-3 -bottom-3 size-24 rounded-full"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How Pre-order works */}
      <section
        id="how-pre-order-works"
        className="mx-4 mt-8 scroll-mt-4 rounded-3xl bg-brand-purple-deep p-6 text-white"
      >
        <p className="eyebrow text-brand-gold-bright">How Pre-order works</p>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {preOrderSteps.map(([title, sub], i) => (
            <li key={title} className="flex gap-3">
              <span className="font-display font-medium text-2xl text-brand-gold-bright leading-none">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-white/65 text-xs">{sub}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* In-stock grid */}
      <section id="in-stock" className="mt-8 scroll-mt-4 px-4">
        <h2 className="text-xl">Ready to take home</h2>
        {inStock.length > 0 ? (
          <div className="mt-3">
            <ShelfGrid cards={inStock} />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
            Nothing in stock just now. Check back soon.
          </p>
        )}
      </section>
    </div>
  );
}
