import { expect, test, type Page } from "@playwright/test";

// Industry-specific interview picker layout (2026-11-14): Technical coding must
// be easy to reach, not highlighted. In every layout each card sits inside the
// first 1440×900 viewport, coding is first in the first row, no row ends in an
// empty slot at 1440/1024/768/375, and nothing scrolls sideways. Screenshots of each layout go to SHOTS.
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

/** Every card fully in the viewport, and Technical coding first in the first row. */
async function checkFold(page: Page, label: string) {
  const boxes = await page.locator("[data-interview]").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.getAttribute("data-interview"), top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(7);
  const vh = page.viewportSize()!.height;
  for (const b of boxes) {
    expect(b.top >= 0 && b.bottom <= vh, `${label}: ${b.key} above the fold (bottom ${Math.round(b.bottom)})`).toBe(true);
  }
  const coding = boxes.find((b) => b.key === "technical-coding")!;
  const firstTop = Math.min(...boxes.map((b) => b.top));
  expect(Math.abs(coding.top - firstTop), `${label}: coding in the first row`).toBeLessThan(2);
  const firstRow = boxes.filter((b) => Math.abs(b.top - firstTop) < 2);
  expect(Math.min(...firstRow.map((b) => b.left)), `${label}: coding first in its row`).toBe(coding.left);
}

/** Every row of cards spans the list's full width: no empty slot at the end of any row. */
async function checkRowsFull(page: Page, label: string) {
  const { list, cards } = await page.locator('ul[aria-label="Industry-specific interviews"]').evaluate((ul) => {
    const r = ul.getBoundingClientRect();
    return {
      list: { left: r.left, right: r.right },
      cards: [...ul.querySelectorAll("[data-interview]")].map((el) => {
        const b = el.getBoundingClientRect();
        return { key: el.getAttribute("data-interview"), top: Math.round(b.top), left: b.left, right: b.right };
      }),
    };
  });
  const rows = new Map<number, typeof cards>();
  for (const card of cards) {
    const key = [...rows.keys()].find((top) => Math.abs(top - card.top) < 2) ?? card.top;
    rows.set(key, [...(rows.get(key) ?? []), card]);
  }
  for (const [top, row] of rows) {
    const names = row.map((c) => c.key).join(", ");
    expect(Math.abs(Math.min(...row.map((c) => c.left)) - list.left), `${label}: row at ${top} starts at the edge (${names})`).toBeLessThan(4);
    expect(Math.abs(Math.max(...row.map((c) => c.right)) - list.right), `${label}: row at ${top} reaches the edge (${names})`).toBeLessThan(4);
  }
}

test.describe.configure({ mode: "serial" });

test("default layout: every card in the first 1440×900 viewport, Technical coding first", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(PAGE);
  await expect(page.locator('[data-interview="technical-coding"]')).toBeVisible({ timeout: 45_000 });
  await checkFold(page, "default");
  await checkRowsFull(page, "default");
  await expect(page.getByRole("link", { name: "Start Technical coding" })).toBeInViewport();
});

for (const layout of ["balanced", "filler"]) {
  test(`layout ${layout}: above the fold, coding first, rows full at every width, no sideways scroll`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto(`${PAGE}?layout=${layout}`);
    await expect(page.locator(`[data-layout="${layout}"]`)).toBeVisible({ timeout: 45_000 });
    await checkFold(page, layout);
    await checkRowsFull(page, `${layout} 1440`);
    await page.screenshot({ path: `${SHOTS}/${layout}-1440.png` });

    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await checkRowsFull(page, `${layout} ${width}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/${layout}-${width}.png` });
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await checkRowsFull(page, `${layout} 375`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/${layout}-375.png` });
  });
}
