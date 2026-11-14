import { expect, test, type Page } from "@playwright/test";

// Industry-specific interview picker layout (2026-11-14): Technical coding must
// be findable without scrolling. The default layout must keep the coding card,
// and every other option, inside the first 1440×900 viewport; every option must
// fit 375px with no sideways scroll. Screenshots of each option go to SHOTS.
const SHOTS =
  process.env.LAYOUT_SHOTS ?? "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-interview-layout";
const STUDENT = { email: "student@case.edu", password: "student123" };
const PAGE = "/practice/interviews/industry-specific";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** True when the element's whole box is inside the viewport (the shell scrolls an inner column). */
async function fullyInViewport(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  });
}

test.describe.configure({ mode: "serial" });

test("default layout: Technical coding and every option are in the first 1440×900 viewport", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(PAGE);
  const coding = page.locator('[data-interview="technical-coding"]');
  await expect(coding).toBeVisible({ timeout: 45_000 });
  expect(await fullyInViewport(page, '[data-interview="technical-coding"]')).toBe(true);
  await expect(page.getByRole("link", { name: "Start Technical coding" })).toBeInViewport();
  const keys = await page.locator("[data-interview]").evaluateAll((els) => els.map((el) => el.getAttribute("data-interview")));
  expect(keys.length).toBeGreaterThanOrEqual(7);
  for (const key of keys) {
    expect(await fullyInViewport(page, `[data-interview="${key}"]`), `${key} above the fold`).toBe(true);
  }
});

for (const layout of ["featured", "grouped", "rows"]) {
  test(`layout ${layout}: above the fold at 1440, no sideways scroll at 375`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto(`${PAGE}?layout=${layout}`);
    await expect(page.locator(`[data-layout="${layout}"]`)).toBeVisible({ timeout: 45_000 });
    const keys = await page.locator("[data-interview]").evaluateAll((els) => els.map((el) => el.getAttribute("data-interview")));
    for (const key of keys) {
      expect(await fullyInViewport(page, `[data-interview="${key}"]`), `${layout}: ${key} above the fold`).toBe(true);
    }
    await page.screenshot({ path: `${SHOTS}/${layout}-1440.png` });

    await page.locator('[data-interview="technical-coding"] summary').click();
    await page.screenshot({ path: `${SHOTS}/${layout}-1440-open.png` });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PAGE}?layout=${layout}`);
    await expect(page.locator(`[data-layout="${layout}"]`)).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: `${SHOTS}/${layout}-375.png` });
    await page.setViewportSize({ width: 375, height: 2400 });
    await page.screenshot({ path: `${SHOTS}/${layout}-375-full.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
