"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { Toaster } from "@emblish_workspace/ui/components/sonner";
import { ConvexReactClient } from "convex/react";

import { authClient } from "@/lib/auth-client";
import { BagProvider } from "@/lib/bag";

import { ENV } from "../env";

const convex = new ConvexReactClient(ENV.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({
  children,
  initialToken,
}: {
  children: React.ReactNode;
  initialToken?: string | null;
}) {
  return (
    <>
      <ConvexBetterAuthProvider client={convex} authClient={authClient} initialToken={initialToken}>
        <BagProvider>{children}</BagProvider>
      </ConvexBetterAuthProvider>
      <Toaster theme="light" richColors />
    </>
  );
}
