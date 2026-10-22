"use client";
// PROTOTYPE — floating variant switcher for throwaway UI prototypes. Never ships to production.

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({
	variants,
	current,
}: {
	variants: { key: string; name: string }[];
	current: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const i = Math.max(
		0,
		variants.findIndex((v) => v.key === current),
	);

	useEffect(() => {
		const go = (step: number) => {
			const next = variants[(i + step + variants.length) % variants.length];
			router.replace(`${pathname}?variant=${next.key}` as Route, {
				scroll: false,
			});
		};
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t?.closest("input, textarea, select, [contenteditable]")) return;
			if (e.key === "ArrowLeft") go(-1);
			if (e.key === "ArrowRight") go(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [i, variants, pathname, router]);

	if (process.env.NODE_ENV === "production") return null;

	const go = (step: number) => {
		const next = variants[(i + step + variants.length) % variants.length];
		router.replace(`${pathname}?variant=${next.key}` as Route, {
			scroll: false,
		});
	};

	return (
		<div className="fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-1 py-1 font-medium text-white text-xs shadow-2xl ring-2 ring-white">
			<button
				type="button"
				onClick={() => go(-1)}
				className="rounded-full px-3 py-1.5 hover:bg-white/20"
			>
				←
			</button>
			<span className="whitespace-nowrap px-2">
				{variants[i].key} ({variants[i].name})
			</span>
			<button
				type="button"
				onClick={() => go(1)}
				className="rounded-full px-3 py-1.5 hover:bg-white/20"
			>
				→
			</button>
		</div>
	);
}
