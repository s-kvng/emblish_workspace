import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadedQueryResult, preloadQuery } from "convex/nextjs";
import { notFound } from "next/navigation";

import InvoiceView from "@/components/storefront/invoice-view";

import { ENV } from "../../../env";

export const metadata = {
  title: "Invoice · Emblish",
  robots: { index: false },
};

/** An invoice, public to whoever has its link (the invoice SMS carries it), and pay-only. */
export default async function InvoicePage({ params, searchParams }: PageProps<"/p/[code]">) {
  const { code } = await params;
  const { from } = await searchParams;
  const preloaded = await preloadQuery(
    api.storefront.invoices.get,
    { code },
    { url: ENV.NEXT_PUBLIC_CONVEX_URL },
  );
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <InvoiceView preloaded={preloaded} returnedFromSeev={from === "seev"} />;
}
