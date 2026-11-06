import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import { signIn } from "./test.auth";
import { setupBackend } from "./test.setup";

export const firstOwner = {
  email: "ama@emblish.test",
  password: "correct-horse-battery",
  name: "Ama Mensah",
};

/** A fresh backend with the bootstrapped first Owner, and that Owner's calls. */
export async function withFirstOwner() {
  const t = setupBackend();
  await t.action(internal.system.bootstrap.firstOwner, firstOwner);
  const response = await signIn(t, firstOwner.email, firstOwner.password);
  const { user } = await response.json();
  return {
    t,
    owner: t.withIdentity({ subject: user.id }),
    ownerAuthUserId: user.id as string,
  };
}

/** The `code` of a refused call, or "allowed" if it went through. */
export async function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => "allowed",
    (error) => (error instanceof ConvexError ? (error.data as { code: string }).code : error),
  );
}
