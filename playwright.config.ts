import { defineConfig } from "@playwright/test";

/**
 * End-to-end journey against the built static site. The suite is
 * deliberately small: it re-runs the navigation journey reported as
 * issue 3 plus the dataset-asset rendering from issue 10, on the same
 * bytes production serves. Run with: pnpm build && pnpm e2e.
 */
export default defineConfig({
  testDir: "./scripts/e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:4318",
  },
  webServer: {
    command: "node scripts/e2e/serve.mjs",
    port: 4318,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  reporter: [["list"]],
});
