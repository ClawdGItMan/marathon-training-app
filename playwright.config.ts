import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "npm run dev",
    port: 3000,
    // NOTE: if you already have `npm run dev` running without PLAYWRIGHT_TEST=1, the dev overlay is active and tab clicks may flake — stop your dev server before running e2e.
    reuseExistingServer: true,
    env: { ...process.env, PLAYWRIGHT_TEST: "1" },
  },
  use: {
    viewport: { width: 414, height: 846 },
  },
});
