import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadedQueryResult, preloadQuery } from "convex/nextjs";
import { notFound } from "next/navigation";

import CategoryView from "@/components/storefront/category-view";

import { ENV } from "../../../env";

export default async function CategoryPage({ params }: PageProps<"/categories/[categoryId]">) {
  const { categoryId } = await params;
  const preloaded = await preloadQuery(
    api.storefront.catalog.category,
    { categoryId },
    { url: ENV.NEXT_PUBLIC_CONVEX_URL },
  );
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <CategoryView preloaded={preloaded} />;
}
