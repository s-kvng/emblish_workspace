"use client";
// PROTOTYPE (wayfinder #18): style tile + real Storefront Home + Back Office Today mock,
// all skinned by one direction's tokens. The grey page chrome is not part of any direction.

import {
	Bike,
	Calculator,
	Clock,
	FileText,
	Hash,
	Home,
	KeyRound,
	Menu,
	Package,
	PackageCheck,
	Receipt,
	Search,
	Tag,
	Truck,
	Undo2,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import { BrowseD } from "../storefront/_browse-variants";
import { type Direction, directions } from "./_directions";

export function DirectionView({ variant }: { variant: string }) {
	const d = directions.find((x) => x.key === variant) ?? directions[0];
	const vars = {
		...d.skin,
		"--font-em-display": d.fonts.display,
		"--font-em-sans": d.fonts.sans,
		"--font-em-wordmark": "var(--font-merri)",
	} as CSSProperties;

	return (
		<div className="min-h-screen bg-neutral-200 px-4 pt-6 pb-28 text-neutral-900">
			<header className="mx-auto max-w-[1240px]">
				<p className="font-mono text-[11px] text-neutral-500 uppercase tracking-widest">
					Prototype · Visual direction for Storefront and Back Office · {d.key}{" "}
					of {directions.length}
				</p>
				<h1 className="mt-1 font-semibold text-3xl tracking-tight">
					{d.key} · {d.name}
				</h1>
				<p className="mt-2 max-w-3xl text-neutral-700 text-sm">{d.pitch}</p>
				<div className="mt-3 flex max-w-4xl flex-wrap gap-2 text-xs">
					<span className="rounded-full bg-white px-3 py-1.5">
						<b>Best for:</b> {d.bestFor}
					</span>
					<span className="rounded-full bg-white px-3 py-1.5">
						<b>Watch out:</b> {d.watchOut}
					</span>
				</div>
			</header>

			<div className="mx-auto mt-6 grid max-w-[1240px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
				<div className="em overflow-hidden rounded-3xl shadow-sm" style={vars}>
					<StyleTile d={d} />
				</div>
				<Phone label="Storefront · Home (real prototype, re-skinned)">
					<div className="em" style={vars}>
						<BrowseD />
					</div>
				</Phone>
				<Phone label="Back Office · Today (mock)">
					<BackOfficeToday d={d} />
				</Phone>
			</div>

			<PrototypeSwitcher
				variants={directions.map(({ key, name }) => ({ key, name }))}
				current={d.key}
			/>
		</div>
	);
}

function Phone({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="mx-auto">
			<p className="mb-2 text-center font-medium text-neutral-600 text-xs">
				{label}
			</p>
			<div className="h-[760px] w-[375px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2.75rem] border-[10px] border-neutral-950 bg-neutral-950 shadow-xl">
				<div className="relative h-full overflow-y-auto overflow-x-hidden rounded-[2rem]">
					{children}
				</div>
			</div>
		</div>
	);
}

/* ---------- Style tile ---------- */

function StyleTile({ d }: { d: Direction }) {
	const dark = d.logo === "black";
	const danger = d.swatches[d.swatches.length - 1].hex;
	const paid = dark ? "#5bc48a" : "#1f7a4d";
	return (
		<div className="space-y-8 p-6">
			<Section title="Logo use">
				<LogoUse d={d} />
			</Section>

			<Section title="Colour">
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{d.swatches.map((s) => (
						<div key={s.role} className="overflow-hidden rounded-xl border">
							<div
								className="flex h-16 items-end p-2 font-mono text-[10px]"
								style={{ background: s.hex, color: s.ink ?? "#1f1430" }}
							>
								{s.hex}
							</div>
							<p className="bg-card px-2 py-1.5 text-[11px] leading-tight">
								{s.role}
							</p>
						</div>
					))}
				</div>
			</Section>

			<Section title={`Type · ${d.fonts.displayName} + ${d.fonts.sansName}`}>
				<p className="display text-4xl leading-[1.05]">{d.tone.headline}</p>
				<p className="display mt-3 text-xl">Closing soon</p>
				<p className="mt-2 max-w-prose text-sm leading-relaxed">
					Pay for the item today and the Shipping Fee when it arrives in Ghana.
					We text you at every stage, then you pick it up or we deliver it.
				</p>
				<div className="mt-3 flex flex-wrap items-baseline gap-4">
					<span className="font-semibold text-(--em-gold-ink) text-[11px] uppercase tracking-[0.2em]">
						Pre-orders now open
					</span>
					<span className="font-bold text-2xl">GH₵ 380</span>
					<span className="text-muted-foreground text-xs">
						+ shipping ~GH₵ 45 on arrival
					</span>
				</div>
			</Section>

			<Section title="Components">
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-sm"
					>
						Pre-order · GH₵ 380
					</button>
					<button
						type="button"
						className="rounded-full border border-current/25 px-5 py-2.5 font-semibold text-sm"
					>
						Buy now
					</button>
					<button
						type="button"
						className="rounded-full bg-(--em-hero-cta-bg) px-5 py-2.5 font-semibold text-(--em-hero-cta-ink) text-sm"
					>
						Shop Pre-orders
					</button>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Badge bg="var(--em-badge-hot-bg)" ink="var(--em-badge-hot-ink)">
						IN STOCK
					</Badge>
					<Badge bg="var(--em-badge-warm-bg)" ink="var(--em-badge-warm-ink)">
						ALSO PRE-ORDER
					</Badge>
					<Badge bg="var(--muted)" ink="var(--muted-foreground)">
						SOLD OUT
					</Badge>
					<Badge bg="var(--em-badge-hot-bg)" ink="var(--em-badge-hot-ink)">
						5 days left
					</Badge>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Stamp color={paid}>PAID</Stamp>
					<Stamp color={danger}>OVERDUE</Stamp>
					<Stamp color="var(--muted-foreground)">VOID</Stamp>
				</div>
				<div className="mt-3 flex max-w-sm overflow-hidden rounded-full border bg-card">
					<input
						placeholder="024 000 0000"
						className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none"
					/>
					<button
						type="button"
						className="bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-xs"
					>
						Notify me
					</button>
				</div>
			</Section>

			<Section title={`Tone of voice · ${d.tone.label}`}>
				<div className="grid gap-4 sm:grid-cols-2">
					<div>
						<p className="mb-1.5 text-muted-foreground text-xs">Arrival SMS</p>
						<div className="rounded-2xl rounded-bl-sm bg-muted p-3 text-sm leading-snug">
							{d.tone.sms}
						</div>
						<p className="mt-1.5 text-[11px] text-muted-foreground">
							{d.tone.sms.length} chars · {d.tone.note}
						</p>
					</div>
					<div className="space-y-3 text-sm">
						<div>
							<p className="mb-1 text-muted-foreground text-xs">
								Empty My orders
							</p>
							<p>{d.tone.empty}</p>
						</div>
						<div>
							<p className="mb-1 text-muted-foreground text-xs">
								Wrong Pickup Code
							</p>
							<p style={{ color: danger }}>{d.tone.error}</p>
						</div>
					</div>
				</div>
			</Section>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<h3 className="mb-3 border-b pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
				{title}
			</h3>
			{children}
		</section>
	);
}

function Badge({
	bg,
	ink,
	children,
}: {
	bg: string;
	ink: string;
	children: ReactNode;
}) {
	return (
		<span
			className="rounded-full px-2.5 py-1 font-semibold text-[11px]"
			style={{ background: bg, color: ink }}
		>
			{children}
		</span>
	);
}

function Stamp({ color, children }: { color: string; children: ReactNode }) {
	return (
		<span
			className="-rotate-3 rounded-md border-2 px-2 py-0.5 font-bold text-xs tracking-widest"
			style={{ color, borderColor: color }}
		>
			{children}
		</span>
	);
}

function Lockup({ ink, size = "text-xl" }: { ink: string; size?: string }) {
	return (
		<div className="flex items-center gap-2">
			<img
				src="/prototype-brand/emblem.png"
				alt=""
				className="size-10 shrink-0"
			/>
			<span className={`em-wordmark ${size}`} style={{ color: ink }}>
				EMBLISH
			</span>
		</div>
	);
}

function LogoUse({ d }: { d: Direction }) {
	if (d.logo === "pill")
		return (
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="grid place-items-center gap-2 rounded-2xl border bg-white p-6">
					<Lockup ink="#5b1f8e" />
					<span className="rounded-full bg-[#ffd84a] px-3 py-1 font-semibold text-[#5b1f8e] text-xs">
						We Serve You With Care
					</span>
				</div>
				<div className="grid place-items-center gap-2 rounded-2xl bg-[#ffd84a] p-6">
					<Lockup ink="#2e0f4a" />
					<span className="rounded-full bg-[#5b1f8e] px-3 py-1 font-semibold text-white text-xs">
						We Serve You With Care
					</span>
				</div>
				<p className="text-muted-foreground text-xs sm:col-span-2">
					The yellow wordmark only works on dark, so on light the wordmark is
					set in purple and the tagline pill carries the yellow. Logo file and
					phone icon are left off the app UI.
				</p>
			</div>
		);
	if (d.logo === "black")
		return (
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="overflow-hidden rounded-2xl bg-black">
					<img
						src="/prototype-brand/logo-full.jpg"
						alt="Emblish logo"
						className="mx-auto h-48"
					/>
				</div>
				<div className="grid place-items-center gap-2 rounded-2xl border bg-card p-6">
					<Lockup ink="#f2cf6b" />
					<span className="text-(--em-gold-ink) text-xs uppercase tracking-[0.25em]">
						We Serve You With Care
					</span>
				</div>
				<p className="text-muted-foreground text-xs sm:col-span-2">
					The logo is used as-is: it was drawn for black. The phone icon is
					dropped everywhere except print and signage.
				</p>
			</div>
		);
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="grid place-items-center gap-2 rounded-2xl border bg-card p-6">
				<Lockup ink="#4a1d6e" />
				<span className="text-(--em-gold-ink) text-xs italic">
					We serve you with care
				</span>
			</div>
			<div className="grid place-items-center rounded-2xl bg-(--em-purple-deep) p-4">
				<img
					src="/prototype-brand/logo-full.png"
					alt="Emblish logo"
					className="h-44"
				/>
			</div>
			<p className="text-muted-foreground text-xs sm:col-span-2">
				Everyday lockup: emblem + purple wordmark on ivory. The full logo
				appears only on deep purple (footer, receipts, splash), where its yellow
				reads.
			</p>
		</div>
	);
}

/* ---------- Back Office Today (mock) ---------- */

const QUEUES = [
	{ label: "Ready for Pickup", n: 3, Icon: PackageCheck },
	{ label: "To dispatch", n: 2, Icon: Truck },
	{ label: "Out for delivery", n: 1, Icon: Bike },
	{ label: "Quote Delivery Fee", n: 1, Icon: Calculator },
	{
		label: "Awaiting payment",
		n: 6,
		Icon: Receipt,
		sub: "2 overdue",
		urgent: true,
	},
	{ label: "Uncollected 7+ days", n: 2, Icon: Clock, urgentCount: true },
	{ label: "Refunds to make", n: 1, Icon: Undo2, sub: "Owner" },
	{ label: "Needs prices", n: 2, Icon: Tag, sub: "Owner" },
];

function BackOfficeToday({ d }: { d: Direction }) {
	const b = d.bo;
	const display: CSSProperties = {
		fontFamily: d.fonts.display,
		fontWeight: Number(d.skin["--em-display-weight"] ?? 500),
		letterSpacing: d.skin["--em-display-tracking"] ?? "-0.01em",
	};
	return (
		<div
			className="flex min-h-full flex-col"
			style={{ background: b.bg, color: b.ink, fontFamily: d.fonts.sans }}
		>
			<div
				className="px-4 pt-10 pb-5"
				style={{ background: b.headerBg, color: b.headerInk }}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<img src="/prototype-brand/emblem.png" alt="" className="size-7" />
						<span className="text-xs opacity-75">Mon 26 Oct</span>
					</div>
					<span
						className="grid size-8 place-items-center rounded-full font-semibold text-[11px]"
						style={{ background: b.fabBg, color: b.fabInk }}
					>
						AO
					</span>
				</div>
				<p className="mt-3 text-[28px] leading-none" style={display}>
					Today
				</p>
				<p className="mt-1 text-xs opacity-75">Good morning, Afua · Owner</p>
			</div>

			<div className="flex-1 space-y-4 p-4">
				<div
					className="rounded-2xl p-4"
					style={{ background: b.bannerBg, color: b.bannerInk }}
				>
					<p className="text-lg leading-tight" style={display}>
						Customer at the counter?
					</p>
					<p className="mt-0.5 text-xs opacity-80">3 Pickup orders waiting</p>
					<button
						type="button"
						className="mt-3 flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold text-sm"
						style={{ background: b.ctaBg, color: b.ctaInk }}
					>
						<KeyRound className="size-4" /> Enter Pickup Code
					</button>
				</div>

				<div
					className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm"
					style={{
						background: b.card,
						borderColor: b.cardBorder,
						color: b.muted,
					}}
				>
					<Search className="size-4" /> Phone or Pickup Code
				</div>

				<div className="grid grid-cols-2 gap-2.5">
					{QUEUES.map(({ label, n, Icon, sub, urgent, urgentCount }) => (
						<div
							key={label}
							className="rounded-2xl border p-3"
							style={{ background: b.card, borderColor: b.cardBorder }}
						>
							<div className="flex items-start justify-between">
								<Icon
									className="size-4"
									style={{ color: b.muted }}
									strokeWidth={1.8}
								/>
								<span
									className="text-2xl leading-none"
									style={{
										...display,
										color: urgentCount ? b.urgent : b.count,
									}}
								>
									{n}
								</span>
							</div>
							<p className="mt-3 font-semibold text-[13px] leading-tight">
								{label}
							</p>
							{sub && (
								<p
									className="mt-0.5 text-[11px]"
									style={{ color: urgent ? b.urgent : b.muted }}
								>
									{sub}
								</p>
							)}
						</div>
					))}
				</div>
			</div>

			<nav
				className="sticky bottom-0 flex items-end justify-around border-t px-2 pt-2 pb-5 text-[10px]"
				style={{
					background: b.tabBg,
					borderColor: b.cardBorder,
					color: b.tabInk,
				}}
			>
				<Tab Icon={Home} label="Today" color={b.tabActive} />
				<Tab Icon={Package} label="Arrivals" />
				<div className="-mt-7 flex flex-col items-center gap-1">
					<span
						className="grid size-14 place-items-center rounded-full shadow-lg"
						style={{ background: b.fabBg, color: b.fabInk }}
					>
						<Hash className="size-6" />
					</span>
					Hand over
				</div>
				<Tab Icon={FileText} label="Invoices" />
				<Tab Icon={Menu} label="More" />
			</nav>
		</div>
	);
}

function Tab({
	Icon,
	label,
	color,
}: {
	Icon: typeof Home;
	label: string;
	color?: string;
}) {
	return (
		<div
			className="flex flex-col items-center gap-1"
			style={color ? { color, fontWeight: 600 } : undefined}
		>
			<Icon className="size-5" />
			{label}
		</div>
	);
}
