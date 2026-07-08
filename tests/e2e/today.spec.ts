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
});
