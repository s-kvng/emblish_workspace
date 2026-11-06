import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    env: {
      SITE_URL: "http://localhost:3001",
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters-long",
    },
  },
});
