// PROTOTYPE (wayfinder #13): three Storefront Checkout variants on one throwaway route,
// switchable via ?variant=A|B|C and the floating bar (← / → keys). "Scenarios" (top right) drives
// returning Customer, payment failure and the 30-minute expiry. Mock Bag, no backend.
import { CheckoutSwitch } from "./_switch";

export default async function CheckoutPrototype({
	searchParams,
}: {
	searchParams: Promise<{ variant?: string }>;
}) {
	const { variant = "A" } = await searchParams;
	return <CheckoutSwitch variant={variant} />;
}
