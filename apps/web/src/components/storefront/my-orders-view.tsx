"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { Button } from "@emblish_workspace/ui/components/button";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

/** Who's signed in, and the way out. Their Pre-orders and Store Orders join this page later. */
export default function MyOrdersView() {
  const router = useRouter();
  const me = useQuery(api.storefront.customer.me);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl">My orders</h1>
      <p className="mt-4 text-muted-foreground text-sm">Signed in as</p>
      <p className="font-medium text-lg">{me ? (me.name ?? me.phone) : "…"}</p>
      {me?.name && <p className="text-muted-foreground text-sm">{me.phone}</p>}
      <p className="mt-6 text-muted-foreground text-sm">Your orders will show here.</p>
      <Button variant="outline" size="lg" onClick={signOut} className="mt-8 h-11 w-full text-sm">
        Sign out
      </Button>
    </div>
  );
}
