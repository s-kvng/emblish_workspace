"use client";
// PROTOTYPE — shared bits for the Storefront prototype: placeholder images and Variant selection.
// Layout is deliberately NOT shared; each variant owns its own structure.

import {
	Coffee,
	Footprints,
	type LucideIcon,
	Search,
	Shirt,
	ShoppingBag,
	Sparkles,
	User,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { Mode, Product, Variant } from "./_data";
import { availableIn } from "./_data";

const SHOTS = ["Front", "Back", "Detail", "On model"];

export function hueFor(p: Product, variant?: Variant) {
	const key =
		p.imageOption && variant ? variant.options[p.imageOption] : undefined;
	return p.hues[key ?? ""] ?? p.hues.default ?? Object.values(p.hues)[0] ?? 0;
}

const ICONS: Record<string, LucideIcon> = {
	Clothing: Shirt,
	Shoes: Footprints,
	Bags: ShoppingBag,
	Home: Coffee,
	Beauty: Sparkles,
};

/** Placeholder product photo: a soft tinted tile with the category's icon, tinted per Variant. */
export function Shot({
	product,
	variant,
	shot = 0,
	className = "",
	label = true,
}: {
	product: Product;
	variant?: Variant;
	shot?: number;
	className?: string;
	label?: boolean;
}) {
	const hue = hueFor(product, variant);
	const tone =
		product.imageOption && variant
			? variant.options[product.imageOption]
			: undefined;
	const Icon = ICONS[product.category] ?? ShoppingBag;
	return (
		<div
			className={`relative grid place-items-center overflow-hidden ${className}`}
			style={{
				background: `radial-gradient(circle at ${30 + shot * 20}% 25%, oklch(0.99 0.01 ${hue}), oklch(0.93 0.045 ${hue}))`,
			}}
		>
			<Icon
				strokeWidth={1.1}
				className="h-1/2 w-1/2 drop-shadow-xl"
				style={{
					color: `oklch(0.45 0.11 ${hue})`,
					transform: `rotate(${shot * 8 - 8}deg) scale(${1 - shot * 0.08})`,
				}}
			/>
			{label && (
				<span className="absolute bottom-2 left-2 rounded-full bg-white/80 px-2 py-0.5 text-(--em-ink) text-[10px] backdrop-blur">
					{tone ? `${tone} · ` : ""}
					{SHOTS[shot % SHOTS.length]}
				</span>
			)}
		</div>
	);
}

/** Shared store header (allowed to be shared; layout below it is not). */
export function StoreHeader() {
	return (
		<header className="flex items-center justify-between px-4 py-3">
			<Link
				href={"/prototype/storefront?variant=D" as Route}
				className="flex items-center gap-1.5"
			>
				<span className="grid size-7 rotate-45 place-items-center rounded-md bg-(--em-purple)">
					<span className="size-2.5 rounded-sm bg-(--em-gold)" />
				</span>
				<span className="display ml-1 font-semibold text-(--em-purple) text-xl">
					Emblish
				</span>
			</Link>
			<div className="flex items-center gap-4 text-(--em-purple)">
				<Search className="size-5" />
				<User className="size-5" />
				<Link
					href={"/prototype/storefront/checkout" as Route}
					className="relative"
				>
					<ShoppingBag className="size-5" />
					<span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-(--em-gold) font-semibold text-(--em-purple-deep) text-[9px]">
						5
					</span>
				</Link>
			</div>
		</header>
	);
}

/** Option selection. Picks the first Variant available in `mode` as the starting point. */
export function useSelection(p: Product, mode: Mode | "any") {
	const first =
		p.variants.find((v) => mode !== "any" && availableIn(p, v, mode)) ??
		p.variants.find(
			(v) => availableIn(p, v, "now") || availableIn(p, v, "pre"),
		) ??
		p.variants[0];
	const [sel, setSel] = useState<Record<string, string>>(first.options);
	const variant = useMemo(
		() =>
			p.variants.find((v) =>
				p.options.every((o) => v.options[o.name] === sel[o.name]),
			) ?? p.variants[0],
		[p, sel],
	);
	/** Is there any Variant with this value (keeping the other picks) available in `m`? */
	const valueAvailable = (option: string, value: string, m: Mode | "any") =>
		p.variants.some(
			(v) =>
				v.options[option] === value &&
				p.options.every(
					(o) => o.name === option || v.options[o.name] === sel[o.name],
				) &&
				(m === "any"
					? availableIn(p, v, "now") || availableIn(p, v, "pre")
					: availableIn(p, v, m)),
		);
	const pick = (option: string, value: string) =>
		setSel((s) => ({ ...s, [option]: value }));
	return { sel, variant, pick, valueAvailable };
}

export const stub = (what: string) => toast.info(`Prototype: would ${what}`);
