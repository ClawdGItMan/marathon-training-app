import { expect, test } from "@playwright/test";

test.describe("Settings screen", () => {
  test("reached from Today's header link, and TODAY link returns", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "SETTINGS" }).click();
    await expect(page).toHaveURL(/\/settings\?from=today$/);

    await expect(page.getByText("Settings")).toBeVisible();
    await page.getByRole("link", { name: "TODAY", exact: true }).first().click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("ASK COACH chip from Settings navigates with from=today context", async ({ page }) => {
    await page.goto("/settings?from=today");
    await page.getByRole("link", { name: "ASK COACH" }).click();
    await expect(page).toHaveURL(/\/coach\?from=today$/);
  });

  test("no ?from defaults the back link to /today", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "TODAY", exact: true }).first()).toHaveAttribute(
      "href",
      "/today"
    );
  });

  test("shows RACE and TIMEZONE lines, and disabled Phase-2 CONNECT buttons", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText("Honolulu Marathon · DEC 13 2026")).toBeVisible();
    await expect(page.getByText("TIMEZONE")).toBeVisible();

    await expect(page.getByText("Whoop")).toBeVisible();
    await expect(page.getByText("Strava")).toBeVisible();
    await expect(page.getByText("NOT CONNECTED")).toHaveCount(2);

    const connectButtons = page.getByRole("button", { name: /Connect .* — available in Phase 2/ });
    await expect(connectButtons).toHaveCount(2);
    for (const button of await connectButtons.all()) {
      await expect(button).toBeDisabled();
    }
  });
});
