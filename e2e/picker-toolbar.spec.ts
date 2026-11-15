import { expect, test, type Page } from "@playwright/test";

/**
 * Capture the picker toolbar through the real flow: sign in, the general
 * interview setup wizard, step 1 is the interviewer step.
 */
const SHOTS = "screenshots/picker-toolbar";
const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function reachPicker(page: Page) {
  await page.goto("/practice/interviews/general");
  await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByLabel("Search by name")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);
}

/**
 * Open a HeroUI Select. Centre the trigger first: at 375 the step is taller
 * than the viewport, so the floating action dock sits over the bottom ~76px
 * and a student scrolls the control clear before tapping it.
 */
async function openSelect(page: Page, which: "first" | "last") {
  const trigger = page.locator('button[data-slot="trigger"]')[which]();
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 15_000 });
}

const count = (page: Page) => page.locator('[aria-live="polite"]').first();
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe.configure({ mode: "serial" });

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  test(`toolbar shots at ${vp.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(vp);
    await signIn(page);
    await reachPicker(page);

    await page.screenshot({ path: `${SHOTS}/unfiltered-${vp.name}.png` });
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Scroll down so the section headings and the dock-in-flow are both shown.
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/sections-${vp.name}.png` });
    await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(400);

    // The Voice dropdown open — check it is not clipped by the grid.
    await openSelect(page, "first");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/dropdown-open-${vp.name}.png` });
    await page.getByRole("option", { name: /Female voice/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(700);

    // Voice filter + a name search: two filters with their chips.
    await page.getByLabel("Search by name").fill("a");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/two-filters-${vp.name}.png` });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    console.log(
      `[${vp.name}] two filters: "${(await count(page).innerText()).trim()}", cards ${await page
        .locator("button[aria-pressed]")
        .count()}`,
    );

    // A search alone with results.
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByLabel("Search by name").fill("an");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/search-results-${vp.name}.png` });
    console.log(
      `[${vp.name}] search "an": "${(await count(page).innerText()).trim()}", cards ${await page
        .locator("button[aria-pressed]")
        .count()}`,
    );

    // Name A-Z: grouping off, one flat alphabet.
    await page.getByRole("button", { name: "Clear all" }).click();
    await openSelect(page, "last");
    await page.getByRole("option", { name: /Name A/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/sort-name-${vp.name}.png` });
    await openSelect(page, "last");
    await page.getByRole("option", { name: /Suggested/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(500);

    // No results.
    await page.getByLabel("Search by name").fill("zzzz");
    await expect(page.getByText("No interviewer matches those filters")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/empty-state-${vp.name}.png` });
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();

    // The dock: floating mid-list, landed at the very bottom.
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/dock-floating-${vp.name}.png` });
    await page.keyboard.press("End");
    await page.mouse.wheel(0, 40_000);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/dock-landed-${vp.name}.png` });
  });
}

test("no horizontal overflow at 1024 and 768", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await reachPicker(page);
    expect(await overflow(page), `overflow at ${width}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/unfiltered-${width}.png` });
    await openSelect(page, "first");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/dropdown-open-${width}.png` });
    await page.keyboard.press("Escape");
  }
});
