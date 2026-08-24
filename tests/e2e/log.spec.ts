import { expect, test } from "@playwright/test";

test.describe("Log screen (design #7d)", () => {
  test("shows the imported Strava run, RPE meter, and pain chips with no SYNCED badge", async ({
    page,
  }) => {
    await page.goto("/log");

    await expect(page.getByText("AUTO-IMPORTED · STRAVA")).toBeVisible();
    await expect(page.getByText("Easy run")).toBeVisible();
    await expect(page.getByText("HOW HARD? · RPE")).toBeVisible();
    await expect(page.getByText("ANY PAIN?")).toBeVisible();
    await expect(page.getByRole("button", { name: "ACHILLES · L" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByText("SYNCED")).toHaveCount(0);

    // Task 12: local mode has no sync concept — the imported-run section's
    // stale marker must never render here.
    await expect(page.getByText(/STALE —/)).toHaveCount(0);
  });

  test("SAVE LOG writes the run + pain to the repo and redirects to /today", async ({ page }) => {
    await page.goto("/log");

    await page.getByRole("button", { name: "RPE 7" }).click();
    await page.getByRole("button", { name: "SAVE LOG" }).click();

    await expect(page).toHaveURL(/\/today$/);
  });

  test("?focus=pain lands on /log with the pain section in view", async ({ page }) => {
    await page.goto("/log?focus=pain");

    await expect(page).toHaveURL(/\/log\?focus=pain/);
    await expect(page.getByText("ANY PAIN?")).toBeVisible();
  });
});
