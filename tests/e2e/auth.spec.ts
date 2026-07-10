import { expect, test } from "@playwright/test";

/**
 * Mode-gate check, local direction only. `NEXT_PUBLIC_REPO_MODE` defaults to
 * "local" (unset here, matching CI) — `src/middleware.ts` must be a hard
 * no-op in that mode so the rest of the Phase-1 suite (unauthenticated)
 * keeps passing untouched. The `supabase`-mode direction (redirect to
 * /sign-in, allowlist signOut+redirect) needs the local Supabase stack and
 * real cookies; it isn't covered here — see tests/unit/auth.test.tsx for the
 * OTP flow (mocked client) and task-2-report.md for the manual/`*.supabase.test.ts`
 * coverage note.
 */
test("local mode: /sign-in renders without a real session", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("SIGN IN")).toBeVisible();
  await expect(page.getByLabel("EMAIL")).toBeVisible();
});

test("local mode: /today is not redirected to /sign-in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText("SIGN IN")).not.toBeVisible();
});
