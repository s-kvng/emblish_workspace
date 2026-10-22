// PROTOTYPE (wayfinder #14): three layouts for the /pay/<invoiceId> page a Customer reaches from an
// SMS link, no sign-in. Switch via ?variant=A|B|C and the floating bar. "Scenarios" (top right) picks
// another invoice and forces due-soon / overdue / paid / voided. Try INV-2207 (Shipping Fee + Delivery
// Fee), INV-2215 (Elsewhere Delivery Fee Invoice), INV-2201 (voided, replaced). Mock Paystack.
import { PaySwitch } from "./_pay-variants";

export default async function PayPrototype({
	params,
	searchParams,
}: {
	params: Promise<{ invoiceId: string }>;
	searchParams: Promise<{ variant?: string }>;
}) {
	const [{ invoiceId }, { variant = "A" }] = await Promise.all([
		params,
		searchParams,
	]);
	return <PaySwitch invoiceId={invoiceId} variant={variant} />;
}
