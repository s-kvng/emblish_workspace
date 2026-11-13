import { ConvexError } from "convex/values";

/** The message a refused Convex call carries, or a fallback. */
export function messageOf(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data?.message === "string"
    ? (error.data.message as string)
    : fallback;
}
