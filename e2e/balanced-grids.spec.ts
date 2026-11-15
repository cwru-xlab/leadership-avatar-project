import { expect, test, type Page } from "@playwright/test";

// Gap-free picker grids (2026-11-14): every BalancedGrid on these pages fills
// each row to both edges at 1440, 1024, 768 and 375, and nothing scrolls
// sideways. With SHOT_PREFIX=before the spec only takes screenshots (the
// origin/dev pages have no BalancedGrid to measure).
const SHOTS =
  process.env.LAYOUT_SHOTS ?? "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-interview-layout";
const PREFIX = process.env.SHOT_PREFIX ?? "after";
const STUDENT = { email: "student@case.edu", password: "student123" };

const PAGES: { name: string; path: string; ready: string | null; optional?: boolean }[] = [
  { name: "interviews", path: "/practice/interviews/industry-specific", ready: "Industry-specific interviews" },
  { name: "practice", path: "/practice", ready: "What do you want to practice?" },
  { name: "deck", path: "/practice/pitches/deck", ready: "Choose a setting" },
  { name: "clinical", path: "/practice/clinical-communication", ready: null },
  { name: "mi", path: "/practice/motivational-interviewing", ready: null },
  // Case studies only renders a grid when the database has cases or scenarios.
  { name: "case-studies", path: "/practice/case-studies", ready: "Case studies", optional: true },
];

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Each row of each balanced grid reaches both edges of its grid. */
async function checkRowsFull(page: Page, label: string) {
  const grids = await page.locator("[data-balanced-grid]").evaluateAll((els) =>
    els.map((grid) => {
      const g = grid.getBoundingClientRect();
      return {
        left: g.left,
        right: g.right,
        cards: [...grid.children].map((el) => {
          const b = el.getBoundingClientRect();
          return { top: Math.round(b.top), left: b.left, right: b.right };
        }),
      };
    }),
  );
  expect(grids.length, `${label}: has a balanced grid`).toBeGreaterThan(0);
  for (const grid of grids) {
    expect(grid.cards.length, `${label}: grid has cards`).toBeGreaterThan(0);
    const rows = new Map<number, typeof grid.cards>();
    for (const card of grid.cards) {
      const key = [...rows.keys()].find((top) => Math.abs(top - card.top) < 2) ?? card.top;
      rows.set(key, [...(rows.get(key) ?? []), card]);
    }
    for (const [top, row] of rows) {
      expect(Math.abs(Math.min(...row.map((c) => c.left)) - grid.left), `${label}: row at ${top} starts at the edge`).toBeLessThan(4);
      expect(Math.abs(Math.max(...row.map((c) => c.right)) - grid.right), `${label}: row at ${top} reaches the edge`).toBeLessThan(4);
    }
  }
}

test.describe.configure({ mode: "serial" });

for (const target of PAGES) {
  test(`${target.name}: rows full at every width, no sideways scroll`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto(target.path);
    if (target.ready) await expect(page.getByText(target.ready, { exact: true }).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    if (PREFIX === "after" && !target.optional) {
      await expect(page.locator("[data-balanced-grid]").first()).toBeVisible({ timeout: 45_000 });
    }
    await page.screenshot({ path: `${SHOTS}/${PREFIX}-${target.name}-1440.png` });
    if (PREFIX !== "after") return;
    if (target.optional && (await page.locator("[data-balanced-grid]").count()) === 0) {
      test.info().annotations.push({ type: "skipped-check", description: `${target.name}: no cards in this database` });
      return;
    }

    for (const width of [1440, 1024, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await checkRowsFull(page, `${target.name} ${width}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${target.name} ${width}: no sideways scroll`).toBeLessThanOrEqual(0);
    }
  });
}
