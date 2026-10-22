"use client";
// PROTOTYPE (wayfinder #14) — mock Customer orders, invoices and an in-memory model shared by the
// My orders and /pay variants. Logic is shared on purpose; layout is not. Shapes follow:
//  - lifecycle (#2): Order Window stages Open → Closed → Ordered from supplier → In transit → Arrived;
//    Pre-order statuses Awaiting arrival → Shipping Fee due → Ready for handover → Handed over,
//    plus Cancelled / Forfeited; free self-cancel until "Ordered from supplier"; Staff send refunds.
//  - invoicing (#3): one Shipping Fee Invoice per Pre-order, due 14 days after issue, void + reissue
//    keeps the due date; a separate Delivery Fee Invoice never leads to Forfeit.
//  - fulfilment (#9, #11): switch until Dispatched/Collected; unpaid amounts adjusted, paid
//    differences invoiced (Delivery Fee Invoice) or refunded (Staff-triggered → "refund pending").

import { useEffect, useMemo, useState } from "react";

import { ZONES, type Zone } from "../checkout/_checkout-data";

export const TODAY_ISO = "2026-10-22";

export const WINDOW_STAGES = [
	"Open",
	"Closed",
	"Ordered from supplier",
	"In transit",
	"Arrived",
] as const;
export type WindowStage = (typeof WINDOW_STAGES)[number];

export type StageEvent = {
	stage: WindowStage;
	at?: string; // ISO date it happened; absent = not yet
	expected?: string; // human expected range, e.g. "28–30 Oct"
	note?: string; // Staff's short note
};

export type OrderLine = {
	slug: string;
	sku: string;
	name: string;
	label: string; // option values
	qty: number;
	unit: number; // pesewas, frozen
	arrived?: number; // Pre-order: units that arrived (Shortfall if < qty)
};

export type Method = "pickup" | "delivery";

export type Fulfilment = {
	method: Method;
	zoneId?: string;
	address?: string; // one-line summary
	deliveryFee?: number; // frozen at checkout / at switch; undefined for Elsewhere until quoted
};

export type InvoiceKind = "shipping" | "delivery";
export type InvoiceState = "unpaid" | "paid" | "voided";

export type Invoice = {
	id: string; // e.g. INV-2207, the /pay/<invoiceId>
	orderId: string;
	kind: InvoiceKind;
	state: InvoiceState;
	issued: string;
	due: string;
	paidAt?: string;
	receiptNo?: string;
	replacedBy?: string; // voided → the reissued invoice
	voidReason?: string;
	rows: { label: string; detail?: string; amount: number }[];
};

export type Refund = {
	id: string;
	amount: number;
	reason: string;
	state: "pending" | "refunded";
	at: string;
};

export type OrderStatus =
	| "Awaiting arrival"
	| "Shipping Fee due"
	| "Delivery Fee due"
	| "Ready for handover"
	| "Dispatched"
	| "Collected"
	| "Delivered"
	| "Cancelled"
	| "Forfeited";

export type Order = {
	id: string;
	kind: "store" | "pre";
	placed: string;
	receiptNo: string;
	lines: OrderLine[];
	status: OrderStatus;
	fulfilment: Fulfilment;
	pickupCode?: string; // once Ready for handover (Pickup)
	window?: {
		name: string; // e.g. "October window"
		closes: string;
		stages: StageEvent[];
		shippingFeePerUnit?: number; // estimate (or confirmed once arrived)
		shippingConfirmed?: boolean;
	};
	invoices: string[]; // invoice ids, oldest first
	refunds: Refund[];
	history: { at: string; text: string }[]; // customer-visible log
};

export const sumRows = (inv: Invoice) =>
	inv.rows.reduce((a, r) => a + r.amount, 0);
export const itemsTotal = (o: Order) =>
	o.lines.reduce((a, l) => a + l.unit * l.qty, 0);
export const unitCount = (o: Order) => o.lines.reduce((a, l) => a + l.qty, 0);
export const arrivedCount = (o: Order) =>
	o.lines.reduce((a, l) => a + (l.arrived ?? l.qty), 0);

export const zoneOf = (id?: string): Zone | undefined =>
	ZONES.find((z) => z.id === id);

export const dateLabel = (iso: string) =>
	new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
	});

export const daysUntil = (iso: string) =>
	Math.round(
		(new Date(iso).getTime() - new Date(TODAY_ISO).getTime()) / 86_400_000,
	);

/** The window's current stage = the last one that happened. */
export const currentStage = (o: Order): StageEvent | undefined =>
	o.window ? [...o.window.stages].reverse().find((s) => s.at) : undefined;
export const nextStage = (o: Order): StageEvent | undefined =>
	o.window?.stages.find((s) => !s.at);

/** Customer may cancel a Pre-order for free until the window reaches "Ordered from supplier". */
export const canSelfCancel = (o: Order) =>
	o.kind === "pre" &&
	o.status === "Awaiting arrival" &&
	!o.window?.stages.find((s) => s.stage === "Ordered from supplier")?.at;

/** Fulfilment can change until Dispatched / Collected (and not on ended orders). */
export const canSwitch = (o: Order) =>
	!["Dispatched", "Collected", "Delivered", "Cancelled", "Forfeited"].includes(
		o.status,
	);

export const isPast = (o: Order) =>
	["Collected", "Delivered", "Cancelled", "Forfeited"].includes(o.status);

/** What the Customer must do next, if anything. */
export function nextAction(
	o: Order,
	invoices: Record<string, Invoice>,
): { kind: "pay"; invoice: Invoice } | { kind: "pickup"; code: string } | null {
	const unpaid = o.invoices
		.map((id) => invoices[id])
		.find((i) => i?.state === "unpaid");
	if (unpaid) return { kind: "pay", invoice: unpaid };
	if (
		o.status === "Ready for handover" &&
		o.fulfilment.method === "pickup" &&
		o.pickupCode
	)
		return { kind: "pickup", code: o.pickupCode };
	return null;
}

// ---------- mock data ----------

const EAST = 3000;

export const INITIAL_INVOICES: Invoice[] = [
	{
		id: "INV-2201",
		orderId: "EM-1044",
		kind: "shipping",
		state: "voided",
		issued: "2026-10-20",
		due: "2026-11-03",
		voidReason: "You switched to Delivery, so we added the Delivery Fee.",
		replacedBy: "INV-2207",
		rows: [
			{
				label: "Shipping Fee",
				detail: "5 arrived units × GH₵ 8",
				amount: 4000,
			},
		],
	},
	{
		id: "INV-2207",
		orderId: "EM-1044",
		kind: "shipping",
		state: "unpaid",
		issued: "2026-10-21",
		due: "2026-11-03",
		rows: [
			{
				label: "Shipping Fee",
				detail: "5 arrived units × GH₵ 8",
				amount: 4000,
			},
			{
				label: "Delivery Fee",
				detail: "East Legon & Airport",
				amount: EAST,
			},
		],
	},
	{
		id: "INV-2190",
		orderId: "EM-1060",
		kind: "shipping",
		state: "paid",
		issued: "2026-10-12",
		due: "2026-10-26",
		paidAt: "2026-10-14",
		receiptNo: "R-50391",
		rows: [
			{
				label: "Shipping Fee",
				detail: "1 arrived unit × GH₵ 45",
				amount: 4500,
			},
		],
	},
	{
		id: "INV-2215",
		orderId: "EM-1060",
		kind: "delivery",
		state: "unpaid",
		issued: "2026-10-21",
		due: "2026-11-04",
		rows: [
			{
				label: "Delivery Fee",
				detail: "Elsewhere in Ghana · Kumasi (quoted)",
				amount: 6500,
			},
		],
	},
];

export const INITIAL_ORDERS: Order[] = [
	{
		id: "EM-1042",
		kind: "store",
		placed: "2026-10-20",
		receiptNo: "R-50410",
		lines: [
			{
				slug: "linen-kaftan",
				sku: "KAF-SAN-M",
				name: "Linen Kaftan",
				label: "Sand · M",
				qty: 1,
				unit: 45000,
			},
			{
				slug: "leather-sandals",
				sku: "SAN-41",
				name: "Leather Slide Sandals",
				label: "41",
				qty: 1,
				unit: 32000,
			},
		],
		status: "Ready for handover",
		fulfilment: { method: "pickup" },
		pickupCode: "7KQ4",
		invoices: [],
		refunds: [],
		history: [
			{ at: "2026-10-20", text: "Paid · Receipt R-50410" },
			{ at: "2026-10-20", text: "Ready for pickup · Pickup Code sent by SMS" },
		],
	},
	{
		id: "EM-1044",
		kind: "pre",
		placed: "2026-09-02",
		receiptNo: "R-49870",
		lines: [
			{
				slug: "shea-body-butter",
				sku: "SHEA-LEM-100-G",
				name: "Whipped Shea Body Butter",
				label: "Lemongrass · 100 ml · Glass",
				qty: 3,
				unit: 6500,
				arrived: 3,
			},
			{
				slug: "shea-body-butter",
				sku: "SHEA-VAN-250-G",
				name: "Whipped Shea Body Butter",
				label: "Vanilla · 250 ml · Glass",
				qty: 3,
				unit: 11000,
				arrived: 2,
			},
		],
		status: "Shipping Fee due",
		fulfilment: {
			method: "delivery",
			zoneId: "east",
			address: "Lagos Ave, East Legon · blue gate opp. Shell",
			deliveryFee: EAST,
		},
		window: {
			name: "September window",
			closes: "2026-09-15",
			shippingFeePerUnit: 800,
			shippingConfirmed: true,
			stages: [
				{ stage: "Open", at: "2026-08-25" },
				{ stage: "Closed", at: "2026-09-15" },
				{ stage: "Ordered from supplier", at: "2026-09-17" },
				{
					stage: "In transit",
					at: "2026-09-30",
					note: "Shipped by sea from Tema partner.",
				},
				{
					stage: "Arrived",
					at: "2026-10-20",
					note: "One Vanilla 250 ml jar didn't make it. Refunding it.",
				},
			],
		},
		invoices: ["INV-2201", "INV-2207"],
		refunds: [
			{
				id: "RF-311",
				amount: 11000,
				reason: "Shortfall: 1 × Vanilla · 250 ml didn't arrive",
				state: "pending",
				at: "2026-10-20",
			},
		],
		history: [
			{ at: "2026-09-02", text: "Item Payment paid · Receipt R-49870" },
			{ at: "2026-10-20", text: "Arrived: 5 of 6 units" },
			{ at: "2026-10-20", text: "Shipping Fee Invoice INV-2201 sent" },
			{ at: "2026-10-21", text: "Switched to Delivery (East Legon & Airport)" },
			{ at: "2026-10-21", text: "INV-2201 voided, INV-2207 sent instead" },
		],
	},
	{
		id: "EM-1060",
		kind: "pre",
		placed: "2026-08-30",
		receiptNo: "R-49811",
		lines: [
			{
				slug: "pour-over-set",
				sku: "POUR-SET",
				name: "Ceramic Pour-over Set",
				label: "",
				qty: 1,
				unit: 52000,
				arrived: 1,
			},
		],
		status: "Delivery Fee due",
		fulfilment: {
			method: "delivery",
			zoneId: "elsewhere",
			address: "Asokwa, Kumasi · behind Asokwa Police Station",
			deliveryFee: 6500,
		},
		window: {
			name: "August window",
			closes: "2026-09-01",
			shippingFeePerUnit: 4500,
			shippingConfirmed: true,
			stages: [
				{ stage: "Open", at: "2026-08-10" },
				{ stage: "Closed", at: "2026-09-01" },
				{ stage: "Ordered from supplier", at: "2026-09-03" },
				{ stage: "In transit", at: "2026-09-20" },
				{ stage: "Arrived", at: "2026-10-11" },
			],
		},
		invoices: ["INV-2190", "INV-2215"],
		refunds: [],
		history: [
			{ at: "2026-08-30", text: "Item Payment paid · Receipt R-49811" },
			{ at: "2026-10-11", text: "Arrived" },
			{ at: "2026-10-14", text: "Shipping Fee paid · Receipt R-50391" },
			{
				at: "2026-10-21",
				text: "Delivery Fee quoted for Kumasi · INV-2215 sent",
			},
		],
	},
	{
		id: "EM-1043",
		kind: "pre",
		placed: "2026-10-20",
		receiptNo: "R-50410",
		lines: [
			{
				slug: "linen-kaftan",
				sku: "KAF-BLK-M",
				name: "Linen Kaftan",
				label: "Black · M",
				qty: 1,
				unit: 39000,
			},
		],
		status: "Awaiting arrival",
		fulfilment: {
			method: "delivery",
			zoneId: "east",
			address: "Lagos Ave, East Legon · blue gate opp. Shell",
			deliveryFee: EAST,
		},
		window: {
			name: "October window",
			closes: "2026-10-10",
			shippingFeePerUnit: 3500,
			stages: [
				{ stage: "Open", at: "2026-09-26" },
				{ stage: "Closed", at: "2026-10-10" },
				{ stage: "Ordered from supplier", at: "2026-10-12" },
				{
					stage: "In transit",
					at: "2026-10-19",
					expected: "Arrives 1–5 Dec",
					note: "On the vessel from Lagos. Tracking updated weekly.",
				},
				{ stage: "Arrived", expected: "1–5 Dec" },
			],
		},
		invoices: [],
		refunds: [],
		history: [
			{ at: "2026-10-20", text: "Item Payment paid · Receipt R-50410" },
		],
	},
	{
		id: "EM-1051",
		kind: "pre",
		placed: "2026-10-05",
		receiptNo: "R-50122",
		lines: [
			{
				slug: "kente-bow-tie",
				sku: "BOW-GLD",
				name: "Kente Bow Tie",
				label: "Gold",
				qty: 2,
				unit: 12000,
			},
		],
		status: "Awaiting arrival",
		fulfilment: { method: "pickup" },
		window: {
			name: "October window",
			closes: "2026-10-18",
			shippingFeePerUnit: 1000,
			stages: [
				{ stage: "Open", at: "2026-10-01" },
				{ stage: "Closed", at: "2026-10-18" },
				{
					stage: "Ordered from supplier",
					expected: "by 28 Oct",
					note: "Confirming the weave count with Bonwire.",
				},
				{ stage: "In transit", expected: "early Nov" },
				{ stage: "Arrived", expected: "late Nov" },
			],
		},
		invoices: [],
		refunds: [],
		history: [
			{ at: "2026-10-05", text: "Item Payment paid · Receipt R-50122" },
		],
	},
	{
		id: "EM-0988",
		kind: "store",
		placed: "2026-09-28",
		receiptNo: "R-49980",
		lines: [
			{
				slug: "wax-print-tote",
				sku: "TOTE-IND",
				name: "Wax-print Tote",
				label: "Indigo",
				qty: 1,
				unit: 18000,
			},
		],
		status: "Delivered",
		fulfilment: {
			method: "delivery",
			zoneId: "central",
			address: "Ring Rd, Osu",
			deliveryFee: 2500,
		},
		invoices: [],
		refunds: [],
		history: [
			{ at: "2026-09-28", text: "Paid · Receipt R-49980" },
			{ at: "2026-09-29", text: "Dispatched" },
			{ at: "2026-09-29", text: "Delivered" },
		],
	},
	{
		id: "EM-0950",
		kind: "pre",
		placed: "2026-09-10",
		receiptNo: "R-49902",
		lines: [
			{
				slug: "linen-kaftan",
				sku: "KAF-OLI-L",
				name: "Linen Kaftan",
				label: "Olive · L",
				qty: 1,
				unit: 39000,
			},
		],
		status: "Cancelled",
		fulfilment: { method: "pickup" },
		invoices: [],
		refunds: [
			{
				id: "RF-290",
				amount: 39000,
				reason: "You cancelled before we ordered from the supplier",
				state: "refunded",
				at: "2026-09-14",
			},
		],
		history: [
			{ at: "2026-09-10", text: "Item Payment paid · Receipt R-49902" },
			{ at: "2026-09-12", text: "You cancelled" },
			{ at: "2026-09-14", text: "Refunded GH₵ 390 to MTN MoMo ••67" },
		],
	},
];

// ---------- fulfilment switch: the money effect ----------

export type SwitchEffect = {
	newFee?: number; // Delivery Fee after the switch (undefined = Pickup or quoted later)
	diff: number; // + Customer pays more, − Customer gets money back, 0 none
	kind:
		| "none"
		| "on-next-invoice" // Shipping Fee Invoice not issued yet: fee goes on it
		| "reissue" // unpaid invoice voided and reissued, same due date
		| "new-delivery-invoice" // paid already (or Store Order): Delivery Fee Invoice for the difference
		| "void-delivery-invoice"
		| "refund" // paid difference refunded by Staff
		| "quote"; // Elsewhere in Ghana: Staff quote by SMS
	headline: string;
	detail: string;
};

/** Apply #9's money rules to a proposed switch. */
export function switchEffect(
	o: Order,
	invoices: Record<string, Invoice>,
	method: Method,
	zoneId?: string,
): SwitchEffect {
	const zone = zoneOf(zoneId);
	const oldFee =
		o.fulfilment.method === "delivery" ? (o.fulfilment.deliveryFee ?? 0) : 0;
	const newFee = method === "delivery" ? zone?.fee : 0;
	const quote = method === "delivery" && zone && zone.fee === undefined;
	const diff = quote ? 0 : (newFee ?? 0) - oldFee;
	const all = o.invoices.map((id) => invoices[id]).filter(Boolean);
	const unpaid = all.find((i) => i.state === "unpaid");
	const feePaid =
		o.kind === "store" ||
		all.some(
			(i) =>
				i.state === "paid" && i.rows.some((r) => r.label === "Delivery Fee"),
		);
	const shippingIssued = all.some((i) => i.kind === "shipping");
	const amt = (n: number) => `GH₵ ${(Math.abs(n) / 100).toFixed(0)}`;

	if (quote)
		return {
			diff: 0,
			kind: "quote",
			headline: "We'll text you a Delivery Fee quote",
			detail:
				"Staff quote deliveries outside our zones. You'll get a Delivery Fee Invoice by SMS; we dispatch once it's paid.",
		};
	if (diff === 0)
		return {
			newFee,
			diff,
			kind: "none",
			headline: "No change to what you pay",
			detail: "Same fee, so nothing to pay or refund.",
		};
	if (diff > 0) {
		if (o.kind === "pre" && !shippingIssued)
			return {
				newFee,
				diff,
				kind: "on-next-invoice",
				headline: `+${amt(diff)}, added to your Shipping Fee Invoice`,
				detail:
					"Nothing to pay now. The Delivery Fee goes on the Shipping Fee Invoice we send when your goods arrive.",
			};
		if (unpaid && !feePaid)
			return {
				newFee,
				diff,
				kind: "reissue",
				headline: `+${amt(diff)}, we'll send a new invoice`,
				detail: `${unpaid.id} (${amt(sumRows(unpaid))}) is cancelled and replaced by a new invoice for ${amt(sumRows(unpaid) + diff)}. The due date stays ${dateLabel(unpaid.due)}.`,
			};
		return {
			newFee,
			diff,
			kind: "new-delivery-invoice",
			headline: `+${amt(diff)} Delivery Fee to pay`,
			detail:
				o.kind === "store"
					? "You paid for this order already, so we'll text you a Delivery Fee Invoice. We dispatch once it's paid."
					: "Your Shipping Fee is paid, so we'll text you a separate Delivery Fee Invoice. We dispatch once it's paid.",
		};
	}
	// diff < 0
	if (o.kind === "pre" && !shippingIssued)
		return {
			newFee,
			diff,
			kind: "on-next-invoice",
			headline: `${amt(diff)} less on your Shipping Fee Invoice`,
			detail:
				"Nothing to refund: you haven't paid a Delivery Fee yet. Your Shipping Fee Invoice will simply be lower.",
		};
	if (unpaid && !feePaid)
		return {
			newFee,
			diff,
			kind: unpaid.kind === "delivery" ? "void-delivery-invoice" : "reissue",
			headline:
				unpaid.kind === "delivery"
					? "Your Delivery Fee Invoice is cancelled"
					: `${amt(diff)} less, we'll send a new invoice`,
			detail:
				unpaid.kind === "delivery"
					? `${unpaid.id} is cancelled. Nothing to pay.`
					: `${unpaid.id} (${amt(sumRows(unpaid))}) is cancelled and replaced by a new invoice for ${amt(sumRows(unpaid) + diff)}. The due date stays ${dateLabel(unpaid.due)}.`,
		};
	return {
		newFee,
		diff,
		kind: "refund",
		headline: `${amt(diff)} back to you`,
		detail:
			"You've already paid this Delivery Fee, so we'll refund the difference to the mobile money or card you paid with. It shows as 'refund pending' until it lands (usually 1–3 days after we send it).",
	};
}

// ---------- the in-memory model ----------

const KEY = "emblish-prototype-orders";

type Snapshot = { orders: Order[]; invoices: Invoice[] };

function load(): Snapshot {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw) return JSON.parse(raw) as Snapshot;
	} catch {}
	return { orders: INITIAL_ORDERS, invoices: INITIAL_INVOICES };
}
function save(s: Snapshot) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(s));
	} catch {}
}

let seq = 2300;

export function useOrders() {
	const [snap, setSnapRaw] = useState<Snapshot>({
		orders: INITIAL_ORDERS,
		invoices: INITIAL_INVOICES,
	});
	useEffect(() => setSnapRaw(load()), []); // after mount, so SSR markup matches
	const [signedIn, setSignedIn] = useState(true);
	const setSnap = (f: (s: Snapshot) => Snapshot) =>
		setSnapRaw((s) => {
			const n = f(s);
			save(n);
			return n;
		});

	const invoices = useMemo(
		() => Object.fromEntries(snap.invoices.map((i) => [i.id, i])),
		[snap.invoices],
	);

	const patchOrder = (id: string, f: (o: Order) => Order) =>
		setSnap((s) => ({
			...s,
			orders: s.orders.map((o) => (o.id === id ? f(o) : o)),
		}));

	return {
		orders: snap.orders,
		invoices,
		signedIn,
		setSignedIn,
		reset: () => {
			try {
				sessionStorage.removeItem(KEY);
			} catch {}
			setSnapRaw({ orders: INITIAL_ORDERS, invoices: INITIAL_INVOICES });
		},
		/** Free self-cancel (before "Ordered from supplier"); Staff send the refund. */
		cancel: (id: string) =>
			patchOrder(id, (o) => ({
				...o,
				status: "Cancelled",
				refunds: [
					...o.refunds,
					{
						id: `RF-${seq++}`,
						amount: itemsTotal(o),
						reason: "You cancelled before we ordered from the supplier",
						state: "pending",
						at: TODAY_ISO,
					},
				],
				history: [
					...o.history,
					{ at: TODAY_ISO, text: "You cancelled · full refund pending" },
				],
			})),
		/** Change Fulfilment Method / zone / address and apply the money effect. */
		switchFulfilment: (
			id: string,
			method: Method,
			zoneId?: string,
			address?: string,
		) =>
			setSnap((s) => {
				const o = s.orders.find((x) => x.id === id) as Order;
				const invs = Object.fromEntries(s.invoices.map((i) => [i.id, i]));
				const fx = switchEffect(o, invs, method, zoneId);
				const zone = zoneOf(zoneId);
				let invoicesNext = s.invoices;
				const orderInvoices = [...o.invoices];
				const refunds = [...o.refunds];
				const hist = [
					...o.history,
					{
						at: TODAY_ISO,
						text:
							method === "pickup"
								? "Switched to Pickup"
								: `Switched to Delivery (${zone?.name})`,
					},
				];
				const unpaid = o.invoices
					.map((i) => invs[i])
					.find((i) => i?.state === "unpaid");
				if (
					(fx.kind === "reissue" || fx.kind === "void-delivery-invoice") &&
					unpaid
				) {
					const newId = `INV-${seq++}`;
					const rows = unpaid.rows
						.filter((r) => r.label !== "Delivery Fee")
						.concat(
							method === "delivery" && fx.newFee
								? [
										{
											label: "Delivery Fee",
											detail: zone?.name,
											amount: fx.newFee,
										},
									]
								: [],
						);
					invoicesNext = invoicesNext.map((i) =>
						i.id === unpaid.id
							? {
									...i,
									state: "voided" as const,
									voidReason: "You changed how you get this order.",
									replacedBy: rows.length ? newId : undefined,
								}
							: i,
					);
					if (rows.length) {
						invoicesNext = [
							...invoicesNext,
							{
								...unpaid,
								id: newId,
								state: "unpaid",
								issued: TODAY_ISO,
								rows,
							},
						];
						orderInvoices.push(newId);
						hist.push({
							at: TODAY_ISO,
							text: `${unpaid.id} voided, ${newId} sent instead`,
						});
					} else hist.push({ at: TODAY_ISO, text: `${unpaid.id} voided` });
				}
				if (fx.kind === "new-delivery-invoice") {
					const newId = `INV-${seq++}`;
					invoicesNext = [
						...invoicesNext,
						{
							id: newId,
							orderId: o.id,
							kind: "delivery",
							state: "unpaid",
							issued: TODAY_ISO,
							due: "2026-11-05",
							rows: [
								{
									label: "Delivery Fee",
									detail:
										fx.diff === fx.newFee
											? zone?.name
											: `Difference, ${zone?.name}`,
									amount: fx.diff,
								},
							],
						},
					];
					orderInvoices.push(newId);
					hist.push({
						at: TODAY_ISO,
						text: `Delivery Fee Invoice ${newId} sent`,
					});
				}
				if (fx.kind === "refund")
					refunds.push({
						id: `RF-${seq++}`,
						amount: -fx.diff,
						reason: "Delivery Fee difference after you changed fulfilment",
						state: "pending",
						at: TODAY_ISO,
					});
				const status: OrderStatus =
					fx.kind === "new-delivery-invoice" || fx.kind === "quote"
						? o.kind === "store" || o.status === "Ready for handover"
							? "Delivery Fee due"
							: o.status
						: o.status === "Delivery Fee due" && method === "pickup"
							? "Ready for handover"
							: o.status;
				return {
					invoices: invoicesNext,
					orders: s.orders.map((x) =>
						x.id === id
							? {
									...o,
									status,
									pickupCode:
										method === "pickup" && status === "Ready for handover"
											? (o.pickupCode ?? "Q3M8")
											: o.pickupCode,
									fulfilment: {
										method,
										zoneId: method === "delivery" ? zoneId : undefined,
										address: method === "delivery" ? address : undefined,
										deliveryFee: method === "delivery" ? zone?.fee : undefined,
									},
									invoices: orderInvoices,
									refunds,
									history: hist,
								}
							: x,
					),
				};
			}),
	};
}

export type OrdersModel = ReturnType<typeof useOrders>;

/** Pay-page lookup: the live (sessionStorage) invoice, else the mock. */
export function loadInvoice(id: string): {
	invoice?: Invoice;
	order?: Order;
} {
	const s =
		typeof window === "undefined"
			? { orders: INITIAL_ORDERS, invoices: INITIAL_INVOICES }
			: load();
	const invoice = s.invoices.find((i) => i.id === id);
	const order = s.orders.find((o) => o.id === invoice?.orderId);
	return { invoice, order };
}

export function markInvoicePaid(id: string) {
	const s = load();
	const inv = s.invoices.find((i) => i.id === id);
	if (!inv) return;
	const receiptNo = `R-${50500 + Math.floor(Math.random() * 400)}`;
	const invoices = s.invoices.map((i) =>
		i.id === id
			? { ...i, state: "paid" as const, paidAt: TODAY_ISO, receiptNo }
			: i,
	);
	const stillUnpaid = (o: Order) =>
		o.invoices.some(
			(x) => x !== id && invoices.find((i) => i.id === x)?.state === "unpaid",
		);
	const orders = s.orders.map((o) =>
		o.id === inv.orderId
			? {
					...o,
					status: stillUnpaid(o)
						? o.status
						: ("Ready for handover" as OrderStatus),
					pickupCode:
						o.fulfilment.method === "pickup"
							? (o.pickupCode ?? "Q3M8")
							: undefined,
					history: [
						...o.history,
						{ at: TODAY_ISO, text: `${inv.id} paid · Receipt ${receiptNo}` },
					],
				}
			: o,
	);
	save({ orders, invoices });
}
