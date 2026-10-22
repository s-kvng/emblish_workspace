"use client";
// PROTOTYPE (wayfinder #14) — three /pay/<invoiceId> layouts sharing one in-memory invoice model.
// A "Invoice document": a printable paper invoice (sibling of the Paper-slip Receipt) with a stamp.
// B "Pay-first": amount and Pay button above the fold, the breakdown folded away.
// C "Why you're paying": the order's story (arrived → pay → handover) leads, each fee explained.
// No sign-in on this page (#4); paying hands off to a mock Paystack and updates the mock orders.

import {
	AlertTriangle,
	Check,
	ChevronDown,
	Clock,
	Package,
	Settings2,
	Truck,
	X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import { cedi, findProduct, type Product } from "../../_data";
import { Shot } from "../../_shared";
import { PICKUP_POINT } from "../../checkout/_checkout-data";
import {
	arrivedCount,
	dateLabel,
	daysUntil,
	INITIAL_INVOICES,
	INITIAL_ORDERS,
	type Invoice,
	loadInvoice,
	markInvoicePaid,
	type Order,
	sumRows,
	TODAY_ISO,
	unitCount,
	zoneOf,
} from "../../orders/_orders-data";

// ---------- shared model ----------

type Force = "none" | "due-soon" | "overdue" | "paid" | "voided";

const addDays = (iso: string, n: number) => {
	const d = new Date(iso);
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
};

function usePay(id: string) {
	const [data, setData] = useState<{ invoice?: Invoice; order?: Order }>(() => {
		const invoice = INITIAL_INVOICES.find((i) => i.id === id);
		return {
			invoice,
			order: INITIAL_ORDERS.find((o) => o.id === invoice?.orderId),
		};
	});
	useEffect(() => setData(loadInvoice(id)), [id]);
	const [force, setForce] = useState<Force>("none");
	const [failNext, setFailNext] = useState(false);
	const [paystack, setPaystack] = useState(false);

	const base = data.invoice;
	const invoice: Invoice | undefined = base && {
		...base,
		...(force === "due-soon" && {
			state: "unpaid",
			due: addDays(TODAY_ISO, 1),
		}),
		...(force === "overdue" && {
			state: "unpaid",
			due: addDays(TODAY_ISO, -2),
		}),
		...(force === "paid" && {
			state: "paid",
			paidAt: TODAY_ISO,
			receiptNo: base.receiptNo ?? "R-50533",
		}),
		...(force === "voided" &&
			base.state !== "voided" && {
				state: "voided",
				replacedBy: undefined,
				voidReason: "We cancelled this invoice. There's nothing to pay.",
			}),
	};
	const days = invoice ? daysUntil(invoice.due) : 0;

	return {
		id,
		invoice,
		order: data.order,
		total: invoice ? sumRows(invoice) : 0,
		days,
		overdue: invoice?.state === "unpaid" && days < 0,
		dueSoon: invoice?.state === "unpaid" && days >= 0 && days <= 2,
		force,
		setForce,
		failNext,
		setFailNext,
		paystack,
		openPaystack: () => setPaystack(true),
		paystackResult: (r: "success" | "fail" | "closed") => {
			setPaystack(false);
			if (r === "success" && !failNext) {
				markInvoicePaid(id);
				setData(loadInvoice(id));
				setForce("none");
				toast.success("Paid. Your Receipt is on its way by SMS.");
				return;
			}
			toast.error(
				r === "closed"
					? "Payment cancelled. Nothing was charged."
					: "Payment failed. Nothing was charged. Try again?",
			);
		},
	};
}
type PayModel = ReturnType<typeof usePay>;

const kindName = (i: Invoice) =>
	i.kind === "shipping" ? "Shipping Fee Invoice" : "Delivery Fee Invoice";

const productOf = (o?: Order): Product | undefined =>
	o ? findProduct(o.lines[0].slug) : undefined;

const fulfilmentLine = (o?: Order) => {
	if (!o) return "";
	if (o.fulfilment.method === "pickup")
		return `Pickup at ${PICKUP_POINT.address}`;
	return `Delivery to ${zoneOf(o.fulfilment.zoneId)?.name ?? "your address"}${o.fulfilment.address ? ` · ${o.fulfilment.address}` : ""}`;
};

/** What happens if this stays unpaid: Shipping Fee → reminders then Forfeit risk; Delivery → never Forfeit. */
const consequence = (m: PayModel) =>
	m.invoice?.kind === "shipping"
		? m.overdue
			? "This invoice is overdue. We'll keep your goods for now, but after 30 days unpaid we may release them and your Item Payment isn't automatically refunded."
			: "Your goods are waiting for you. We hand them over once this is paid."
		: m.overdue
			? "This invoice is overdue. Your goods are safe with us; we just can't dispatch them. You can switch to Pickup instead."
			: "We dispatch as soon as this is paid.";

const myOrders = (v: string) =>
	`/prototype/storefront/orders?variant=${v}` as Route;

// ---------- switcher ----------

const payVariants = [
	{ key: "A", name: "Invoice document" },
	{ key: "B", name: "Pay-first" },
	{ key: "C", name: "Why you're paying" },
];

export function PaySwitch({
	invoiceId,
	variant,
}: {
	invoiceId: string;
	variant: string;
}) {
	const m = usePay(invoiceId);
	const v = payVariants.find((x) => x.key === variant) ?? payVariants[0];
	return (
		<>
			{!m.invoice ? (
				<NotFound id={invoiceId} />
			) : v.key === "A" ? (
				<PayA m={m} />
			) : v.key === "B" ? (
				<PayB m={m} />
			) : (
				<PayC m={m} />
			)}
			{m.paystack && <PaystackMini m={m} />}
			<PayScenarioPanel m={m} variant={v.key} />
			<PrototypeSwitcher variants={payVariants} current={v.key} />
		</>
	);
}

function NotFound({ id }: { id: string }) {
	return (
		<div className="mx-auto max-w-md px-4 py-20 text-center">
			<p className="display text-(--em-purple) text-2xl">Invoice not found</p>
			<p className="mt-2 text-muted-foreground text-sm">
				We couldn't find {id}. Check the link in your SMS, or open My orders.
			</p>
		</div>
	);
}

function Brand() {
	return (
		<div className="flex items-center gap-1.5">
			<span className="grid size-6 rotate-45 place-items-center rounded-md bg-(--em-purple)">
				<span className="size-2 rounded-sm bg-(--em-gold)" />
			</span>
			<span className="display ml-1 font-semibold text-(--em-purple) text-lg">
				Emblish
			</span>
		</div>
	);
}

/** The paid / voided end states, wording shared; each variant frames them its own way. */
function EndState({ m, v }: { m: PayModel; v: string }) {
	const i = m.invoice as Invoice;
	if (i.state === "paid")
		return (
			<div className="grid gap-2 text-sm">
				<p className="flex items-center gap-2 font-semibold text-emerald-700">
					<Check className="size-4" /> Paid {i.paidAt && dateLabel(i.paidAt)} ·
					Receipt {i.receiptNo}
				</p>
				<p className="text-muted-foreground">
					We texted your Receipt. Nothing more to pay on this invoice.
				</p>
				<Link href={myOrders(v)} className="text-(--em-purple) underline">
					Track this order in My orders
				</Link>
			</div>
		);
	return (
		<div className="grid gap-2 text-sm">
			<p className="font-semibold text-muted-foreground">
				This invoice was cancelled
			</p>
			<p className="text-muted-foreground">{i.voidReason}</p>
			{i.replacedBy && (
				<Link
					href={
						`/prototype/storefront/pay/${i.replacedBy}?variant=${v}` as Route
					}
					className="inline-flex h-11 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground"
				>
					Open the new invoice ({i.replacedBy})
				</Link>
			)}
		</div>
	);
}

// ---------- A: Invoice document ----------

function PayA({ m }: { m: PayModel }) {
	const i = m.invoice as Invoice;
	const o = m.order;
	return (
		<div className="mx-auto max-w-md px-4 pt-6 pb-40">
			<div className="relative bg-white px-5 py-6 font-mono text-[13px] shadow-lg ring-1 ring-border">
				{i.state !== "unpaid" && (
					<span
						className={`absolute top-16 right-4 rotate-12 rounded border-4 px-3 py-1 font-bold font-sans text-2xl tracking-widest ${i.state === "paid" ? "border-emerald-600 text-emerald-600" : "border-slate-400 text-slate-400"}`}
					>
						{i.state === "paid" ? "PAID" : "VOID"}
					</span>
				)}
				<div className="flex justify-center font-sans">
					<Brand />
				</div>
				<p className="mt-1 text-center font-bold text-xs">
					{kindName(i).toUpperCase()}
				</p>
				<p className="text-center text-muted-foreground text-xs">
					{i.id} · issued {dateLabel(i.issued)}
				</p>
				<Dash />
				<p>
					{o?.kind === "pre" ? "Pre-order" : "Store Order"} #{o?.id}
				</p>
				{o?.lines.map((l) => (
					<p key={l.sku} className="text-muted-foreground text-xs">
						{l.arrived ?? l.qty} x {l.name} {l.label}
						{l.arrived !== undefined && l.arrived < l.qty
							? ` (${l.qty - l.arrived} didn't arrive, refunded separately)`
							: ""}
					</p>
				))}
				<p className="text-muted-foreground text-xs">{fulfilmentLine(o)}</p>
				<Dash />
				{i.rows.map((r) => (
					<div key={r.label} className="flex justify-between gap-2">
						<span>
							{r.label}
							{r.detail && (
								<span className="block text-muted-foreground text-xs">
									{r.detail}
								</span>
							)}
						</span>
						<span>{(r.amount / 100).toFixed(2)}</span>
					</div>
				))}
				<Dash />
				<p className="flex justify-between font-bold text-base">
					<span>AMOUNT DUE (GHS)</span>
					<span>{(m.total / 100).toFixed(2)}</span>
				</p>
				<p
					className={`text-xs ${m.overdue ? "font-bold text-red-600" : m.dueSoon ? "font-bold text-amber-700" : "text-muted-foreground"}`}
				>
					DUE {dateLabel(i.due).toUpperCase()}
					{i.state === "unpaid" &&
						(m.overdue
							? ` · OVERDUE ${-m.days} DAY${m.days === -1 ? "" : "S"}`
							: m.days === 0
								? " · TODAY"
								: ` · IN ${m.days} DAY${m.days === 1 ? "" : "S"}`)}
				</p>
				<Dash />
				<p className="text-center text-muted-foreground text-xs">
					Item Payment already paid · Receipt {o?.receiptNo}
				</p>
			</div>

			<div className="mt-5 font-sans">
				{i.state === "unpaid" ? (
					<p className="text-muted-foreground text-xs">{consequence(m)}</p>
				) : (
					<EndState m={m} v="A" />
				)}
			</div>

			{i.state === "unpaid" && (
				<div className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-white/95 px-4 pt-3 pb-5 backdrop-blur">
					<div className="mx-auto grid max-w-md gap-1">
						<button
							type="button"
							onClick={m.openPaystack}
							className="h-12 rounded-md bg-primary font-semibold text-primary-foreground"
						>
							Pay {cedi(m.total)}
						</button>
						<p className="text-center text-muted-foreground text-xs">
							Mobile money or card, on Paystack. No sign-in needed.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}

function Dash() {
	return (
		<p className="my-2 overflow-hidden whitespace-nowrap text-border">
			{"- ".repeat(40)}
		</p>
	);
}

// ---------- B: Pay-first ----------

function PayB({ m }: { m: PayModel }) {
	const i = m.invoice as Invoice;
	const o = m.order;
	const p = productOf(o);
	const [open, setOpen] = useState(false);
	return (
		<div className="mx-auto flex min-h-dvh max-w-md flex-col">
			<header className="bg-(--em-purple) px-5 pt-5 pb-8 text-white">
				<div className="flex items-center justify-between text-white/80 text-xs">
					<span className="display font-semibold text-(--em-gold) text-lg">
						Emblish
					</span>
					<span>{i.id}</span>
				</div>
				<p className="mt-6 text-sm text-white/80">{kindName(i)}</p>
				<p
					className={`display font-semibold text-5xl ${i.state === "unpaid" ? "" : "line-through opacity-60"}`}
				>
					{cedi(m.total)}
				</p>
				{i.state === "unpaid" && (
					<span
						className={`mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-xs ${m.overdue ? "bg-red-500" : m.dueSoon ? "bg-(--em-gold) text-(--em-purple-deep)" : "bg-white/15"}`}
					>
						<Clock className="size-3.5" />
						{m.overdue
							? `Overdue since ${dateLabel(i.due)}`
							: m.days === 0
								? "Due today"
								: m.days === 1
									? "Due tomorrow"
									: `Due ${dateLabel(i.due)} · ${m.days} days left`}
					</span>
				)}
			</header>

			<div className="-mt-4 grid gap-4 rounded-t-2xl bg-background px-5 pt-5 pb-40">
				{i.state !== "unpaid" ? (
					<EndState m={m} v="B" />
				) : (
					<button
						type="button"
						onClick={m.openPaystack}
						className="h-14 rounded-xl bg-(--em-gold) font-bold text-(--em-purple-deep) text-lg shadow-md"
					>
						Pay {cedi(m.total)} now
					</button>
				)}

				{o && p && (
					<div className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
						<Shot product={p} className="size-14 rounded-lg" label={false} />
						<div className="min-w-0 flex-1 text-sm">
							<p className="truncate font-semibold">
								{o.lines[0].name}
								{o.lines.length > 1 && ` +${o.lines.length - 1} more`}
							</p>
							<p className="text-muted-foreground text-xs">
								{o.kind === "pre" ? "Pre-order" : "Store Order"} #{o.id}
							</p>
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={() => setOpen((x) => !x)}
					className="flex items-center justify-between font-medium text-sm"
				>
					What am I paying for?
					<ChevronDown
						className={`size-4 transition ${open ? "rotate-180" : ""}`}
					/>
				</button>
				{open && (
					<div className="grid gap-2 rounded-xl bg-muted p-4 text-sm">
						{i.rows.map((r) => (
							<div key={r.label} className="flex justify-between gap-2">
								<span>
									{r.label}
									{r.detail && (
										<span className="block text-muted-foreground text-xs">
											{r.detail}
										</span>
									)}
								</span>
								<span className="font-medium">{cedi(r.amount)}</span>
							</div>
						))}
						<div className="flex justify-between border-border border-t pt-2 font-semibold">
							<span>Total</span>
							<span>{cedi(m.total)}</span>
						</div>
						<p className="text-muted-foreground text-xs">
							Item Payment already paid (Receipt {o?.receiptNo}).{" "}
							{fulfilmentLine(o)}.
						</p>
					</div>
				)}
				{i.state === "unpaid" && (
					<p className="text-muted-foreground text-xs">{consequence(m)}</p>
				)}
			</div>
		</div>
	);
}

// ---------- C: Why you're paying ----------

function PayC({ m }: { m: PayModel }) {
	const i = m.invoice as Invoice;
	const o = m.order;
	const p = productOf(o);
	const arrived = o ? arrivedCount(o) : 0;
	const units = o ? unitCount(o) : 0;
	const delivery = o?.fulfilment.method === "delivery";
	const steps = [
		{ icon: Package, label: "Arrived", done: true },
		{
			icon: Clock,
			label: i.kind === "shipping" ? "Shipping Fee" : "Delivery Fee",
			done: i.state === "paid",
			now: i.state === "unpaid",
		},
		{
			icon: delivery ? Truck : Check,
			label: delivery ? "We deliver" : "You pick up",
			done: false,
		},
	];
	return (
		<div className="mx-auto max-w-md px-4 pt-5 pb-40">
			<Brand />
			{p && (
				<Shot
					product={p}
					className="mt-4 aspect-[16/9] w-full rounded-2xl"
					label={false}
				/>
			)}
			<h1 className="display mt-4 font-semibold text-(--em-ink) text-2xl">
				{i.kind === "shipping"
					? `Your ${o?.lines[0].name} has arrived`
					: `Your ${o?.lines[0].name} is ready to send`}
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				{i.kind === "shipping"
					? `${arrived} of ${units} units arrived in Ghana. One last payment and it's yours.`
					: `We quoted delivery to ${o?.fulfilment.address?.split("·")[0] ?? "you"}. Pay it and we send it out.`}
			</p>

			<ol className="mt-5 grid grid-cols-3 gap-2">
				{steps.map((s) => (
					<li
						key={s.label}
						className={`grid justify-items-center gap-1 rounded-xl p-3 text-center text-xs ${s.now ? "bg-(--em-gold-soft) font-semibold text-(--em-gold-ink) ring-(--em-gold) ring-2" : s.done ? "bg-(--em-purple-soft) text-(--em-purple)" : "bg-muted text-muted-foreground"}`}
					>
						<s.icon className="size-5" />
						{s.label}
					</li>
				))}
			</ol>

			<div className="mt-6 grid gap-3">
				{i.rows.map((r) => (
					<div
						key={r.label}
						className="rounded-xl border border-border bg-white p-4"
					>
						<div className="flex justify-between font-semibold text-sm">
							<span>{r.label}</span>
							<span>{cedi(r.amount)}</span>
						</div>
						<p className="mt-1 text-muted-foreground text-xs">
							{r.label === "Shipping Fee"
								? `${r.detail}. Covers bringing your goods to Ghana; charged only on units that arrived.`
								: `${r.detail}. Your rider brings it to your door.`}
						</p>
					</div>
				))}
				{o?.lines.some((l) => l.arrived !== undefined && l.arrived < l.qty) && (
					<p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 text-xs">
						<AlertTriangle className="size-4 shrink-0" />
						{units - arrived} unit{units - arrived === 1 ? "" : "s"} didn't
						arrive. You're not charged Shipping on it, and we're refunding its
						Item Payment separately.
					</p>
				)}
				<div className="flex items-baseline justify-between px-1">
					<span className="text-sm">Total</span>
					<span className="display font-semibold text-(--em-purple) text-2xl">
						{cedi(m.total)}
					</span>
				</div>
				{i.state === "unpaid" && (
					<p
						className={`px-1 text-xs ${m.overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}
					>
						Due {dateLabel(i.due)}. {consequence(m)}
					</p>
				)}
			</div>

			{i.state !== "unpaid" ? (
				<div className="mt-6">
					<EndState m={m} v="C" />
				</div>
			) : (
				<>
					<p className="mt-6 text-center text-muted-foreground text-xs">
						{delivery ? (
							<>
								Rather pick it up and skip the Delivery Fee?{" "}
								<Link href={myOrders("C")} className="underline">
									Sign in to change
								</Link>
							</>
						) : (
							<>
								Want it delivered instead?{" "}
								<Link href={myOrders("C")} className="underline">
									Sign in to change
								</Link>
							</>
						)}
					</p>
					<div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-background via-background to-transparent px-4 pt-6 pb-5">
						<button
							type="button"
							onClick={m.openPaystack}
							className="mx-auto block h-12 w-full max-w-md rounded-full bg-primary font-semibold text-primary-foreground shadow-lg"
						>
							Pay {cedi(m.total)}
						</button>
					</div>
				</>
			)}
		</div>
	);
}

// ---------- prototype-only ----------

function PaystackMini({ m }: { m: PayModel }) {
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4 font-sans">
			<div className="grid w-full max-w-sm gap-2 rounded-xl bg-white p-4 text-slate-800 text-sm shadow-2xl">
				<div className="flex justify-between">
					<p className="font-semibold">
						Paystack <span className="font-normal text-slate-400">(mock)</span>
					</p>
					<p className="font-bold">{cedi(m.total)}</p>
				</div>
				<p className="text-slate-500 text-xs">
					Mobile money or card · {m.invoice?.id}
				</p>
				<button
					type="button"
					onClick={() => m.paystackResult("success")}
					className="h-11 rounded-md bg-emerald-500 font-semibold text-white"
				>
					Simulate: payment succeeds
				</button>
				<button
					type="button"
					onClick={() => m.paystackResult("fail")}
					className="h-11 rounded-md border border-red-300 text-red-600"
				>
					Simulate: declined / failed
				</button>
				<button
					type="button"
					onClick={() => m.paystackResult("closed")}
					className="h-11 text-slate-500 underline"
				>
					Close window (cancel)
				</button>
			</div>
		</div>
	);
}

function PayScenarioPanel({ m, variant }: { m: PayModel; variant: string }) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const forces: { k: Force; label: string }[] = [
		{ k: "none", label: "As stored" },
		{ k: "due-soon", label: "Due tomorrow" },
		{ k: "overdue", label: "Overdue 2 days" },
		{ k: "paid", label: "Paid" },
		{ k: "voided", label: "Voided" },
	];
	return (
		<div className="fixed top-3 right-3 z-[110] font-sans text-xs">
			{!open ? (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="flex items-center gap-1 rounded-full bg-fuchsia-600 px-3 py-1.5 font-medium text-white shadow-lg ring-2 ring-white"
				>
					<Settings2 className="size-3.5" /> Scenarios
				</button>
			) : (
				<div className="grid w-64 gap-2 rounded-xl bg-fuchsia-600 p-3 text-white shadow-2xl ring-2 ring-white">
					<div className="flex items-center justify-between font-semibold">
						Prototype scenarios
						<button type="button" onClick={() => setOpen(false)}>
							<X className="size-4" />
						</button>
					</div>
					<span>Invoice</span>
					<div className="grid gap-1">
						{[
							["INV-2207", "Shipping + Delivery Fee"],
							["INV-2215", "Delivery Fee (Elsewhere)"],
							["INV-2201", "Voided, replaced"],
						].map(([id, label]) => (
							<button
								key={id}
								type="button"
								onClick={() =>
									router.replace(
										`/prototype/storefront/pay/${id}?variant=${variant}` as Route,
									)
								}
								className={`rounded px-2 py-1 text-left ${m.id === id ? "bg-white text-fuchsia-700" : "bg-white/20"}`}
							>
								{id} · {label}
							</button>
						))}
					</div>
					<span className="border-white/30 border-t pt-2">Force state</span>
					<div className="flex flex-wrap gap-1">
						{forces.map((f) => (
							<button
								key={f.k}
								type="button"
								onClick={() => m.setForce(f.k)}
								className={`rounded px-2 py-1 ${m.force === f.k ? "bg-white text-fuchsia-700" : "bg-white/20"}`}
							>
								{f.label}
							</button>
						))}
					</div>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={m.failNext}
							onChange={(e) => m.setFailNext(e.target.checked)}
						/>
						Next payment fails
					</label>
					<p className="text-white/80">
						Today is 22 Oct 2026. No sign-in here.
					</p>
				</div>
			)}
		</div>
	);
}
