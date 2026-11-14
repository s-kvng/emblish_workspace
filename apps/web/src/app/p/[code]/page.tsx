import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadedQueryResult, preloadQuery } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";

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
  const invoice = preloadedQueryResult(preloaded);
  if (invoice === null) notFound();
  // A voided invoice's link goes to the live end of its chain: the invoice to pay now.
  if (invoice.status === "void" && invoice.replacedByCode) {
    redirect(`/p/${invoice.replacedByCode}${from === "seev" ? "?from=seev" : ""}`);
  }
  return <InvoiceView preloaded={preloaded} returnedFromSeev={from === "seev"} />;
}
