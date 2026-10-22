// PROTOTYPE (wayfinder #14): three My orders variants on one throwaway route, switchable via
// ?variant=A|B|C and the floating bar (← / → keys). Each covers: Store Orders and Pre-orders together,
// Order Window tracking, Pickup Code view/resend, switching fulfilment (with the fee difference
// explained), self-cancel, invoices to pay and refund visibility. "Scenarios" (top right) signs out
// or resets the mock. Mock data, no backend.
import { OrdersSwitch } from "./_switch";

export default async function OrdersPrototype({
	searchParams,
}: {
	searchParams: Promise<{ variant?: string }>;
}) {
	const { variant = "A" } = await searchParams;
	return <OrdersSwitch variant={variant} />;
}
