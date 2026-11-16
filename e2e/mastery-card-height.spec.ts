import { expect, test, type Page } from "@playwright/test";

/**
 * Every competency card in a grid row is the same height.
 *
 * `LevelProgress` renders nothing when there is no next level to progress
 * toward — i.e. at level 5 — so a Mastered card used to drop its bar while
 * keeping the "Progress to the next level" heading above the gap, and came out
 * measurably shorter than the cards beside it.
 *
 * This asserts the rendered geometry rather than the markup, so it fails for
 * ANY future cause of a short card, not just this one.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

for (const { email, tag } of [
  // Jane Smith: the account in the report, and the only seeded student holding
  // level 5 — so the only one that exercises the no-next-level branch.
  { email: "student@case.edu", tag: "top-level" },
  { email: "alice.johnson@case.edu", tag: "many-levels" },
  { email: "one.session@case.edu", tag: "one-level" },
]) {
  test(`competency cards in a row match height (${tag})`, async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, email);
    await page.goto("/mastery");

    const cards = page.locator('[data-testid="competency-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    // Group by rounded y, which is what "the same grid row" means on screen.
    const boxes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const bar = el.querySelector('[role="progressbar"]');
        /**
         * The progress heading specifically — `div.flex-col > span.font-semibold`
         * also matches the card title's wrapper, which made this read a title
         * as a heading on unmeasured cards (they show a description, and
         * correctly have no bar).
         */
        const headings = Array.from(el.querySelectorAll("span.text-xs.font-semibold.text-muted"))
          .map((n) => (n.textContent ?? "").trim())
          .filter((t) => t === "Progress to the next level" || t === "Top level reached");
        return {
          top: Math.round(r.top),
          height: Math.round(r.height),
          label: (el.querySelector("p")?.textContent ?? "").trim().slice(0, 32),
          hasBar: Boolean(bar),
          heading: headings[0] ?? "",
        };
      }),
    );

    const rows = new Map<number, typeof boxes>();
    for (const b of boxes) {
      const key = [...rows.keys()].find((k) => Math.abs(k - b.top) <= 4) ?? b.top;
      rows.set(key, [...(rows.get(key) ?? []), b]);
    }

    for (const [top, row] of rows) {
      if (row.length < 2) continue;
      const heights = row.map((r) => r.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(
        spread,
        `row @${top} heights differ by ${spread}px: ${row.map((r) => `${r.label}=${r.height}`).join(", ")}`,
      ).toBe(0);
    }

    // Every card showing a level shows a bar — including the top level, which
    // is the case that used to render the heading over empty space.
    const withLevel = boxes.filter((b) => b.heading.length > 0);
    expect(withLevel.length).toBeGreaterThan(0);
    for (const b of withLevel) {
      expect(b.hasBar, `${b.label} has the heading "${b.heading}" but no bar`).toBe(true);
    }

    // The heading never promises a next level where there is none.
    const topLevel = boxes.filter((b) => b.heading === "Top level reached");
    for (const b of topLevel) {
      expect(b.heading).not.toContain("next level");
      expect(b.hasBar, `${b.label} is at the top level but has no bar`).toBe(true);
    }
    console.log(`${tag}: ${count} cards, ${rows.size} rows, ${topLevel.length} at top level`);
    /**
     * The top-level branch is the whole point of this spec, so one run must
     * actually reach it. Without this the suite could go green while never
     * rendering a Mastered card — which is exactly how the original bug
     * survived.
     */
    if (tag === "top-level") {
      expect(topLevel.length, "no Mastered card: this run never exercised the no-next-level branch").toBeGreaterThan(0);
    }

    await page
      .getByRole("region", { name: "Mastery by competency" })
      .screenshot({ path: `screenshots/mastery-cards/${tag}-cards.png` });
  });
}
