import CheckoutView, { type Step } from "@/components/storefront/checkout-view";

const steps: Step[] = ["bag", "phone", "pickup", "review"];

/**
 * The step-by-step Checkout: Bag → Phone → Pickup → Review & pay. Seev's hosted checkout
 * sends the Customer back here with `?checkout=<id>`, and sign-in returns with `?step=pickup`.
 */
export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const params = await searchParams;
  const step = steps.find((s) => s === params.step) ?? "bag";
  const checkoutId = typeof params.checkout === "string" ? params.checkout : undefined;
  return (
    <CheckoutView initialStep={checkoutId ? "review" : step} returnedCheckoutId={checkoutId} />
  );
}
