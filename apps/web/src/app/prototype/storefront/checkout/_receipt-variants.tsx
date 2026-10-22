"use client";
// PROTOTYPE (wayfinder #13) — three Receipt layouts. One Receipt per payment, lines grouped under each
// order the payment created (Store Order items + its Delivery Fee, then each Pre-order's Item Payment).
//   A  Grouped list     — receipt first: one section per order with lines, subtotal and its next step
//   B  Next steps first — confirmation hero + one "what happens next" card per order; lines tucked away
//   C  Paper slip       — a printable receipt document, orders as sub-headings

import {
	CheckCircle2,
	ChevronDown,
	Download,
	MessageSquare,
	Package,
	Share2,
	Truck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import { cedi } from "../_data";
import { StoreHeader } from "../_shared";
import {
	groupOrders,
	loadReceiptSeed,
	type OrderGroup,
	PICKUP_POINT,
	type ReceiptSeed,
	totalsFor,
	ZONES,
} from "./_checkout-data";

const RECEIPT_NO = "EMB-R-10482";
const PAID_AT = "22 Oct 2026, 14:32";
const PAID_WITH = "MTN MoMo ••67";
const ORDER_NOS = ["S-2291", "P-5530", "P-5531", "P-5532"];
const PICKUP_CODE = "4827";

function useReceipt() {
	const [seed, setSeed] = useState<ReceiptSeed | null>(null);
	useEffect(() => setSeed(loadReceiptSeed()), []);
	if (!seed) return null;
	const groups = groupOrders(seed.bag);
	const zone = ZONES.find((z) => z.id === seed.zoneId);
	const totals = totalsFor(groups, seed.method, zone);
	return { seed, groups, zone, totals };
}
type R = NonNullable<ReturnType<typeof useReceipt>>;

const orderNo = (i: number) => ORDER_NOS[i] ?? `P-${5530 + i}`;

function nextStep(r: R, g: OrderGroup) {
	const delivery = r.seed.method === "delivery";
	if (g.kind === "store") {
		if (!delivery)
			return `Ready now. Show Pickup Code ${PICKUP_CODE} at ${PICKUP_POINT.name}, ${PICKUP_POINT.hours}.`;
		if (r.zone?.fee === undefined)
			return "We'll text you a Delivery Fee for this order. We dispatch once it's paid.";
		return "We'll dispatch soon and text you when it's on the way.";
	}
	return `Arrives ${g.eta}. We'll text you the Shipping Fee invoice${delivery ? " (with delivery)" : ""} then.`;
}

// ---------------------------------------------------------------- A

function ReceiptA({ r }: { r: R }) {
	return (
		<div className="mx-auto max-w-md px-4 pb-32">
			<p className="mt-2 flex items-center gap-2 font-semibold text-(--em-purple)">
				<CheckCircle2 className="size-5" /> Payment received
			</p>
			<h1 className="mt-1 font-semibold text-3xl">{cedi(r.totals.payNow)}</h1>
			<p className="text-muted-foreground text-sm">
				Receipt {RECEIPT_NO} · {PAID_AT} · {PAID_WITH}
			</p>
			<p className="mt-1 text-muted-foreground text-xs">
				We've texted this to {r.seed.phone}.
			</p>

			<div className="mt-5 grid gap-4">
				{r.groups.map((g, i) => (
					<section
						key={g.key}
						className="rounded-xl border border-border bg-white"
					>
						<header className="flex items-center justify-between border-border border-b px-3 py-2 text-sm">
							<b>
								{g.kind === "store"
									? "In-stock order"
									: `Pre-order · ${g.lines[0].product.name}`}
							</b>
							<span className="text-muted-foreground text-xs">
								#{orderNo(i)}
							</span>
						</header>
						<div className="grid gap-1 px-3 py-2 text-sm">
							{g.lines.map((l) => (
								<div key={l.id} className="flex justify-between">
									<span>
										{l.qty}× {l.product.name}{" "}
										<span className="text-muted-foreground">{l.label}</span>
									</span>
									<span>{cedi(l.total)}</span>
								</div>
							))}
							{g.kind === "store" && r.totals.deliveryNow > 0 && (
								<div className="flex justify-between">
									<span>Delivery Fee · {r.zone?.name}</span>
									<span>{cedi(r.totals.deliveryNow)}</span>
								</div>
							)}
							{g.kind === "pre" && (
								<p className="text-muted-foreground text-xs">
									Item Payment. Shipping Fee is billed on arrival.
								</p>
							)}
							<div className="mt-1 flex justify-between border-border border-t pt-1 font-semibold">
								<span>Paid</span>
								<span>
									{cedi(
										g.items + (g.kind === "store" ? r.totals.deliveryNow : 0),
									)}
								</span>
							</div>
						</div>
						<p
							className={`rounded-b-xl px-3 py-2 text-xs ${g.kind === "store" ? "bg-(--em-purple-soft) text-(--em-purple)" : "bg-(--em-gold-soft) text-(--em-gold-ink)"}`}
						>
							{nextStep(r, g)}
						</p>
					</section>
				))}
			</div>

			<div className="mt-4 flex justify-between font-bold text-lg">
				<span>Total paid</span>
				<span>{cedi(r.totals.payNow)}</span>
			</div>
			<Link
				href="/prototype/storefront?variant=D"
				className="mt-6 block h-11 rounded-md border border-border text-center text-sm leading-[2.75rem]"
			>
				See My orders
			</Link>
		</div>
	);
}

// ---------------------------------------------------------------- B

function ReceiptB({ r }: { r: R }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="mx-auto max-w-md pb-32">
			<div className="bg-(--em-purple) px-5 pt-6 pb-10 text-center text-white">
				<CheckCircle2 className="mx-auto size-12 text-(--em-gold)" />
				<h1 className="mt-2 font-semibold text-2xl">
					You're all set{r.seed.name ? `, ${r.seed.name}` : ""}
				</h1>
				<p className="text-sm text-white/80">
					{cedi(r.totals.payNow)} paid · {r.groups.length} orders · texted to{" "}
					{r.seed.phone}
				</p>
			</div>
			<div className="-mt-6 grid gap-3 px-4">
				{r.groups.map((g, i) => (
					<div
						key={g.key}
						className="flex gap-3 rounded-xl bg-white p-4 shadow-md ring-1 ring-border"
					>
						<span
							className={`grid size-10 shrink-0 place-items-center rounded-full ${g.kind === "store" ? "bg-(--em-purple-soft) text-(--em-purple)" : "bg-(--em-gold-soft) text-(--em-gold-ink)"}`}
						>
							{g.kind === "store" ? (
								r.seed.method === "delivery" ? (
									<Truck className="size-5" />
								) : (
									<Package className="size-5" />
								)
							) : (
								<MessageSquare className="size-5" />
							)}
						</span>
						<div className="min-w-0 flex-1 text-sm">
							<p className="flex justify-between font-semibold">
								<span className="truncate">
									{g.kind === "store"
										? "In-stock order"
										: g.lines[0].product.name}
								</span>
								<span className="text-muted-foreground text-xs">
									#{orderNo(i)}
								</span>
							</p>
							<p className="text-muted-foreground text-xs">
								{g.lines
									.map((l) => `${l.qty}× ${l.label || l.product.name}`)
									.join(", ")}
							</p>
							<p className="mt-2">{nextStep(r, g)}</p>
							{g.kind === "store" && r.seed.method !== "delivery" && (
								<p className="mt-2 inline-block rounded-md border-(--em-purple) border-2 border-dashed px-3 py-1 font-bold font-mono text-(--em-purple) text-xl tracking-widest">
									{PICKUP_CODE}
								</p>
							)}
						</div>
					</div>
				))}
			</div>
			<div className="mx-4 mt-4 rounded-xl border border-border bg-white">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex w-full items-center justify-between p-4 text-sm"
				>
					<span>
						Receipt {RECEIPT_NO} · <b>{cedi(r.totals.payNow)}</b>
					</span>
					<ChevronDown
						className={`size-4 transition ${open ? "rotate-180" : ""}`}
					/>
				</button>
				{open && (
					<div className="grid gap-3 border-border border-t p-4 text-sm">
						{r.groups.map((g, i) => (
							<div key={g.key}>
								<p className="font-semibold text-muted-foreground text-xs">
									#{orderNo(i)}
								</p>
								{g.lines.map((l) => (
									<p key={l.id} className="flex justify-between">
										<span>
											{l.qty}× {l.product.name} {l.label}
										</span>
										<span>{cedi(l.total)}</span>
									</p>
								))}
								{g.kind === "store" && r.totals.deliveryNow > 0 && (
									<p className="flex justify-between">
										<span>Delivery Fee</span>
										<span>{cedi(r.totals.deliveryNow)}</span>
									</p>
								)}
							</div>
						))}
						<p className="text-muted-foreground text-xs">
							{PAID_AT} · {PAID_WITH}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- C

function ReceiptC({ r }: { r: R }) {
	return (
		<div className="mx-auto max-w-md px-4 pt-2 pb-32">
			<div className="relative bg-white px-5 py-6 font-mono text-[13px] shadow-lg ring-1 ring-border [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),95%_100%,90%_calc(100%-8px),85%_100%,80%_calc(100%-8px),75%_100%,70%_calc(100%-8px),65%_100%,60%_calc(100%-8px),55%_100%,50%_calc(100%-8px),45%_100%,40%_calc(100%-8px),35%_100%,30%_calc(100%-8px),25%_100%,20%_calc(100%-8px),15%_100%,10%_calc(100%-8px),5%_100%,0_calc(100%-8px))]">
				<p className="display text-center font-sans font-semibold text-(--em-purple) text-xl">
					Emblish
				</p>
				<p className="text-center text-muted-foreground text-xs">
					RECEIPT {RECEIPT_NO}
				</p>
				<p className="text-center text-muted-foreground text-xs">{PAID_AT}</p>
				<Dash />
				<p>Customer: {r.seed.phone}</p>
				<p>
					{r.seed.method === "delivery"
						? `Delivery: ${r.zone?.name}`
						: `Pickup: ${PICKUP_POINT.name}`}
				</p>
				{r.groups.map((g, i) => (
					<div key={g.key}>
						<Dash />
						<p className="font-bold">
							{g.kind === "store" ? "STORE ORDER" : "PRE-ORDER"} #{orderNo(i)}
						</p>
						{g.kind === "pre" && (
							<p className="text-muted-foreground text-xs">
								Item Payment · arrives {g.eta}
							</p>
						)}
						{g.lines.map((l) => (
							<p key={l.id} className="flex justify-between gap-2">
								<span className="truncate">
									{l.qty} x {l.product.name} {l.label}
								</span>
								<span>{(l.total / 100).toFixed(2)}</span>
							</p>
						))}
						{g.kind === "store" && r.totals.deliveryNow > 0 && (
							<p className="flex justify-between">
								<span>Delivery Fee</span>
								<span>{(r.totals.deliveryNow / 100).toFixed(2)}</span>
							</p>
						)}
						{g.kind === "store" && r.seed.method !== "delivery" && (
							<p className="mt-1">
								Pickup Code: <b>{PICKUP_CODE}</b>
							</p>
						)}
					</div>
				))}
				<Dash />
				<p className="flex justify-between font-bold text-base">
					<span>TOTAL PAID (GHS)</span>
					<span>{(r.totals.payNow / 100).toFixed(2)}</span>
				</p>
				<p className="text-muted-foreground text-xs">
					{PAID_WITH} · Paystack ref T8812345
				</p>
				<Dash />
				<p className="text-center text-muted-foreground text-xs">
					Shipping Fees for Pre-orders are invoiced separately on arrival.
				</p>
			</div>
			<div className="mt-5 grid grid-cols-2 gap-2 text-sm">
				<button
					type="button"
					className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white"
				>
					<Download className="size-4" /> Save PDF
				</button>
				<button
					type="button"
					className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white"
				>
					<Share2 className="size-4" /> Share
				</button>
			</div>
			<Link
				href="/prototype/storefront?variant=D"
				className="mt-2 block h-11 rounded-md bg-primary text-center font-semibold text-primary-foreground text-sm leading-[2.75rem]"
			>
				Track my orders
			</Link>
		</div>
	);
}

const Dash = () => (
	<p className="my-2 overflow-hidden whitespace-nowrap text-muted-foreground">
		{"- ".repeat(40)}
	</p>
);

// ---------------------------------------------------------------- switch

const receiptVariants = [
	{ key: "A", name: "Grouped list", C: ReceiptA },
	{ key: "B", name: "Next steps first", C: ReceiptB },
	{ key: "C", name: "Paper slip", C: ReceiptC },
];

export function ReceiptSwitch({ variant }: { variant: string }) {
	const r = useReceipt();
	const V =
		receiptVariants.find((v) => v.key === variant) ?? receiptVariants[0];
	return (
		<>
			<StoreHeader />
			{r && <V.C r={r} />}
			<PrototypeSwitcher variants={receiptVariants} current={V.key} />
		</>
	);
}
