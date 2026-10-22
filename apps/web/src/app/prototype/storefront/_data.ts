// PROTOTYPE — throwaway mock catalog for the Storefront browse/product prototype (wayfinder #12).
// Shapes follow the catalog decision (#5): Product → Variants (≤3 options), Store Price on the
// Variant, Pre-order price/cap per Variant on the Order Window, MOQ across Variants, prices in pesewas.

export type Option = { name: string; values: string[] };

export type Variant = {
	sku: string;
	options: Record<string, string>;
	storePrice?: number; // pesewas; absent = not sold In-stock
	stock: number;
};

export type WindowVariant = {
	sku: string;
	price: number;
	cap?: number;
	ordered: number;
};

export type OrderWindow = {
	closes: string; // ISO date
	eta: string; // human expected arrival
	shippingFeeEstimate?: number; // pesewas per unit; absent = "confirmed on arrival"
	variants: WindowVariant[]; // subset of the Product's Variants
};

export type Product = {
	slug: string;
	name: string;
	category: string;
	blurb: string;
	options: Option[];
	imageOption?: string; // the option whose value swaps the gallery
	hues: Record<string, number>; // placeholder image hue per imageOption value (or "default")
	variants: Variant[];
	window?: OrderWindow;
	moq?: number;
};

export const TODAY = new Date("2026-10-22");

export const categories = ["Clothing", "Shoes", "Bags", "Home", "Beauty"];

const v = (
	sku: string,
	options: Record<string, string>,
	storePrice: number | undefined,
	stock: number,
): Variant => ({ sku, options, storePrice, stock });

export const products: Product[] = [
	{
		slug: "linen-kaftan",
		name: "Linen Kaftan",
		category: "Clothing",
		blurb: "Breathable washed linen, relaxed fit. Hand-finished hems.",
		options: [
			{ name: "Colour", values: ["Sand", "Olive", "Black"] },
			{ name: "Size", values: ["S", "M", "L", "XL"] },
		],
		imageOption: "Colour",
		hues: { Sand: 70, Olive: 120, Black: 260 },
		variants: [
			v("KAF-SAN-S", { Colour: "Sand", Size: "S" }, 45000, 0),
			v("KAF-SAN-M", { Colour: "Sand", Size: "M" }, 45000, 3),
			v("KAF-SAN-L", { Colour: "Sand", Size: "L" }, 45000, 1),
			v("KAF-SAN-XL", { Colour: "Sand", Size: "XL" }, 45000, 0),
			v("KAF-OLI-S", { Colour: "Olive", Size: "S" }, 45000, 0),
			v("KAF-OLI-M", { Colour: "Olive", Size: "M" }, 45000, 0),
			v("KAF-OLI-L", { Colour: "Olive", Size: "L" }, 45000, 2),
			v("KAF-OLI-XL", { Colour: "Olive", Size: "XL" }, 45000, 0),
			v("KAF-BLK-S", { Colour: "Black", Size: "S" }, 48000, 0),
			v("KAF-BLK-M", { Colour: "Black", Size: "M" }, 48000, 0),
			v("KAF-BLK-L", { Colour: "Black", Size: "L" }, 48000, 0),
			v("KAF-BLK-XL", { Colour: "Black", Size: "XL" }, 48000, 0),
		],
		window: {
			closes: "2026-11-14",
			eta: "early December",
			shippingFeeEstimate: 3500,
			variants: [
				{ sku: "KAF-SAN-S", price: 38000, ordered: 4 },
				{ sku: "KAF-SAN-M", price: 38000, ordered: 9 },
				{ sku: "KAF-SAN-L", price: 38000, ordered: 6 },
				{ sku: "KAF-OLI-M", price: 38000, ordered: 3 },
				{ sku: "KAF-OLI-L", price: 38000, ordered: 2 },
				{ sku: "KAF-BLK-M", price: 40000, cap: 10, ordered: 7 },
				{ sku: "KAF-BLK-L", price: 40000, cap: 10, ordered: 10 },
			],
		},
	},
	{
		slug: "pour-over-set",
		name: "Ceramic Pour-over Set",
		category: "Home",
		blurb: "Dripper, carafe and two cups in matte stoneware.",
		options: [],
		hues: { default: 25 },
		variants: [v("POUR-SET", {}, undefined, 0)],
		window: {
			closes: "2026-10-27",
			eta: "mid December",
			variants: [{ sku: "POUR-SET", price: 52000, cap: 40, ordered: 31 }],
		},
	},
	{
		slug: "leather-sandals",
		name: "Leather Slide Sandals",
		category: "Shoes",
		blurb: "Full-grain leather upper on a cushioned cork footbed.",
		options: [{ name: "Size", values: ["39", "40", "41", "42", "43", "44"] }],
		hues: { default: 35 },
		variants: [
			v("SAN-39", { Size: "39" }, 32000, 2),
			v("SAN-40", { Size: "40" }, 32000, 0),
			v("SAN-41", { Size: "41" }, 32000, 5),
			v("SAN-42", { Size: "42" }, 32000, 4),
			v("SAN-43", { Size: "43" }, 32000, 0),
			v("SAN-44", { Size: "44" }, 32000, 1),
		],
	},
	{
		slug: "wax-print-tote",
		name: "Wax-print Tote",
		category: "Bags",
		blurb: "Heavy canvas tote lined in Ankara wax print.",
		options: [{ name: "Print", values: ["Indigo", "Marigold"] }],
		imageOption: "Print",
		hues: { Indigo: 265, Marigold: 80 },
		variants: [
			v("TOTE-IND", { Print: "Indigo" }, 18000, 0),
			v("TOTE-MAR", { Print: "Marigold" }, 18000, 0),
		],
	},
	{
		slug: "shea-body-butter",
		name: "Whipped Shea Body Butter",
		category: "Beauty",
		blurb: "Unrefined Northern Region shea, whipped with coconut oil.",
		options: [
			{ name: "Scent", values: ["Unscented", "Lemongrass", "Vanilla"] },
			{ name: "Size", values: ["100 ml", "250 ml"] },
			{ name: "Jar", values: ["Glass", "Tin"] },
		],
		imageOption: "Scent",
		hues: { Unscented: 90, Lemongrass: 135, Vanilla: 55 },
		variants: ["Unscented", "Lemongrass", "Vanilla"].flatMap((scent) =>
			["100 ml", "250 ml"].flatMap((size) =>
				["Glass", "Tin"].map((jar) =>
					v(
						`SHEA-${scent.slice(0, 3).toUpperCase()}-${size.split(" ")[0]}-${jar[0]}`,
						{ Scent: scent, Size: size, Jar: jar },
						undefined,
						0,
					),
				),
			),
		),
		moq: 6,
		window: {
			closes: "2026-11-30",
			eta: "January",
			shippingFeeEstimate: 800,
			variants: ["Unscented", "Lemongrass", "Vanilla"].flatMap((scent) =>
				["100 ml", "250 ml"].flatMap((size) =>
					["Glass", "Tin"]
						.filter((jar) => !(scent === "Vanilla" && jar === "Tin"))
						.map((jar) => ({
							sku: `SHEA-${scent.slice(0, 3).toUpperCase()}-${size.split(" ")[0]}-${jar[0]}`,
							price: size === "100 ml" ? 4500 : 9000,
							ordered: 12,
						})),
				),
			),
		},
	},
	{
		slug: "kente-bow-tie",
		name: "Kente Bow Tie",
		category: "Clothing",
		blurb: "Handwoven Bonwire kente, pre-tied with adjustable strap.",
		options: [{ name: "Pattern", values: ["Gold", "Green", "Royal"] }],
		imageOption: "Pattern",
		hues: { Gold: 85, Green: 150, Royal: 285 },
		variants: [
			v("BOW-GLD", { Pattern: "Gold" }, 15000, 6),
			v("BOW-GRN", { Pattern: "Green" }, 15000, 0),
			v("BOW-ROY", { Pattern: "Royal" }, 15000, 0),
		],
		window: {
			closes: "2026-11-05",
			eta: "late November",
			shippingFeeEstimate: 1000,
			variants: [
				{ sku: "BOW-GRN", price: 12000, ordered: 5 },
				{ sku: "BOW-ROY", price: 12000, cap: 15, ordered: 15 },
			],
		},
	},
];

// ---------- helpers ----------

export const cedi = (pesewas: number) => {
	const whole = pesewas % 100 === 0;
	return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", {
		minimumFractionDigits: whole ? 0 : 2,
		maximumFractionDigits: 2,
	})}`;
};

export const shortDate = (iso: string) =>
	new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const daysLeft = (iso: string) =>
	Math.ceil((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000);

export const windowVariant = (p: Product, sku: string) =>
	p.window?.variants.find((w) => w.sku === sku);

export const windowLeft = (w: WindowVariant) =>
	w.cap === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(0, w.cap - w.ordered);

export const canBuyNow = (v: Variant) =>
	v.storePrice !== undefined && v.stock > 0;
export const canPreorder = (p: Product, v: Variant) => {
	const w = windowVariant(p, v.sku);
	return !!w && windowLeft(w) > 0;
};

export const isInStock = (p: Product) => p.variants.some(canBuyNow);
export const isPreorderOpen = (p: Product) =>
	p.variants.some((v) => canPreorder(p, v));
export const isSoldOut = (p: Product) => !isInStock(p) && !isPreorderOpen(p);

export const fromStorePrice = (p: Product) => {
	const prices = p.variants
		.filter(canBuyNow)
		.map((v) => v.storePrice as number);
	return prices.length ? Math.min(...prices) : undefined;
};
export const fromPreorderPrice = (p: Product) => {
	const prices = p.variants
		.filter((v) => canPreorder(p, v))
		.map((v) => windowVariant(p, v.sku)?.price as number);
	return prices.length ? Math.min(...prices) : undefined;
};

export const findProduct = (slug: string) =>
	products.find((p) => p.slug === slug);

export type Mode = "now" | "pre";

export const availableIn = (p: Product, v: Variant, mode: Mode) =>
	mode === "now" ? canBuyNow(v) : canPreorder(p, v);

export const priceIn = (p: Product, v: Variant, mode: Mode) =>
	mode === "now" ? v.storePrice : windowVariant(p, v.sku)?.price;
