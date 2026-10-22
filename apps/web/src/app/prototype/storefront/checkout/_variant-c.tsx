"use client";
// PROTOTYPE (wayfinder #13) — Checkout C: "Money timeline + bottom sheets".
// The Bag page is laid out as a timeline of when things happen and what you pay at each point
// (today → each Pre-order's arrival). Checking out happens in bottom sheets over the timeline:
// phone → Pickup / Delivery → confirm. The Checkout is created at "Pay"; its clock is a thin bar
// across the top of the sheet once it exists.

import {
	CalendarClock,
	ChevronRight,
	MapPin,
	Minus,
	Plus,
	ShoppingBag,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cedi } from "../_data";
import { Shot, StoreHeader } from "../_shared";
import {
	type CheckoutModel,
	clock,
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

type Sheet = null | "phone" | "fulfil" | "confirm";

export function CheckoutC() {
	const m = useCheckout({ holdAt: "pay" });
	const router = useRouter();
	const [sheet, setSheet] = useState<Sheet>(null);
	useEffect(() => {
		if (m.stage === "paid")
			router.push("/prototype/storefront/checkout/receipt?variant=C");
	}, [m.stage, router]);
	useEffect(() => {
		if (m.stage === "returned-unpaid" || m.stage === "expired")
			setSheet("confirm");
	}, [m.stage]);

	const open = () =>
		setSheet(
			m.signedIn ? (m.fulfilmentComplete ? "confirm" : "fulfil") : "phone",
		);
	const t = m.totals;
	const delivering = m.method === "delivery" && m.zone;

	return (
		<div className="mx-auto max-w-md pb-32">
			<StoreHeader />
			<div className="px-4">
				<h1 className="font-semibold text-2xl">Your bag</h1>
				<p className="text-muted-foreground text-sm">
					What happens after you pay, and when.
				</p>

				<ol className="relative mt-5 ml-3 border-(--em-purple)/20 border-l-2">
					{m.groups.map((g, i) => {
						const today = g.kind === "store";
						return (
							<li key={g.key} className="relative mb-6 pl-5">
								<span
									className={`absolute top-0 -left-[9px] size-4 rounded-full ring-(--background) ring-4 ${today ? "bg-(--em-purple)" : "bg-(--em-gold)"}`}
								/>
								<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									{today ? "Today" : `${g.eta} · arrives`}
								</p>
								<p className="font-semibold">
									{today
										? "In-stock order, ready right away"
										: `Pre-order: ${g.lines[0].product.name}`}
								</p>
								<div className="mt-2 grid gap-2">
									{g.lines.map((l) => (
										<div
											key={l.id}
											className="flex items-center gap-3 rounded-lg bg-white p-2 shadow-sm ring-1 ring-border"
										>
											<Shot
												product={l.product}
												variant={l.variant}
												className="size-11 shrink-0 rounded"
												label={false}
											/>
											<div className="min-w-0 flex-1 text-sm">
												<p className="truncate">{l.product.name}</p>
												<p className="text-muted-foreground text-xs">
													{l.label}
												</p>
											</div>
											<span className="flex items-center gap-1.5 text-sm">
												<button
													type="button"
													onClick={() => m.setQty(l.id, l.qty - 1)}
													className="grid size-6 place-items-center rounded-full bg-muted"
												>
													<Minus className="size-3" />
												</button>
												<span className="w-4 text-center tabular-nums">
													{l.qty}
												</span>
												<button
													type="button"
													onClick={() => m.setQty(l.id, l.qty + 1)}
													className="grid size-6 place-items-center rounded-full bg-muted"
												>
													<Plus className="size-3" />
												</button>
											</span>
										</div>
									))}
								</div>
								{g.moq && g.moq.have < g.moq.min && (
									<div className="mt-2">
										<div className="h-1.5 overflow-hidden rounded-full bg-red-100">
											<div
												className="h-full bg-red-500"
												style={{ width: `${(g.moq.have / g.moq.min) * 100}%` }}
											/>
										</div>
										<p className="mt-1 text-red-700 text-xs">
											{g.moq.have} of {g.moq.min} minimum. Mix any options to
											reach it.
										</p>
									</div>
								)}
								{/* money at this point in time */}
								<div
									className={`mt-2 rounded-lg px-3 py-2 text-xs ${today ? "bg-(--em-purple-soft) text-(--em-purple)" : "bg-(--em-gold-soft) text-(--em-gold-ink)"}`}
								>
									{today ? (
										<>
											Pay now: <b>{cedi(g.items)}</b>
											{delivering &&
												(t.deliveryEach !== undefined
													? ` + delivery ${cedi(t.deliveryEach)}`
													: " · delivery fee quoted by SMS")}
										</>
									) : (
										<>
											Pay now: <b>{cedi(g.items)}</b> · On arrival: Shipping Fee{" "}
											{g.shipEstimateTotal === undefined
												? "TBC"
												: `~${cedi(g.shipEstimateTotal)}`}
											{delivering &&
												(t.deliveryEach !== undefined
													? ` + delivery ${cedi(t.deliveryEach)}`
													: " + delivery (quoted)")}
										</>
									)}
								</div>
								{i === 0 && m.groups.length > 1 && (
									<p className="mt-2 text-muted-foreground text-xs">
										Each step is its own order with its own SMS updates
										{delivering ? " and its own delivery" : ""}.
									</p>
								)}
							</li>
						);
					})}
				</ol>
			</div>

			<div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-(--background) via-(--background) to-transparent px-4 pt-6 pb-4">
				<button
					type="button"
					disabled={m.problems.length > 0 || m.bag.length === 0}
					onClick={open}
					className="mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-40"
				>
					<span className="flex items-center gap-2">
						<ShoppingBag className="size-5" /> Check out
					</span>
					<span>{cedi(t.payNow)} today</span>
				</button>
			</div>

			{sheet && <SheetC m={m} sheet={sheet} setSheet={setSheet} />}
			{m.stage === "paystack" && <PaystackMock m={m} />}
			<ScenarioPanel m={m} />
		</div>
	);
}

function SheetC({
	m,
	sheet,
	setSheet,
}: {
	m: CheckoutModel;
	sheet: Exclude<Sheet, null>;
	setSheet: (s: Sheet) => void;
}) {
	const title = {
		phone: "What's your number?",
		fulfil: "How do you want your orders?",
		confirm: "Confirm and pay",
	}[sheet];
	const pct = m.remaining === null ? null : (m.remaining / (30 * 60_000)) * 100;
	return (
		<div
			className="fixed inset-0 z-40 flex items-end bg-black/40"
			onClick={() => m.stage !== "expired" && setSheet(null)}
		>
			<div
				className="mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-(--background)"
				onClick={(e) => e.stopPropagation()}
			>
				{pct !== null && (
					<div className="sticky top-0 z-10 h-1 bg-muted">
						<div
							className={`h-full transition-all ${pct < 17 ? "bg-red-500" : "bg-(--em-gold)"}`}
							style={{ width: `${pct}%` }}
						/>
					</div>
				)}
				<div className="p-5">
					<div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
					<div className="mb-4 flex items-center justify-between">
						<p className="display font-semibold text-lg">{title}</p>
						<button type="button" onClick={() => setSheet(null)}>
							<X className="size-5" />
						</button>
					</div>

					{sheet === "phone" && (
						<>
							<PhoneCode m={m} />
							{m.signedIn && (
								<button
									type="button"
									onClick={() => setSheet("fulfil")}
									className="mt-4 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground text-sm"
								>
									Continue
								</button>
							)}
						</>
					)}

					{sheet === "fulfil" && (
						<div className="grid gap-3">
							<button
								type="button"
								onClick={() => m.setMethod("pickup")}
								className={`flex items-center gap-3 rounded-xl border p-4 text-left ${m.method === "pickup" ? "border-(--em-purple) bg-(--em-purple-soft)" : "border-border bg-white"}`}
							>
								<MapPin className="size-5 text-(--em-purple)" />
								<span className="flex-1 text-sm">
									<b>Pick up in Osu</b> · free
									<span className="block text-muted-foreground text-xs">
										{PICKUP_POINT.address}, {PICKUP_POINT.hours}
									</span>
								</span>
							</button>
							<p className="text-muted-foreground text-xs">Or deliver to…</p>
							<div className="grid grid-cols-2 gap-2">
								{ZONES.map((z) => (
									<button
										key={z.id}
										type="button"
										onClick={() => {
											m.setMethod("delivery");
											m.setZoneId(z.id);
										}}
										className={`rounded-xl border p-3 text-left text-sm ${m.method === "delivery" && m.zone?.id === z.id ? "border-(--em-purple) bg-(--em-purple-soft)" : "border-border bg-white"}`}
									>
										<b className="block">{z.name}</b>
										<span className="text-muted-foreground text-xs">
											{z.fee === undefined
												? "Quoted by SMS"
												: `${cedi(z.fee)} per order`}
										</span>
									</button>
								))}
							</div>
							{m.method === "delivery" && m.zone && (
								<>
									<p className="rounded-lg bg-(--em-gold-soft) p-3 text-(--em-gold-ink) text-xs">
										<b>
											{m.totals.deliveries} deliveries
											{m.zone.fee !== undefined
												? `, ${cedi(m.zone.fee)} each`
												: ""}
										</b>
										, one per order as it becomes ready.{" "}
										{m.zone.fee !== undefined &&
											`${cedi(m.zone.fee)} today, the rest with each Shipping Fee.`}
									</p>
									<AddressFields m={m} dense />
								</>
							)}
							<button
								type="button"
								disabled={!m.fulfilmentComplete}
								onClick={() => setSheet("confirm")}
								className="mt-2 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
							>
								Continue
							</button>
						</div>
					)}

					{sheet === "confirm" && <Confirm m={m} setSheet={setSheet} />}
				</div>
			</div>
		</div>
	);
}

function Confirm({
	m,
	setSheet,
}: {
	m: CheckoutModel;
	setSheet: (s: Sheet) => void;
}) {
	const t = m.totals;
	if (m.stage === "expired")
		return (
			<div className="grid gap-3 text-center">
				<CalendarClock className="mx-auto size-10 text-red-500" />
				<p className="font-semibold">This Checkout has expired</p>
				<p className="text-muted-foreground text-sm">
					We only hold items for 30 minutes. Nothing was charged. Check out
					again and we'll re-check what's still available.
				</p>
				<button
					type="button"
					onClick={() => {
						m.restart();
						setSheet(null);
					}}
					className="h-12 rounded-full bg-primary font-semibold text-primary-foreground text-sm"
				>
					Back to my bag
				</button>
			</div>
		);
	return (
		<div className="grid gap-3 text-sm">
			{m.stage === "returned-unpaid" && m.remaining !== null && (
				<p className="rounded-lg bg-red-50 p-3 text-red-700 text-xs">
					{m.lastFailure === "failed"
						? "Payment failed"
						: "Payment not finished"}
					. Nothing was charged. Items held for{" "}
					<b className="tabular-nums">{clock(m.remaining)}</b>.
				</p>
			)}
			<Line label="Number" value={m.phone} onClick={() => setSheet("phone")} />
			<Line
				label={m.method === "pickup" ? "Pickup" : "Delivery"}
				value={
					m.method === "pickup"
						? "Osu pickup point"
						: `${m.zone?.name} · ${m.address.landmark}`
				}
				onClick={() => setSheet("fulfil")}
			/>
			<div className="grid gap-1 rounded-xl bg-white p-3 ring-1 ring-border">
				{m.groups.map((g) => (
					<div key={g.key} className="flex justify-between">
						<span>
							{g.kind === "store"
								? "In-stock order"
								: `Pre-order: ${g.lines[0].product.name}`}
						</span>
						<span>{cedi(g.items)}</span>
					</div>
				))}
				{t.deliveryNow > 0 && (
					<div className="flex justify-between">
						<span>Delivery, in-stock order</span>
						<span>{cedi(t.deliveryNow)}</span>
					</div>
				)}
				<div className="mt-1 flex justify-between border-border border-t pt-2 font-bold">
					<span>Today</span>
					<span>{cedi(t.payNow)}</span>
				</div>
				<p className="text-muted-foreground text-xs">
					Later: Shipping Fees ~{cedi(t.laterShipping)}
					{t.laterDelivery > 0 && ` + ${cedi(t.laterDelivery)} delivery`},
					invoiced by SMS as each Pre-order lands.
				</p>
			</div>
			<button
				type="button"
				disabled={!m.canPay}
				onClick={m.pay}
				className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
			>
				{m.stage === "returned-unpaid" ? "Try again" : `Pay ${cedi(t.payNow)}`}
			</button>
			<p className="text-center text-muted-foreground text-xs">
				Mobile money or card, on Paystack. Items are held for 30 minutes once
				you tap Pay.
			</p>
		</div>
	);
}

function Line({
	label,
	value,
	onClick,
}: {
	label: string;
	value: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-border"
		>
			<span className="flex-1">
				<span className="block text-muted-foreground text-xs">{label}</span>
				{value}
			</span>
			<ChevronRight className="size-4 text-muted-foreground" />
		</button>
	);
}
