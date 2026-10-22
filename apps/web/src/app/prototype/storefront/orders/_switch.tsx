"use client";
// PROTOTYPE (wayfinder #14) — mounts one My orders variant plus the floating switcher.

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import { OrdersA } from "./_variant-a";
import { OrdersB } from "./_variant-b";
import { OrdersC } from "./_variant-c";

const ordersVariants = [
	{ key: "A", name: "Inbox + order page", C: OrdersA },
	{ key: "B", name: "One feed, expandable cards", C: OrdersB },
	{ key: "C", name: "To-do first + journey sheet", C: OrdersC },
];

export function OrdersSwitch({ variant }: { variant: string }) {
	const V = ordersVariants.find((v) => v.key === variant) ?? ordersVariants[0];
	return (
		<>
			<V.C key={V.key} />
			<PrototypeSwitcher variants={ordersVariants} current={V.key} />
		</>
	);
}
