"use client";
// PROTOTYPE (wayfinder #14) — My orders A: "Inbox + order page".
// The list works like an inbox, grouped into "Needs you" (something to pay or a Pickup Code to show),
// "On the way" (other active orders) and "Past". Rows are compact: thumbnail, id + kind, products,
// status pill and a one-line next step. Tapping a row opens a full-screen order page: big status,
// a vertical stepper (Order Window stages, then handover), Pickup Code, Invoices, Refunds,
// "How you get it" with an inline Change form that explains the money effect before confirming,
// self-cancel, items + Receipt no., and the history log.

import {
	AlertTriangle,
	ArrowLeft,
	Check,
	ChevronRight,
	Circle,
	MessageSquare,
	Package,
	Store,
	Truck,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { cedi, findProduct } from "../_data";
import { Shot, stub } from "../_shared";
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
	type Order,
	type OrderStatus,
	type OrdersModel,
	sumRows,
	switchEffect,
	unitCount,
	useOrders,
	WINDOW_STAGES,
	zoneOf,
} from "./_orders-data";
import { OrdersScenarioPanel, SignInGate } from "./_orders-shared";

type Invoices = OrdersModel["invoices"];

const kindLabel = (o: Order) =>
	o.kind === "store" ? "Store Order" : "Pre-order";

const payHref = (id: string) =>
	`/prototype/storefront/pay/${id}?variant=A` as Route;

const PILL: Record<OrderStatus, string> = {
	"Awaiting arrival": "bg-(--em-purple-soft) text-(--em-purple)",
	"Shipping Fee due": "bg-(--em-gold-soft) text-(--em-gold-ink)",
	"Delivery Fee due": "bg-(--em-gold-soft) text-(--em-gold-ink)",
	"Ready for handover": "bg-emerald-50 text-emerald-700",
	Dispatched: "bg-sky-50 text-sky-700",
	Collected: "bg-muted text-muted-foreground",
	Delivered: "bg-muted text-muted-foreground",
	Cancelled: "bg-muted text-muted-foreground",
	Forfeited: "bg-red-50 text-red-700",
};

function statusText(o: Order) {
	if (o.status === "Ready for handover")
		return o.fulfilment.method === "pickup"
			? "Ready for pickup"
			: "Ready to dispatch";
	return o.status;
}

function Pill({ o }: { o: Order }) {
	return (
		<span
			className={`shrink-0 rounded-full px-2 py-0.5 font-semibold text-[11px] ${PILL[o.status]}`}
		>
			{statusText(o)}
		</span>
	);
}

/** One-line "what happens next" for the list row. */
function nextStep(o: Order, invoices: Invoices): string {
	const a = nextAction(o, invoices);
	if (a?.kind === "pay") {
		const d = daysUntil(a.invoice.due);
		return `Pay ${cedi(sumRows(a.invoice))} · due ${dateLabel(a.invoice.due)}${d >= 0 ? ` (${d} days)` : ""}`;
	}
	if (a?.kind === "pickup")
		return `Show code ${a.code} at ${PICKUP_POINT.name}`;
	if (o.status === "Awaiting arrival") {
		const cur = currentStage(o);
		const nxt = o.window?.stages.find((s) => !s.at);
		return `${cur?.stage ?? "Open"}${nxt?.expected ? ` · next: ${nxt.stage}, ${nxt.expected}` : ""}`;
	}
	if (o.status === "Ready for handover") return "We'll dispatch it soon";
	if (o.status === "Dispatched") return "On its way to you";
	if (o.status === "Cancelled") {
		const p = o.refunds.find((r) => r.state === "pending");
		return p ? `Refund pending · ${cedi(p.amount)}` : "Refunded";
	}
	return `${o.status} · ${dateLabel(o.history[o.history.length - 1]?.at ?? o.placed)}`;
}

// ---------- list ----------

export function OrdersA() {
	const m = useOrders();
	const [openId, setOpenId] = useState<string | null>(null);
	const open = m.orders.find((o) => o.id === openId);

	if (!m.signedIn)
		return (
			<>
				<SignInGate m={m} />
				<OrdersScenarioPanel m={m} />
			</>
		);

	if (open)
		return (
			<>
				<OrderPage o={open} m={m} onBack={() => setOpenId(null)} />
				<OrdersScenarioPanel m={m} />
			</>
		);

	const needs = m.orders.filter((o) => !isPast(o) && nextAction(o, m.invoices));
	const onWay = m.orders.filter(
		(o) => !isPast(o) && !nextAction(o, m.invoices),
	);
	const past = m.orders.filter(isPast);

	return (
		<div className="mx-auto flex min-h-dvh max-w-md flex-col pb-10">
			<header className="sticky top-0 z-30 bg-(--em-purple) px-4 pt-4 pb-4 text-white">
				<h1 className="display font-semibold text-2xl">My orders</h1>
				<p className="text-white/70 text-xs">
					{needs.length
						? `${needs.length} need${needs.length === 1 ? "s" : ""} you`
						: "Nothing needs you right now"}
				</p>
			</header>
			<Section title="Needs you" accent orders={needs} m={m} open={setOpenId} />
			<Section title="On the way" orders={onWay} m={m} open={setOpenId} />
			<Section title="Past" orders={past} m={m} open={setOpenId} />
		</div>
	);
}

function Section({
	title,
	orders,
	m,
	open,
	accent,
}: {
	title: string;
	orders: Order[];
	m: OrdersModel;
	open: (id: string) => void;
	accent?: boolean;
}) {
	if (!orders.length) return null;
	return (
		<section className="mt-4">
			<h2
				className={`px-4 pb-1.5 font-semibold text-xs uppercase tracking-wide ${accent ? "text-(--em-gold-ink)" : "text-muted-foreground"}`}
			>
				{title} · {orders.length}
			</h2>
			<ul className="divide-y divide-border border-border border-y bg-white">
				{orders.map((o) => (
					<li key={o.id}>
						<Row o={o} m={m} onOpen={() => open(o.id)} />
					</li>
				))}
			</ul>
		</section>
	);
}

function Row({
	o,
	m,
	onOpen,
}: {
	o: Order;
	m: OrdersModel;
	onOpen: () => void;
}) {
	const p = findProduct(o.lines[0].slug);
	const names = [...new Set(o.lines.map((l) => l.name))].join(", ");
	const action = nextAction(o, m.invoices);
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex w-full items-center gap-3 px-4 py-3 text-left"
		>
			{p ? (
				<Shot
					product={p}
					label={false}
					className="size-14 shrink-0 rounded-lg"
				/>
			) : (
				<div className="size-14 shrink-0 rounded-lg bg-muted" />
			)}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="flex-1 truncate font-semibold text-sm">
						{o.id}{" "}
						<span className="font-normal text-muted-foreground">
							· {kindLabel(o)}
						</span>
					</p>
					<Pill o={o} />
				</div>
				<p className="truncate text-muted-foreground text-xs">{names}</p>
				<p
					className={`mt-0.5 truncate text-xs ${action ? "font-semibold text-(--em-purple)" : "text-(--em-ink)"}`}
				>
					{nextStep(o, m.invoices)}
				</p>
			</div>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

// ---------- order page ----------

const RANK: Record<OrderStatus, number> = {
	"Awaiting arrival": 0,
	"Shipping Fee due": 1,
	"Delivery Fee due": 1,
	"Ready for handover": 2,
	Dispatched: 3,
	Collected: 4,
	Delivered: 4,
	Cancelled: -1,
	Forfeited: -1,
};

type Step = {
	label: string;
	done: boolean;
	at?: string;
	expected?: string;
	note?: string;
};

function stepsFor(o: Order, invoices: Invoices): Step[] {
	const r = RANK[o.status];
	const pickup = o.fulfilment.method === "pickup";
	const steps: Step[] = [];
	if (o.window) {
		for (const name of WINDOW_STAGES) {
			const s = o.window.stages.find((x) => x.stage === name);
			steps.push({
				label: name === "Open" ? "Order Window open" : name,
				done: !!s?.at,
				at: s?.at,
				expected: s?.at ? undefined : s?.expected,
				note: s?.note,
			});
		}
		const ship = o.invoices
			.map((id) => invoices[id])
			.find((i) => i?.kind === "shipping" && i.state !== "voided");
		steps.push({
			label: pickup ? "Shipping Fee paid" : "Shipping + Delivery Fee paid",
			done: ship?.state === "paid" || r >= 2,
			at: ship?.paidAt,
			expected:
				ship?.state === "unpaid" ? `due ${dateLabel(ship.due)}` : undefined,
		});
	} else {
		steps.push({ label: "Paid", done: true, at: o.placed });
	}
	if (
		o.status === "Delivery Fee due" ||
		o.invoices.some((id) => invoices[id]?.kind === "delivery")
	)
		steps.push({
			label: "Delivery Fee paid",
			done: r >= 2,
		});
	steps.push({
		label: pickup ? "Ready for pickup" : "Ready to dispatch",
		done: r >= 2,
	});
	if (!pickup) steps.push({ label: "Dispatched", done: r >= 3 });
	steps.push({ label: pickup ? "Collected" : "Delivered", done: r >= 4 });
	return steps;
}

function OrderPage({
	o,
	m,
	onBack,
}: {
	o: Order;
	m: OrdersModel;
	onBack: () => void;
}) {
	const action = nextAction(o, m.invoices);
	const invs = o.invoices.map((id) => m.invoices[id]).filter(Boolean);
	const shortfall = o.lines.filter(
		(l) => l.arrived !== undefined && l.arrived < l.qty,
	);
	const cur = currentStage(o);
	const ended = o.status === "Cancelled" || o.status === "Forfeited";

	return (
		<div className="mx-auto flex min-h-dvh max-w-md flex-col pb-16">
			<header className="sticky top-0 z-30 flex items-center gap-3 bg-(--em-purple) px-4 py-3 text-white">
				<button type="button" onClick={onBack} aria-label="Back to my orders">
					<ArrowLeft className="size-5" />
				</button>
				<div className="flex-1">
					<p className="font-semibold">{o.id}</p>
					<p className="text-white/70 text-xs">
						{kindLabel(o)} · placed {dateLabel(o.placed)}
					</p>
				</div>
			</header>

			{/* big status block */}
			<div className="bg-(--em-purple) px-4 pb-6 text-white">
				<p className="text-(--em-gold-bright) text-xs uppercase tracking-wide">
					Status
				</p>
				<p className="display font-semibold text-3xl">{statusText(o)}</p>
				<p className="mt-1 text-sm text-white/80">
					{o.status === "Awaiting arrival" && cur
						? `${o.window?.name}: ${cur.stage}${cur.note ? `. ${cur.note}` : ""}`
						: nextStep(o, m.invoices)}
				</p>
				{action?.kind === "pay" && (
					<Link
						href={payHref(action.invoice.id)}
						className="mt-4 flex h-12 items-center justify-center rounded-md bg-(--em-gold) font-semibold text-(--em-purple-deep)"
					>
						Pay {cedi(sumRows(action.invoice))}
					</Link>
				)}
			</div>

			<div className="grid gap-6 px-4 pt-5">
				{action?.kind === "pickup" && <PickupCard code={action.code} />}

				{shortfall.length > 0 && (
					<div className="flex gap-2 rounded-lg border border-(--em-gold) bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-sm">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" />
						<div>
							<p className="font-semibold">
								{arrivedCount(o)} of {unitCount(o)} units arrived
							</p>
							{shortfall.map((l) => (
								<p key={l.sku} className="text-xs">
									{l.qty - (l.arrived ?? 0)} × {l.name} ({l.label}) didn't
									arrive. You're refunded for it, and you only pay Shipping Fee
									on what arrived.
								</p>
							))}
						</div>
					</div>
				)}

				{!ended && (
					<Block title="Tracking">
						<Stepper steps={stepsFor(o, m.invoices)} />
					</Block>
				)}

				{invs.length > 0 && (
					<Block title="Invoices">
						<div className="grid gap-3">
							{[...invs].reverse().map((i) => (
								<InvoiceCard key={i.id} i={i} />
							))}
						</div>
					</Block>
				)}

				{o.refunds.length > 0 && (
					<Block title="Refunds">
						<ul className="grid gap-2">
							{o.refunds.map((r) => (
								<li
									key={r.id}
									className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-sm"
								>
									<div className="flex-1">
										<p className="font-semibold">{cedi(r.amount)}</p>
										<p className="text-muted-foreground text-xs">{r.reason}</p>
										<p className="text-muted-foreground text-xs">
											{r.state === "pending"
												? "Staff send it to the mobile money or card you paid with · usually 1–3 days"
												: `Sent ${dateLabel(r.at)}`}
										</p>
									</div>
									<span
										className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${r.state === "pending" ? "bg-(--em-gold-soft) text-(--em-gold-ink)" : "bg-emerald-50 text-emerald-700"}`}
									>
										{r.state === "pending" ? "Refund pending" : "Refunded"}
									</span>
								</li>
							))}
						</ul>
					</Block>
				)}

				{!ended && <HowYouGetIt o={o} m={m} />}

				{o.kind === "pre" && !ended && <CancelBlock o={o} m={m} />}

				<Block title="Items">
					<ul className="divide-y divide-border rounded-lg border border-border bg-white">
						{o.lines.map((l) => {
							const p = findProduct(l.slug);
							return (
								<li key={l.sku} className="flex items-center gap-3 p-3 text-sm">
									{p && (
										<Shot
											product={p}
											label={false}
											className="size-11 shrink-0 rounded-md"
										/>
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{l.name}</p>
										<p className="text-muted-foreground text-xs">
											{l.label ? `${l.label} · ` : ""}
											{l.qty} × {cedi(l.unit)}
											{l.arrived !== undefined && l.arrived < l.qty
												? ` · ${l.arrived} arrived`
												: ""}
										</p>
									</div>
									<span className="tabular-nums">{cedi(l.unit * l.qty)}</span>
								</li>
							);
						})}
						<li className="flex justify-between p-3 font-semibold text-sm">
							<span>{o.kind === "pre" ? "Item Payment" : "Items"}</span>
							<span className="tabular-nums">{cedi(itemsTotal(o))}</span>
						</li>
					</ul>
					<p className="mt-1.5 text-muted-foreground text-xs">
						Receipt no. {o.receiptNo}
					</p>
				</Block>

				<Block title="History">
					<ol className="grid gap-2 border-border border-l-2 pl-4">
						{[...o.history].reverse().map((h, n) => (
							<li key={`${h.at}-${h.text}`} className="text-sm">
								<span className="mr-2 text-muted-foreground text-xs tabular-nums">
									{dateLabel(h.at)}
								</span>
								{h.text}
							</li>
						))}
					</ol>
				</Block>
			</div>
		</div>
	);
}

function Block({
	title,
	children,
	action,
}: {
	title: string;
	children: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<section>
			<div className="mb-2 flex items-center justify-between">
				<h2 className="font-semibold text-(--em-purple) text-sm uppercase tracking-wide">
					{title}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
}

function Stepper({ steps }: { steps: Step[] }) {
	const firstOpen = steps.findIndex((s) => !s.done);
	return (
		<ol>
			{steps.map((s, n) => {
				const now = n === firstOpen;
				return (
					<li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
						{n < steps.length - 1 && (
							<span
								className={`absolute top-6 left-[11px] h-[calc(100%-20px)] w-0.5 ${s.done ? "bg-(--em-purple)" : "bg-border"}`}
							/>
						)}
						<span
							className={`z-10 grid size-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-(--em-purple) text-white" : now ? "border-(--em-gold) border-2 bg-white" : "border-2 border-border bg-white"}`}
						>
							{s.done ? (
								<Check className="size-3.5" />
							) : now ? (
								<Circle className="size-2 fill-(--em-gold) text-(--em-gold)" />
							) : null}
						</span>
						<div className="min-w-0 flex-1 pt-0.5">
							<div className="flex items-baseline justify-between gap-2">
								<p
									className={`text-sm ${s.done || now ? "font-semibold" : "text-muted-foreground"}`}
								>
									{s.label}
								</p>
								<span className="shrink-0 text-muted-foreground text-xs">
									{s.at
										? dateLabel(s.at)
										: s.expected
											? `expected ${s.expected.replace(/^Arrives /, "")}`
											: ""}
								</span>
							</div>
							{s.note && (
								<p className="mt-1 flex gap-1.5 rounded-md bg-(--em-purple-soft) px-2 py-1.5 text-(--em-purple) text-xs">
									<MessageSquare className="mt-0.5 size-3 shrink-0" />
									<span>
										<span className="font-semibold">Emblish:</span> {s.note}
									</span>
								</p>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}

function PickupCard({ code }: { code: string }) {
	return (
		<div className="rounded-xl border-(--em-gold) border-2 bg-(--em-gold-soft) p-4 text-center">
			<p className="font-semibold text-(--em-gold-ink) text-xs uppercase tracking-wide">
				Your Pickup Code
			</p>
			<p className="my-2 font-mono font-semibold text-(--em-purple-deep) text-6xl tracking-[0.25em]">
				{code}
			</p>
			<p className="text-(--em-ink) text-sm">
				Show this at {PICKUP_POINT.name}
			</p>
			<p className="text-muted-foreground text-xs">
				{PICKUP_POINT.address} · {PICKUP_POINT.hours}
			</p>
			<button
				type="button"
				onClick={() => stub("resend the Pickup Code by SMS")}
				className="mt-3 font-semibold text-(--em-purple) text-sm underline"
			>
				Resend by SMS
			</button>
		</div>
	);
}

function InvoiceCard({ i }: { i: Invoice }) {
	const voided = i.state === "voided";
	const d = daysUntil(i.due);
	return (
		<div
			className={`rounded-lg border bg-white p-3 text-sm ${voided ? "border-border border-dashed opacity-60" : i.state === "unpaid" ? "border-(--em-gold)" : "border-border"}`}
		>
			<div className="flex items-center justify-between">
				<p className={`font-semibold ${voided ? "line-through" : ""}`}>
					{i.id} ·{" "}
					{i.kind === "shipping"
						? "Shipping Fee Invoice"
						: "Delivery Fee Invoice"}
				</p>
				<span
					className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${i.state === "unpaid" ? "bg-(--em-gold-soft) text-(--em-gold-ink)" : i.state === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
				>
					{i.state === "unpaid"
						? "Unpaid"
						: i.state === "paid"
							? "Paid"
							: "Superseded"}
				</span>
			</div>
			<ul className="mt-2 grid gap-1">
				{i.rows.map((r) => (
					<li key={r.label} className="flex justify-between gap-2 text-xs">
						<span>
							{r.label}
							{r.detail && (
								<span className="text-muted-foreground"> · {r.detail}</span>
							)}
						</span>
						<span className="tabular-nums">{cedi(r.amount)}</span>
					</li>
				))}
			</ul>
			<div className="mt-2 flex justify-between border-border border-t pt-2 font-semibold">
				<span>Total</span>
				<span className="tabular-nums">{cedi(sumRows(i))}</span>
			</div>
			<p className="mt-1 text-muted-foreground text-xs">
				Issued {dateLabel(i.issued)} ·{" "}
				{i.state === "paid"
					? `paid ${dateLabel(i.paidAt ?? i.issued)} · Receipt ${i.receiptNo}`
					: `due ${dateLabel(i.due)}${!voided && d >= 0 ? ` (${d} days left)` : ""}`}
			</p>
			{voided && (
				<p className="mt-1 text-muted-foreground text-xs">
					{i.voidReason}
					{i.replacedBy ? ` Replaced by ${i.replacedBy}.` : ""}
				</p>
			)}
			{i.state === "unpaid" && (
				<>
					{i.kind === "shipping" && (
						<p className="mt-1 text-muted-foreground text-xs">
							Unpaid by the due date, the Pre-order is forfeited.
						</p>
					)}
					<Link
						href={payHref(i.id)}
						className="mt-3 flex h-11 items-center justify-center rounded-md bg-(--em-purple) font-semibold text-sm text-white"
					>
						Pay {cedi(sumRows(i))}
					</Link>
				</>
			)}
		</div>
	);
}

// ---------- how you get it + change ----------

const SAMPLE_ADDRESS = "Ring Rd East, Osu · opp. Danquah Circle Total";

function HowYouGetIt({ o, m }: { o: Order; m: OrdersModel }) {
	const [editing, setEditing] = useState(false);
	const [method, setMethod] = useState<Method>(o.fulfilment.method);
	const [zoneId, setZoneId] = useState<string | undefined>(o.fulfilment.zoneId);
	const [address, setAddress] = useState(o.fulfilment.address ?? "");
	const f = o.fulfilment;
	const zone = zoneOf(f.zoneId);

	const changed =
		method !== f.method ||
		(method === "delivery" &&
			(zoneId !== f.zoneId || address !== (f.address ?? "")));
	const ready = method === "pickup" || (!!zoneId && address.trim().length > 3);
	const fx =
		changed && ready ? switchEffect(o, m.invoices, method, zoneId) : null;

	const startEdit = () => {
		setMethod(f.method);
		setZoneId(f.zoneId);
		setAddress(f.address ?? "");
		setEditing(true);
	};

	return (
		<Block
			title="How you get it"
			action={
				canSwitch(o) && !editing ? (
					<button
						type="button"
						onClick={startEdit}
						className="font-semibold text-(--em-purple) text-sm underline"
					>
						Change
					</button>
				) : undefined
			}
		>
			<div className="flex gap-3 rounded-lg border border-border bg-white p-3 text-sm">
				{f.method === "pickup" ? (
					<Store className="mt-0.5 size-5 shrink-0 text-(--em-purple)" />
				) : (
					<Truck className="mt-0.5 size-5 shrink-0 text-(--em-purple)" />
				)}
				<div className="flex-1">
					{f.method === "pickup" ? (
						<>
							<p className="font-semibold">Pickup · free</p>
							<p className="text-muted-foreground text-xs">
								{PICKUP_POINT.name}, {PICKUP_POINT.address}
							</p>
						</>
					) : (
						<>
							<p className="font-semibold">
								Delivery · {zone?.name}{" "}
								<span className="font-normal text-muted-foreground">
									·{" "}
									{f.deliveryFee !== undefined
										? cedi(f.deliveryFee)
										: "fee quoted by SMS"}
								</span>
							</p>
							<p className="text-muted-foreground text-xs">{f.address}</p>
						</>
					)}
				</div>
			</div>
			{!canSwitch(o) && (
				<p className="mt-1.5 text-muted-foreground text-xs">
					It's on its way, so this can't change now.
				</p>
			)}

			{editing && (
				<div className="mt-3 grid gap-3 rounded-lg border border-(--em-purple)/30 bg-(--em-purple-soft)/50 p-3">
					<div className="grid grid-cols-2 gap-2">
						{(["pickup", "delivery"] as const).map((k) => (
							<button
								key={k}
								type="button"
								onClick={() => setMethod(k)}
								className={`flex h-11 items-center justify-center gap-1.5 rounded-md border font-semibold text-sm ${method === k ? "border-(--em-purple) bg-(--em-purple) text-white" : "border-border bg-white"}`}
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

					{method === "delivery" && (
						<>
							<div className="grid gap-1.5">
								<p className="font-medium text-xs">Delivery Zone</p>
								{ZONES.map((z) => (
									<label
										key={z.id}
										className={`flex cursor-pointer items-start gap-2 rounded-md border bg-white p-2.5 text-sm ${zoneId === z.id ? "border-(--em-purple)" : "border-border"}`}
									>
										<input
											type="radio"
											name={`zone-${o.id}`}
											checked={zoneId === z.id}
											onChange={() => setZoneId(z.id)}
											className="mt-1 accent-(--em-purple)"
										/>
										<span className="flex-1">
											<span className="font-medium">{z.name}</span>
											<span className="block text-muted-foreground text-xs">
												{z.areas}
											</span>
										</span>
										<span className="text-xs tabular-nums">
											{z.fee !== undefined ? cedi(z.fee) : "quote"}
										</span>
									</label>
								))}
							</div>
							<Labeled label="Address" hint="area, street, landmark">
								<input
									className={field}
									value={address}
									onChange={(e) => setAddress(e.target.value)}
									placeholder="e.g. Osu, Oxford St · opp. the bank"
								/>
							</Labeled>
							<button
								type="button"
								onClick={() => setAddress(SAMPLE_ADDRESS)}
								className="justify-self-start text-fuchsia-600 text-xs underline"
							>
								prototype: fill sample
							</button>
						</>
					)}

					{fx && (
						<div
							className={`rounded-md border p-3 text-sm ${fx.diff > 0 || fx.kind === "quote" ? "border-(--em-gold) bg-(--em-gold-soft) text-(--em-gold-ink)" : fx.diff < 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-border bg-white"}`}
						>
							<p className="font-semibold">{fx.headline}</p>
							<p className="mt-0.5 text-xs">{fx.detail}</p>
						</div>
					)}
					{!changed && (
						<p className="text-muted-foreground text-xs">
							Pick a different method, zone or address.
						</p>
					)}

					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setEditing(false)}
							className="h-11 flex-1 rounded-md border border-border bg-white font-semibold text-sm"
						>
							Keep as is
						</button>
						<button
							type="button"
							disabled={!fx}
							onClick={() => {
								m.switchFulfilment(
									o.id,
									method,
									method === "delivery" ? zoneId : undefined,
									method === "delivery" ? address : undefined,
								);
								setEditing(false);
							}}
							className="h-11 flex-1 rounded-md bg-(--em-purple) font-semibold text-sm text-white disabled:opacity-40"
						>
							Confirm change
						</button>
					</div>
				</div>
			)}
		</Block>
	);
}

// ---------- cancel ----------

function CancelBlock({ o, m }: { o: Order; m: OrdersModel }) {
	const [confirming, setConfirming] = useState(false);
	if (!canSelfCancel(o))
		return (
			<p className="text-muted-foreground text-xs">
				We've ordered this from the supplier, so it can't be cancelled here.
				Need to cancel?{" "}
				<button
					type="button"
					onClick={() => stub("open WhatsApp to contact Emblish")}
					className="font-semibold text-(--em-purple) underline"
				>
					Contact us
				</button>
			</p>
		);
	if (!confirming)
		return (
			<button
				type="button"
				onClick={() => setConfirming(true)}
				className="justify-self-start text-red-700 text-sm underline"
			>
				Cancel this Pre-order
			</button>
		);
	return (
		<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
			<p className="font-semibold text-red-800">Cancel {o.id}?</p>
			<p className="mt-1 text-red-800/80 text-xs">
				You get a full refund of {cedi(itemsTotal(o))}. Staff send it to the
				mobile money or card you paid with; it shows as "refund pending" until
				it lands (usually 1–3 days). You can cancel for free until we order from
				the supplier.
			</p>
			<div className="mt-3 flex gap-2">
				<button
					type="button"
					onClick={() => setConfirming(false)}
					className="h-10 flex-1 rounded-md border border-border bg-white font-semibold text-sm"
				>
					Keep it
				</button>
				<button
					type="button"
					onClick={() => m.cancel(o.id)}
					className="h-10 flex-1 rounded-md bg-red-700 font-semibold text-sm text-white"
				>
					Cancel & refund
				</button>
			</div>
		</div>
	);
}
