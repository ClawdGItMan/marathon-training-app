import { expect, test } from "@playwright/test";

const tabs = [
  ["TODAY", "/today"], ["PLAN", "/plan"], ["COACH", "/coach"], ["BODY", "/body"], ["PROGRESS", "/progress"],
] as const;

test("root redirects to /today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
});

for (const [label, path] of tabs)
  test(`tab ${label} navigates to ${path}`, async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
