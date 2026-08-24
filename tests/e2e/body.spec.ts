import { expect, test } from "@playwright/test";

test.describe("Body screen — recovery + pain manager", () => {
  test("loads recovery analytics and pain manager", async ({ page }) => {
    await page.goto("/body");

    await expect(page.getByText("Recovery", { exact: true })).toBeVisible();
    await expect(page.getByText("PAIN & INJURIES")).toBeVisible();
  });

  test("Log soreness or injury button navigates to /log?focus=pain", async ({ page }) => {
    await page.goto("/body");

    await page.getByText("+ LOG SORENESS OR INJURY").click();

    await expect(page).toHaveURL(/\/log\?focus=pain/);
  });

  // Task 12: local mode has no sync concept — getSyncStatus() returns
  // all-fresh without touching Supabase (src/lib/sync/staleness.ts), so the
  // VITALS stale marker must never render here. Screens change zero pixels
  // except the marker line itself.
  test("never shows the stale marker in local mode", async ({ page }) => {
    await page.goto("/body");

    await expect(page.getByText("VITALS")).toBeVisible();
    await expect(page.getByText(/STALE —/)).toHaveCount(0);
  });
});
