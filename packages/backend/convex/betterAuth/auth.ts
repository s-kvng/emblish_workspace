// Static instance for the Better Auth CLI's schema generation only. Never
// import this at runtime: it builds the options without a Convex ctx.
import { betterAuth } from "better-auth/minimal";

import { createAuthOptions } from "../auth";

export const auth = betterAuth(createAuthOptions({} as any));
