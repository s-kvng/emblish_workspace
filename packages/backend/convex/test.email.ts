import { afterEach, vi } from "vitest";

import type { TestBackend } from "./test.setup";

export type SentEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

/**
 * Catches what would be posted to Resend, so a test can read the emails
 * the backend sent. Call it once per test file.
 */
export function captureEmails() {
  const sent: SentEmail[] = [];
  const realFetch = globalThis.fetch;

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ id: `email-${sent.length}` });
  });
  afterEach(() => {
    sent.length = 0;
  });

  return {
    sent,
    /** Runs the scheduled sends, then takes the emails to one address not already taken. */
    async to(t: TestBackend, address: string) {
      vi.useFakeTimers();
      try {
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      } finally {
        vi.useRealTimers();
      }
      const taken = sent.filter((email) => email.to.includes(address));
      sent.splice(0, sent.length, ...sent.filter((email) => !taken.includes(email)));
      return taken;
    },
  };
}

/** The first link in an email's text. */
export function linkIn(email: SentEmail) {
  const link = email.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No link in "${email.subject}"`);
  return new URL(link);
}
