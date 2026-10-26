"use client";
// PROTOTYPE — three structurally different Storefront browse pages (wayfinder #12).
//   A  Category grid   — sticky category chips, 2-up image grid, dual price line on each card
//   B  Window feed     — single column grouped by urgency: closing soon / ready today / rest
//   C  Dense list      — search + Buy now / Pre-order filter, thumbnail rows with badges
//   D  Home            — branded landing after the visual references: hero, trust strip,
//                        category tiles, closing-soon rail, how-it-works band, SMS sign-up

import {
	ArrowRight,
	CreditCard,
	MessageSquare,
	ShoppingBag,
	Truck,
	Wallet,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import {
	categories,
	cedi,
	daysLeft,
	fromPreorderPrice,
	fromStorePrice,
	isInStock,
	isPreorderOpen,
	isSoldOut,
	type Product,
	products,
	shortDate,
} from "./_data";
import { Shot, StoreHeader, stub } from "./_shared";

const href = (p: Product, variant: string) =>
	`/prototype/storefront/${p.slug}?variant=${variant}` as Route;

// ---------------------------------------------------------------- A

export function BrowseA() {
	const [cat, setCat] = useState<string | null>(null);
	const list = products.filter((p) => !cat || p.category === cat);
	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-40">
			<StoreHeader />
			<nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur">
				{[null, ...categories].map((c) => (
					<button
						key={c ?? "all"}
						type="button"
						onClick={() => setCat(c)}
						className={`shrink-0 rounded-full border px-3 py-1 text-sm ${cat === c ? "border-primary bg-primary text-primary-foreground" : ""}`}
					>
						{c ?? "All"}
					</button>
				))}
			</nav>
			<div className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 pt-2">
				{list.map((p) => {
					const now = fromStorePrice(p);
					const pre = fromPreorderPrice(p);
					const soldOut = isSoldOut(p);
					return (
						<Link key={p.slug} href={href(p, "A")} className="group">
							<div className="relative">
								<Shot
									product={p}
									variant={p.variants[0]}
									className="aspect-[4/5] rounded-lg"
									label={false}
								/>
								{soldOut && (
									<div className="absolute inset-0 grid place-items-center rounded-lg bg-background/60 font-semibold text-sm">
										Sold out
									</div>
								)}
								{pre !== undefined && p.window && (
									<span className="absolute top-2 left-2 rounded-full bg-(--em-gold) px-2 py-0.5 font-semibold text-(--em-purple-deep) text-[10px]">
										PRE-ORDER · {daysLeft(p.window.closes)}d left
									</span>
								)}
							</div>
							<p className="mt-2 font-medium text-sm leading-tight">{p.name}</p>
							<div className="mt-0.5 text-sm">
								{now !== undefined && <p>{cedi(now)}</p>}
								{pre !== undefined && (
									<p
										className={
											now !== undefined ? "text-muted-foreground text-xs" : ""
										}
									>
										{now !== undefined ? "Pre-order " : ""}
										{cedi(pre)}
									</p>
								)}
								{soldOut && (
									<p className="text-muted-foreground">
										{cedi(p.variants[0].storePrice ?? 0)}
									</p>
								)}
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- B

export function BrowseB() {
	const closing = products
		.filter(isPreorderOpen)
		.sort(
			(a, b) =>
				daysLeft(a.window?.closes ?? "") - daysLeft(b.window?.closes ?? ""),
		);
	const ready = products.filter(isInStock);
	const gone = products.filter(isSoldOut);
	return (
		<div className="mx-auto w-full min-w-0 max-w-md space-y-8 pb-40">
			<header className="bg-gradient-to-br from-(--em-purple-deep) to-(--em-purple) px-4 pt-6 pb-5 text-white">
				<p className="text-xs uppercase tracking-widest opacity-70">Emblish</p>
				<h1 className="mt-1 font-semibold text-xl leading-snug">
					Order before the window closes. We import it, you pay shipping when it
					lands.
				</h1>
			</header>

			<section>
				<h2 className="px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Pre-order windows closing soon
				</h2>
				<div className="mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
					{closing.map((p) => {
						const d = daysLeft(p.window?.closes ?? "");
						return (
							<Link
								key={p.slug}
								href={href(p, "B")}
								className="w-64 shrink-0 snap-start overflow-hidden rounded-xl border"
							>
								<Shot
									product={p}
									variant={p.variants[0]}
									className="h-36"
									label={false}
								/>
								<div className="space-y-1 p-3">
									<p className="font-medium">{p.name}</p>
									<p className="text-sm">
										from {cedi(fromPreorderPrice(p) ?? 0)}
									</p>
									<div className="flex items-center justify-between text-xs">
										<span
											className={
												d <= 7
													? "font-semibold text-red-600"
													: "text-muted-foreground"
											}
										>
											Closes {shortDate(p.window?.closes ?? "")} · {d} days
										</span>
										<span className="text-muted-foreground">
											Arrives {p.window?.eta}
										</span>
									</div>
								</div>
							</Link>
						);
					})}
				</div>
			</section>

			<section className="px-4">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					In stock · pick up or delivered this week
				</h2>
				<div className="mt-3 space-y-4">
					{ready.map((p) => (
						<Link key={p.slug} href={href(p, "B")} className="block">
							<Shot
								product={p}
								variant={p.variants.find((v) => v.stock > 0)}
								className="h-56 rounded-xl"
							/>
							<div className="mt-2 flex items-baseline justify-between">
								<p className="font-medium">{p.name}</p>
								<p>{cedi(fromStorePrice(p) ?? 0)}</p>
							</div>
							{isPreorderOpen(p) && (
								<p className="text-muted-foreground text-xs">
									Also on Pre-order from {cedi(fromPreorderPrice(p) ?? 0)}
								</p>
							)}
						</Link>
					))}
				</div>
			</section>

			{gone.length > 0 && (
				<section className="px-4">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Sold out
					</h2>
					<div className="mt-3 grid grid-cols-3 gap-2 opacity-60">
						{gone.map((p) => (
							<Link key={p.slug} href={href(p, "B")}>
								<Shot
									product={p}
									variant={p.variants[0]}
									className="aspect-square rounded-lg grayscale"
									label={false}
								/>
								<p className="mt-1 text-xs">{p.name}</p>
							</Link>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

// ---------------------------------------------------------------- C

type Filter = "all" | "now" | "pre";

export function BrowseC() {
	const [q, setQ] = useState("");
	const [cat, setCat] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const list = products.filter(
		(p) =>
			(!q || p.name.toLowerCase().includes(q.toLowerCase())) &&
			(!cat || p.category === cat) &&
			(filter === "all" ||
				(filter === "now" ? isInStock(p) : isPreorderOpen(p))),
	);
	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-40">
			<StoreHeader />
			<div className="sticky top-0 z-10 space-y-2 border-b bg-background px-3 pt-3 pb-2">
				<div className="flex gap-2">
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search Emblish"
						className="h-10 flex-1 rounded-md border bg-muted/50 px-3 text-sm"
					/>
					<select
						value={cat}
						onChange={(e) => setCat(e.target.value)}
						className="h-10 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">All categories</option>
						{categories.map((c) => (
							<option key={c}>{c}</option>
						))}
					</select>
				</div>
				<div className="grid grid-cols-3 rounded-md bg-muted p-0.5 text-sm">
					{(
						[
							["all", "All"],
							["now", "Buy now"],
							["pre", "Pre-order"],
						] as const
					).map(([k, label]) => (
						<button
							key={k}
							type="button"
							onClick={() => setFilter(k)}
							className={`rounded py-1.5 ${filter === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>
			<ul className="divide-y">
				{list.map((p) => {
					const now = fromStorePrice(p);
					const pre = fromPreorderPrice(p);
					const soldOut = isSoldOut(p);
					return (
						<li key={p.slug}>
							<Link href={href(p, "C")} className="flex gap-3 px-3 py-3">
								<Shot
									product={p}
									variant={p.variants[0]}
									className={`size-20 shrink-0 rounded-md ${soldOut ? "grayscale" : ""}`}
									label={false}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-muted-foreground text-xs">{p.category}</p>
									<p className="truncate font-medium">{p.name}</p>
									<div className="mt-1 flex flex-wrap gap-1.5 text-xs">
										{now !== undefined && (
											<span className="rounded bg-(--em-purple-soft) px-1.5 py-0.5 text-(--em-purple)">
												In stock · {cedi(now)}
											</span>
										)}
										{pre !== undefined && (
											<span className="rounded bg-(--em-gold-soft) px-1.5 py-0.5 text-(--em-gold-ink)">
												Pre-order · {cedi(pre)} · closes{" "}
												{shortDate(p.window?.closes ?? "")}
											</span>
										)}
										{soldOut && (
											<span className="rounded bg-muted px-1.5 py-0.5">
												Sold out
											</span>
										)}
									</div>
								</div>
							</Link>
						</li>
					);
				})}
				{list.length === 0 && (
					<li className="p-6 text-center text-muted-foreground text-sm">
						Nothing matches.
					</li>
				)}
			</ul>
		</div>
	);
}

// ---------------------------------------------------------------- D

const TRUST = [
	{
		Icon: Wallet,
		title: "Pay now, ship later",
		sub: "Shipping is billed on arrival",
	},
	{ Icon: CreditCard, title: "MoMo & card", sub: "Secure checkout" },
	{ Icon: Truck, title: "Pickup or Delivery", sub: "Across Ghana" },
	{ Icon: MessageSquare, title: "SMS updates", sub: "Track every shipment" },
];

const CAT_HUE: Record<string, number> = {
	Clothing: 300,
	Shoes: 60,
	Bags: 20,
	Home: 85,
	Beauty: 330,
};

export function BrowseD() {
	const closing = products
		.filter(isPreorderOpen)
		.sort(
			(a, b) =>
				daysLeft(a.window?.closes ?? "") - daysLeft(b.window?.closes ?? ""),
		);
	const featured = closing[0];
	return (
		<div className="mx-auto w-full min-w-0 max-w-md">
			<StoreHeader />

			{/* Hero */}
			<section className="mx-4 overflow-hidden rounded-3xl bg-(image:--em-hero-bg) text-(--em-hero-ink)">
				<div className="px-6 pt-7">
					<p className="font-semibold text-(--em-hero-accent) text-[11px] uppercase tracking-[0.2em]">
						Pre-orders now open
					</p>
					<h1 className="mt-2 font-medium text-[2rem] leading-[1.1]">
						Bring it home{" "}
						<span className="text-(--em-hero-accent) italic">before</span> it
						lands.
					</h1>
					<p className="mt-3 text-sm opacity-75">
						Order from our next shipment. Pay for the item today, and the
						shipping when it arrives.
					</p>
					<div className="mt-5 flex gap-2">
						<Link
							href={"/prototype/storefront?variant=B" as Route}
							className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-(--em-hero-cta-bg) px-4 py-2.5 font-semibold text-(--em-hero-cta-ink) text-sm"
						>
							Shop Pre-orders <ArrowRight className="size-4" />
						</Link>
						<Link
							href={"/prototype/storefront?variant=C" as Route}
							className="whitespace-nowrap rounded-full border border-current/30 px-4 py-2.5 text-sm"
						>
							In stock now
						</Link>
					</div>
				</div>
				{featured && (
					<Link href={href(featured, "A")} className="relative mt-6 block h-44">
						<Shot
							product={featured}
							variant={featured.variants[0]}
							label={false}
							className="absolute inset-x-10 bottom-0 h-40 rounded-t-[2rem]"
						/>
						<span className="absolute right-6 bottom-4 rounded-full bg-card px-3 py-1 font-semibold text-(--em-link) text-xs shadow-lg">
							{featured.name} · closes in{" "}
							{daysLeft(featured.window?.closes ?? "")}d
						</span>
					</Link>
				)}
			</section>
			<div className="mt-3 flex justify-center gap-1.5">
				<span className="h-1.5 w-5 rounded-full bg-primary" />
				<span className="size-1.5 rounded-full bg-border" />
				<span className="size-1.5 rounded-full bg-border" />
			</div>

			{/* Trust strip */}
			<section className="mx-4 mt-6 grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border bg-card p-4">
				{TRUST.map(({ Icon, title, sub }) => (
					<div key={title} className="flex items-start gap-2.5">
						<Icon
							className="mt-0.5 size-5 shrink-0 text-(--em-gold)"
							strokeWidth={1.6}
						/>
						<div>
							<p className="font-semibold text-xs">{title}</p>
							<p className="text-[11px] text-muted-foreground">{sub}</p>
						</div>
					</div>
				))}
			</section>

			{/* Categories */}
			<section className="mt-8">
				<h2 className="display px-4 font-medium text-xl">Shop by category</h2>
				<div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
					{categories.map((c) => {
						const p = products.find((x) => x.category === c);
						const hue = CAT_HUE[c] ?? 300;
						return (
							<Link
								key={c}
								href={"/prototype/storefront?variant=A" as Route}
								className="relative h-36 w-32 shrink-0 overflow-hidden rounded-2xl p-3"
								style={{
									background: `oklch(var(--em-tile-l) var(--em-tile-c) ${hue})`,
								}}
							>
								<p className="font-semibold text-sm">{c}</p>
								<p className="mt-0.5 flex items-center gap-1 text-(--em-link) text-[11px]">
									Shop now <ArrowRight className="size-3" />
								</p>
								{p && (
									<Shot
										product={p}
										label={false}
										className="absolute -right-3 -bottom-3 size-24 rounded-full bg-transparent!"
									/>
								)}
							</Link>
						);
					})}
				</div>
			</section>

			{/* Closing soon */}
			<section className="mt-8">
				<div className="flex items-baseline justify-between px-4">
					<h2 className="display font-medium text-xl">Closing soon</h2>
					<Link
						href={"/prototype/storefront?variant=B" as Route}
						className="flex items-center gap-1 font-semibold text-(--em-link) text-xs"
					>
						View all <ArrowRight className="size-3" />
					</Link>
				</div>
				<div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
					{closing.map((p) => {
						const d = daysLeft(p.window?.closes ?? "");
						return (
							<Link
								key={p.slug}
								href={href(p, "A")}
								className="w-44 shrink-0 overflow-hidden rounded-2xl border bg-card"
							>
								<div className="relative">
									<Shot
										product={p}
										variant={p.variants[0]}
										label={false}
										className="aspect-square"
									/>
									<span
										className={`absolute top-2 left-2 rounded-full px-2 py-0.5 font-semibold text-[10px] ${d <= 7 ? "bg-(--em-badge-hot-bg) text-(--em-badge-hot-ink)" : "bg-(--em-badge-warm-bg) text-(--em-badge-warm-ink)"}`}
									>
										{d} days left
									</span>
								</div>
								<div className="p-3">
									<p className="truncate font-medium text-sm">{p.name}</p>
									<p className="mt-0.5 font-semibold text-sm">
										{cedi(fromPreorderPrice(p) ?? 0)}
									</p>
									<p className="text-[11px] text-muted-foreground">
										Arrives {p.window?.eta}
									</p>
								</div>
							</Link>
						);
					})}
				</div>
			</section>

			{/* How it works band */}
			<section className="mx-4 mt-8 rounded-3xl bg-(--em-band-bg) p-6 text-(--em-band-ink)">
				<p className="font-semibold text-(--em-band-accent) text-[11px] uppercase tracking-[0.2em]">
					How Pre-order works
				</p>
				<ol className="mt-4 space-y-3">
					{[
						[
							"Order before the window closes",
							"Pay for the item. We place one order with the supplier.",
						],
						["We ship it to Ghana", "You get SMS updates at every stage."],
						["Pay shipping, then collect", "Pick it up or have it delivered."],
					].map(([t, sub], i) => (
						<li key={t} className="flex gap-3">
							<span className="display font-medium text-(--em-band-accent) text-2xl leading-none">
								{i + 1}
							</span>
							<div>
								<p className="font-semibold text-sm">{t}</p>
								<p className="text-xs opacity-65">{sub}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* Ready now */}
			<section className="mt-8 px-4">
				<h2 className="display font-medium text-xl">Ready to take home</h2>
				<div className="mt-3 grid grid-cols-2 gap-3">
					{products
						.filter((p) => isInStock(p) || isSoldOut(p))
						.map((p) => {
							const soldOut = isSoldOut(p);
							return (
								<div
									key={p.slug}
									className="overflow-hidden rounded-2xl border bg-card"
								>
									<Link href={href(p, "A")} className="relative block">
										<Shot
											product={p}
											variant={
												p.variants.find((v) => v.stock > 0) ?? p.variants[0]
											}
											label={false}
											className={`aspect-square ${soldOut ? "opacity-50 grayscale" : ""}`}
										/>
										<span
											className={`absolute top-2 left-2 rounded-full px-2 py-0.5 font-semibold text-[10px] ${soldOut ? "bg-muted text-muted-foreground" : isPreorderOpen(p) ? "bg-(--em-badge-warm-bg) text-(--em-badge-warm-ink)" : "bg-(--em-badge-hot-bg) text-(--em-badge-hot-ink)"}`}
										>
											{soldOut
												? "SOLD OUT"
												: isPreorderOpen(p)
													? "ALSO PRE-ORDER"
													: "IN STOCK"}
										</span>
									</Link>
									<div className="p-3">
										<p className="truncate font-medium text-sm">{p.name}</p>
										<p className="font-semibold text-sm">
											{cedi(fromStorePrice(p) ?? p.variants[0].storePrice ?? 0)}
										</p>
										<button
											type="button"
											disabled={soldOut}
											onClick={() => stub(`open ${p.name} options`)}
											className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-primary-foreground text-xs disabled:bg-muted disabled:text-muted-foreground"
										>
											<ShoppingBag className="size-3.5" />{" "}
											{soldOut ? "Sold out" : "Buy now"}
										</button>
									</div>
								</div>
							);
						})}
				</div>
			</section>

			{/* SMS sign-up */}
			<section className="mx-4 mt-8 rounded-3xl bg-(--em-promo-bg) p-5">
				<p className="display font-medium text-(--em-promo-ink) text-lg">
					Hear when a new window opens
				</p>
				<p className="text-(--em-promo-sub) text-xs">
					One SMS per drop. No spam.
				</p>
				<div className="mt-3 flex overflow-hidden rounded-full border border-(--em-gold)/40 bg-card">
					<input
						placeholder="024 000 0000"
						className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none"
					/>
					<button
						type="button"
						onClick={() => stub("subscribe this number to SMS")}
						className="bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-xs"
					>
						Notify me
					</button>
				</div>
			</section>

			{/* Footer */}
			<footer className="mt-10 bg-(--em-band-bg) px-6 pt-8 pb-36 text-(--em-band-ink)/70 text-xs">
				<p className="em-wordmark text-(--em-band-accent) text-xl">EMBLISH</p>
				<p className="mt-1">Pre-order what you love. We bring it home.</p>
				<div className="mt-6 grid grid-cols-2 gap-6">
					<div className="space-y-1.5">
						<p className="font-semibold text-(--em-band-accent)">Shop</p>
						<p>Pre-orders</p>
						<p>In stock</p>
						<p>Categories</p>
					</div>
					<div className="space-y-1.5">
						<p className="font-semibold text-(--em-band-accent)">Help</p>
						<p>My orders</p>
						<p>Pickup &amp; Delivery</p>
						<p>FAQs</p>
					</div>
				</div>
				<p className="mt-8 opacity-50">© 2026 Emblish</p>
			</footer>
		</div>
	);
}

const browseVariants = [
	{ key: "D", name: "Home", C: BrowseD },
	{ key: "A", name: "Category grid", C: BrowseA },
	{ key: "B", name: "Window feed", C: BrowseB },
	{ key: "C", name: "Dense list", C: BrowseC },
];

export function BrowseSwitch({ variant }: { variant: string }) {
	const V = browseVariants.find((v) => v.key === variant) ?? browseVariants[0];
	return (
		<>
			<V.C />
			<PrototypeSwitcher variants={browseVariants} current={V.key} />
		</>
	);
}
