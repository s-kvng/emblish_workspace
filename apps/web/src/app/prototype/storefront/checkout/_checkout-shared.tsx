"use client";
// PROTOTYPE (wayfinder #13) — pieces shared by every Checkout variant: the mock Paystack page (not ours
// to design), the prototype scenario panel, and the decided address fields. Layout is NOT shared.

import { Settings2, X } from "lucide-react";
import { useState } from "react";

import { cedi } from "../_data";
import { type CheckoutModel, clock } from "./_checkout-data";

export const field =
	"h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-(--em-purple) focus:ring-2 focus:ring-(--em-purple)/15";

/** The decided address form: landmark required, GhanaPost GPS optional, recipient name and phone. */
export function AddressFields({
	m,
	dense = false,
}: {
	m: CheckoutModel;
	dense?: boolean;
}) {
	const a = m.address;
	const row = dense ? "grid grid-cols-2 gap-2" : "grid gap-3";
	return (
		<div className="grid gap-3">
			<div className={row}>
				<Labeled label="Recipient name">
					<input
						className={field}
						value={a.recipient}
						placeholder="Ama Owusu"
						onChange={(e) => m.setAddress({ recipient: e.target.value })}
					/>
				</Labeled>
				<Labeled label="Recipient phone">
					<input
						className={field}
						inputMode="tel"
						value={a.phone}
						placeholder="024 555 4567"
						onChange={(e) => m.setAddress({ phone: e.target.value })}
					/>
				</Labeled>
			</div>
			<div className={row}>
				<Labeled label="Area / neighbourhood">
					<input
						className={field}
						value={a.area}
						placeholder="East Legon"
						onChange={(e) => m.setAddress({ area: e.target.value })}
					/>
				</Labeled>
				<Labeled label="Street or house no." hint="optional">
					<input
						className={field}
						value={a.street}
						placeholder="Lagos Avenue"
						onChange={(e) => m.setAddress({ street: e.target.value })}
					/>
				</Labeled>
			</div>
			<Labeled label="Closest landmark" hint="helps the rider find you">
				<input
					className={field}
					value={a.landmark}
					placeholder="Blue gate opposite Shell station"
					onChange={(e) => m.setAddress({ landmark: e.target.value })}
				/>
			</Labeled>
			<Labeled label="GhanaPost GPS" hint="optional">
				<input
					className={`${field} uppercase`}
					value={a.gps}
					placeholder="GA-492-7731"
					onChange={(e) => m.setAddress({ gps: e.target.value })}
				/>
			</Labeled>
			<button
				type="button"
				className="justify-self-start text-(--em-purple) text-xs underline"
				onClick={() =>
					m.setAddress({
						recipient: m.name ? `${m.name} Owusu` : "Ama Owusu",
						phone: m.phone || "024 555 4567",
						area: "East Legon",
						street: "Lagos Avenue",
						landmark: "Blue gate opposite Shell station",
					})
				}
			>
				Prototype: fill sample address
			</button>
		</div>
	);
}

export function Labeled({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="grid gap-1 text-xs">
			<span className="font-medium text-(--em-ink)">
				{label}{" "}
				{hint && (
					<span className="font-normal text-muted-foreground">· {hint}</span>
				)}
			</span>
			{children}
		</label>
	);
}

/** Phone number → 6-digit code. Any 6 digits verify in the prototype. */
export function PhoneCode({
	m,
	compact = false,
}: {
	m: CheckoutModel;
	compact?: boolean;
}) {
	if (m.signedIn)
		return (
			<p className="text-sm">
				Signed in as <b>{m.phone}</b>{" "}
				<button
					type="button"
					className="text-(--em-purple) text-xs underline"
					onClick={m.signOut}
				>
					Not you?
				</button>
			</p>
		);
	return (
		<div className="grid gap-3">
			<div className="flex gap-2">
				<span className="grid h-11 shrink-0 place-items-center whitespace-nowrap rounded-md border border-border bg-muted px-3 text-sm">
					🇬🇭 +233
				</span>
				<input
					className={field}
					inputMode="tel"
					placeholder="24 555 4567"
					value={m.phone}
					disabled={m.codeSent}
					onChange={(e) => m.setPhone(e.target.value)}
				/>
			</div>
			{!m.codeSent ? (
				<button
					type="button"
					disabled={m.phone.replace(/\D/g, "").length < 9}
					onClick={m.sendCode}
					className="h-11 rounded-md bg-primary font-semibold text-primary-foreground text-sm disabled:opacity-40"
				>
					Text me a code
				</button>
			) : (
				<div className="grid gap-2">
					<p className="text-muted-foreground text-xs">
						We sent a 6-digit code to {m.phone}.{" "}
						<button type="button" className="underline">
							Resend
						</button>{" "}
						· <span className="text-fuchsia-600">prototype: any 6 digits</span>
					</p>
					<input
						className={`${field} text-center font-mono text-lg tracking-[0.5em]`}
						inputMode="numeric"
						maxLength={6}
						autoFocus
						value={m.code}
						onChange={(e) => m.setCode(e.target.value.replace(/\D/g, ""))}
						placeholder="••••••"
					/>
				</div>
			)}
			{!compact && (
				<p className="text-muted-foreground text-xs">
					No password. Your number is how we text order updates and how you see
					My orders later.
				</p>
			)}
		</div>
	);
}

/** Mock Paystack hosted checkout. Deliberately generic: this page belongs to Paystack, not Emblish. */
export function PaystackMock({ m }: { m: CheckoutModel }) {
	const [tab, setTab] = useState<"momo" | "card">("momo");
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4 font-sans">
			<div className="w-full max-w-sm overflow-hidden rounded-xl bg-white text-slate-800 shadow-2xl">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div>
						<p className="font-semibold text-sm">
							Paystack{" "}
							<span className="font-normal text-slate-400">(mock)</span>
						</p>
						<p className="text-slate-500 text-xs">ama@… · Emblish</p>
					</div>
					<div className="text-right">
						<p className="text-slate-500 text-xs">Pay</p>
						<p className="font-bold">{cedi(m.totals.payNow)}</p>
					</div>
				</div>
				<div className="flex border-b text-sm">
					{(["momo", "card"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`flex-1 py-2 ${tab === t ? "border-emerald-500 border-b-2 font-semibold" : "text-slate-500"}`}
						>
							{t === "momo" ? "Mobile money" : "Card"}
						</button>
					))}
				</div>
				<div className="grid gap-2 p-4 text-sm">
					<p className="text-slate-500 text-xs">
						{tab === "momo"
							? "MTN MoMo · approve the prompt on your phone"
							: "Visa / Mastercard"}
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
						className="h-11 rounded-md text-slate-500 underline"
					>
						Close window (cancel)
					</button>
					{m.remaining !== null && (
						<p className="text-center text-slate-400 text-xs">
							Emblish Checkout expires in {clock(m.remaining)}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

/** Prototype-only scenario controls (fuchsia = not part of the design). */
export function ScenarioPanel({ m }: { m: CheckoutModel }) {
	const [open, setOpen] = useState(false);
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
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={m.scenario.returning}
							onChange={(e) =>
								m.scenario.returning
									? m.signOut()
									: m.setScenario({
											...m.scenario,
											returning: e.target.checked,
										})
							}
						/>
						Returning Customer (already signed in)
					</label>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={m.scenario.nextPayment === "fail"}
							onChange={(e) =>
								m.setScenario({
									...m.scenario,
									nextPayment: e.target.checked ? "fail" : "success",
								})
							}
						/>
						Next payment fails at Paystack
					</label>
					<div className="grid gap-1 border-white/30 border-t pt-2">
						<span>
							Checkout clock:{" "}
							{m.remaining === null ? "no Checkout yet" : clock(m.remaining)}
						</span>
						<div className="flex gap-1">
							<button
								type="button"
								disabled={m.remaining === null}
								onClick={() => m.fastForward(4)}
								className="flex-1 rounded bg-white/20 py-1 disabled:opacity-40"
							>
								→ 4 min left
							</button>
							<button
								type="button"
								disabled={m.remaining === null}
								onClick={() => m.fastForward(0.15)}
								className="flex-1 rounded bg-white/20 py-1 disabled:opacity-40"
							>
								→ expire
							</button>
						</div>
					</div>
					<p className="text-white/80">Stage: {m.stage}</p>
				</div>
			)}
		</div>
	);
}
