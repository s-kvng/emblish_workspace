import { afterEach, vi } from "vitest";

import type { TestBackend } from "./test.setup";

export type SentSms = {
  sender: string;
  recipients: string[];
  message: string;
  callback_url?: string;
  sandbox?: boolean;
};

/**
 * Catches what would be posted to Arkesel, so a test can read the SMS the backend
 * sent. Each SMS gets an Arkesel id `sms-<n>`. Call it once per test file.
 */
export function captureSms() {
  const sent: SentSms[] = [];
  let refuse = false;
  const realFetch = globalThis.fetch;

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://sms.arkesel.com/")) return realFetch(input, init);
    if (refuse) {
      return Response.json(
        {
          status: "error",
          message: "Insufficient balance or invalid coverage!",
        },
        { status: 402 },
      );
    }
    const sms: SentSms = JSON.parse(String(init?.body));
    sent.push(sms);
    return Response.json({
      status: "success",
      data: sms.recipients.map((recipient) => ({
        recipient,
        id: `sms-${sent.length}`,
      })),
    });
  });
  afterEach(() => {
    sent.length = 0;
    refuse = false;
  });

  return {
    sent,
    /** Makes Arkesel refuse every send until the test ends. */
    refuseSends() {
      refuse = true;
    },
    /** Runs the scheduled sends, then takes the SMS to one number not already taken. */
    async to(t: TestBackend, recipient: string) {
      vi.useFakeTimers();
      try {
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      } finally {
        vi.useRealTimers();
      }
      const taken = sent.filter((sms) => sms.recipients.includes(recipient));
      sent.splice(0, sent.length, ...sent.filter((sms) => !taken.includes(sms)));
      return taken;
    },
  };
}

/** The 6-digit code in a login SMS. */
export function codeIn(sms: SentSms) {
  const code = sms.message.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code in "${sms.message}"`);
  return code;
}
