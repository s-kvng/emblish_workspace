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
