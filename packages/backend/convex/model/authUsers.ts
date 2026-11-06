import { ConvexError } from "convex/values";

import type { ActionCtx } from "../_generated/server";
import { createAuth } from "../auth";

/**
 * Creates a Staff member's Better Auth user with their password. Public
 * sign-up is off, so the user and its credential are written directly.
 * Returns the user's id and a way to remove it again if what follows fails.
 */
export async function createStaffAuthUser(
  ctx: ActionCtx,
  { email, name, password }: { email: string; name: string; password: string },
) {
  const auth = await createAuth(ctx).$context;
  const { minPasswordLength, maxPasswordLength } = auth.password.config;
  if (password.length < minPasswordLength || password.length > maxPasswordLength) {
    throw new ConvexError({
      code: "INVALID_PASSWORD",
      message: `The password must be ${minPasswordLength} to ${maxPasswordLength} characters long.`,
    });
  }
  if (await auth.internalAdapter.findUserByEmail(email)) {
    throw new ConvexError({
      code: "EMAIL_IN_USE",
      message: `${email} is already signed up.`,
    });
  }

  const user = await auth.internalAdapter.createUser({
    email,
    name,
    emailVerified: true,
    kind: "staff",
  });
  const remove = async () => {
    await auth.internalAdapter.deleteUser(user.id);
  };
  try {
    await auth.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await auth.password.hash(password),
    });
  } catch (error) {
    await remove();
    throw error;
  }
  return { authUserId: user.id, remove };
}
