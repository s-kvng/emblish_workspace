import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadedQueryResult, preloadQuery } from "convex/nextjs";
import { notFound } from "next/navigation";

import ProductView from "@/components/storefront/product-view";

import { ENV } from "../../../env";

/** Only Published Products resolve; Drafts and archived ones 404. */
export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const preloaded = await preloadQuery(
    api.storefront.catalog.product,
    { slug },
    { url: ENV.NEXT_PUBLIC_CONVEX_URL },
  );
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <ProductView preloaded={preloaded} />;
}
