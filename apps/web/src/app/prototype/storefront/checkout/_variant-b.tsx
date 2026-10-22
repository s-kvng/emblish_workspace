"use client";
// PROTOTYPE (wayfinder #13) — Checkout B: "Step-by-step, held from the start".
// A full-screen wizard: Bag → Phone → Pickup / Delivery → Review & pay. The Checkout (and its Stock
// Holds) is created as soon as the Customer leaves the Bag, so the 30-minute clock is visible in the
// header for the whole flow. Going back to the Bag releases it.

import { ArrowLeft, Check, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cedi, shortDate } from "../_data";
import { Shot } from "../_shared";
import {
	type CheckoutModel,
	clock,
	PICKUP_POINT,
	useCheckout,
	ZONES,
} from "./_checkout-data";
import {
	AddressFields,
	field,
	PaystackMock,
	PhoneCode,
	ScenarioPanel,
} from "./_checkout-shared";

const STEPS = ["Bag", "Phone", "Pickup or Delivery", "Review & pay"] as const;

export function CheckoutB() {
	const m = useCheckout({ holdAt: "start" });
	const router = useRouter();
	const [step, setStep] = useState(0);
	useEffect(() => {
		if (m.stage === "paid")
			router.push("/prototype/storefront/checkout/receipt?variant=B");
	}, [m.stage, router]);
	useEffect(() => {
		if (step === 1 && m.signedIn) setStep(2); // returning Customers skip the phone step
	}, [step, m.signedIn]);

	const next = () => {
		if (step === 0) m.startCheckout();
		setStep((s) => Math.min(3, s + 1));
	};
	const back = () => {
		if (step === 1 || (step === 2 && m.scenario.returning)) {
			m.backToBag();
			setStep(0);
			return;
		}
		setStep((s) => Math.max(0, s - 1));
	};
	const ok = [
		m.problems.length === 0 && m.bag.length > 0,
		m.signedIn,
		m.fulfilmentComplete,
		m.canPay,
	][step];
	const low = m.remaining !== null && m.remaining < 5 * 60_000;

	return (
		<div className="mx-auto flex min-h-dvh max-w-md flex-col">
			{/* header: back, step title, clock */}
			<header className="sticky top-0 z-30 bg-(--em-purple) px-4 pt-3 pb-4 text-white">
				<div className="flex items-center gap-3">
					{step > 0 ? (
						<button type="button" onClick={back} aria-label="Back">
							<ArrowLeft className="size-5" />
						</button>
					) : (
						<span className="size-5" />
					)}
					<p className="flex-1 font-semibold">{STEPS[step]}</p>
					{m.remaining !== null && m.stage !== "expired" && (
						<span
							className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-xs tabular-nums ${low ? "bg-red-500" : "bg-white/15"}`}
						>
							<Timer className="size-3.5" /> {clock(m.remaining)}
						</span>
					)}
				</div>
				<div className="mt-3 grid grid-cols-4 gap-1">
					{STEPS.map((s, i) => (
						<span
							key={s}
							className={`h-1 rounded-full ${i <= step ? "bg-(--em-gold)" : "bg-white/25"}`}
						/>
					))}
				</div>
				{m.remaining !== null && step > 0 && (
					<p className="mt-2 text-white/75 text-xs">
						Your items are held while you check out. If the clock runs out, they
						go back on sale.
					</p>
				)}
			</header>

			<main className="flex-1 px-4 pt-4 pb-32">
				{step === 0 && <BagStep m={m} />}
				{step === 1 && <PhoneCode m={m} />}
				{step === 2 && <FulfilmentStep m={m} />}
				{step === 3 && <ReviewStep m={m} goTo={setStep} />}
			</main>

			<footer className="fixed inset-x-0 bottom-0 z-30 border-border border-t bg-white px-4 py-3">
				<div className="mx-auto max-w-md">
					{step < 3 ? (
						<button
							type="button"
							disabled={!ok}
							onClick={next}
							className="h-12 w-full rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
						>
							{step === 0 ? `Check out · ${cedi(m.totals.items)}` : "Continue"}
						</button>
					) : (
						<button
							type="button"
							disabled={!ok}
							onClick={m.pay}
							className="h-12 w-full rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
						>
							{m.stage === "returned-unpaid"
								? "Try payment again"
								: `Pay ${cedi(m.totals.payNow)}`}
						</button>
					)}
				</div>
			</footer>

			{m.stage === "returned-unpaid" && step === 3 && (
				<div className="fixed inset-x-4 bottom-20 z-30 mx-auto max-w-md rounded-lg bg-(--em-ink) p-3 text-sm text-white shadow-xl">
					{m.lastFailure === "failed"
						? "Payment failed. Nothing was charged."
						: "Payment cancelled. Nothing was charged."}{" "}
					Your items are still held.
				</div>
			)}

			{m.stage === "expired" && (
				<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
					<div className="w-full max-w-sm rounded-xl bg-white p-5 text-center">
						<Timer className="mx-auto size-10 text-red-500" />
						<p className="mt-2 font-semibold text-lg">Time's up</p>
						<p className="mt-1 text-muted-foreground text-sm">
							We held your items for 30 minutes. They're back on sale now, and
							nothing was charged. Your bag is saved.
						</p>
						<button
							type="button"
							onClick={() => {
								m.restart();
								setStep(0);
							}}
							className="mt-4 h-11 w-full rounded-md bg-primary font-semibold text-primary-foreground text-sm"
						>
							Back to my bag
						</button>
					</div>
				</div>
			)}

			{m.stage === "paystack" && <PaystackMock m={m} />}
			<ScenarioPanel m={m} />
		</div>
	);
}

function BagStep({ m }: { m: CheckoutModel }) {
	const lines = m.groups.flatMap((g) => g.lines);
	const orders = m.groups.length;
	return (
		<div className="grid gap-4">
			<div className="divide-y divide-border rounded-xl border border-border bg-white">
				{lines.map((l) => (
					<div key={l.id} className="flex items-center gap-3 p-3">
						<Shot
							product={l.product}
							variant={l.variant}
							className="size-12 shrink-0 rounded-md"
							label={false}
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">{l.product.name}</p>
							<p className="text-muted-foreground text-xs">
								{l.label} ·{" "}
								<span
									className={
										l.mode === "now"
											? "font-semibold text-(--em-purple)"
											: "font-semibold text-(--em-gold-ink)"
									}
								>
									{l.mode === "now" ? "In stock" : "Pre-order"}
								</span>
							</p>
						</div>
						<select
							className="h-8 rounded-md border border-border bg-white px-1 text-sm"
							value={l.qty}
							onChange={(e) => m.setQty(l.id, Number(e.target.value))}
						>
							{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((q) => (
								<option key={q} value={q}>
									{q === 0 ? "Remove" : q}
								</option>
							))}
						</select>
						<span className="w-20 text-right font-semibold text-sm">
							{cedi(l.total)}
						</span>
					</div>
				))}
			</div>

			{m.problems.map((g) => (
				<p
					key={g.key}
					className="rounded-lg bg-red-50 p-3 text-red-700 text-sm"
				>
					<b>{g.lines[0].product.name}</b> needs at least {g.moq?.min} per
					Pre-order (any mix of options). You have {g.moq?.have}.
				</p>
			))}

			{/* explainer: the split */}
			<div className="rounded-xl bg-(--em-purple-soft) p-4">
				<p className="font-semibold text-(--em-purple) text-sm">
					You pay once. We split it into {orders}{" "}
					{orders === 1 ? "order" : "orders"}.
				</p>
				<ol className="mt-3 grid gap-3">
					{m.groups.map((g, i) => (
						<li key={g.key} className="flex gap-3 text-sm">
							<span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--em-purple) font-semibold text-white text-xs">
								{i + 1}
							</span>
							<span>
								<b>
									{g.kind === "store"
										? "In-stock order"
										: g.lines[0].product.name}
								</b>
								<span className="block text-muted-foreground text-xs">
									{g.kind === "store"
										? `${g.lines.length} item${g.lines.length > 1 ? "s" : ""}, ready as soon as you pay`
										: `Pre-order, arrives ${g.eta}. Shipping Fee billed then.`}
								</span>
							</span>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}

function FulfilmentStep({ m }: { m: CheckoutModel }) {
	return (
		<div className="grid gap-4">
			<div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
				{(["pickup", "delivery"] as const).map((k) => (
					<button
						key={k}
						type="button"
						onClick={() => m.setMethod(k)}
						className={`h-10 rounded-md font-medium ${m.method === k ? "bg-white shadow" : "text-muted-foreground"}`}
					>
						{k === "pickup" ? "Pickup (free)" : "Delivery"}
					</button>
				))}
			</div>
			{!m.method && (
				<p className="text-muted-foreground text-sm">
					Choose once for all {m.groups.length} orders. You can change an order
					later, until it's dispatched.
				</p>
			)}
			{m.method === "pickup" && (
				<div className="rounded-xl border border-border bg-white p-4 text-sm">
					<p className="font-semibold">{PICKUP_POINT.name}</p>
					<p>{PICKUP_POINT.address}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{PICKUP_POINT.hours}
					</p>
					<p className="mt-3 text-xs">
						Each order gets its own Pickup Code by SMS when it's ready. Show it
						at the counter.
					</p>
				</div>
			)}
			{m.method === "delivery" && (
				<>
					<label className="grid gap-1 text-xs">
						<span className="font-medium">Delivery Zone</span>
						<select
							className={field}
							value={m.zone?.id ?? ""}
							onChange={(e) => m.setZoneId(e.target.value)}
						>
							<option value="" disabled>
								Where should we deliver?
							</option>
							{ZONES.map((z) => (
								<option key={z.id} value={z.id}>
									{z.name} ·{" "}
									{z.fee === undefined ? "fee quoted by SMS" : cedi(z.fee)}
								</option>
							))}
						</select>
						{m.zone && (
							<span className="text-muted-foreground">{m.zone.areas}</span>
						)}
					</label>
					{m.zone && (
						<div className="flex items-center gap-3 rounded-lg border border-(--em-gold) bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-sm">
							<span className="font-bold text-2xl">{m.totals.deliveries}×</span>
							<span>
								<b>
									{m.totals.deliveries} deliveries
									{m.zone.fee !== undefined ? `, ${cedi(m.zone.fee)} each` : ""}
								</b>
								<span className="block text-xs">
									Every order is delivered separately as it becomes ready.
								</span>
							</span>
						</div>
					)}
					{m.zone && <AddressFields m={m} />}
				</>
			)}
		</div>
	);
}

function ReviewStep({
	m,
	goTo,
}: {
	m: CheckoutModel;
	goTo: (s: number) => void;
}) {
	const t = m.totals;
	return (
		<div className="grid gap-4 text-sm">
			<Block title="Contact" onEdit={() => goTo(1)}>
				{m.phone}
			</Block>
			<Block
				title={m.method === "pickup" ? "Pickup" : `Delivery · ${m.zone?.name}`}
				onEdit={() => goTo(2)}
			>
				{m.method === "pickup"
					? PICKUP_POINT.address
					: `${m.address.recipient}, ${m.address.area}. ${m.address.landmark}`}
			</Block>

			<div className="grid gap-2">
				{m.groups.map((g, i) => {
					const deliveryToday = g.kind === "store" ? t.deliveryNow : 0;
					return (
						<div
							key={g.key}
							className="rounded-xl border border-border bg-white p-3"
						>
							<p className="flex justify-between font-semibold">
								<span>
									Order {i + 1}:{" "}
									{g.kind === "store"
										? "In stock"
										: `Pre-order, ${g.lines[0].product.name}`}
								</span>
								<span>{cedi(g.items + deliveryToday)}</span>
							</p>
							<p className="text-muted-foreground text-xs">
								{g.lines
									.map((l) => `${l.qty}× ${l.label || l.product.name}`)
									.join(", ")}
								{deliveryToday > 0 && ` + delivery ${cedi(deliveryToday)}`}
							</p>
							{g.kind === "pre" && (
								<p className="mt-1 text-(--em-gold-ink) text-xs">
									On arrival ({g.eta}): Shipping Fee{" "}
									{g.shipEstimateTotal === undefined
										? "TBC"
										: `~${cedi(g.shipEstimateTotal)}`}
									{m.method === "delivery" &&
										(t.deliveryEach !== undefined
											? ` + delivery ${cedi(t.deliveryEach)}`
											: " + delivery (quoted)")}
									{g.windowCloses &&
										` · orders close ${shortDate(g.windowCloses)}`}
								</p>
							)}
						</div>
					);
				})}
			</div>

			<div className="flex items-center justify-between rounded-xl bg-(--em-purple) p-4 text-white">
				<span>Total today</span>
				<span className="font-bold text-xl">{cedi(t.payNow)}</span>
			</div>
			<p className="flex items-start gap-2 text-muted-foreground text-xs">
				<Check className="mt-0.5 size-3.5 shrink-0" /> You'll pay on Paystack
				with mobile money or card, then come straight back here for your
				Receipt.
			</p>
		</div>
	);
}

function Block({
	title,
	onEdit,
	children,
}: {
	title: string;
	onEdit: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-3 border-border border-b pb-3">
			<div>
				<p className="text-muted-foreground text-xs">{title}</p>
				<p>{children}</p>
			</div>
			<button
				type="button"
				onClick={onEdit}
				className="text-(--em-purple) text-xs underline"
			>
				Edit
			</button>
		</div>
	);
}
