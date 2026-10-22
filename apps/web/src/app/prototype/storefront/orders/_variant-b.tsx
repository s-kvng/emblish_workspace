"use client";
// PROTOTYPE (wayfinder #14) — My orders B: "One feed, expandable cards".
// Every order (Store Orders and Pre-orders) is a rich card in one scrolling feed, action-needed first,
// with filter chips (All / Pre-orders / Store Orders / Past). A collapsed card shows a product strip,
// a horizontal 5-dot progress tracker, the current stage + expected date and an inline primary action
// (Pay / Show code). Tapping expands the card in place (accordion) with stage notes, items, invoices,
// refunds, fulfilment and history. Switching fulfilment and cancelling open bottom sheets; the switch
// sheet shows each zone's fee difference and a live money-effect panel before Confirm.

import {
	Check,
	ChevronDown,
	KeyRound,
	MapPin,
	MessageSquare,
	Package,
	Truck,
	X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { cedi, findProduct } from "../_data";
import { Shot, StoreHeader, stub } from "../_shared";
import { PICKUP_POINT, ZONES } from "../checkout/_checkout-data";
import { field, Labeled } from "../checkout/_checkout-shared";
import {
	arrivedCount,
	canSelfCancel,
	canSwitch,
	currentStage,
	dateLabel,
	daysUntil,
	type Invoice,
	isPast,
	itemsTotal,
	type Method,
	nextAction,
	nextStage,
	type Order,
	type OrdersModel,
	sumRows,
	switchEffect,
	unitCount,
	useOrders,
	WINDOW_STAGES,
	zoneOf,
} from "./_orders-data";
import { OrdersScenarioPanel, SignInGate } from "./_orders-shared";

type Filter = "all" | "pre" | "store" | "past";
type Sheet = { kind: "switch" | "cancel"; id: string } | null;

const payHref = (id: string) =>
	`/prototype/storefront/pay/${id}?variant=B` as Route;

const signed = (n: number) =>
	n === 0 ? "same" : `${n > 0 ? "+" : "−"}${cedi(Math.abs(n))}`;

export function OrdersB() {
	const m = useOrders();
	const [filter, setFilter] = useState<Filter>("all");
	const [open, setOpen] = useState<string | null>(null);
	const [sheet, setSheet] = useState<Sheet>(null);

	const sorted = useMemo(() => {
		const rank = (o: Order) =>
			isPast(o) ? 2 : nextAction(o, m.invoices) ? 0 : 1;
		return [...m.orders].sort(
			(a, b) => rank(a) - rank(b) || b.placed.localeCompare(a.placed),
		);
	}, [m.orders, m.invoices]);

	if (!m.signedIn)
		return (
			<>
				<StoreHeader />
				<SignInGate m={m} />
				<OrdersScenarioPanel m={m} />
			</>
		);

	const active = sorted.filter((o) => !isPast(o));
	const past = sorted.filter(isPast);
	const shown =
		filter === "past"
			? past
			: filter === "all"
				? active
				: active.filter((o) => o.kind === filter);
	const needing = active.filter((o) => nextAction(o, m.invoices)).length;
	const sheetOrder = sheet
		? m.orders.find((o) => o.id === sheet.id)
		: undefined;

	const chips: { key: Filter; label: string; n: number }[] = [
		{ key: "all", label: "All", n: active.length },
		{
			key: "pre",
			label: "Pre-orders",
			n: active.filter((o) => o.kind === "pre").length,
		},
		{
			key: "store",
			label: "Store Orders",
			n: active.filter((o) => o.kind === "store").length,
		},
		{ key: "past", label: "Past", n: past.length },
	];

	return (
		<div className="mx-auto min-h-dvh max-w-md pb-24">
			<StoreHeader />
			<div className="px-4">
				<h1 className="display font-semibold text-(--em-purple) text-3xl">
					My orders
				</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					{needing > 0
						? `${needing} ${needing === 1 ? "order needs" : "orders need"} you. They're at the top.`
						: "Nothing needs you right now."}
				</p>
			</div>

			<div className="sticky top-0 z-20 -mt-1 flex gap-2 overflow-x-auto bg-background px-4 py-3">
				{chips.map((c) => (
					<button
						key={c.key}
						type="button"
						onClick={() => setFilter(c.key)}
						className={`shrink-0 rounded-full border px-3.5 py-1.5 font-medium text-sm ${
							filter === c.key
								? "border-(--em-purple) bg-(--em-purple) text-white"
								: "border-border bg-white text-(--em-ink)"
						}`}
					>
						{c.label}{" "}
						<span
							className={
								filter === c.key ? "text-white/70" : "text-muted-foreground"
							}
						>
							{c.n}
						</span>
					</button>
				))}
			</div>

			<div className="grid gap-3 px-4">
				{shown.length === 0 && (
					<p className="rounded-xl border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
						No orders here.
					</p>
				)}
				{shown.map((o) => (
					<OrderCard
						key={o.id}
						o={o}
						m={m}
						open={open === o.id}
						toggle={() => setOpen((x) => (x === o.id ? null : o.id))}
						openSheet={(kind) => setSheet({ kind, id: o.id })}
					/>
				))}

				{filter === "all" && past.length > 0 && (
					<>
						<div className="mt-4 flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-wider">
							<span className="h-px flex-1 bg-border" /> Past orders
							<span className="h-px flex-1 bg-border" />
						</div>
						{past.map((o) => (
							<OrderCard
								key={o.id}
								o={o}
								m={m}
								open={open === o.id}
								toggle={() => setOpen((x) => (x === o.id ? null : o.id))}
								openSheet={(kind) => setSheet({ kind, id: o.id })}
							/>
						))}
					</>
				)}
			</div>

			{sheet?.kind === "switch" && sheetOrder && (
				<SwitchSheet o={sheetOrder} m={m} close={() => setSheet(null)} />
			)}
			{sheet?.kind === "cancel" && sheetOrder && (
				<CancelSheet o={sheetOrder} m={m} close={() => setSheet(null)} />
			)}

			<OrdersScenarioPanel m={m} />
		</div>
	);
}

// ---------- tracker ----------

const PRE_DOTS = ["Closed", "Ordered", "In transit", "Arrived", "Ready"];

function tracker(o: Order): {
	dots: string[];
	done: number; // number of dots reached
	label: string;
	sub?: string;
	ended?: boolean;
} {
	const ended = o.status === "Cancelled" || o.status === "Forfeited";
	if (o.kind === "store") {
		const last = o.fulfilment.method === "pickup" ? "Collected" : "Delivered";
		const dots = ["Paid", "Ready", last];
		const done =
			o.status === "Collected" || o.status === "Delivered"
				? 3
				: o.status === "Ready for handover" || o.status === "Dispatched"
					? 2
					: 1;
		return {
			dots,
			done: ended ? 0 : done,
			ended,
			label: ended
				? o.status
				: o.status === "Ready for handover"
					? o.fulfilment.method === "pickup"
						? "Ready for pickup"
						: "Ready to dispatch"
					: o.status,
			sub:
				o.status === "Delivery Fee due"
					? "Pay the Delivery Fee to dispatch"
					: undefined,
		};
	}
	const handedish = [
		"Ready for handover",
		"Dispatched",
		"Collected",
		"Delivered",
	].includes(o.status);
	const cur = currentStage(o);
	const nxt = nextStage(o);
	const stageIdx = cur ? WINDOW_STAGES.indexOf(cur.stage) : 0; // 0 = Open
	const done = handedish ? 5 : stageIdx; // Open = 0 dots, Closed = 1 … Arrived = 4
	let label: string = o.status;
	let sub: string | undefined;
	if (ended) label = o.status;
	else if (o.status === "Awaiting arrival") {
		label = cur?.stage === "Open" ? "Window open" : (cur?.stage ?? "Placed");
		if (nxt)
			sub = `Next: ${nxt.stage}${nxt.expected ? ` · ${nxt.expected}` : ""}`;
	} else if (o.status === "Shipping Fee due") {
		label = "Arrived · Shipping Fee due";
	} else if (o.status === "Ready for handover") {
		label =
			o.fulfilment.method === "pickup"
				? "Ready for pickup"
				: "Ready to dispatch";
	}
	return { dots: PRE_DOTS, done: ended ? 0 : done, label, sub, ended };
}

function Tracker({ o }: { o: Order }) {
	const t = tracker(o);
	return (
		<div>
			<div
				className="grid"
				style={{ gridTemplateColumns: `repeat(${t.dots.length}, 1fr)` }}
			>
				{t.dots.map((d, i) => {
					const reached = i < t.done;
					const isCur = i === t.done - 1;
					return (
						<div key={d} className="relative flex flex-col items-center">
							{i < t.dots.length - 1 && (
								<span
									className={`absolute top-[7px] left-1/2 h-0.5 w-full ${i < t.done - 1 && !t.ended ? "bg-(--em-purple)" : "bg-border"}`}
								/>
							)}
							<span
								className={`relative grid size-4 place-items-center rounded-full border-2 ${
									t.ended
										? "border-border bg-muted"
										: reached
											? "border-(--em-purple) bg-(--em-purple)"
											: "border-border bg-white"
								} ${isCur && !t.ended ? "ring-(--em-gold)/40 ring-4" : ""}`}
							>
								{reached && !t.ended && (
									<Check className="size-2.5 text-white" strokeWidth={4} />
								)}
							</span>
							<span
								className={`mt-1 text-center text-[10px] leading-tight ${reached && !t.ended ? "text-(--em-ink)" : "text-muted-foreground"}`}
							>
								{d}
							</span>
						</div>
					);
				})}
			</div>
			<p
				className={`mt-2 font-semibold text-sm ${t.ended ? "text-muted-foreground" : "text-(--em-ink)"}`}
			>
				{t.label}
			</p>
			{t.sub && <p className="text-muted-foreground text-xs">{t.sub}</p>}
		</div>
	);
}

// ---------- card ----------

function OrderCard({
	o,
	m,
	open,
	toggle,
	openSheet,
}: {
	o: Order;
	m: OrdersModel;
	open: boolean;
	toggle: () => void;
	openSheet: (k: "switch" | "cancel") => void;
}) {
	const action = nextAction(o, m.invoices);
	const past = isPast(o);
	return (
		<article
			className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
				action ? "border-(--em-gold)" : "border-border"
			} ${past ? "opacity-90" : ""}`}
		>
			<button
				type="button"
				onClick={toggle}
				className="block w-full text-left"
				aria-expanded={open}
			>
				<div className="flex h-20 gap-0.5">
					{o.lines.slice(0, 3).map((l) => {
						const p = findProduct(l.slug);
						return p ? (
							<Shot
								key={l.sku}
								product={p}
								label={false}
								className="h-full flex-1"
							/>
						) : (
							<div key={l.sku} className="h-full flex-1 bg-muted" />
						);
					})}
				</div>
				<div className="grid gap-3 p-4">
					<div className="flex items-start justify-between gap-2">
						<div>
							<p className="font-semibold text-(--em-ink) text-sm">
								{o.lines[0].name}
								{o.lines.length > 1 && (
									<span className="font-normal text-muted-foreground">
										{" "}
										+{o.lines.length - 1} more
									</span>
								)}
							</p>
							<p className="text-muted-foreground text-xs">
								{o.id} ·{" "}
								{o.kind === "pre"
									? `Pre-order · ${o.window?.name ?? ""}`
									: "Store Order"}{" "}
								· {unitCount(o)} {unitCount(o) === 1 ? "item" : "items"}
							</p>
						</div>
						<ChevronDown
							className={`mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
						/>
					</div>
					<Tracker o={o} />
				</div>
			</button>

			{action && (
				<div className="px-4 pb-4">
					{action.kind === "pay" ? (
						<Link
							href={payHref(action.invoice.id)}
							className="flex h-11 items-center justify-center rounded-md bg-(--em-purple) font-semibold text-sm text-white"
						>
							Pay {cedi(sumRows(action.invoice))}
							<span className="ml-2 font-normal text-white/70 text-xs">
								due {dateLabel(action.invoice.due)} ·{" "}
								{daysUntil(action.invoice.due)}d left
							</span>
						</Link>
					) : (
						<button
							type="button"
							onClick={() => !open && toggle()}
							className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-(--em-gold) font-semibold text-(--em-purple-deep) text-sm"
						>
							<KeyRound className="size-4" />
							{open ? `Pickup Code ${action.code}` : "Show Pickup Code"}
						</button>
					)}
				</div>
			)}

			{open && <CardDetail o={o} m={m} openSheet={openSheet} />}
		</article>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-2">
			<h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
				{title}
			</h3>
			{children}
		</section>
	);
}

function CardDetail({
	o,
	m,
	openSheet,
}: {
	o: Order;
	m: OrdersModel;
	openSheet: (k: "switch" | "cancel") => void;
}) {
	const invs = o.invoices
		.map((id) => m.invoices[id])
		.filter((i): i is Invoice => Boolean(i));
	const zone = zoneOf(o.fulfilment.zoneId);
	const ended = o.status === "Cancelled" || o.status === "Forfeited";
	const orderedFromSupplier = Boolean(
		o.window?.stages.find((s) => s.stage === "Ordered from supplier")?.at,
	);
	const shortfall = arrivedCount(o) < unitCount(o);

	return (
		<div className="grid gap-5 border-border border-t bg-(--em-purple-soft)/40 p-4">
			{/* Pickup code */}
			{o.status === "Ready for handover" &&
				o.fulfilment.method === "pickup" &&
				o.pickupCode && (
					<div className="rounded-xl bg-(--em-purple) p-4 text-center text-white">
						<p className="text-white/70 text-xs">
							Show this at the pickup point
						</p>
						<p className="my-1 font-mono font-semibold text-4xl tracking-[0.3em]">
							{o.pickupCode}
						</p>
						<p className="text-white/70 text-xs">
							{PICKUP_POINT.address} · {PICKUP_POINT.hours}
						</p>
						<button
							type="button"
							onClick={() => stub("resend the Pickup Code by SMS")}
							className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs"
						>
							<MessageSquare className="size-3.5" /> Resend by SMS
						</button>
					</div>
				)}

			{/* Order Window stages */}
			{o.window && (
				<Section
					title={`${o.window.name} · closes ${dateLabel(o.window.closes)}`}
				>
					<ol className="grid gap-0">
						{o.window.stages.map((s, i) => {
							const reached = Boolean(s.at);
							const last = i === (o.window?.stages.length ?? 0) - 1;
							return (
								<li key={s.stage} className="flex gap-3">
									<div className="flex flex-col items-center">
										<span
											className={`mt-1 size-2.5 rounded-full ${reached ? "bg-(--em-purple)" : "border-2 border-border bg-white"}`}
										/>
										{!last && <span className="w-px flex-1 bg-border" />}
									</div>
									<div className="pb-3 text-sm">
										<p
											className={
												reached ? "font-medium" : "text-muted-foreground"
											}
										>
											{s.stage}{" "}
											<span className="font-normal text-muted-foreground text-xs">
												{s.at
													? dateLabel(s.at)
													: s.expected
														? `expected ${s.expected}`
														: ""}
											</span>
										</p>
										{s.note && (
											<p className="mt-1 rounded-md bg-(--em-gold-soft) px-2 py-1 text-(--em-gold-ink) text-xs">
												Staff: {s.note}
											</p>
										)}
									</div>
								</li>
							);
						})}
					</ol>
					{o.window.shippingFeePerUnit !== undefined && (
						<p className="text-muted-foreground text-xs">
							Shipping Fee {o.window.shippingConfirmed ? "" : "estimate "}
							{cedi(o.window.shippingFeePerUnit)} per unit, invoiced when your
							goods arrive.
						</p>
					)}
				</Section>
			)}

			{/* Items */}
			<Section title="Items">
				{o.lines.map((l) => {
					const p = findProduct(l.slug);
					const short = l.arrived !== undefined && l.arrived < l.qty;
					return (
						<div key={l.sku} className="flex items-center gap-3">
							{p ? (
								<Shot
									product={p}
									label={false}
									className="size-12 shrink-0 rounded-md"
								/>
							) : (
								<div className="size-12 shrink-0 rounded-md bg-muted" />
							)}
							<div className="min-w-0 flex-1 text-sm">
								<p className="truncate font-medium">{l.name}</p>
								<p className="text-muted-foreground text-xs">
									{l.label ? `${l.label} · ` : ""}
									{l.qty} × {cedi(l.unit)}
								</p>
								{short && (
									<p className="font-medium text-red-600 text-xs">
										Only {l.arrived} of {l.qty} arrived
									</p>
								)}
							</div>
							<span className="text-sm tabular-nums">
								{cedi(l.qty * l.unit)}
							</span>
						</div>
					);
				})}
				<p className="flex justify-between border-border border-t pt-2 text-sm">
					<span className="text-muted-foreground">
						{o.kind === "pre" ? "Item Payment" : "Paid"} · Receipt {o.receiptNo}
					</span>
					<span className="font-semibold tabular-nums">
						{cedi(itemsTotal(o))}
					</span>
				</p>
				{shortfall && (
					<p className="text-muted-foreground text-xs">
						{arrivedCount(o)} of {unitCount(o)} units arrived. Missing units are
						refunded (see Refunds).
					</p>
				)}
			</Section>

			{/* Invoices */}
			{invs.length > 0 && (
				<Section title="Invoices">
					{invs.map((inv) => (
						<div
							key={inv.id}
							className={`rounded-lg border bg-white p-3 text-sm ${inv.state === "voided" ? "border-dashed opacity-60" : "border-border"}`}
						>
							<div className="flex items-center justify-between">
								<p
									className={`font-medium ${inv.state === "voided" ? "line-through" : ""}`}
								>
									{inv.id} ·{" "}
									{inv.kind === "shipping" ? "Shipping Fee" : "Delivery Fee"}
								</p>
								<span
									className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${
										inv.state === "paid"
											? "bg-emerald-50 text-emerald-700"
											: inv.state === "unpaid"
												? "bg-(--em-gold-soft) text-(--em-gold-ink)"
												: "bg-muted text-muted-foreground"
									}`}
								>
									{inv.state === "paid"
										? "Paid"
										: inv.state === "unpaid"
											? "Unpaid"
											: "Superseded"}
								</span>
							</div>
							{inv.rows.map((r) => (
								<p
									key={r.label}
									className="flex justify-between text-muted-foreground text-xs"
								>
									<span>
										{r.label}
										{r.detail ? ` · ${r.detail}` : ""}
									</span>
									<span className="tabular-nums">{cedi(r.amount)}</span>
								</p>
							))}
							<p className="mt-1 flex justify-between font-semibold text-xs">
								<span>Total</span>
								<span className="tabular-nums">{cedi(sumRows(inv))}</span>
							</p>
							{inv.state === "voided" && (
								<p className="mt-1 text-muted-foreground text-xs">
									{inv.voidReason}
									{inv.replacedBy ? ` Replaced by ${inv.replacedBy}.` : ""}
								</p>
							)}
							{inv.state === "paid" && (
								<p className="mt-1 text-muted-foreground text-xs">
									Paid {inv.paidAt ? dateLabel(inv.paidAt) : ""} · Receipt{" "}
									{inv.receiptNo}
								</p>
							)}
							{inv.state === "unpaid" && (
								<Link
									href={payHref(inv.id)}
									className="mt-2 flex h-9 items-center justify-center rounded-md bg-(--em-purple) font-semibold text-white text-xs"
								>
									Pay {cedi(sumRows(inv))} · due {dateLabel(inv.due)}
								</Link>
							)}
						</div>
					))}
				</Section>
			)}

			{/* Refunds */}
			{o.refunds.length > 0 && (
				<Section title="Refunds">
					{o.refunds.map((r) => (
						<div
							key={r.id}
							className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white p-3 text-sm"
						>
							<div>
								<p className="font-medium">
									{r.state === "pending" ? "Refund pending" : "Refunded"}
								</p>
								<p className="text-muted-foreground text-xs">{r.reason}</p>
								<p className="text-muted-foreground text-xs">
									{r.id} · {dateLabel(r.at)}
									{r.state === "pending"
										? " · Staff send it, usually 1–3 days"
										: ""}
								</p>
							</div>
							<span
								className={`shrink-0 font-semibold tabular-nums ${r.state === "refunded" ? "text-emerald-700" : "text-(--em-gold-ink)"}`}
							>
								{cedi(r.amount)}
							</span>
						</div>
					))}
				</Section>
			)}

			{/* Fulfilment */}
			<Section title="How you get it">
				<div className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-sm">
					{o.fulfilment.method === "pickup" ? (
						<MapPin className="mt-0.5 size-4 text-(--em-purple)" />
					) : (
						<Truck className="mt-0.5 size-4 text-(--em-purple)" />
					)}
					<div className="flex-1">
						{o.fulfilment.method === "pickup" ? (
							<>
								<p className="font-medium">Pickup · {PICKUP_POINT.name}</p>
								<p className="text-muted-foreground text-xs">
									{PICKUP_POINT.address}
								</p>
							</>
						) : (
							<>
								<p className="font-medium">
									Delivery · {zone?.name}{" "}
									<span className="font-normal text-muted-foreground">
										{o.fulfilment.deliveryFee !== undefined
											? cedi(o.fulfilment.deliveryFee)
											: "fee quoted by SMS"}
									</span>
								</p>
								<p className="text-muted-foreground text-xs">
									{o.fulfilment.address}
								</p>
							</>
						)}
					</div>
				</div>
				{canSwitch(o) ? (
					<button
						type="button"
						onClick={() => openSheet("switch")}
						className="h-10 rounded-md border border-(--em-purple) font-medium text-(--em-purple) text-sm"
					>
						Change pickup / delivery
					</button>
				) : (
					!ended && (
						<p className="text-muted-foreground text-xs">
							Can't change any more: this order has been{" "}
							{o.status.toLowerCase()}.
						</p>
					)
				)}
			</Section>

			{/* Cancel */}
			{canSelfCancel(o) ? (
				<button
					type="button"
					onClick={() => openSheet("cancel")}
					className="justify-self-start text-red-600 text-sm underline underline-offset-2"
				>
					Cancel this Pre-order (full refund)
				</button>
			) : (
				o.kind === "pre" &&
				!isPast(o) &&
				orderedFromSupplier && (
					<p className="text-muted-foreground text-xs">
						We've ordered this from the supplier, so it can't be cancelled here.
						Need to cancel?{" "}
						<button
							type="button"
							onClick={() => stub("open WhatsApp chat with Emblish")}
							className="text-(--em-purple) underline"
						>
							Contact us
						</button>
					</p>
				)
			)}

			{/* History */}
			<Section
				title={`History · placed ${dateLabel(o.placed)} · Receipt ${o.receiptNo}`}
			>
				<ul className="grid gap-1.5">
					{[...o.history].reverse().map((h, i) => (
						<li key={`${h.at}-${h.text}`} className="flex gap-3 text-xs">
							<span className="w-12 shrink-0 text-muted-foreground tabular-nums">
								{dateLabel(h.at)}
							</span>
							<span>{h.text}</span>
						</li>
					))}
				</ul>
			</Section>
		</div>
	);
}

// ---------- bottom sheets ----------

function BottomSheet({
	title,
	close,
	children,
	footer,
}: {
	title: string;
	close: () => void;
	children: React.ReactNode;
	footer: React.ReactNode;
}) {
	return (
		<div className="fixed inset-0 z-[100] flex items-end justify-center">
			<button
				type="button"
				aria-label="Close"
				onClick={close}
				className="absolute inset-0 bg-black/40"
			/>
			<div className="slide-in-from-bottom relative flex max-h-[88dvh] w-full max-w-md animate-in flex-col rounded-t-2xl bg-white shadow-2xl duration-200">
				<div className="flex items-center justify-between px-4 pt-3 pb-2">
					<span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-border" />
				</div>
				<div className="flex items-center justify-between px-4 pb-3">
					<h2 className="display font-semibold text-(--em-purple) text-lg">
						{title}
					</h2>
					<button type="button" onClick={close} aria-label="Close">
						<X className="size-5 text-muted-foreground" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
				<div className="border-border border-t bg-white px-4 pt-3 pb-4">
					{footer}
				</div>
			</div>
		</div>
	);
}

function SwitchSheet({
	o,
	m,
	close,
}: {
	o: Order;
	m: OrdersModel;
	close: () => void;
}) {
	const [method, setMethod] = useState<Method>(o.fulfilment.method);
	const [zoneId, setZoneId] = useState<string | undefined>(o.fulfilment.zoneId);
	const [address, setAddress] = useState(o.fulfilment.address ?? "");

	const effZone = method === "delivery" ? zoneId : undefined;
	const fx =
		method === "delivery" && !zoneId
			? null
			: switchEffect(o, m.invoices, method, effZone);
	const unchanged =
		method === o.fulfilment.method &&
		(method === "pickup" ||
			(zoneId === o.fulfilment.zoneId &&
				address === (o.fulfilment.address ?? "")));
	const ok =
		!unchanged &&
		(method === "pickup" || (Boolean(zoneId) && address.trim().length > 3));

	const confirm = () => {
		m.switchFulfilment(
			o.id,
			method,
			effZone,
			method === "delivery" ? address : undefined,
		);
		toast.success(
			method === "pickup"
				? `${o.id} switched to Pickup`
				: `${o.id} will be delivered to ${zoneOf(zoneId)?.name}`,
		);
		close();
	};

	return (
		<BottomSheet
			title={`Change how you get ${o.id}`}
			close={close}
			footer={
				<div className="grid gap-3">
					<div
						className={`rounded-lg p-3 text-sm ${
							!fx
								? "bg-muted text-muted-foreground"
								: fx.diff > 0
									? "bg-(--em-gold-soft) text-(--em-gold-ink)"
									: fx.diff < 0
										? "bg-emerald-50 text-emerald-800"
										: "bg-(--em-purple-soft) text-(--em-purple)"
						}`}
					>
						{fx ? (
							<>
								<p className="font-semibold">{fx.headline}</p>
								<p className="mt-0.5 text-xs opacity-90">{fx.detail}</p>
							</>
						) : (
							<p>Pick a Delivery Zone to see what changes.</p>
						)}
					</div>
					<button
						type="button"
						disabled={!ok}
						onClick={confirm}
						className="h-12 rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
					>
						{unchanged ? "No changes yet" : "Confirm change"}
					</button>
				</div>
			}
		>
			<div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
				{(["pickup", "delivery"] as const).map((k) => (
					<button
						key={k}
						type="button"
						onClick={() => setMethod(k)}
						className={`flex h-10 items-center justify-center gap-1.5 rounded-md font-medium text-sm ${
							method === k
								? "bg-white text-(--em-purple) shadow-sm"
								: "text-muted-foreground"
						}`}
					>
						{k === "pickup" ? (
							<Package className="size-4" />
						) : (
							<Truck className="size-4" />
						)}
						{k === "pickup" ? "Pickup" : "Delivery"}
					</button>
				))}
			</div>

			{method === "pickup" ? (
				<div className="mt-4 rounded-lg border border-border p-3 text-sm">
					<p className="font-medium">{PICKUP_POINT.name}</p>
					<p className="text-muted-foreground text-xs">
						{PICKUP_POINT.address} · {PICKUP_POINT.hours}
					</p>
					<p className="mt-2 text-xs">
						Free. We text a Pickup Code when it's ready.{" "}
						{o.fulfilment.method === "delivery" && o.fulfilment.deliveryFee
							? `Saves ${cedi(o.fulfilment.deliveryFee)} Delivery Fee.`
							: ""}
					</p>
				</div>
			) : (
				<div className="mt-4 grid gap-4">
					<div className="grid gap-1.5" role="radiogroup">
						{ZONES.map((z) => {
							const d = switchEffect(o, m.invoices, "delivery", z.id);
							const sel = zoneId === z.id;
							const current =
								o.fulfilment.method === "delivery" &&
								o.fulfilment.zoneId === z.id;
							return (
								<button
									key={z.id}
									type="button"
									aria-pressed={sel}
									onClick={() => setZoneId(z.id)}
									className={`flex items-center gap-3 rounded-lg border p-3 text-left ${
										sel
											? "border-(--em-purple) bg-(--em-purple-soft)"
											: "border-border"
									}`}
								>
									<span
										className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${sel ? "border-(--em-purple)" : "border-border"}`}
									>
										{sel && (
											<span className="size-2 rounded-full bg-(--em-purple)" />
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block font-medium text-sm">
											{z.name}
											{current && (
												<span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-normal text-[10px] text-muted-foreground">
													current
												</span>
											)}
										</span>
										<span className="block truncate text-muted-foreground text-xs">
											{z.areas}
										</span>
									</span>
									<span className="shrink-0 text-right">
										<span className="block text-sm tabular-nums">
											{z.fee !== undefined ? cedi(z.fee) : "Quote"}
										</span>
										<span
											className={`block text-[11px] tabular-nums ${
												d.kind === "quote"
													? "text-muted-foreground"
													: d.diff > 0
														? "text-(--em-gold-ink)"
														: d.diff < 0
															? "text-emerald-700"
															: "text-muted-foreground"
											}`}
										>
											{d.kind === "quote" ? "quote" : signed(d.diff)}
										</span>
									</span>
								</button>
							);
						})}
					</div>
					<Labeled label="Delivery address" hint="area, street and a landmark">
						<input
							className={field}
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder="e.g. Ring Rd, Osu · opp. the Total station"
						/>
					</Labeled>
				</div>
			)}
		</BottomSheet>
	);
}

function CancelSheet({
	o,
	m,
	close,
}: {
	o: Order;
	m: OrdersModel;
	close: () => void;
}) {
	return (
		<BottomSheet
			title={`Cancel ${o.id}?`}
			close={close}
			footer={
				<div className="grid grid-cols-2 gap-2">
					<button
						type="button"
						onClick={close}
						className="h-11 rounded-md border border-border font-medium text-sm"
					>
						Keep order
					</button>
					<button
						type="button"
						onClick={() => {
							m.cancel(o.id);
							toast.success(`${o.id} cancelled · refund pending`);
							close();
						}}
						className="h-11 rounded-md bg-red-600 font-semibold text-sm text-white"
					>
						Cancel & refund
					</button>
				</div>
			}
		>
			<div className="grid gap-3 text-sm">
				<p>
					We haven't ordered this from the supplier yet, so you get a{" "}
					<strong>full refund of {cedi(itemsTotal(o))}</strong>.
				</p>
				<p className="text-muted-foreground text-xs">
					Our Staff send the refund to the mobile money or card you paid with.
					It shows as "refund pending" on this order until it lands, usually 1–3
					days.
				</p>
			</div>
		</BottomSheet>
	);
}
