import { ConvexError } from "convex/values";

/** The first message in a TanStack Form validation error, as zod reports it. */
export function firstIssue(error: unknown): string | null {
  if (Array.isArray(error)) return firstIssue(error[0]);
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return null;
}

/** The message a Convex function refused with, or a fallback for anything unexpected. */
export function refusalMessage(error: unknown, fallback = "Something went wrong. Try again.") {
  if (error instanceof ConvexError) {
    const { message } = error.data as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return fallback;
}
