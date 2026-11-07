import { redirect } from "next/navigation";

import MyOrdersView from "@/components/storefront/my-orders-view";
import { isAuthenticated } from "@/lib/auth-server";

/** My orders, where order SMS links land; it needs a phone-code sign-in first. */
export default async function MyOrdersPage() {
  if (!(await isAuthenticated())) redirect("/sign-in?next=/orders");
  return <MyOrdersView />;
}
