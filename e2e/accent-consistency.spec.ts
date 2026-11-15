import { expect, test, type Page } from "@playwright/test";

/**
 * The Orange accent (--la-accent) shows up the same way everywhere:
 * - every student page title, plain (`PageTitle`) or hero (`PracticeHero`,
 *   the study plan band), has the Orange rule under it;
 * - every live practice picker card carries its icon in Orange;
 * - the sidebar (active marker, up-next fill) looks the same on every page,
 *   Mastery included;
 * - Mastery's page body has no accent at all, so it can't be read as the
 *   level-2 orange.
 */
const ACCENT = "rgb(255, 146, 57)";
const REPORT = "2cd23e87-49e4-4d94-a5b3-aeaa048589f5";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice.johnson@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** A fixed up-next step (3 of 10) so the sidebar card always renders. */
async function mockUpNext(page: Page) {
  await page.route("**/api/study-plans", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { plans: [{ id: "plan-e2e" }] } })
      : route.continue(),
  );
  await page.route("**/api/study-plans/plan-e2e/path", (route) =>
    route.fulfill({
      json: {
        path: {
          steps: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, position: i + 1, competencyLabel: `Skill ${i + 1}` })),
          nextStep: { stepId: "s2" },
        },
      },
    }),
  );
}

const titleRuleColor = (page: Page) =>
  page.locator("main h1").first().evaluate((h1) => {
    const after = getComputedStyle(h1, "::after");
    return after.content === "none" ? null : after.backgroundColor;
  });

const HEADERS = [
  { kind: "plain", path: "/practice" },
  { kind: "plain", path: "/reports" },
  { kind: "plain", path: `/reports/${REPORT}` },
  { kind: "plain", path: "/study-plans" },
  { kind: "plain", path: "/paths" },
  { kind: "plain", path: "/practice/clinical-communication" },
  { kind: "plain", path: "/practice/courageous-conversations" },
  { kind: "plain", path: "/practice/case-studies" },
  { kind: "hero", path: "/practice/interviews" },
  { kind: "hero", path: "/practice/interviews/industry-specific" },
  { kind: "hero", path: "/practice/pitches" },
  { kind: "hero", path: "/practice/pitches/deck" },
  { kind: "hero", path: "/practice/networking" },
];

const PICKERS = [
  "/practice",
  "/practice/interviews",
  "/practice/interviews/industry-specific",
  "/practice/pitches",
  "/practice/pitches/deck",
  "/practice/networking",
  "/practice/sales-discovery",
  "/practice/clinical-communication",
  "/practice/motivational-interviewing",
];

test.describe("accent consistency", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
  });

  for (const { kind, path } of HEADERS) {
    test(`${kind} header on ${path} has the title rule`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await titleRuleColor(page)).toBe(ACCENT);
    });
  }

  test("a study plan's band header has the title rule", async ({ page }) => {
    await page.goto("/study-plans");
    const href = await page.locator('main a[href^="/study-plans/"]').first().getAttribute("href");
    test.skip(!href, "no saved study plan for this user");
    await page.goto(href!);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await titleRuleColor(page)).toBe(ACCENT);
  });

  for (const path of PICKERS) {
    test(`picker cards on ${path} carry the accent icon`, async ({ page }) => {
      await page.goto(path);
      const icons = page.locator("main svg.la-card-icon");
      await expect(icons.first()).toBeVisible();
      const colors = await icons.evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
      expect(colors.length).toBeGreaterThan(0);
      for (const color of colors) expect(color).toBe(ACCENT);
    });
  }

  test("the sidebar accent is the same on Mastery and Practice", async ({ page }) => {
    await mockUpNext(page);
    const sidebar = async () => {
      const aside = page.locator("aside:visible");
      const marker = aside.locator('a[aria-current="page"] > span[aria-hidden]').first();
      const upNext = aside.locator('a[href="/study-plans/plan-e2e"]');
      await expect(upNext).toBeVisible();
      return {
        marker: await marker.evaluate((el) => getComputedStyle(el).backgroundColor),
        fill: await upNext.locator("span[aria-hidden] > span").first().evaluate((el) => getComputedStyle(el).backgroundColor),
      };
    };
    await page.goto("/practice");
    const practice = await sidebar();
    await page.goto("/mastery");
    await expect(page.locator("main h1").first()).toBeVisible();
    const mastery = await sidebar();
    expect(practice).toEqual({ marker: ACCENT, fill: ACCENT });
    expect(mastery).toEqual(practice);
  });

  test("Mastery's page body has no accent", async ({ page }) => {
    await page.goto("/mastery");
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await titleRuleColor(page)).toBeNull();
    // Mastery uses the level-2 orange as status (same hex), so check the
    // accent's own hooks rather than the color.
    const accentHooks = await page
      .locator("main")
      .locator(".la-title-rule, .la-card-icon, .la-featured, .la-hero-tile, .bg-accent, .text-accent, .border-accent")
      .count();
    expect(accentHooks).toBe(0);
  });
});
