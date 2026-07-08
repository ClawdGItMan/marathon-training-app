import { expect, test } from "@playwright/test";

test.describe("Plan screen", () => {
  test("today's row links to the workout detail route (route lands in R9)", async ({ page }) => {
    await page.goto("/plan");

    await expect(page.getByText("16-WEEK BLOCK")).toBeVisible();
    const link = page.getByRole("link", { name: /Rolling 400s/ });
    // Only assert the href — the destination route 404s until R9.
    await expect(link).toHaveAttribute("href", "/workout/wed-400s");
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
