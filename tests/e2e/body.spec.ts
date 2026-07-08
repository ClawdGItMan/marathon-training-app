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
});
