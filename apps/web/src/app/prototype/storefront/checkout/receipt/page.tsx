// PROTOTYPE (wayfinder #13): three Receipt layouts, switchable via ?variant=A|B|C.
// Reads the last prototype Checkout from sessionStorage, or a sample paid Checkout.
import { ReceiptSwitch } from "../_receipt-variants";

export default async function ReceiptPrototype({
	searchParams,
}: {
	searchParams: Promise<{ variant?: string }>;
}) {
	const { variant = "A" } = await searchParams;
	return <ReceiptSwitch variant={variant} />;
}
