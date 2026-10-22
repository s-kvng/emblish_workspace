// PROTOTYPE (wayfinder #12): three Storefront product-page variants on one throwaway route,
// switchable via ?variant=A|B|C and the floating bar (← / → keys).
import { ProductSwitch } from "../_product-variants";

export default async function ProductPrototype({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ variant?: string }>;
}) {
	const [{ slug }, { variant = "A" }] = await Promise.all([
		params,
		searchParams,
	]);
	return <ProductSwitch variant={variant} slug={slug} />;
}
