"use client";
// PROTOTYPE (wayfinder #13) — Checkout A: "One page, grouped by order".
// Everything on one scrolling page. The Bag is shown already split into the orders it will become.
// The Checkout (and its Stock Holds) is created only when the Customer taps Pay; the 30-minute clock
// appears only once they're back from Paystack without paying.

import {
	AlertTriangle,
	Clock,
	Minus,
	Package,
	Plus,
	Store,
	Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { cedi, daysLeft, shortDate } from "../_data";
import { Shot, StoreHeader } from "../_shared";
import {
	type CheckoutModel,
	clock,
	type OrderGroup,
	PICKUP_POINT,
	useCheckout,
	ZONES,
} from "./_checkout-data";
import {
	AddressFields,
	PaystackMock,
	PhoneCode,
	ScenarioPanel,
} from "./_checkout-shared";

export function CheckoutA() {
	const m = useCheckout({ holdAt: "pay" });
	const router = useRouter();
	useEffect(() => {
		if (m.stage === "paid")
			router.push("/prototype/storefront/checkout/receipt?variant=A");
	}, [m.stage, router]);

	const locked = m.stage === "paystack" || m.stage === "returned-unpaid";
	const orders = m.groups.length;

	return (
		<div className="mx-auto max-w-md pb-40">
			<StoreHeader />
			<div className="px-4">
				<h1 className="font-semibold text-2xl">Checkout</h1>

				{m.stage === "returned-unpaid" && m.remaining !== null && (
					<div className="mt-3 rounded-lg border border-(--em-gold) bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-sm">
						<p className="flex items-center gap-2 font-semibold">
							<Clock className="size-4" />
							{m.lastFailure === "failed"
								? "Payment didn't go through"
								: "You left before paying"}
						</p>
						<p className="mt-1">
							We're holding your items for{" "}
							<b className="tabular-nums">{clock(m.remaining)}</b>. Nothing was
							charged.
						</p>
						<div className="mt-2 flex gap-2">
							<button
								type="button"
								onClick={m.pay}
								className="h-9 rounded-md bg-primary px-4 font-semibold text-primary-foreground text-xs"
							>
								Try payment again
							</button>
							<button
								type="button"
								onClick={m.restart}
								className="h-9 rounded-md px-3 text-xs underline"
							>
								Change my order
							</button>
						</div>
					</div>
				)}

				{m.stage === "expired" && (
					<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
						<p className="font-semibold">Your Checkout expired</p>
						<p className="mt-1">
							30 minutes passed without payment, so your items are no longer
							held. Nothing was charged. Your bag is still here; we'll re-check
							stock and Pre-order space when you try again.
						</p>
						<button
							type="button"
							onClick={m.restart}
							className="mt-2 h-9 rounded-md bg-primary px-4 font-semibold text-primary-foreground text-xs"
						>
							Start again
						</button>
					</div>
				)}

				{/* ---------------- 1. Orders */}
				<section className="mt-4">
					<p className="text-muted-foreground text-sm">
						One payment today,{" "}
						<b className="text-(--em-ink)">
							{orders} separate {orders === 1 ? "order" : "orders"}
						</b>
						: in-stock items are ready now, and each Pre-order arrives on its
						own date.
					</p>
					<div className="mt-3 grid gap-3">
						{m.groups.map((g, i) => (
							<OrderCard key={g.key} g={g} n={i + 1} m={m} locked={locked} />
						))}
					</div>
				</section>

				{/* ---------------- 2. Phone */}
				<Section n={2} title="Your phone number" done={m.signedIn}>
					<PhoneCode m={m} />
				</Section>

				{/* ---------------- 3. Fulfilment */}
				<Section n={3} title="Pickup or Delivery" done={m.fulfilmentComplete}>
					<p className="mb-3 text-muted-foreground text-xs">
						Applies to every order. You can switch an order later, until it's
						dispatched.
					</p>
					<div className="grid grid-cols-2 gap-2">
						{(["pickup", "delivery"] as const).map((k) => (
							<button
								key={k}
								type="button"
								disabled={locked}
								onClick={() => m.setMethod(k)}
								className={`rounded-lg border p-3 text-left text-sm ${m.method === k ? "border-(--em-purple) bg-(--em-purple-soft)" : "border-border bg-white"}`}
							>
								{k === "pickup" ? (
									<Store className="mb-1 size-5 text-(--em-purple)" />
								) : (
									<Truck className="mb-1 size-5 text-(--em-purple)" />
								)}
								<p className="font-semibold">
									{k === "pickup" ? "Pickup" : "Delivery"}
								</p>
								<p className="text-muted-foreground text-xs">
									{k === "pickup"
										? "Free · Osu, Accra"
										: "Fee by zone, per order"}
								</p>
							</button>
						))}
					</div>
					{m.method === "pickup" && (
						<div className="mt-3 rounded-lg bg-muted p-3 text-sm">
							<p className="font-semibold">{PICKUP_POINT.name}</p>
							<p>{PICKUP_POINT.address}</p>
							<p className="text-muted-foreground text-xs">
								{PICKUP_POINT.hours}. We text you a Pickup Code for each order
								when it's ready.
							</p>
						</div>
					)}
					{m.method === "delivery" && (
						<div className="mt-3 grid gap-3">
							<div className="grid gap-1.5">
								{ZONES.map((z) => (
									<label
										key={z.id}
										className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${m.zone?.id === z.id ? "border-(--em-purple) bg-(--em-purple-soft)" : "border-border bg-white"}`}
									>
										<input
											type="radio"
											name="zone-a"
											checked={m.zone?.id === z.id}
											onChange={() => m.setZoneId(z.id)}
											className="accent-(--em-purple)"
										/>
										<span className="flex-1">
											<span className="block font-medium">{z.name}</span>
											<span className="block text-muted-foreground text-xs">
												{z.areas}
											</span>
										</span>
										<span className="font-semibold">
											{z.fee === undefined ? "Quoted" : cedi(z.fee)}
										</span>
									</label>
								))}
							</div>
							{m.zone && <DeliveryNote m={m} />}
							{m.zone && <AddressFields m={m} />}
						</div>
					)}
				</Section>

				{/* ---------------- 4. Summary */}
				<Section n={4} title="What you pay" done={false}>
					<Summary m={m} />
				</Section>
			</div>

			{/* sticky pay bar */}
			<div className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-white/95 px-4 py-3 backdrop-blur">
				<div className="mx-auto flex max-w-md items-center gap-3">
					<div className="flex-1">
						<p className="text-muted-foreground text-xs">Pay today</p>
						<p className="font-bold text-lg">{cedi(m.totals.payNow)}</p>
					</div>
					<button
						type="button"
						disabled={!m.canPay || m.stage === "expired"}
						onClick={m.pay}
						className="h-12 flex-1 rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
					>
						{m.stage === "returned-unpaid" ? "Try again" : "Pay with Paystack"}
					</button>
				</div>
				{!m.canPay && m.stage === "bag" && (
					<p className="mx-auto mt-1 max-w-md text-muted-foreground text-xs">
						{blocker(m)}
					</p>
				)}
			</div>

			{m.stage === "paystack" && <PaystackMock m={m} />}
			<ScenarioPanel m={m} />
		</div>
	);
}

function blocker(m: CheckoutModel) {
	if (m.problems.length)
		return `Reach the minimum for ${m.problems[0].lines[0].product.name} first.`;
	if (!m.signedIn) return "Verify your phone number to continue.";
	if (!m.method) return "Choose Pickup or Delivery.";
	if (!m.zone) return "Choose your Delivery Zone.";
	if (!m.addressComplete) return "Add recipient, phone, area and a landmark.";
	return "";
}

function Section({
	n,
	title,
	done,
	children,
}: {
	n: number;
	title: string;
	done: boolean;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-6 border-border border-t pt-5">
			<h2 className="mb-3 flex items-center gap-2 font-semibold">
				<span
					className={`grid size-6 place-items-center rounded-full text-xs ${done ? "bg-(--em-purple) text-white" : "bg-muted text-muted-foreground"}`}
				>
					{done ? "✓" : n}
				</span>
				{title}
			</h2>
			{children}
		</section>
	);
}

function OrderCard({
	g,
	n,
	m,
	locked,
}: {
	g: OrderGroup;
	n: number;
	m: CheckoutModel;
	locked: boolean;
}) {
	const short = g.moq && g.moq.have < g.moq.min;
	return (
		<div
			className={`overflow-hidden rounded-xl border bg-white ${short ? "border-red-300" : "border-border"}`}
		>
			<div
				className={`flex items-center gap-2 px-3 py-2 text-xs ${g.kind === "store" ? "bg-(--em-purple-soft) text-(--em-purple)" : "bg-(--em-gold-soft) text-(--em-gold-ink)"}`}
			>
				{g.kind === "store" ? (
					<Package className="size-4" />
				) : (
					<Clock className="size-4" />
				)}
				<span className="font-semibold">
					Order {n} · {g.title}
				</span>
				<span className="ml-auto">{g.subtitle}</span>
			</div>
			<div className="divide-y divide-border">
				{g.lines.map((l) => (
					<div key={l.id} className="flex gap-3 p-3">
						<Shot
							product={l.product}
							variant={l.variant}
							className="size-14 shrink-0 rounded-md"
							label={false}
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">{l.product.name}</p>
							<p className="text-muted-foreground text-xs">{l.label}</p>
							<div className="mt-1 flex items-center justify-between">
								<Stepper
									qty={l.qty}
									disabled={locked}
									onChange={(q) => m.setQty(l.id, q)}
								/>
								<span className="font-semibold text-sm">{cedi(l.total)}</span>
							</div>
						</div>
					</div>
				))}
			</div>
			{g.kind === "pre" && (
				<div className="grid gap-1 bg-muted/50 px-3 py-2 text-muted-foreground text-xs">
					{g.windowCloses && (
						<span>
							Orders close {shortDate(g.windowCloses)} (
							{daysLeft(g.windowCloses)} days) · arrives {g.eta}
						</span>
					)}
					<span>
						Shipping Fee billed on arrival:{" "}
						{g.shipEstimateTotal === undefined
							? "confirmed on arrival"
							: `about ${cedi(g.shipEstimateTotal)}`}
					</span>
				</div>
			)}
			{short && g.moq && (
				<p className="flex items-center gap-2 bg-red-50 px-3 py-2 text-red-700 text-xs">
					<AlertTriangle className="size-4 shrink-0" />
					Minimum {g.moq.min} across all options. Add {g.moq.min - g.moq.have}{" "}
					more to Pre-order this.
				</p>
			)}
		</div>
	);
}

function Stepper({
	qty,
	onChange,
	disabled,
}: {
	qty: number;
	onChange: (q: number) => void;
	disabled?: boolean;
}) {
	return (
		<span className="inline-flex items-center rounded-full border border-border text-sm">
			<button
				type="button"
				disabled={disabled}
				onClick={() => onChange(qty - 1)}
				className="grid size-7 place-items-center disabled:opacity-30"
			>
				<Minus className="size-3" />
			</button>
			<span className="w-6 text-center tabular-nums">{qty}</span>
			<button
				type="button"
				disabled={disabled}
				onClick={() => onChange(qty + 1)}
				className="grid size-7 place-items-center disabled:opacity-30"
			>
				<Plus className="size-3" />
			</button>
		</span>
	);
}

function DeliveryNote({ m }: { m: CheckoutModel }) {
	const t = m.totals;
	const n = t.deliveries;
	if (t.deliveryEach === undefined)
		return (
			<p className="rounded-lg bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-xs">
				<b>{n} deliveries.</b> We'll text you a Delivery Fee for each order. The
				in-stock order ships once that's paid.
			</p>
		);
	return (
		<p className="rounded-lg bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-xs">
			<b>
				{n} deliveries, {cedi(t.deliveryEach)} each.
			</b>{" "}
			Each order travels on its own. You pay the in-stock one today; each
			Pre-order's comes with its Shipping Fee.
		</p>
	);
}

function Summary({ m }: { m: CheckoutModel }) {
	const t = m.totals;
	const pre = m.groups.filter((g) => g.kind === "pre").length;
	return (
		<div className="grid gap-4 text-sm">
			<div className="grid gap-1">
				<p className="font-semibold text-xs uppercase tracking-wide">Today</p>
				<Row k="Items" v={cedi(t.items)} />
				{t.deliveryNow > 0 && (
					<Row k="Delivery, in-stock order" v={cedi(t.deliveryNow)} />
				)}
				<Row k={<b>Pay today</b>} v={<b>{cedi(t.payNow)}</b>} />
			</div>
			{pre > 0 && (
				<div className="grid gap-1 text-muted-foreground">
					<p className="font-semibold text-xs uppercase tracking-wide">
						Later, when Pre-orders arrive
					</p>
					<Row
						k="Shipping Fees (estimate)"
						v={`~${cedi(t.laterShipping)}${t.laterShippingUnknown ? " + TBC" : ""}`}
					/>
					{t.laterDelivery > 0 && (
						<Row
							k={`Delivery, ${pre} Pre-order${pre > 1 ? "s" : ""}`}
							v={cedi(t.laterDelivery)}
						/>
					)}
					<p className="text-xs">
						We text you an invoice for each Pre-order when it lands in Ghana.
					</p>
				</div>
			)}
		</div>
	);
}

const Row = ({ k, v }: { k: React.ReactNode; v: React.ReactNode }) => (
	<div className="flex justify-between">
		<span>{k}</span>
		<span>{v}</span>
	</div>
);
