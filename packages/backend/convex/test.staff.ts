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

/** Adds an active Staff member (not an Owner, unless `role` says so) and returns their calls. */
export async function withStaffMember(
  t: ReturnType<typeof setupBackend>,
  name = "Kofi Boateng",
  role: "staff" | "owner" = "staff",
) {
  const authUserId = `auth-${name.toLowerCase().replace(/\W+/g, "-")}`;
  await t.run((ctx) =>
    ctx.db.insert("staff", {
      authUserId,
      email: `${authUserId}@emblish.test`,
      name,
      role,
      status: "active",
    }),
  );
  return t.withIdentity({ subject: authUserId });
}
