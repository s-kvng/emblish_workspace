import type { TestBackend } from "./test.setup";

const origin = "http://localhost:3001";

function post(t: TestBackend, path: string, body: unknown) {
  return t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

/** Email + password sign-in through the real Better Auth route. */
export function signIn(t: TestBackend, email: string, password: string) {
  return post(t, "/sign-in/email", { email, password });
}

/** Public email sign-up, which must stay closed. */
export function signUp(t: TestBackend, email: string, password: string, name: string) {
  return post(t, "/sign-up/email", { email, password, name });
}

/** Asks for a password reset email, as the Back Office's "Forgot password?" does. */
export function requestPasswordReset(t: TestBackend, email: string, redirectTo: string) {
  return post(t, "/request-password-reset", { email, redirectTo });
}

/** Asks for a sign-in code by SMS, as the Storefront's phone step does. */
export function sendPhoneCode(t: TestBackend, phoneNumber: string) {
  return post(t, "/phone-number/send-otp", { phoneNumber });
}

/** Signs a Customer in with the code from the SMS. */
export function verifyPhoneCode(t: TestBackend, phoneNumber: string, code: string) {
  return post(t, "/phone-number/verify", { phoneNumber, code });
}

/** Sets a new password with the token the reset link carried. */
export function resetPassword(t: TestBackend, token: string, newPassword: string) {
  return post(t, "/reset-password", { token, newPassword });
}
