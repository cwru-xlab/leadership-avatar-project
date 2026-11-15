import { writeFileSync } from "node:fs";

import { test, type Page } from "@playwright/test";

/**
 * Screenshots of the four seeded grading-probe reports (not an assertion spec).
 *   PROBE_IDS="a=<id>,b=<id>,c=<id>,d=<id>" E2E_BASE_URL=http://localhost:3124 \
 *     npx playwright test --config scripts/research/playwright.probe.config.ts
 */
const DIR = "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/coding-report/probe";
const IDS = (process.env.PROBE_IDS ?? "").split(",").filter(Boolean).map((x) => x.split("="));

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("student@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("technical-coding probe report shots", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  for (const [label, id] of IDS) {
    await page.goto(`/reports/${id}`);
    await page.getByText("Grading probe", { exact: false }).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/${label}-top-1440.png` });
    // Every tab in the report's strip, so each rendered section is on record.
    const tabs = page.getByRole("tab");
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const tab = tabs.nth(i);
      const name = ((await tab.textContent()) ?? `tab${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await tab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${DIR}/${label}-tab-${name}-1440.png` });
      writeFileSync(`${DIR}/${label}-tab-${name}.txt`, await page.locator("main").first().innerText());
      // The app shell scrolls an inner container, so fullPage stops at the fold: page through it.
      for (let k = 1; k <= 4; k++) {
        const moved = await page.evaluate((step) => {
          const el = [...document.querySelectorAll<HTMLElement>("*")].find((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
          if (!el) return false;
          const before = el.scrollTop;
          el.scrollTop = before + step;
          return el.scrollTop !== before;
        }, 760);
        if (!moved) break;
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${DIR}/${label}-tab-${name}-p${k + 1}-1440.png` });
      }
    }
  }
});
