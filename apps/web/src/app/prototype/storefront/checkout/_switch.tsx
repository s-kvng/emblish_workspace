"use client";
// PROTOTYPE (wayfinder #13) — mounts one Checkout variant plus the floating switcher.

import { PrototypeSwitcher } from "@/components/prototype-switcher";

import { CheckoutA } from "./_variant-a";
import { CheckoutB } from "./_variant-b";
import { CheckoutC } from "./_variant-c";

const checkoutVariants = [
	{ key: "A", name: "One page, grouped by order", C: CheckoutA },
	{ key: "B", name: "Step-by-step, held from start", C: CheckoutB },
	{ key: "C", name: "Money timeline + sheets", C: CheckoutC },
];

export function CheckoutSwitch({ variant }: { variant: string }) {
	const V =
		checkoutVariants.find((v) => v.key === variant) ?? checkoutVariants[0];
	return (
		<>
			<V.C key={V.key} />
			<PrototypeSwitcher variants={checkoutVariants} current={V.key} />
		</>
	);
}
