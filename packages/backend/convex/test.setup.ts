/// <reference types="vite/client" />
import { convexTest } from "convex-test";

import betterAuthSchema from "./betterAuth/schema";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./betterAuth/**", "!./**/*.test.ts"]);
const betterAuthModules = import.meta.glob(["./betterAuth/**/*.ts"]);

/** A fresh backend with the local Better Auth component mounted. */
export function setupBackend() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  return t;
}

export type TestBackend = ReturnType<typeof setupBackend>;
