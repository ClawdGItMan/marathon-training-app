import { expect, test } from "@playwright/test";

test.describe("Plan screen", () => {
  test("today's row links to the workout detail route with ?from=plan", async ({ page }) => {
    await page.goto("/plan");

    await expect(page.getByText("16-WEEK BLOCK")).toBeVisible();
    const link = page.getByRole("link", { name: /Rolling 400s/ });
    await expect(link).toHaveAttribute("href", "/workout/wed-400s?from=plan");
  });

  test("tapping a day row navigates to the Workout Detail screen with PLAN active", async ({
    page,
  }) => {
    await page.goto("/plan");

    await page.getByRole("link", { name: /Rolling 400s/ }).click();
    await expect(page).toHaveURL(/\/workout\/wed-400s\?from=plan$/);
    await expect(page.getByText("Rolling 400s")).toBeVisible();
    await expect(page.getByText("BREAKDOWN")).toBeVisible();

    // PLAN keeps its lime underline even though /workout has no tab of its own.
    const planTab = page.getByRole("link", { name: "PLAN", exact: true });
    await expect(planTab).toHaveClass(/border-sig/);
  });

  test("STRENGTH tab shows the checklist and toggles a ring independently of the detail sheet", async ({
    page,
  }) => {
    await page.goto("/plan");
    await page.getByText("STRENGTH", { exact: true }).click();

    await expect(page.getByText("MAX STRENGTH · DELOAD")).toBeVisible();
    await expect(page.getByText("Back squat")).toBeVisible();

    const ring = page.getByRole("button", { name: "Toggle complete: Back squat" });
    await expect(ring).toHaveAttribute("aria-pressed", "false");
    await ring.click();
    await expect(ring).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("CLOSE")).toHaveCount(0);
  });

  test("tapping an exercise opens the detail sheet", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("STRENGTH", { exact: true }).click();

    await page.getByRole("button", { name: "Exercise detail: Back squat" }).click();

    await expect(page.getByText("CLOSE")).toBeVisible();
    await expect(page.getByText("Heavy · 185 lb").first()).toBeVisible();

    await page.getByText("CLOSE").click();
    await expect(page.getByText("CLOSE")).toHaveCount(0);
  });
});
