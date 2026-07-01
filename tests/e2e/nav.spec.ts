import { expect, test } from "@playwright/test";

const tabs = [
  ["TODAY", "/today"], ["PLAN", "/plan"], ["PROGRESS", "/progress"], ["BODY", "/body"], ["LOG", "/log"],
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

test("ASK COACH chip from /today navigates to /coach?from=today", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("link", { name: "ASK COACH" }).click();
  await expect(page).toHaveURL(/\/coach\?from=today$/);
});

test("tab bar nav hairline styling", async ({ page }) => {
  await page.goto("/today");
  const nav = page.locator("nav");
  const borderTopWidth = await nav.evaluate(
    (el) => window.getComputedStyle(el).borderTopWidth
  );
  const borderBottomWidth = await nav.evaluate(
    (el) => window.getComputedStyle(el).borderBottomWidth
  );
  expect(borderTopWidth).toBe("1px");
  expect(borderBottomWidth).toBe("0px");
});
