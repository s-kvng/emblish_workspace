"use client";
// PROTOTYPE — three structurally different Storefront browse pages (wayfinder #12).
//   A  Category grid   — sticky category chips, 2-up image grid, dual price line on each card
//   B  Window feed     — single column grouped by urgency: closing soon / ready today / rest
//   C  Dense list      — search + Buy now / Pre-order filter, thumbnail rows with badges

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
import { Shot } from "./_shared";

const href = (p: Product, variant: string) =>
	`/prototype/storefront/${p.slug}?variant=${variant}` as Route;

// ---------------------------------------------------------------- A

export function BrowseA() {
	const [cat, setCat] = useState<string | null>(null);
	const list = products.filter((p) => !cat || p.category === cat);
	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-40">
			<header className="px-4 pt-4 pb-2">
				<h1 className="font-semibold text-2xl tracking-tight">Emblish</h1>
			</header>
			<nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur">
				{[null, ...categories].map((c) => (
					<button
						key={c ?? "all"}
						type="button"
						onClick={() => setCat(c)}
						className={`shrink-0 rounded-full border px-3 py-1 text-sm ${cat === c ? "border-foreground bg-foreground text-background" : ""}`}
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
									<span className="absolute top-2 left-2 rounded bg-amber-400 px-1.5 py-0.5 font-semibold text-[10px] text-black">
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
			<header className="bg-foreground px-4 pt-6 pb-5 text-background">
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
											<span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
												In stock · {cedi(now)}
											</span>
										)}
										{pre !== undefined && (
											<span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
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

const browseVariants = [
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
