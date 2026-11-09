import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadedQueryResult, preloadQuery } from "convex/nextjs";
import { notFound } from "next/navigation";

import ReceiptView from "@/components/storefront/receipt-view";

import { ENV } from "../../../env";

export const metadata = {
  title: "Receipt · Emblish",
  robots: { index: false },
};

/** A Receipt, public to whoever has its link (the payment SMS carries it). */
export default async function ReceiptPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  const preloaded = await preloadQuery(
    api.storefront.receipts.get,
    { code },
    { url: ENV.NEXT_PUBLIC_CONVEX_URL },
  );
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <ReceiptView preloaded={preloaded} />;
}
