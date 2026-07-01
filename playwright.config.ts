import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    env: { ...process.env, PLAYWRIGHT_TEST: "1" },
  },
  use: {
    viewport: { width: 414, height: 846 },
  },
});
