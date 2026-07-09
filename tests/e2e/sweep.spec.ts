import { expect, test } from "@playwright/test";

// Full 8-route sweep (R12 brief): every screen renders its heading, throws no
// console errors, and the PWA manifest resolves. Per-screen specs (nav/plan/
// progress/body/log/coach/workout/settings.spec.ts) still own the detailed
// behavior — this is a single flat smoke pass across the whole app.
const ROUTES: Array<[string, string | RegExp]> = [
  ["/today", "Today"],
  ["/plan", "Plan"],
  ["/progress", "Progress"],
  ["/body", "Recovery"],
  ["/log", "Log"],
  ["/coach", "Coach"],
  ["/workout/wed-400s", /Rolling 400s|Rolling 600s/],
  ["/settings", "Settings"],
];

for (const [path, heading] of ROUTES) {
  test(`${path} renders its heading with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(path);
    await expect(page.getByText(heading).first()).toBeVisible();

    expect(errors, `console errors on ${path}: ${errors.join("; ")}`).toEqual([]);
  });
}

test("manifest.json is served and resolves", async ({ page, request }) => {
  const res = await request.get("/manifest.json");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.background_color).toBe("#0B0C0E");
  expect(manifest.theme_color).toBe("#0B0C0E");
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);

  // Every referenced icon file must actually resolve (not just be listed).
  for (const icon of manifest.icons) {
    const iconRes = await page.request.get(icon.src);
    expect(iconRes.status(), `icon ${icon.src}`).toBe(200);
  }
});
