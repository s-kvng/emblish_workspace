"use client";
// PROTOTYPE (wayfinder #13) — mock Bag, Delivery Zones and an in-memory Checkout model shared by the
// Checkout variants. Logic is shared on purpose; layout is not. Shapes follow the mixed-checkout
// decision (#11): one Checkout → at most one Store Order + one Pre-order per Order Window, one charge,
// one Receipt, 30-minute expiry; each order pays its own Delivery Fee (Store Order now, Pre-orders on
// their Shipping Fee Invoice).

import { useEffect, useMemo, useState } from "react";

import {
	findProduct,
	type Product,
	type Variant,
	windowVariant,
} from "../_data";

export type BagLine = {
	id: string;
	slug: string;
	sku: string;
	mode: "now" | "pre";
	qty: number;
};

export const INITIAL_BAG: BagLine[] = [
	{ id: "l1", slug: "linen-kaftan", sku: "KAF-SAN-M", mode: "now", qty: 1 },
	{ id: "l2", slug: "leather-sandals", sku: "SAN-41", mode: "now", qty: 1 },
	{ id: "l3", slug: "linen-kaftan", sku: "KAF-BLK-M", mode: "pre", qty: 1 },
	{
		id: "l4",
		slug: "shea-body-butter",
		sku: "SHEA-LEM-100-G",
		mode: "pre",
		qty: 2,
	},
	{
		id: "l5",
		slug: "shea-body-butter",
		sku: "SHEA-VAN-250-G",
		mode: "pre",
		qty: 2,
	},
];

export type Zone = { id: string; name: string; areas: string; fee?: number };

export const ZONES: Zone[] = [
	{
		id: "central",
		name: "Accra Central",
		areas: "Osu, Labone, Cantonments, Adabraka",
		fee: 2500,
	},
	{
		id: "east",
		name: "East Legon & Airport",
		areas: "East Legon, Airport Res., Spintex",
		fee: 3000,
	},
	{
		id: "west",
		name: "Accra West",
		areas: "Dansoman, Kaneshie, Achimota",
		fee: 3500,
	},
	{
		id: "tema",
		name: "Tema & Ashaiman",
		areas: "Communities 1–25, Ashaiman",
		fee: 4000,
	},
	{ id: "kasoa", name: "Kasoa", areas: "Kasoa, Weija, Old Barrier", fee: 4500 },
	{
		id: "elsewhere",
		name: "Elsewhere in Ghana",
		areas: "Kumasi, Takoradi, Tamale… we quote the fee by SMS",
	},
];

export const PICKUP_POINT = {
	name: "Emblish pickup point",
	address: "14 Oxford Street, Osu, Accra",
	hours: "Mon–Sat, 10am–6pm",
};

export type Address = {
	recipient: string;
	phone: string;
	area: string;
	street: string;
	landmark: string;
	gps: string;
};

export const EMPTY_ADDRESS: Address = {
	recipient: "",
	phone: "",
	area: "",
	street: "",
	landmark: "",
	gps: "",
};

// ---------- derived lines and orders ----------

export type Line = BagLine & {
	product: Product;
	variant: Variant;
	unit: number;
	total: number;
	label: string; // option values, e.g. "Sand · M"
	shipEstimate?: number; // per unit, Pre-order only
};

export type OrderGroup = {
	key: string; // "store" or the Order Window's product slug (one window per product in the mock)
	kind: "store" | "pre";
	title: string;
	subtitle: string;
	lines: Line[];
	items: number; // pesewas
	moq?: { min: number; have: number };
	shipEstimateTotal?: number; // pesewas, Pre-order only; undefined = confirmed on arrival
	windowCloses?: string;
	eta?: string;
};

export function resolveLine(l: BagLine): Line {
	const product = findProduct(l.slug) as Product;
	const variant = product.variants.find((v) => v.sku === l.sku) as Variant;
	const unit =
		l.mode === "now"
			? (variant.storePrice as number)
			: (windowVariant(product, l.sku)?.price as number);
	return {
		...l,
		product,
		variant,
		unit,
		total: unit * l.qty,
		label: Object.values(variant.options).join(" · "),
		shipEstimate:
			l.mode === "pre" ? product.window?.shippingFeeEstimate : undefined,
	};
}

export function groupOrders(bag: BagLine[]): OrderGroup[] {
	const lines = bag.map(resolveLine);
	const groups: OrderGroup[] = [];
	const store = lines.filter((l) => l.mode === "now");
	if (store.length)
		groups.push({
			key: "store",
			kind: "store",
			title: "In-stock order",
			subtitle: "Ready as soon as you pay",
			lines: store,
			items: sum(store.map((l) => l.total)),
		});
	const bySlug = new Map<string, Line[]>();
	for (const l of lines.filter((l) => l.mode === "pre"))
		bySlug.set(l.slug, [...(bySlug.get(l.slug) ?? []), l]);
	for (const [slug, ls] of bySlug) {
		const p = ls[0].product;
		const have = sum(ls.map((l) => l.qty));
		const est = p.window?.shippingFeeEstimate;
		groups.push({
			key: slug,
			kind: "pre",
			title: `Pre-order · ${p.name}`,
			subtitle: `Arrives ${p.window?.eta}`,
			lines: ls,
			items: sum(ls.map((l) => l.total)),
			moq: p.moq ? { min: p.moq, have } : undefined,
			shipEstimateTotal: est === undefined ? undefined : est * have,
			windowCloses: p.window?.closes,
			eta: p.window?.eta,
		});
	}
	return groups;
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const moqProblems = (groups: OrderGroup[]) =>
	groups.filter((g) => g.moq && g.moq.have < g.moq.min);

// ---------- money ----------

export type Totals = {
	items: number;
	deliveryNow: number; // Store Order's fixed-zone Delivery Fee, charged now
	payNow: number;
	deliveries: number; // number of separate deliveries (one per order)
	deliveryEach?: number; // undefined for "Elsewhere" (quoted later)
	laterShipping: number; // sum of Shipping Fee estimates known now
	laterShippingUnknown: boolean; // some window confirms its fee on arrival
	laterDelivery: number; // Delivery Fees billed later on each Pre-order's Shipping Fee Invoice
};

export function totalsFor(
	groups: OrderGroup[],
	method: "pickup" | "delivery" | null,
	zone: Zone | undefined,
): Totals {
	const items = sum(groups.map((g) => g.items));
	const delivering = method === "delivery" && !!zone;
	const each = delivering ? zone?.fee : undefined;
	const hasStore = groups.some((g) => g.kind === "store");
	const preCount = groups.filter((g) => g.kind === "pre").length;
	const deliveryNow = delivering && hasStore && each !== undefined ? each : 0;
	return {
		items,
		deliveryNow,
		payNow: items + deliveryNow,
		deliveries: delivering ? groups.length : 0,
		deliveryEach: each,
		laterShipping: sum(groups.map((g) => g.shipEstimateTotal ?? 0)),
		laterShippingUnknown: groups.some(
			(g) => g.kind === "pre" && g.shipEstimateTotal === undefined,
		),
		laterDelivery: delivering && each !== undefined ? each * preCount : 0,
	};
}

// ---------- the in-memory Checkout ----------

export type Stage =
	| "bag" // still editing; no Checkout yet
	| "details" // signing in / choosing fulfilment
	| "paystack" // handed off to Paystack
	| "returned-unpaid" // back from Paystack without paying (closed or failed)
	| "expired"
	| "paid";

export type Scenario = {
	returning: boolean; // Customer already signed in on this device
	nextPayment: "success" | "fail";
};

const PHONE_ON_FILE = "024 555 4567";

/**
 * One hook drives every variant: the Bag, sign-in, fulfilment and the 30-minute Checkout clock.
 * `holdAt` decides WHEN the Checkout (and its Stock Holds) is created — that's one of the questions.
 */
export function useCheckout(opts: { holdAt: "start" | "pay" }) {
	const [bag, setBag] = useState<BagLine[]>(INITIAL_BAG);
	const [stage, setStage] = useState<Stage>("bag");
	const [scenario, setScenario] = useState<Scenario>({
		returning: false,
		nextPayment: "success",
	});

	// sign-in
	const [phone, setPhone] = useState("");
	const [codeSent, setCodeSent] = useState(false);
	const [code, setCode] = useState("");
	const [signedIn, setSignedIn] = useState(false);
	const [name, setName] = useState("");

	// fulfilment
	const [method, setMethod] = useState<"pickup" | "delivery" | null>(null);
	const [zoneId, setZoneId] = useState<string | null>(null);
	const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);

	// Checkout clock (ms remaining); null = no Checkout exists
	const [expiresAt, setExpiresAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [lastFailure, setLastFailure] = useState<null | "failed" | "closed">(
		null,
	);

	useEffect(() => {
		if (expiresAt === null) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [expiresAt]);

	const remaining = expiresAt === null ? null : Math.max(0, expiresAt - now);

	useEffect(() => {
		if (remaining === 0 && stage !== "paid" && stage !== "expired")
			setStage("expired");
	}, [remaining, stage]);

	useEffect(() => {
		if (scenario.returning) {
			setSignedIn(true);
			setPhone(PHONE_ON_FILE);
			setName("Ama");
		}
	}, [scenario.returning]);

	const groups = useMemo(() => groupOrders(bag), [bag]);
	const zone = ZONES.find((z) => z.id === zoneId);
	const totals = totalsFor(groups, method, zone);
	const problems = moqProblems(groups);

	const openCheckout = () => {
		setExpiresAt(Date.now() + 30 * 60_000);
		setNow(Date.now());
	};

	const addressComplete =
		!!address.recipient &&
		!!address.phone &&
		!!address.area &&
		!!address.landmark;
	const fulfilmentComplete =
		method === "pickup" || (method === "delivery" && !!zone && addressComplete);

	return {
		bag,
		groups,
		totals,
		problems,
		stage,
		scenario,
		setScenario,
		remaining,
		lastFailure,
		// bag
		setQty: (id: string, qty: number) =>
			setBag((b) =>
				qty <= 0
					? b.filter((l) => l.id !== id)
					: b.map((l) => (l.id === id ? { ...l, qty } : l)),
			),
		// stage moves
		startCheckout: () => {
			setStage("details");
			if (opts.holdAt === "start") openCheckout();
		},
		backToBag: () => {
			setStage("bag");
			if (opts.holdAt === "start") setExpiresAt(null); // edits release the Checkout
		},
		pay: () => {
			if (expiresAt === null) openCheckout();
			setStage("paystack");
		},
		paystackResult: (r: "success" | "fail" | "closed") => {
			const outcome =
				r === "success" && scenario.nextPayment === "fail" ? "fail" : r;
			if (outcome === "success") {
				setStage("paid");
				saveForReceipt({ bag, method, zoneId, address, phone, name });
				return;
			}
			setLastFailure(outcome === "fail" ? "failed" : "closed");
			setStage("returned-unpaid");
		},
		restart: () => {
			setExpiresAt(null);
			setLastFailure(null);
			setStage("bag");
		},
		// prototype controls
		fastForward: (minutesLeft: number) => {
			if (expiresAt === null) return;
			setExpiresAt(Date.now() + minutesLeft * 60_000);
			setNow(Date.now());
		},
		// sign-in
		phone,
		setPhone,
		codeSent,
		sendCode: () => setCodeSent(true),
		code,
		setCode: (c: string) => {
			setCode(c);
			if (c.length === 6) setSignedIn(true);
		},
		signedIn,
		signOut: () => {
			setSignedIn(false);
			setCodeSent(false);
			setCode("");
			setPhone("");
			setScenario((s) => ({ ...s, returning: false }));
		},
		name,
		setName,
		// fulfilment
		method,
		setMethod,
		zone,
		setZoneId,
		address,
		setAddress: (patch: Partial<Address>) =>
			setAddress((a) => ({ ...a, ...patch })),
		addressComplete,
		fulfilmentComplete,
		canPay:
			signedIn && fulfilmentComplete && problems.length === 0 && bag.length > 0,
	};
}

export type CheckoutModel = ReturnType<typeof useCheckout>;

export const clock = (ms: number) => {
	const s = Math.ceil(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- hand-off to the Receipt route ----------

export type ReceiptSeed = {
	bag: BagLine[];
	method: "pickup" | "delivery" | null;
	zoneId: string | null;
	address: Address;
	phone: string;
	name: string;
};

const KEY = "emblish-prototype-receipt";

function saveForReceipt(seed: ReceiptSeed) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(seed));
	} catch {}
}

export function loadReceiptSeed(): ReceiptSeed {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw) return JSON.parse(raw) as ReceiptSeed;
	} catch {}
	return {
		bag: INITIAL_BAG.map((l) => (l.id === "l4" ? { ...l, qty: 4 } : l)),
		method: "delivery",
		zoneId: "east",
		address: {
			recipient: "Ama Owusu",
			phone: "024 555 4567",
			area: "East Legon",
			street: "Lagos Avenue",
			landmark: "Blue gate opposite Shell station",
			gps: "GA-492-7731",
		},
		phone: PHONE_ON_FILE,
		name: "Ama",
	};
}
