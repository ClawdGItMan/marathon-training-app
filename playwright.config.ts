import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { TEST_USER_EMAIL } from "./tests/parity/constants";

// Gated so the default/CI run (`PLAYWRIGHT_TEST=1 npx playwright test`, no
// SUPABASE_E2E) stays exactly the single-webServer config that shipped
// through Task 4 — 44 tests, local-repo mode, port 3000 (the supabase-mode
// spec self-skips there). Setting SUPABASE_E2E=1 swaps in the supabase-mode
// webServer + project INSTEAD of the default one — not alongside it —
// because Next 16's dev server holds a per-directory lock (.next/dev), so
// two `next dev` instances from this dir can't coexist. Requires the local
// Supabase stack running + seeded (see tests/e2e/supabase-mode.spec.ts).
const SUPABASE_E2E = process.env.SUPABASE_E2E === "1";
const SUPABASE_MODE_PORT = 3010;

const defaultWebServer = {
  command: "npm run dev",
  port: 3000,
  // NOTE: if you already have `npm run dev` running without PLAYWRIGHT_TEST=1, the dev overlay is active and tab clicks may flake — stop your dev server before running e2e.
  reuseExistingServer: true,
  // Extend Playwright's 60s default webServer wait to 120s: cold Next
  // builds (no .next cache) can take longer than 60s to answer, and a dev
  // server that still hasn't responded by 2 minutes is genuinely broken —
  // fail fast rather than hang further.
  timeout: 120_000,
  env: { ...process.env, PLAYWRIGHT_TEST: "1" },
};

/**
 * Dev server for the supabase-mode project: same app, but env-forced into
 * supabase repo mode against the locally running stack, on a separate port
 * so a stray local-mode server on 3000 can't be silently reused. Reads the
 * stack's URL/anon key from `supabase status` the same way
 * tests/unit/repo-parity-supabase.supabase.test.ts's beforeAll does, rather
 * than hardcoding supabase/config.toml's port.
 */
function supabaseModeWebServer() {
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));

  // Test workers (tests/e2e/helpers/supabase-session.ts signs in with plain
  // supabase-js inside the test process) inherit the runner's env — expose
  // the stack coordinates there too, not just to the dev-server child.
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;

  return {
    command: `npm run dev -- --port ${SUPABASE_MODE_PORT}`,
    port: SUPABASE_MODE_PORT,
    reuseExistingServer: true,
    // Same 120s extension of Playwright's 60s default as defaultWebServer above.
    timeout: 120_000,
    env: {
      ...process.env,
      PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_REPO_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      // Seeded password user (tests/parity/constants.ts) is the only
      // allowlisted account in this mode.
      ALLOWED_EMAIL: TEST_USER_EMAIL,
    },
  };
}

export default defineConfig({
  testDir: "tests/e2e",
  webServer: SUPABASE_E2E ? supabaseModeWebServer() : defaultWebServer,
  use: {
    viewport: { width: 414, height: 846 },
  },
  ...(SUPABASE_E2E
    ? {
        projects: [
          {
            name: "supabase-mode",
            testDir: "tests/e2e",
            testMatch: "supabase-mode.spec.ts",
            use: { baseURL: `http://localhost:${SUPABASE_MODE_PORT}` },
          },
        ],
      }
    : {}),
});
