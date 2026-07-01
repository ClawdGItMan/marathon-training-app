import { expect, test } from "@playwright/test";

test.describe("Progress screen", () => {
  test("loads, shows predictions, and re-scopes the chart on range toggle", async ({ page }) => {
    await page.goto("/progress");

    await expect(page.getByText("Honolulu Marathon")).toBeVisible();
    await expect(page.getByText("PREDICTIONS")).toBeVisible();

    const weekChart = page.getByTestId("week-chart");
    await expect(weekChart.locator("polyline")).toBeVisible();

    await page.getByText("1M", { exact: true }).click();

    const polyline = weekChart.locator("polyline");
    await expect(polyline).toBeVisible();
    const points = await polyline.getAttribute("points");
    const pointCount = points!.trim().split(/\s+/).length;
    expect(pointCount).toBe(4);
  });
});
