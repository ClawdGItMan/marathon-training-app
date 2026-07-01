import { expect, test } from "@playwright/test";

test.describe("Today screen — recommendation decisions", () => {
  test("Accept flow: proposed session becomes active and persists across reload", async ({ page }) => {
    await page.goto("/today");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Before deciding: struck-through planned row + PROPOSED tag both present.
    await expect(page.getByText("TEMPO · 6 MI")).toBeVisible();
    await expect(page.getByText("PROPOSED", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Accept" }).click();

    // After Accept: struck-through planned row and PROPOSED tag are gone;
    // the accepted session (EASY · 4 MI) is the single active row.
    await expect(page.getByText("TEMPO · 6 MI")).toHaveCount(0);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
    await expect(page.getByText("EASY · 4 MI")).toBeVisible();

    // Reload — decision persisted via localStorage.
    await page.reload();
    await expect(page.getByText("EASY · 4 MI")).toBeVisible();
    await expect(page.getByText("TEMPO · 6 MI")).toHaveCount(0);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
  });

  test("Override flow: original tempo session stays active", async ({ page }) => {
    await page.goto("/today");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Override" }).click();

    // Dismissing leaves the original session as the single active row.
    const temp = page.getByText("TEMPO · 6 MI");
    await expect(temp).toBeVisible();
    await expect(temp).not.toHaveClass(/line-through/);
    await expect(page.getByText("PROPOSED", { exact: true })).toHaveCount(0);
  });
});
