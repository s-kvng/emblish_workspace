import type { Route } from "next";
import { redirect } from "next/navigation";

import SignInForm from "@/components/storefront/sign-in-form";
import { isAuthenticated } from "@/lib/auth-server";

/** Only same-site paths, so a crafted link can't send someone elsewhere after sign-in. */
function safeNext(next: string | string[] | undefined) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/orders";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const next = safeNext((await searchParams).next);
  if (await isAuthenticated()) redirect(next as Route);
  return <SignInForm next={next} />;
}
