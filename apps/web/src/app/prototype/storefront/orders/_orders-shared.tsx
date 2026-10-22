"use client";
// PROTOTYPE (wayfinder #14) — pieces shared by every My orders variant: the signed-out gate (decided
// in #4: phone code, ~60-day session), the prototype scenario panel, and plain helpers.
// Layout is NOT shared.

import { RotateCcw, Settings2, X } from "lucide-react";
import { useState } from "react";

import { field } from "../checkout/_checkout-shared";
import type { OrdersModel } from "./_orders-data";

/** My orders needs a session; a signed-out visitor verifies their phone first. */
export function SignInGate({ m }: { m: OrdersModel }) {
	const [sent, setSent] = useState(false);
	return (
		<div className="mx-auto grid max-w-sm gap-3 px-4 py-16">
			<h1 className="display font-semibold text-(--em-purple) text-2xl">
				My orders
			</h1>
			<p className="text-muted-foreground text-sm">
				Enter the phone number you ordered with. We'll text you a code.
			</p>
			<div className="flex gap-2">
				<span className="grid h-11 shrink-0 place-items-center rounded-md border border-border bg-muted px-3 text-sm">
					🇬🇭 +233
				</span>
				<input className={field} inputMode="tel" placeholder="24 555 4567" />
			</div>
			{!sent ? (
				<button
					type="button"
					onClick={() => setSent(true)}
					className="h-11 rounded-md bg-primary font-semibold text-primary-foreground text-sm"
				>
					Text me a code
				</button>
			) : (
				<input
					className={`${field} text-center font-mono text-lg tracking-[0.5em]`}
					maxLength={6}
					placeholder="••••••"
					onChange={(e) => e.target.value.length === 6 && m.setSignedIn(true)}
				/>
			)}
			<p className="text-muted-foreground text-xs">
				Paying an invoice from an SMS link never needs this.{" "}
				<span className="text-fuchsia-600">prototype: any 6 digits</span>
			</p>
		</div>
	);
}

/** Prototype-only controls (fuchsia = not part of the design). */
export function OrdersScenarioPanel({ m }: { m: OrdersModel }) {
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
							checked={m.signedIn}
							onChange={(e) => m.setSignedIn(e.target.checked)}
						/>
						Signed in (60-day session)
					</label>
					<button
						type="button"
						onClick={m.reset}
						className="flex items-center justify-center gap-1 rounded bg-white/20 py-1"
					>
						<RotateCcw className="size-3" /> Reset mock orders
					</button>
					<p className="text-white/80">
						Today is {"22 Oct 2026"}. Pay links open /pay/&lt;invoiceId&gt;;
						paying there updates these orders.
					</p>
				</div>
			)}
		</div>
	);
}
