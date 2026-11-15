import { expect, test, type Page } from "@playwright/test";

/**
 * The Orange accent (--la-accent) shows up the same way everywhere:
 * - every student page title, plain (`PageTitle`) or hero (`PracticeHero`,
 *   the study plan band), has the Orange rule under it;
 * - every live picker card carries its icon in Orange, inline beside the
 *   title (deck modes included, no navy tile);
 * - the active tab underline is Orange, the featured panel has an Orange top
 *   edge, and the hero icon tile sits on an Orange ledge;
 * - the staff home has the title rule and the same card icon treatment;
 * - the sidebar (active marker, up-next fill) looks the same on every page,
 *   Mastery included;
 * - Mastery's page body has no accent at all, so it can't be read as the
 *   level-2 orange.
 */
const ACCENT = "rgb(255, 146, 57)";
const REPORT = "2cd23e87-49e4-4d94-a5b3-aeaa048589f5";

async function signIn(page: Page, email = "alice.johnson@case.edu", password = "student123") {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
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
  { kind: "hero", path: "/practice/interviews/technical" },
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
      // Inline beside the title, never inside a tinted or navy tile.
      const parents = await icons.evaluateAll((els) => els.map((el) => getComputedStyle(el.parentElement!).backgroundColor));
      for (const bg of parents) expect(bg).toBe("rgba(0, 0, 0, 0)");
    });
  }

  test("hero icon tile sits on an Orange ledge", async ({ page }) => {
    await page.goto("/practice/interviews/industry-specific");
    const shadow = await page.locator("main .la-hero-tile").first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(ACCENT);
  });

  test("the active tab underline is Orange", async ({ page }) => {
    await page.goto("/study-plans");
    const tab = page.locator('main [role="tab"][aria-selected="true"]').first();
    await expect(tab).toBeVisible();
    expect(await tab.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(ACCENT);
    await page.goto(`/reports/${REPORT}`);
    const cursor = page.locator("main .la-tab-cursor").first();
    await expect(cursor).toBeVisible();
    expect(await cursor.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ACCENT);
  });

  test("the featured panel has an Orange top edge", async ({ page }) => {
    for (const path of ["/reports", `/reports/${REPORT}`]) {
      await page.goto(path);
      const panel = page.locator("main .la-featured").first();
      await expect(panel).toBeVisible();
      expect(await panel.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(ACCENT);
    }
  });

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
      .locator(".la-title-rule, .la-card-icon, .la-featured, .la-hero-tile, .la-tab, .la-tab-cursor, .bg-accent, .text-accent, .border-accent")
      .count();
    expect(accentHooks).toBe(0);
  });
});

test.describe("accent on the staff home", () => {
  for (const [email, password] of [
    ["admin@example.com", "admin123"],
    ["professor.smith@case.edu", "prof123"],
  ]) {
    test(`${email} home has the title rule and accent card icons`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page, email, password);
      await page.goto("/");
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await titleRuleColor(page)).toBe(ACCENT);
      const colors = await page.locator("main svg.la-card-icon").evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
      expect(colors).toEqual([ACCENT, ACCENT]);
    });
  }
});
