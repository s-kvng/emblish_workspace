import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    env: {
      SITE_URL: "http://localhost:3001",
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters-long",
      CONVEX_SITE_URL: "https://emblish-test.convex.site",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Emblish <no-reply@emblish.test>",
      ARKESEL_API_KEY: "arkesel-test-key",
      ARKESEL_WEBHOOK_SECRET: "arkesel-test-webhook-secret",
      SEEV_CHECKOUT_API_KEY: "seev-test-checkout-key",
      SEEV_WEBHOOK_SECRET: "seev-test-webhook-secret",
    },
  },
});
