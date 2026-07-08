import { expect, test } from "@playwright/test";

test.describe("Workout Detail screen", () => {
  test("Today's session row links here too, with ?from=today driving the back target", async ({
    page,
  }) => {
    await page.goto("/today");

    await page.getByRole("link", { name: /Rolling 400s/ }).first().click();
    await expect(page).toHaveURL(/\/workout\/wed-400s\?from=today$/);

    const back = page.getByLabel("Back to TODAY");
    await expect(back).toHaveAttribute("href", "/today");
  });

  test("COACH SUGGESTS ACCEPT swaps the breakdown to 5x600m and persists across reload", async ({
    page,
  }) => {
    await page.goto("/workout/wed-400s?from=plan");

    await expect(page.getByText("COACH SUGGESTS")).toBeVisible();
    await expect(page.getByText("Try 5 × 600m instead")).toBeVisible();

    await page.getByRole("button", { name: "ACCEPT" }).click();

    await expect(page.getByText("Rolling 600s")).toBeVisible();
    await expect(page.getByText("COACH SUGGESTS")).toHaveCount(0);

    // Overlay decision persists via localStorage.
    await page.reload();
    await expect(page.getByText("Rolling 600s")).toBeVisible();
  });

  test("START WORKOUT is present and clickable", async ({ page }) => {
    await page.goto("/workout/wed-400s?from=plan");

    const cta = page.getByRole("button", { name: "START WORKOUT" });
    await expect(cta).toBeVisible();
    await cta.click();
  });
});
