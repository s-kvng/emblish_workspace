// PROTOTYPE (wayfinder #12): three Storefront browse variants on one throwaway route,
// switchable via ?variant=A|B|C and the floating bar (← / → keys).
import { BrowseSwitch } from "./_browse-variants";

export default async function BrowsePrototype({
	searchParams,
}: {
	searchParams: Promise<{ variant?: string }>;
}) {
	const { variant = "D" } = await searchParams;
	return <BrowseSwitch variant={variant} />;
}
