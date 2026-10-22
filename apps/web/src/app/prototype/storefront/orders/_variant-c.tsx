"use client";
// PROTOTYPE (wayfinder #14) — My orders C: "To-do first + journey sheet". A purple hero greets the
// Customer and counts what needs them; a swipeable carousel of big TO-DO cards (pay this invoice,
// show this Pickup Code) sits right under it. Below, Active / Past tabs over a dense table-like list
// (no images). Tapping a row opens a tall bottom sheet showing the order as a journey: a vertical
// route of stage circles (current one pulsing, future ones greyed with expected dates), a running
// money ledger (paid / still to pay / coming back), then actions. Switching fulfilment is a 2-step
// flow inside the sheet (choose → before/after comparison); cancelling is a confirm step there too.

import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronRight,
	Clock,
	MapPin,
	MessageSquare,
	Package,
	Store,
	Truck,
	X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { cedi } from "../_data";
import { StoreHeader, stub } from "../_shared";
import { PICKUP_POINT, ZONES } from "../checkout/_checkout-data";
import { field, Labeled } from "../checkout/_checkout-shared";
import {
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
	type OrdersModel,
	sumRows,
	switchEffect,
	useOrders,
	WINDOW_STAGES,
	zoneOf,
} from "./_orders-data";
import { OrdersScenarioPanel, SignInGate } from "./_orders-shared";

const payHref = (id: string) =>
	`/prototype/storefront/pay/${id}?variant=C` as Route;

const summary = (o: Order) => {
	const first = o.lines[0];
	const more = o.lines.length - 1;
	return `${first.name}${first.label ? ` · ${first.label}` : ""}${more > 0 ? ` +${more}` : ""}`;
};

const methodLabel = (o: Order) =>
	o.fulfilment.method === "pickup"
		? "Pickup"
		: `Delivery · ${zoneOf(o.fulfilment.zoneId)?.name ?? "—"}`;

/** One line of status text for the dense list. */
function statusText(o: Order, invoices: Record<string, Invoice>) {
	const a = nextAction(o, invoices);
	if (a?.kind === "pay")
		return { text: `Pay ${cedi(sumRows(a.invoice))}`, tone: "due" };
	if (a?.kind === "pickup") return { text: "Ready · show code", tone: "ready" };
	if (o.status === "Awaiting arrival") {
		const st = currentStage(o);
		return { text: st ? st.stage : "Awaiting arrival", tone: "moving" };
	}
	if (o.status === "Cancelled" || o.status === "Forfeited")
		return { text: o.status, tone: "ended" };
	return { text: o.status, tone: isPast(o) ? "ended" : "moving" };
}

export function OrdersC() {
	const m = useOrders();
	const [tab, setTab] = useState<"active" | "past">("active");
	const [openId, setOpenId] = useState<string | null>(null);

	if (!m.signedIn)
		return (
			<>
				<SignInGate m={m} />
				<OrdersScenarioPanel m={m} />
			</>
		);

	const active = m.orders.filter((o) => !isPast(o));
	const past = m.orders.filter(isPast);
	const todos = active
		.map((o) => ({ o, a: nextAction(o, m.invoices) }))
		.filter((x) => x.a !== null);
	const onTheWay = active.length - todos.length;
	const rows = tab === "active" ? active : past;
	const open = m.orders.find((o) => o.id === openId);

	return (
		<div className="mx-auto min-h-dvh max-w-md pb-24">
			<OrdersScenarioPanel m={m} />
			<div className="bg-(--em-purple) text-white">
				<div className="[&_*]:!text-white">
					<StoreHeader />
				</div>
				<div className="px-4 pt-2 pb-24">
					<p className="text-white/70 text-xs uppercase tracking-widest">
						My orders
					</p>
					<h1 className="display font-semibold text-4xl">Hi Ama</h1>
					<p className="mt-1 font-medium text-(--em-gold-bright) text-sm">
						{todos.length} thing{todos.length === 1 ? "" : "s"} need you ·{" "}
						{onTheWay} on the way
					</p>
				</div>
			</div>

			{/* TO-DO carousel overlaps the hero */}
			<div className="-mt-20 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
				{todos.length === 0 && (
					<div className="w-full shrink-0 rounded-3xl bg-white p-6 text-center shadow-lg">
						<Check className="mx-auto size-8 text-emerald-600" />
						<p className="mt-2 font-semibold">Nothing needs you right now</p>
						<p className="text-muted-foreground text-sm">
							We'll text you when something does.
						</p>
					</div>
				)}
				{todos.map(({ o, a }) =>
					a?.kind === "pay" ? (
						<PayCard
							key={o.id}
							o={o}
							inv={a.invoice}
							onOpen={() => setOpenId(o.id)}
						/>
					) : a?.kind === "pickup" ? (
						<PickupCard
							key={o.id}
							o={o}
							code={a.code}
							onOpen={() => setOpenId(o.id)}
						/>
					) : null,
				)}
			</div>
			{todos.length > 1 && (
				<p className="px-4 text-[11px] text-muted-foreground">
					Swipe for {todos.length - 1} more →
				</p>
			)}

			{/* tabs + dense list */}
			<div className="mt-5 px-4">
				<div className="grid grid-cols-2 rounded-full bg-muted p-1 text-sm">
					{(["active", "past"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`rounded-full py-1.5 font-medium ${tab === t ? "bg-white text-(--em-purple) shadow-sm" : "text-muted-foreground"}`}
						>
							{t === "active"
								? `Active (${active.length})`
								: `Past (${past.length})`}
						</button>
					))}
				</div>
				<div className="mt-3 overflow-hidden rounded-xl border border-border bg-white">
					<div className="grid grid-cols-[4.5rem_1fr_auto] gap-2 border-border border-b bg-muted/60 px-3 py-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
						<span>Order</span>
						<span>Items</span>
						<span>Status</span>
					</div>
					{rows.length === 0 && (
						<p className="px-3 py-6 text-center text-muted-foreground text-sm">
							No orders here.
						</p>
					)}
					{rows.map((o) => {
						const s = statusText(o, m.invoices);
						return (
							<button
								key={o.id}
								type="button"
								onClick={() => setOpenId(o.id)}
								className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-2 border-border border-b px-3 py-2.5 text-left last:border-b-0 active:bg-muted"
							>
								<span className="font-mono text-[11px]">
									{o.id}
									<span className="block font-sans text-[10px] text-muted-foreground">
										{o.kind === "pre" ? "Pre-order" : "Store"}
									</span>
								</span>
								<span className="truncate text-sm">{summary(o)}</span>
								<span className="flex items-center gap-1">
									<span
										className={`whitespace-nowrap font-medium text-xs ${
											s.tone === "due"
												? "text-red-600"
												: s.tone === "ready"
													? "text-emerald-700"
													: s.tone === "ended"
														? "text-muted-foreground"
														: "text-(--em-purple)"
										}`}
									>
										{s.text}
									</span>
									<ChevronRight className="size-4 text-muted-foreground" />
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{open && <JourneySheet o={open} m={m} onClose={() => setOpenId(null)} />}
		</div>
	);
}

// ---------- TO-DO cards ----------

function PayCard({
	o,
	inv,
	onOpen,
}: {
	o: Order;
	inv: Invoice;
	onOpen: () => void;
}) {
	const left = daysUntil(inv.due);
	const urgent = left < 3;
	return (
		<div className="flex w-[85%] shrink-0 snap-center flex-col rounded-3xl bg-white p-5 shadow-lg">
			<div className="flex items-center justify-between text-xs">
				<span className="rounded-full bg-(--em-gold-soft) px-2 py-0.5 font-semibold text-(--em-gold-ink)">
					To pay · {inv.kind === "shipping" ? "Shipping Fee" : "Delivery Fee"}
				</span>
				<button
					type="button"
					onClick={onOpen}
					className="font-mono text-muted-foreground underline"
				>
					{o.id}
				</button>
			</div>
			<p className="display mt-3 font-bold text-(--em-purple) text-5xl tabular-nums">
				{cedi(sumRows(inv))}
			</p>
			<p className="mt-1 truncate text-muted-foreground text-xs">
				{summary(o)}
			</p>
			<p
				className={`mt-3 flex items-center gap-1.5 font-semibold text-sm ${urgent ? "text-red-600" : "text-(--em-ink)"}`}
			>
				<Clock className="size-4" />
				Due {dateLabel(inv.due)} ·{" "}
				{left <= 0 ? "today" : `${left} day${left === 1 ? "" : "s"} left`}
			</p>
			<Link
				href={payHref(inv.id)}
				className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-(--em-purple) font-semibold text-white"
			>
				Pay now <ArrowRight className="size-4" />
			</Link>
		</div>
	);
}

function PickupCard({
	o,
	code,
	onOpen,
}: {
	o: Order;
	code: string;
	onOpen: () => void;
}) {
	return (
		<div className="flex w-[85%] shrink-0 snap-center flex-col rounded-3xl bg-white p-5 shadow-lg">
			<div className="flex items-center justify-between text-xs">
				<span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
					Ready for pickup
				</span>
				<button
					type="button"
					onClick={onOpen}
					className="font-mono text-muted-foreground underline"
				>
					{o.id}
				</button>
			</div>
			<PickupCodeBlock code={code} />
			<p className="mt-3 flex items-start gap-1.5 text-xs">
				<MapPin className="mt-0.5 size-3.5 shrink-0 text-(--em-purple)" />
				<span>
					<b>{PICKUP_POINT.address}</b>
					<span className="block text-muted-foreground">
						{PICKUP_POINT.hours}
					</span>
				</span>
			</p>
			<button
				type="button"
				onClick={() => stub(`resend Pickup Code ${code} by SMS`)}
				className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-(--em-purple) font-semibold text-(--em-purple) text-sm"
			>
				<MessageSquare className="size-4" /> Resend by SMS
			</button>
		</div>
	);
}

function PickupCodeBlock({ code }: { code: string }) {
	return (
		<div className="mt-3 rounded-2xl border-(--em-gold) border-2 border-dashed bg-(--em-gold-soft) py-3 text-center">
			<p className="text-(--em-gold-ink) text-[10px] uppercase tracking-widest">
				Pickup Code
			</p>
			<p className="font-bold font-mono text-(--em-purple-deep) text-5xl tracking-[0.3em]">
				{code}
			</p>
		</div>
	);
}

// ---------- the journey sheet ----------

type Node = {
	label: string;
	at?: string;
	expected?: string;
	note?: string;
	state: "done" | "current" | "future";
};

function journey(o: Order): Node[] {
	const nodes: {
		label: string;
		at?: string;
		expected?: string;
		note?: string;
	}[] = [];
	if (o.kind === "pre" && o.window) {
		for (const name of WINDOW_STAGES) {
			const s = o.window.stages.find((x) => x.stage === name);
			nodes.push({
				label: name === "Open" ? `${o.window.name} open` : name,
				at: s?.at,
				expected: s?.expected,
				note: s?.note,
			});
		}
	} else {
		nodes.push({ label: "Paid", at: o.placed });
	}
	const after = ["Ready for handover", "Dispatched", "Collected", "Delivered"];
	const isAfter = after.includes(o.status);
	const handedLabel =
		o.fulfilment.method === "pickup" ? "Collected" : "Delivered";
	const ended = o.status === "Cancelled" || o.status === "Forfeited";
	if (ended) {
		nodes.push({
			label: o.status,
			at: o.history[o.history.length - 1]?.at,
		});
	} else {
		const feeDue =
			o.status === "Shipping Fee due" || o.status === "Delivery Fee due";
		if (feeDue)
			nodes.push({ label: o.status, at: o.history[o.history.length - 1]?.at });
		nodes.push({
			label:
				o.fulfilment.method === "pickup"
					? "Ready for pickup"
					: "Ready to dispatch",
			at: isAfter ? o.history[o.history.length - 1]?.at : undefined,
		});
		if (o.fulfilment.method === "delivery")
			nodes.push({
				label: "Out for delivery",
				at: ["Dispatched", "Delivered"].includes(o.status)
					? o.history.at(-1)?.at
					: undefined,
			});
		nodes.push({
			label: handedLabel,
			at: ["Collected", "Delivered"].includes(o.status)
				? o.history.at(-1)?.at
				: undefined,
		});
	}
	const lastDone = nodes.map((n) => !!n.at).lastIndexOf(true);
	const finished = [
		"Collected",
		"Delivered",
		"Cancelled",
		"Forfeited",
	].includes(o.status);
	return nodes.map((n, i) => ({
		...n,
		state:
			i < lastDone || (i === lastDone && finished)
				? "done"
				: i === lastDone
					? "current"
					: "future",
	}));
}

type Mode = "journey" | "switch1" | "switch2" | "cancel";

function JourneySheet({
	o,
	m,
	onClose,
}: {
	o: Order;
	m: OrdersModel;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<Mode>("journey");
	const [method, setMethod] = useState<Method>(o.fulfilment.method);
	const [zoneId, setZoneId] = useState<string | undefined>(
		o.fulfilment.zoneId ?? "central",
	);
	const [address, setAddress] = useState(o.fulfilment.address ?? "");

	const title =
		mode === "journey"
			? o.id
			: mode === "cancel"
				? "Cancel this Pre-order?"
				: mode === "switch1"
					? "Change how you get it · 1 of 2"
					: "Check the change · 2 of 2";

	return (
		<div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/50">
			<button
				type="button"
				aria-label="Close"
				className="flex-1"
				onClick={onClose}
			/>
			<div className="mx-auto flex h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-(--background) shadow-2xl">
				<div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border" />
				<div className="flex items-center gap-3 border-border border-b px-4 py-3">
					{mode !== "journey" && (
						<button
							type="button"
							aria-label="Back"
							onClick={() =>
								setMode(mode === "switch2" ? "switch1" : "journey")
							}
						>
							<ArrowLeft className="size-5" />
						</button>
					)}
					<div className="min-w-0 flex-1">
						<p className="truncate font-semibold">{title}</p>
						{mode === "journey" && (
							<p className="text-muted-foreground text-xs">
								{o.kind === "pre" ? "Pre-order" : "Store Order"} · placed{" "}
								{dateLabel(o.placed)} · Receipt {o.receiptNo}
							</p>
						)}
					</div>
					<button type="button" aria-label="Close" onClick={onClose}>
						<X className="size-5" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-4 py-4">
					{mode === "journey" && (
						<JourneyView
							o={o}
							m={m}
							onSwitch={() => {
								setMethod(o.fulfilment.method);
								setZoneId(o.fulfilment.zoneId ?? "central");
								setAddress(o.fulfilment.address ?? "");
								setMode("switch1");
							}}
							onCancel={() => setMode("cancel")}
						/>
					)}
					{mode === "switch1" && (
						<SwitchStep1
							o={o}
							method={method}
							setMethod={setMethod}
							zoneId={zoneId}
							setZoneId={setZoneId}
							address={address}
							setAddress={setAddress}
							onNext={() => setMode("switch2")}
						/>
					)}
					{mode === "switch2" && (
						<SwitchStep2
							o={o}
							m={m}
							method={method}
							zoneId={zoneId}
							address={address}
							onConfirm={() => {
								m.switchFulfilment(
									o.id,
									method,
									method === "delivery" ? zoneId : undefined,
									method === "delivery" ? address : undefined,
								);
								toast.success(
									method === "pickup"
										? "Switched to Pickup"
										: `Switched to Delivery · ${zoneOf(zoneId)?.name}`,
								);
								setMode("journey");
							}}
						/>
					)}
					{mode === "cancel" && (
						<CancelStep
							o={o}
							onConfirm={() => {
								m.cancel(o.id);
								toast.success("Pre-order cancelled · full refund pending");
								setMode("journey");
							}}
							onKeep={() => setMode("journey")}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function JourneyView({
	o,
	m,
	onSwitch,
	onCancel,
}: {
	o: Order;
	m: OrdersModel;
	onSwitch: () => void;
	onCancel: () => void;
}) {
	const nodes = journey(o);
	const action = nextAction(o, m.invoices);
	const invs = o.invoices.map((id) => m.invoices[id]).filter(Boolean);
	const orderedFromSupplier = !!o.window?.stages.find(
		(s) => s.stage === "Ordered from supplier",
	)?.at;

	return (
		<div className="grid gap-6">
			{/* items, with Shortfall */}
			<section className="grid gap-1.5">
				{o.lines.map((l) => {
					const short = l.arrived !== undefined && l.arrived < l.qty;
					return (
						<div
							key={l.sku}
							className="flex items-baseline justify-between gap-2 text-sm"
						>
							<span className="min-w-0">
								<span className="font-medium">
									{l.qty}× {l.name}
								</span>
								{l.label && (
									<span className="text-muted-foreground"> · {l.label}</span>
								)}
								{short && (
									<span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-[10px] text-amber-800">
										Shortfall: {l.arrived} of {l.qty} arrived
									</span>
								)}
							</span>
							<span className="shrink-0 tabular-nums">
								{cedi(l.unit * l.qty)}
							</span>
						</div>
					);
				})}
				<p className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
					{o.fulfilment.method === "pickup" ? (
						<Store className="size-3.5" />
					) : (
						<Truck className="size-3.5" />
					)}
					{methodLabel(o)}
					{o.fulfilment.address ? ` · ${o.fulfilment.address}` : ""}
				</p>
			</section>

			{action?.kind === "pickup" && (
				<section>
					<PickupCodeBlock code={action.code} />
					<div className="mt-2 flex items-center justify-between text-xs">
						<span className="text-muted-foreground">
							{PICKUP_POINT.address} · {PICKUP_POINT.hours}
						</span>
						<button
							type="button"
							onClick={() => stub(`resend Pickup Code ${action.code} by SMS`)}
							className="shrink-0 font-semibold text-(--em-purple) underline"
						>
							Resend by SMS
						</button>
					</div>
				</section>
			)}

			{/* the route */}
			<section>
				<h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
					Journey
				</h3>
				<ol className="relative">
					{nodes.map((n, i) => (
						<li key={n.label} className="relative flex gap-4 pb-6 last:pb-0">
							{i < nodes.length - 1 && (
								<span
									className={`absolute top-10 left-[19px] h-[calc(100%-2.5rem)] w-1 rounded-full ${n.state === "done" ? "bg-(--em-purple)" : "bg-[repeating-linear-gradient(to_bottom,var(--border)_0_6px,transparent_6px_12px)]"}`}
								/>
							)}
							<span className="relative grid size-10 shrink-0 place-items-center">
								{n.state === "current" && (
									<span className="absolute inset-0 animate-ping rounded-full bg-(--em-gold)/60" />
								)}
								<span
									className={`relative grid size-10 place-items-center rounded-full border-4 ${
										n.state === "done"
											? "border-(--em-purple) bg-(--em-purple) text-white"
											: n.state === "current"
												? "border-(--em-gold) bg-(--em-purple) text-(--em-gold-bright)"
												: "border-border bg-muted text-muted-foreground"
									}`}
								>
									{n.state === "done" ? (
										<Check className="size-4" />
									) : (
										<Package className="size-4" />
									)}
								</span>
							</span>
							<div
								className={`min-w-0 pt-1 ${n.state === "future" ? "opacity-50" : ""}`}
							>
								<p
									className={`font-semibold ${n.state === "current" ? "text-(--em-purple) text-base" : "text-sm"}`}
								>
									{n.label}
								</p>
								<p className="text-muted-foreground text-xs">
									{n.at
										? dateLabel(n.at)
										: n.expected
											? `Expected ${n.expected}`
											: "Not yet"}
								</p>
								{n.note && (
									<p className="mt-1 rounded-lg bg-(--em-purple-soft) px-2.5 py-1.5 text-(--em-ink) text-xs">
										<span className="font-semibold">Emblish:</span> {n.note}
									</p>
								)}
							</div>
						</li>
					))}
				</ol>
			</section>

			<Ledger o={o} invs={invs} />

			{/* actions */}
			<section className="grid gap-2">
				{action?.kind === "pay" && (
					<Link
						href={payHref(action.invoice.id)}
						className="flex h-12 items-center justify-center gap-2 rounded-xl bg-(--em-purple) font-semibold text-white"
					>
						Pay {cedi(sumRows(action.invoice))} · due{" "}
						{dateLabel(action.invoice.due)}
					</Link>
				)}
				{canSwitch(o) && (
					<button
						type="button"
						onClick={onSwitch}
						className="flex h-12 items-center justify-center gap-2 rounded-xl border border-(--em-purple) font-semibold text-(--em-purple) text-sm"
					>
						<Truck className="size-4" /> Change Pickup / Delivery
					</button>
				)}
				{canSelfCancel(o) && (
					<button
						type="button"
						onClick={onCancel}
						className="h-11 rounded-xl font-medium text-red-600 text-sm underline"
					>
						Cancel this Pre-order (full refund)
					</button>
				)}
				{o.kind === "pre" &&
					o.status === "Awaiting arrival" &&
					orderedFromSupplier && (
						<p className="rounded-xl bg-muted px-3 py-2 text-muted-foreground text-xs">
							We've already ordered this from the supplier, so it can't be
							cancelled here.{" "}
							<button
								type="button"
								className="font-semibold text-(--em-purple) underline"
								onClick={() => stub("open WhatsApp chat with Emblish")}
							>
								Contact us
							</button>{" "}
							if you need to cancel.
						</p>
					)}
			</section>

			{/* history */}
			<section>
				<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
					History
				</h3>
				<ul className="grid gap-1.5 border-border border-l-2 pl-3 text-xs">
					{[...o.history].reverse().map((h, i) => (
						<li key={`${h.at}-${h.text}`} className="flex gap-2">
							<span className="w-12 shrink-0 text-muted-foreground tabular-nums">
								{dateLabel(h.at)}
							</span>
							<span>{h.text}</span>
						</li>
					))}
				</ul>
				<p className="mt-3 text-muted-foreground text-xs">
					Order receipt <span className="font-mono">{o.receiptNo}</span>
				</p>
			</section>
		</div>
	);
}

function Ledger({ o, invs }: { o: Order; invs: Invoice[] }) {
	const paidInvs = invs.filter((i) => i.state === "paid");
	const unpaid = invs.filter((i) => i.state === "unpaid");
	const voided = invs.filter((i) => i.state === "voided");
	const paidSoFar =
		itemsTotal(o) + paidInvs.reduce((a, i) => a + sumRows(i), 0);
	const stillToPay = unpaid.reduce((a, i) => a + sumRows(i), 0);
	const comingBack = o.refunds
		.filter((r) => r.state === "pending")
		.reduce((a, r) => a + r.amount, 0);
	const refunded = o.refunds
		.filter((r) => r.state === "refunded")
		.reduce((a, r) => a + r.amount, 0);

	type Row = {
		key: string;
		label: string;
		sub?: string;
		amount: number;
		tone: "paid" | "due" | "back" | "void";
	};
	const rows: Row[] = [
		{
			key: "item",
			label: o.kind === "pre" ? "Item Payment" : "Order payment",
			sub: `Paid ${dateLabel(o.placed)} · Receipt ${o.receiptNo}`,
			amount: itemsTotal(o),
			tone: "paid",
		},
		...invs.map<Row>((i) => ({
			key: i.id,
			label: `${i.kind === "shipping" ? "Shipping Fee Invoice" : "Delivery Fee Invoice"} ${i.id}`,
			sub:
				i.state === "paid"
					? `Paid ${dateLabel(i.paidAt ?? i.issued)} · Receipt ${i.receiptNo ?? "—"}`
					: i.state === "unpaid"
						? `${i.rows.map((r) => r.label).join(" + ")} · due ${dateLabel(i.due)}`
						: `Superseded${i.replacedBy ? ` by ${i.replacedBy}` : ""} · ${i.voidReason ?? ""}`,
			amount: sumRows(i),
			tone: i.state === "paid" ? "paid" : i.state === "unpaid" ? "due" : "void",
		})),
		...o.refunds.map<Row>((r) => ({
			key: r.id,
			label: r.state === "pending" ? "Refund pending" : "Refunded",
			sub: `${r.reason} · ${dateLabel(r.at)}${r.state === "pending" ? " · Staff send it, 1–3 days" : ""}`,
			amount: r.amount,
			tone: "back",
		})),
	];

	return (
		<section>
			<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
				Money
			</h3>
			<div className="grid grid-cols-3 gap-2 text-center">
				<Tot label="Paid so far" value={paidSoFar} cls="text-(--em-ink)" />
				<Tot
					label="Still to pay"
					value={stillToPay}
					cls={stillToPay ? "text-red-600" : "text-muted-foreground"}
				/>
				<Tot
					label={comingBack ? "Coming back to you" : "Refunded"}
					value={comingBack || refunded}
					cls={
						comingBack || refunded
							? "text-emerald-700"
							: "text-muted-foreground"
					}
				/>
			</div>
			<ul className="mt-3 overflow-hidden rounded-xl border border-border bg-white text-sm">
				{rows.map((r) => (
					<li
						key={r.key}
						className="flex items-start justify-between gap-3 border-border border-b px-3 py-2 last:border-b-0"
					>
						<span className="min-w-0">
							<span
								className={`block font-medium ${r.tone === "void" ? "text-muted-foreground line-through" : ""}`}
							>
								{r.label}
							</span>
							{r.sub && (
								<span className="block text-muted-foreground text-xs">
									{r.sub}
								</span>
							)}
						</span>
						<span
							className={`shrink-0 font-semibold tabular-nums ${
								r.tone === "due"
									? "text-red-600"
									: r.tone === "back"
										? "text-emerald-700"
										: r.tone === "void"
											? "text-muted-foreground line-through"
											: ""
							}`}
						>
							{r.tone === "back" ? "+" : r.tone === "paid" ? "−" : ""}
							{cedi(r.amount)}
						</span>
					</li>
				))}
			</ul>
			{voided.length > 0 && (
				<p className="mt-1 text-[11px] text-muted-foreground">
					Crossed-out invoices were replaced. Only pay the latest one.
				</p>
			)}
		</section>
	);
}

function Tot({
	label,
	value,
	cls,
}: {
	label: string;
	value: number;
	cls: string;
}) {
	return (
		<div className="rounded-xl bg-white px-1 py-2 ring-1 ring-border">
			<p className={`font-bold text-base tabular-nums ${cls}`}>{cedi(value)}</p>
			<p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
		</div>
	);
}

// ---------- switch fulfilment: 2 steps ----------

function SwitchStep1({
	o,
	method,
	setMethod,
	zoneId,
	setZoneId,
	address,
	setAddress,
	onNext,
}: {
	o: Order;
	method: Method;
	setMethod: (m: Method) => void;
	zoneId?: string;
	setZoneId: (z: string) => void;
	address: string;
	setAddress: (a: string) => void;
	onNext: () => void;
}) {
	const unchanged =
		method === o.fulfilment.method &&
		(method === "pickup" ||
			(zoneId === o.fulfilment.zoneId &&
				address === (o.fulfilment.address ?? "")));
	const ok = method === "pickup" || (!!zoneId && address.trim().length > 3);
	return (
		<div className="grid gap-5">
			<div className="grid grid-cols-2 gap-2">
				{(["pickup", "delivery"] as const).map((x) => (
					<button
						key={x}
						type="button"
						onClick={() => setMethod(x)}
						className={`grid gap-1 rounded-2xl border-2 p-4 text-left ${method === x ? "border-(--em-purple) bg-(--em-purple-soft)" : "border-border bg-white"}`}
					>
						{x === "pickup" ? (
							<Store className="size-6 text-(--em-purple)" />
						) : (
							<Truck className="size-6 text-(--em-purple)" />
						)}
						<span className="font-semibold">
							{x === "pickup" ? "Pickup" : "Delivery"}
						</span>
						<span className="text-muted-foreground text-xs">
							{x === "pickup" ? "Free · Osu" : "Fee by zone"}
						</span>
					</button>
				))}
			</div>
			{method === "pickup" ? (
				<p className="rounded-xl bg-white p-3 text-sm ring-1 ring-border">
					<b>{PICKUP_POINT.name}</b>
					<span className="block text-muted-foreground text-xs">
						{PICKUP_POINT.address} · {PICKUP_POINT.hours}
					</span>
				</p>
			) : (
				<>
					<div>
						<p className="mb-2 font-medium text-xs">Delivery Zone</p>
						<div className="flex flex-wrap gap-2">
							{ZONES.map((z) => (
								<button
									key={z.id}
									type="button"
									onClick={() => setZoneId(z.id)}
									className={`rounded-full border px-3 py-1.5 text-xs ${zoneId === z.id ? "border-(--em-purple) bg-(--em-purple) text-white" : "border-border bg-white"}`}
								>
									{z.name} · {z.fee === undefined ? "quoted" : cedi(z.fee)}
								</button>
							))}
						</div>
						<p className="mt-1.5 text-[11px] text-muted-foreground">
							{zoneOf(zoneId)?.areas}
						</p>
					</div>
					<Labeled label="Address & landmark" hint="helps the rider find you">
						<input
							className={field}
							value={address}
							placeholder="Lagos Ave, East Legon · blue gate opp. Shell"
							onChange={(e) => setAddress(e.target.value)}
						/>
					</Labeled>
				</>
			)}
			<button
				type="button"
				disabled={!ok || unchanged}
				onClick={onNext}
				className="flex h-12 items-center justify-center gap-2 rounded-xl bg-(--em-purple) font-semibold text-white disabled:opacity-40"
			>
				See what changes <ArrowRight className="size-4" />
			</button>
			{unchanged && (
				<p className="-mt-3 text-center text-muted-foreground text-xs">
					That's what you have now.
				</p>
			)}
		</div>
	);
}

function SwitchStep2({
	o,
	m,
	method,
	zoneId,
	address,
	onConfirm,
}: {
	o: Order;
	m: OrdersModel;
	method: Method;
	zoneId?: string;
	address: string;
	onConfirm: () => void;
}) {
	const fx = switchEffect(
		o,
		m.invoices,
		method,
		method === "delivery" ? zoneId : undefined,
	);
	const unpaid = o.invoices
		.map((id) => m.invoices[id])
		.find((i) => i?.state === "unpaid");
	const beforeFee =
		o.fulfilment.method === "delivery" ? (o.fulfilment.deliveryFee ?? 0) : 0;
	const afterZone = zoneOf(zoneId);
	const afterFee =
		method === "pickup"
			? cedi(0)
			: afterZone?.fee === undefined
				? "Quoted by SMS"
				: cedi(afterZone.fee);
	const invoiceAfter: Record<typeof fx.kind, string> = {
		none: "No change",
		"on-next-invoice": "Goes on your Shipping Fee Invoice when goods arrive",
		reissue: `${unpaid?.id ?? "Invoice"} replaced by a new one, same due date`,
		"new-delivery-invoice": "New Delivery Fee Invoice by SMS",
		"void-delivery-invoice": `${unpaid?.id ?? "Delivery Fee Invoice"} cancelled`,
		refund: "Difference refunded by Staff",
		quote: "Delivery Fee Invoice after we quote",
	};
	const tone =
		fx.diff > 0
			? "border-amber-300 bg-amber-50"
			: fx.diff < 0
				? "border-emerald-300 bg-emerald-50"
				: "border-border bg-white";

	const rows: [string, string, string][] = [
		[
			"Method",
			o.fulfilment.method === "pickup" ? "Pickup" : "Delivery",
			method === "pickup" ? "Pickup" : "Delivery",
		],
		[
			"Zone",
			o.fulfilment.method === "pickup"
				? "—"
				: (zoneOf(o.fulfilment.zoneId)?.name ?? "—"),
			method === "pickup" ? "—" : (afterZone?.name ?? "—"),
		],
		[
			"Where",
			o.fulfilment.method === "pickup"
				? "Osu pickup point"
				: (o.fulfilment.address ?? "—"),
			method === "pickup" ? "Osu pickup point" : address,
		],
		["Delivery Fee", cedi(beforeFee), afterFee],
		[
			"Invoices",
			unpaid
				? `${unpaid.id} · ${cedi(sumRows(unpaid))} unpaid`
				: "Nothing unpaid",
			invoiceAfter[fx.kind],
		],
	];

	return (
		<div className="grid gap-5">
			<div className="overflow-hidden rounded-xl border border-border bg-white text-xs">
				<div className="grid grid-cols-[5rem_1fr_1fr] bg-muted/60 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
					<span className="px-2 py-1.5" />
					<span className="px-2 py-1.5">Before</span>
					<span className="bg-(--em-purple-soft) px-2 py-1.5 text-(--em-purple)">
						After
					</span>
				</div>
				{rows.map(([k, b, a]) => (
					<div
						key={k}
						className="grid grid-cols-[5rem_1fr_1fr] border-border border-t"
					>
						<span className="px-2 py-2 font-medium text-muted-foreground">
							{k}
						</span>
						<span className="px-2 py-2">{b}</span>
						<span
							className={`bg-(--em-purple-soft)/50 px-2 py-2 font-medium ${a !== b ? "text-(--em-purple)" : ""}`}
						>
							{a}
						</span>
					</div>
				))}
			</div>
			<div className={`rounded-2xl border-2 p-4 ${tone}`}>
				<p className="font-bold text-lg leading-tight">{fx.headline}</p>
				<p className="mt-1 text-sm">{fx.detail}</p>
			</div>
			<button
				type="button"
				onClick={onConfirm}
				className="flex h-12 items-center justify-center gap-2 rounded-xl bg-(--em-purple) font-semibold text-white"
			>
				<Check className="size-4" /> Confirm change
			</button>
		</div>
	);
}

// ---------- self-cancel ----------

function CancelStep({
	o,
	onConfirm,
	onKeep,
}: {
	o: Order;
	onConfirm: () => void;
	onKeep: () => void;
}) {
	return (
		<div className="grid gap-5">
			<div className="rounded-2xl bg-white p-4 ring-1 ring-border">
				<p className="text-muted-foreground text-xs">You get back</p>
				<p className="display font-bold text-(--em-purple) text-4xl tabular-nums">
					{cedi(itemsTotal(o))}
				</p>
				<p className="mt-1 text-sm">Your full Item Payment for {summary(o)}.</p>
			</div>
			<ul className="grid gap-2 text-sm">
				<li className="flex gap-2">
					<Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					Free to cancel: we haven't ordered it from the supplier yet.
				</li>
				<li className="flex gap-2">
					<Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					Our Staff send the refund to the mobile money or card you paid with.
				</li>
				<li className="flex gap-2">
					<Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					It shows as "refund pending" here until it lands (usually 1–3 days).
				</li>
			</ul>
			<button
				type="button"
				onClick={onConfirm}
				className="h-12 rounded-xl bg-red-600 font-semibold text-white"
			>
				Yes, cancel and refund me
			</button>
			<button
				type="button"
				onClick={onKeep}
				className="h-11 rounded-xl border border-border font-medium text-sm"
			>
				Keep my Pre-order
			</button>
		</div>
	);
}
