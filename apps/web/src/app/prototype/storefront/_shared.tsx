"use client";
// PROTOTYPE — shared bits for the Storefront prototype: placeholder images and Variant selection.
// Layout is deliberately NOT shared; each variant owns its own structure.

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
	return (
		<div
			className={`relative flex items-end overflow-hidden ${className}`}
			style={{
				background: `linear-gradient(${135 + shot * 40}deg, oklch(0.86 0.07 ${hue}), oklch(0.62 0.11 ${hue + shot * 12}))`,
			}}
		>
			{label && (
				<span className="m-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
					{product.name}
					{tone ? ` · ${tone}` : ""} · {SHOTS[shot % SHOTS.length]}
				</span>
			)}
		</div>
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
