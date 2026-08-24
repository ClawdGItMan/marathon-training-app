import { expect, test } from "@playwright/test";

test.describe("Today screen — recommendation decisions", () => {
  test("Accept flow: proposed session becomes active and persists across reload", async ({ page }) => {
    await page.goto("/today");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Before deciding: struck-through planned row + PROPOSED tag both present.
    await expect(page.getByText("Rolling 400s")).toBeVisible();
    await expect(page.getByText("Rolling 400s")).toHaveClass(/line-through/);
    await expect(page.getByText("PROPOSED", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "ACCEPT" }).click();

    // After Accept: struck-through planned row and PROPOSED tag are gone;
    // the accepted easy swap is the single active row.
    await expect(page.getByText("Rolling 400s")).toHaveCount(0);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
    await expect(page.getByText("4 mi · Zone 2 · 9:30/mi")).toBeVisible();

    // Reload — decision persisted via localStorage.
    await page.reload();
    await expect(page.getByText("4 mi · Zone 2 · 9:30/mi")).toBeVisible();
    await expect(page.getByText("Rolling 400s")).toHaveCount(0);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
  });

  test("Override flow: original 400s session stays active", async ({ page }) => {
    await page.goto("/today");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "OVERRIDE" }).click();

    // Dismissing leaves the original session as the single active row.
    const original = page.getByText("Rolling 400s");
    await expect(original).toBeVisible();
    await expect(original).not.toHaveClass(/line-through/);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
  });

  // Spec §12: "Modify → edit → save → plan reflects the edited version with
  // modified-proposal provenance" — the one spec-mandated E2E flow that had
  // no Playwright coverage (unit-tested at ModifySheet/repo level only).
  test("Modify flow: sheet edit + save mutates the plan with modified-proposal provenance", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "MODIFY" }).click();

    await expect(page.getByText("MODIFY SESSION")).toBeVisible();
    await page.getByLabel("TITLE").fill("Easy shakeout");
    await page.getByLabel("DISTANCE (MI)").fill("3");
    await page.getByRole("button", { name: "SAVE" }).click();

    // Sheet closes; the edited session is the single active row — the repo
    // now stores it with `modified-proposal` provenance (not the untouched
    // proposal.after), so it's the edited title/distance that shows.
    await expect(page.getByText("MODIFY SESSION")).toHaveCount(0);
    await expect(page.getByText("Easy shakeout")).toBeVisible();
    await expect(page.getByText("Rolling 400s")).toHaveCount(0);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);

    // Persists across reload — repo-visible outcome, not just UI state.
    await page.reload();
    await expect(page.getByText("Easy shakeout")).toBeVisible();
  });

  // Task 12: local mode has no sync concept — getSyncStatus() returns
  // all-fresh without touching Supabase (src/lib/sync/staleness.ts), so the
  // readiness hero's stale marker must never render here. Screens change
  // zero pixels except the marker line itself.
  test("never shows the stale marker in local mode", async ({ page }) => {
    await page.goto("/today");

    await expect(page.getByText("READY")).toBeVisible();
    await expect(page.getByText(/STALE —/)).toHaveCount(0);
  });
});
