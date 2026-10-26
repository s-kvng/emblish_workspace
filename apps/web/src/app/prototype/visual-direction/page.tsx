// PROTOTYPE (wayfinder #18): three visual directions for Storefront + Back Office on one
// throwaway route, switchable via ?variant=A|B|C and the floating bar (← / → keys).
import { DirectionView } from "./_view";

export default async function VisualDirectionPrototype({
	searchParams,
}: {
	searchParams: Promise<{ variant?: string }>;
}) {
	const { variant = "A" } = await searchParams;
	return <DirectionView variant={variant} />;
}
