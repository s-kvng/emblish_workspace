"use client";
// PROTOTYPE — three structurally different Storefront product pages (wayfinder #12).
//   A  Stacked offers   — gallery + thumbnails, availability dots on options, Buy now and Pre-order
//                         as two side-by-side offer cards for the picked Variant, sticky CTA
//   B  Mode toggle      — a Buy now | Pre-order switch at the top drives the whole page
//                         (prices, which options are pickable, details), full-bleed swipe gallery
//   C  Pay-now/pay-later — Pre-order-led: window timeline, "pay now vs. on arrival" breakdown,
//                         multi-Variant line builder that shows MOQ progress; Buy now as a banner

import Link from "next/link";
import { useState } from "react";

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import {
	availableIn,
	canBuyNow,
	canPreorder,
	cedi,
	daysLeft,
	findProduct,
	isInStock,
	isPreorderOpen,
	type Mode,
	type Product,
	priceIn,
	shortDate,
	windowLeft,
	windowVariant,
} from "./_data";
import { Shot, stub, useSelection } from "./_shared";

const back = (variant: string) => (
	<Link
		href={`/prototype/storefront?variant=${variant}`}
		className="text-muted-foreground text-sm"
	>
		← All products
	</Link>
);

const shippingLine = (p: Product) =>
	p.window?.shippingFeeEstimate !== undefined
		? `about ${cedi(p.window.shippingFeeEstimate)} per unit`
		: "confirmed on arrival";

function capNote(p: Product, sku: string) {
	const w = windowVariant(p, sku);
	if (!w) return null;
	const left = windowLeft(w);
	if (left === 0) return "Pre-order full for this option";
	if (left <= 5) return `Only ${left} left in this window`;
	return null;
}

// ---------------------------------------------------------------- A

export function ProductA({ product: p }: { product: Product }) {
	const { sel, variant, pick, valueAvailable } = useSelection(p, "any");
	const [shot, setShot] = useState(0);
	const now = canBuyNow(variant);
	const pre = canPreorder(p, variant);
	const [offer, setOffer] = useState<Mode>(now ? "now" : "pre");
	const chosen: Mode | null =
		offer === "now"
			? now
				? "now"
				: pre
					? "pre"
					: null
			: pre
				? "pre"
				: now
					? "now"
					: null;
	const [qty, setQty] = useState(p.moq ?? 1);

	const dot = (option: string, value: string) => {
		const probe = { ...sel, [option]: value };
		const v = p.variants.find((x) =>
			p.options.every((o) => x.options[o.name] === probe[o.name]),
		);
		if (!v) return "bg-transparent";
		if (canBuyNow(v)) return "bg-emerald-500";
		if (canPreorder(p, v)) return "bg-amber-400";
		return "bg-transparent";
	};

	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-48">
			<div className="px-4 py-2">{back("A")}</div>
			<Shot
				product={p}
				variant={variant}
				shot={shot}
				className="aspect-square"
			/>
			<div className="flex gap-2 overflow-x-auto px-4 py-2">
				{[0, 1, 2, 3].map((i) => (
					<button key={i} type="button" onClick={() => setShot(i)}>
						<Shot
							product={p}
							variant={variant}
							shot={i}
							label={false}
							className={`size-14 rounded ${shot === i ? "ring-2 ring-foreground" : "opacity-70"}`}
						/>
					</button>
				))}
			</div>

			<div className="space-y-4 px-4">
				<div>
					<p className="text-muted-foreground text-xs">{p.category}</p>
					<h1 className="font-semibold text-xl">{p.name}</h1>
					<p className="mt-1 text-muted-foreground text-sm">{p.blurb}</p>
				</div>

				{p.options.map((o) => (
					<div key={o.name}>
						<p className="mb-1.5 text-sm">
							{o.name}: <span className="font-medium">{sel[o.name]}</span>
						</p>
						<div className="flex flex-wrap gap-2">
							{o.values.map((val) => {
								const ok = valueAvailable(o.name, val, "any");
								return (
									<button
										key={val}
										type="button"
										onClick={() => pick(o.name, val)}
										className={`relative rounded-md border px-3 py-1.5 text-sm ${sel[o.name] === val ? "border-foreground ring-1 ring-foreground" : ""} ${ok ? "" : "text-muted-foreground line-through"}`}
									>
										{val}
										<span
											className={`absolute -top-1 -right-1 size-2 rounded-full ${dot(o.name, val)}`}
										/>
									</button>
								);
							})}
						</div>
					</div>
				))}
				{p.options.length > 0 && (
					<p className="flex gap-3 text-muted-foreground text-xs">
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-emerald-500" /> In stock
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-amber-400" /> Pre-order
							only
						</span>
					</p>
				)}

				<div className="grid grid-cols-2 gap-2">
					<button
						type="button"
						disabled={!now}
						onClick={() => setOffer("now")}
						className={`rounded-lg border p-3 text-left disabled:opacity-40 ${chosen === "now" ? "border-foreground ring-1 ring-foreground" : ""}`}
					>
						<p className="font-semibold text-xs uppercase">Buy now</p>
						<p className="mt-1 font-semibold text-lg">
							{variant.storePrice !== undefined
								? cedi(variant.storePrice)
								: "—"}
						</p>
						<p className="text-muted-foreground text-xs">
							{now
								? `${variant.stock} in stock · ready this week`
								: variant.storePrice
									? "Sold out"
									: "Not sold in store"}
						</p>
					</button>
					<button
						type="button"
						disabled={!pre}
						onClick={() => setOffer("pre")}
						className={`rounded-lg border p-3 text-left disabled:opacity-40 ${chosen === "pre" ? "border-foreground ring-1 ring-foreground" : ""}`}
					>
						<p className="font-semibold text-xs uppercase">Pre-order</p>
						<p className="mt-1 font-semibold text-lg">
							{windowVariant(p, variant.sku)
								? cedi(windowVariant(p, variant.sku)?.price ?? 0)
								: "—"}
						</p>
						<p className="text-muted-foreground text-xs">
							{pre
								? `+ shipping ${p.window?.shippingFeeEstimate !== undefined ? `~${cedi(p.window.shippingFeeEstimate)}` : "on arrival"}`
								: (capNote(p, variant.sku) ??
									(p.window ? "Not in this window" : "No open window"))}
						</p>
					</button>
				</div>

				{chosen === "pre" && p.window && (
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-amber-50 p-3 text-amber-950 text-sm dark:bg-amber-950/30 dark:text-amber-100">
						<dt className="opacity-70">Orders close</dt>
						<dd>
							{shortDate(p.window.closes)} ({daysLeft(p.window.closes)} days)
						</dd>
						<dt className="opacity-70">Expected</dt>
						<dd>{p.window.eta}</dd>
						<dt className="opacity-70">Shipping Fee</dt>
						<dd>{shippingLine(p)}, paid when it arrives</dd>
						{p.moq && (
							<>
								<dt className="opacity-70">Minimum</dt>
								<dd>{p.moq} units per order (mix any options)</dd>
							</>
						)}
						{capNote(p, variant.sku) && (
							<>
								<dt className="opacity-70">Heads up</dt>
								<dd className="font-medium">{capNote(p, variant.sku)}</dd>
							</>
						)}
					</dl>
				)}
			</div>

			<div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
				<div className="mx-auto flex max-w-md items-center gap-3">
					<div className="flex items-center rounded-md border">
						<button
							type="button"
							className="px-3 py-2"
							onClick={() => setQty((q) => Math.max(1, q - 1))}
						>
							−
						</button>
						<span className="w-6 text-center text-sm">{qty}</span>
						<button
							type="button"
							className="px-3 py-2"
							onClick={() => setQty((q) => q + 1)}
						>
							+
						</button>
					</div>
					<button
						type="button"
						disabled={!chosen}
						onClick={() =>
							stub(`add ${qty} × ${variant.sku} (${chosen}) to Checkout`)
						}
						className="h-11 flex-1 rounded-md bg-foreground font-semibold text-background text-sm disabled:opacity-40"
					>
						{chosen === "now"
							? `Buy now · ${cedi((variant.storePrice ?? 0) * qty)}`
							: chosen === "pre"
								? `Pre-order · ${cedi((windowVariant(p, variant.sku)?.price ?? 0) * qty)}`
								: "Sold out"}
					</button>
				</div>
				{chosen === "pre" && p.moq && qty < p.moq && (
					<p className="mx-auto mt-1 max-w-md text-red-600 text-xs">
						Add at least {p.moq} units to pre-order.
					</p>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- B

export function ProductB({ product: p }: { product: Product }) {
	const both = isInStock(p) && isPreorderOpen(p);
	const [mode, setMode] = useState<Mode>(isInStock(p) ? "now" : "pre");
	const { sel, variant, pick, valueAvailable } = useSelection(p, mode);
	const available = availableIn(p, variant, mode);
	const price = priceIn(p, variant, mode);

	const switchMode = (m: Mode) => {
		setMode(m);
		// jump to the first option set available in the new mode
		const first = p.variants.find((v) => availableIn(p, v, m));
		if (first)
			for (const [k, val] of Object.entries(first.options)) pick(k, val);
	};

	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-40">
			<div className="relative">
				<div className="flex snap-x snap-mandatory overflow-x-auto">
					{[0, 1, 2, 3].map((i) => (
						<Shot
							key={i}
							product={p}
							variant={variant}
							shot={i}
							className="aspect-[4/5] w-full shrink-0 snap-center"
						/>
					))}
				</div>
				<div className="absolute top-3 left-3 rounded-full bg-background/80 px-3 py-1 backdrop-blur">
					{back("B")}
				</div>
				<p className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2 py-0.5 text-white text-xs">
					swipe →
				</p>
			</div>

			<div className="space-y-5 px-4 pt-4">
				<h1 className="font-semibold text-2xl leading-tight">{p.name}</h1>

				{both && (
					<div className="grid grid-cols-2 rounded-xl bg-muted p-1">
						{(["now", "pre"] as const).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => switchMode(m)}
								className={`rounded-lg py-2 text-sm ${mode === m ? "bg-background font-semibold shadow" : "text-muted-foreground"}`}
							>
								{m === "now" ? "Buy now" : "Pre-order"}
								<span className="block font-normal text-xs">
									{m === "now"
										? "Get it this week"
										: `Arrives ${p.window?.eta}`}
								</span>
							</button>
						))}
					</div>
				)}

				<div className="flex items-baseline gap-2">
					<p className="font-semibold text-3xl">
						{price !== undefined ? cedi(price) : "—"}
					</p>
					{mode === "pre" && (
						<p className="text-muted-foreground text-sm">
							+ Shipping Fee {shippingLine(p)}
						</p>
					)}
				</div>

				{p.options.map((o) => (
					<div key={o.name}>
						<p className="mb-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
							{o.name}
						</p>
						<div className="flex flex-wrap gap-2">
							{o.values.map((val) => {
								const ok = valueAvailable(o.name, val, mode);
								return (
									<button
										key={val}
										type="button"
										onClick={() => pick(o.name, val)}
										className={`min-w-12 rounded-full border px-4 py-2 text-sm ${sel[o.name] === val ? "border-foreground bg-foreground text-background" : ""} ${ok ? "" : "border-dashed text-muted-foreground"}`}
									>
										{val}
									</button>
								);
							})}
						</div>
					</div>
				))}

				{mode === "now" ? (
					<p className="text-sm">
						{available ? (
							<>
								<span className="font-medium text-emerald-700">In stock</span>
								{variant.stock <= 3 && ` · only ${variant.stock} left`} · Pickup
								or Delivery
							</>
						) : (
							<span className="text-muted-foreground">
								This option is sold out in store.
							</span>
						)}
					</p>
				) : (
					p.window && (
						<ol className="space-y-2 border-amber-400 border-l-2 pl-4 text-sm">
							<li>
								<b>Order by {shortDate(p.window.closes)}</b> —{" "}
								{daysLeft(p.window.closes)} days left
								{capNote(p, variant.sku) && (
									<span className="block text-red-600">
										{capNote(p, variant.sku)}
									</span>
								)}
							</li>
							<li>
								We order from the supplier; you'll get tracking updates by SMS.
							</li>
							<li>
								Arrives <b>{p.window.eta}</b>. Shipping Fee {shippingLine(p)}.
							</li>
							{p.moq && (
								<li>Minimum {p.moq} units per order, any mix of options.</li>
							)}
						</ol>
					)
				)}

				<p className="text-muted-foreground text-sm">{p.blurb}</p>
			</div>

			<div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent p-3 pt-6">
				<button
					type="button"
					disabled={!available}
					onClick={() => stub(`add ${variant.sku} (${mode}) to Checkout`)}
					className={`mx-auto block h-12 w-full max-w-md rounded-full font-semibold text-sm disabled:opacity-40 ${mode === "pre" ? "bg-amber-400 text-black" : "bg-foreground text-background"}`}
				>
					{!available
						? "Unavailable"
						: mode === "now"
							? "Buy now"
							: "Pre-order now"}
				</button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- C

type Line = { sku: string; qty: number };

export function ProductC({ product: p }: { product: Product }) {
	const preorderable = isPreorderOpen(p);
	const { sel, variant, pick, valueAvailable } = useSelection(
		p,
		preorderable ? "pre" : "now",
	);
	const [lines, setLines] = useState<Line[]>([]);
	const units = lines.reduce((n, l) => n + l.qty, 0);
	const itemTotal = lines.reduce(
		(n, l) => n + (windowVariant(p, l.sku)?.price ?? 0) * l.qty,
		0,
	);
	const shipEst = p.window?.shippingFeeEstimate;
	const label = (sku: string) =>
		Object.values(p.variants.find((v) => v.sku === sku)?.options ?? {}).join(
			" / ",
		) || p.name;

	const add = () =>
		setLines((ls) =>
			ls.some((l) => l.sku === variant.sku)
				? ls.map((l) => (l.sku === variant.sku ? { ...l, qty: l.qty + 1 } : l))
				: [...ls, { sku: variant.sku, qty: 1 }],
		);

	const optionPicker = (mode: Mode) =>
		p.options.map((o) => (
			<label
				key={o.name}
				className="flex items-center justify-between gap-3 text-sm"
			>
				<span className="text-muted-foreground">{o.name}</span>
				<select
					value={sel[o.name]}
					onChange={(e) => pick(o.name, e.target.value)}
					className="h-10 flex-1 rounded-md border bg-background px-2"
				>
					{o.values.map((val) => (
						<option key={val} value={val}>
							{val}
							{valueAvailable(o.name, val, mode)
								? ""
								: mode === "pre"
									? " — full / not offered"
									: " — sold out"}
						</option>
					))}
				</select>
			</label>
		));

	return (
		<div className="mx-auto w-full min-w-0 max-w-md pb-40">
			<div className="flex items-center justify-between px-4 py-2">
				{back("C")}
				<span className="text-muted-foreground text-xs">{p.category}</span>
			</div>
			<div className="grid grid-cols-3 gap-1 px-1">
				<Shot
					product={p}
					variant={variant}
					className="col-span-2 row-span-2 aspect-square"
				/>
				<Shot
					product={p}
					variant={variant}
					shot={1}
					label={false}
					className="aspect-square"
				/>
				<Shot
					product={p}
					variant={variant}
					shot={2}
					label={false}
					className="aspect-square"
				/>
			</div>

			<div className="space-y-5 px-4 pt-4">
				<div>
					<h1 className="font-semibold text-xl">{p.name}</h1>
					<p className="text-muted-foreground text-sm">{p.blurb}</p>
				</div>

				{isInStock(p) && preorderable && (
					<div className="flex items-center justify-between rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-emerald-950 text-sm dark:bg-emerald-950/30 dark:text-emerald-100">
						<span>
							Want it now? In stock from{" "}
							<b>
								{cedi(
									Math.min(
										...p.variants
											.filter(canBuyNow)
											.map((v) => v.storePrice ?? 0),
									),
								)}
							</b>
						</span>
						<button
							type="button"
							className="font-semibold underline"
							onClick={() => stub("open a Buy now sheet")}
						>
							Buy now
						</button>
					</div>
				)}

				{preorderable && p.window ? (
					<>
						<section className="rounded-xl border p-4">
							<h2 className="font-semibold text-sm">
								How this Pre-order works
							</h2>
							<ol className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] leading-tight">
								{[
									["Today", "Pay for the item"],
									[shortDate(p.window.closes), "Orders close"],
									[p.window.eta, "Arrives in Ghana"],
									["Then", "Pay Shipping, collect"],
								].map(([when, what], i) => (
									<li key={what} className="relative">
										<span
											className={`mx-auto mb-1 block size-3 rounded-full ${i === 0 ? "bg-foreground" : "border-2 border-foreground bg-background"}`}
										/>
										<b className="block">{when}</b>
										<span className="text-muted-foreground">{what}</span>
									</li>
								))}
							</ol>
						</section>

						<section className="space-y-3">
							{optionPicker("pre")}
							<div className="flex items-center justify-between">
								<p className="text-sm">
									<b>{cedi(windowVariant(p, variant.sku)?.price ?? 0)}</b>
									<span className="text-muted-foreground"> each</span>
									{capNote(p, variant.sku) && (
										<span className="block text-red-600 text-xs">
											{capNote(p, variant.sku)}
										</span>
									)}
								</p>
								<button
									type="button"
									disabled={!canPreorder(p, variant)}
									onClick={add}
									className="rounded-md border px-4 py-2 font-medium text-sm disabled:opacity-40"
								>
									+ Add
								</button>
							</div>
						</section>

						{lines.length > 0 && (
							<section className="space-y-2 rounded-xl bg-muted/60 p-4 text-sm">
								{lines.map((l) => (
									<div key={l.sku} className="flex justify-between">
										<span>
											{l.qty} × {label(l.sku)}
										</span>
										<button
											type="button"
											className="text-muted-foreground text-xs underline"
											onClick={() =>
												setLines((ls) => ls.filter((x) => x.sku !== l.sku))
											}
										>
											remove
										</button>
									</div>
								))}
								{p.moq && (
									<div>
										<div className="mt-2 h-1.5 rounded-full bg-background">
											<div
												className="h-1.5 rounded-full bg-amber-500"
												style={{
													width: `${Math.min(100, (units / p.moq) * 100)}%`,
												}}
											/>
										</div>
										<p className="mt-1 text-muted-foreground text-xs">
											{units >= p.moq
												? "Minimum reached"
												: `${p.moq - units} more to reach the ${p.moq}-unit minimum`}
										</p>
									</div>
								)}
								<div className="space-y-1 border-t pt-2">
									<div className="flex justify-between">
										<span>Pay now (items)</span>
										<b>{cedi(itemTotal)}</b>
									</div>
									<div className="flex justify-between text-muted-foreground">
										<span>On arrival (Shipping Fee)</span>
										<span>
											{shipEst !== undefined
												? `~${cedi(shipEst * units)}`
												: "confirmed on arrival"}
										</span>
									</div>
								</div>
							</section>
						)}
					</>
				) : (
					<section className="space-y-3">
						{optionPicker("now")}
						<p className="font-semibold text-lg">
							{variant.storePrice !== undefined
								? cedi(variant.storePrice)
								: "—"}{" "}
							<span className="font-normal text-muted-foreground text-sm">
								{canBuyNow(variant) ? `${variant.stock} in stock` : "Sold out"}
							</span>
						</p>
					</section>
				)}
			</div>

			<div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
				{preorderable ? (
					<button
						type="button"
						disabled={units === 0 || (p.moq !== undefined && units < p.moq)}
						onClick={() => stub(`check out ${units} pre-order units`)}
						className="mx-auto block h-11 w-full max-w-md rounded-md bg-foreground font-semibold text-background text-sm disabled:opacity-40"
					>
						{units === 0
							? "Add options to pre-order"
							: `Pre-order ${units} · pay ${cedi(itemTotal)} now`}
					</button>
				) : (
					<button
						type="button"
						disabled={!canBuyNow(variant)}
						onClick={() => stub(`buy ${variant.sku} now`)}
						className="mx-auto block h-11 w-full max-w-md rounded-md bg-foreground font-semibold text-background text-sm disabled:opacity-40"
					>
						{canBuyNow(variant) ? "Buy now" : "Sold out"}
					</button>
				)}
			</div>
		</div>
	);
}

const productVariants = [
	{ key: "A", name: "Stacked offers", C: ProductA },
	{ key: "B", name: "Mode toggle", C: ProductB },
	{ key: "C", name: "Pay-now / pay-later", C: ProductC },
];

export function ProductSwitch({
	variant,
	slug,
}: {
	variant: string;
	slug: string;
}) {
	const product = findProduct(slug);
	const V =
		productVariants.find((v) => v.key === variant) ?? productVariants[0];
	if (!product) return <p className="p-6">No such product.</p>;
	return (
		<>
			<V.C key={`${V.key}-${slug}`} product={product} />
			<PrototypeSwitcher variants={productVariants} current={V.key} />
		</>
	);
}
