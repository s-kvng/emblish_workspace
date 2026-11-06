import z from "zod";

/** Better Auth's default length limits, which the server enforces too. */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "The passwords don't match",
    path: ["confirmPassword"],
  });
