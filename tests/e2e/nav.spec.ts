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
    // Scoped to the tab bar (not just `exact: true`) because Today's session
    // row is itself a link whose accessible name concatenates its row text
    // (e.g. "… PLANNED … PROPOSED"), which substring-matches "PLAN"/"TODAY"
    // once that row has hydrated in — a real flake reproduced under
    // --repeat-each with 4/5 runs throwing a strict-mode "resolved to 2
    // elements" error. Scoping to `nav` makes the locator match only the
    // tab-bar link regardless of what else has mounted on the page.
    await page.locator("nav").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

test("ASK COACH chip from /today navigates to /coach?from=today", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("link", { name: "ASK COACH", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\?from=today$/);
});

test("tab bar nav hairline styling", async ({ page }) => {
  await page.goto("/today");
  const nav = page.locator("nav");
  // `toHaveCSS` auto-retries until the assertion passes (or times out),
  // instead of reading computed style once — on a cold start the stylesheet
  // can still be loading when the element first attaches, which previously
  // read border-top as 0px and failed. This guards the same regression
  // (hairline must be on the TOP edge, not bottom) without weakening it.
  await expect(nav).toHaveCSS("border-top-width", "1px");
  await expect(nav).toHaveCSS("border-bottom-width", "0px");
});
