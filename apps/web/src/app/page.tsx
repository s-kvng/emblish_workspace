import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { preloadQuery } from "convex/nextjs";

import HomeView from "@/components/storefront/home-view";

import { ENV } from "../env";

export default async function Home() {
  const home = await preloadQuery(
    api.storefront.catalog.home,
    {},
    { url: ENV.NEXT_PUBLIC_CONVEX_URL },
  );
  return <HomeView preloaded={home} />;
}
