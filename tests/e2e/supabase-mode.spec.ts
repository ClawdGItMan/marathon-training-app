import { expect, test } from "@playwright/test";
import { injectSupabaseSession } from "./helpers/supabase-session";

/**
 * Stage 1 ship gate: proves the whole real stack end to end — sign-in
 * against the local Supabase auth server, RLS-scoped reads through
 * supabaseRepo, the offline cache pass-through on a live network, and the
 * Today screen rendering the result. Only runs against the `supabase-mode`
 * Playwright project (see playwright.config.ts), which only exists when
 * SUPABASE_E2E=1 — the default/CI run (44 Phase-1 tests, local-repo mode)
 * never touches this file's real assertions.
 *
 * Requires the local Supabase stack running and freshly seeded:
 *   npm run db:reset && SUPABASE_E2E=1 PLAYWRIGHT_TEST=1 npx playwright test --project=supabase-mode
 */
test.describe("supabase mode smoke", () => {
  test.skip(
    process.env.SUPABASE_E2E !== "1",
    "Requires the local Supabase stack — run with SUPABASE_E2E=1 --project=supabase-mode."
  );

  test("signed-in /today renders the seeded readiness value through the real stack", async ({
    context,
    page,
    baseURL,
  }) => {
    // Inject BEFORE the first navigation so the middleware sees the session
    // cookie on the very first request. Uses the built-in `context` fixture
    // (not browser.newContext()) so the project's baseURL applies to the
    // relative goto below.
    await injectSupabaseSession(context, baseURL ?? "http://localhost:3010");

    await page.goto("/today");

    // Never bounced to sign-in — the injected session + allowlisted seeded
    // email cleared src/middleware.ts's auth gate.
    await expect(page.getByText("SIGN IN")).toHaveCount(0);

    // seed.recovery's last (most recent) snapshot — src/lib/data/seed.ts —
    // is recoveryPct: 62, read live from `recovery_snapshots` via RLS
    // (supabase-repo.ts's getLatestRecovery) and rendered verbatim by
    // ReadinessHero's ring label.
    await expect(page.getByText("62", { exact: true })).toBeVisible();
  });

  test("sign-in screen hides VIEW DEMO when demo env is not configured", async ({ page }) => {
    // This harness never sets DEMO_USER_EMAIL/PASSWORD — the button must be
    // absent, which is also the guarantee that keeps the Phase-1 local-mode
    // baseline and any non-demo deploy pixel-identical.
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "SEND CODE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "VIEW DEMO" })).toHaveCount(0);
  });
});
