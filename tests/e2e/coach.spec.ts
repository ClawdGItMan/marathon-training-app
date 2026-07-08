import { expect, test } from "@playwright/test";

test.describe("Coach screen", () => {
  test("ASK COACH from Plan seeds a CONTEXT line and BACK returns to Plan", async ({ page }) => {
    await page.goto("/plan");
    await page.getByRole("link", { name: "ASK COACH" }).click();
    await expect(page).toHaveURL(/\/coach\?from=plan$/);

    await expect(page.getByText(/CONTEXT: PLAN · WK 07\/16/)).toBeVisible();

    await page.getByRole("link", { name: "BACK" }).click();
    await expect(page).toHaveURL(/\/plan$/);
  });

  test("PROPOSED SWAP ACCEPT persists and reflects on Workout Detail", async ({ page }) => {
    await page.goto("/coach?from=today");

    await expect(page.getByText("PROPOSED SWAP")).toBeVisible();
    await page.getByRole("button", { name: "ACCEPT" }).click();
    await expect(page.getByText("PROPOSED SWAP")).toHaveCount(0);

    await page.goto("/workout/wed-400s?from=plan");
    await expect(page.getByText("Rolling 600s")).toBeVisible();
    await expect(page.getByText("COACH SUGGESTS")).toHaveCount(0);

    // Overlay decision persists across reload.
    await page.reload();
    await expect(page.getByText("Rolling 600s")).toBeVisible();
  });

  test("sending a message persists the transcript across reload", async ({ page }) => {
    await page.goto("/coach");

    await page.getByPlaceholder("ASK ANYTHING…").fill("Should I taper this week?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Should I taper this week?")).toBeVisible();
    await expect(page.getByText("Noted — I'll factor that into your next few sessions.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Should I taper this week?")).toBeVisible();
    await expect(page.getByText("Noted — I'll factor that into your next few sessions.")).toBeVisible();
  });

  test("no from param renders no CONTEXT line and BACK defaults to /today", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.getByText(/CONTEXT:/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "BACK" })).toHaveAttribute("href", "/today");
  });
});
