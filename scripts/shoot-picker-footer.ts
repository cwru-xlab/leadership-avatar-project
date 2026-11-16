/**
 * Throwaway visual check for the picker's footer + pinned strip.
 * Run: npx tsx scripts/shoot-picker-footer.ts   (dev server on :3000)
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots/picker-footer";

async function signIn(page: Page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill("student@case.edu");
    await page.locator('input[type="password"]').fill("student123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      return;
    } catch {
      console.log(`sign-in attempt ${attempt + 1} timed out; retrying`);
    }
  }
  throw new Error("could not sign in");
}

const SCROLLER = "main";

async function scrollTo(page: Page, where: "top" | "middle" | "bottom") {
  await page.evaluate(
    ({ sel, where }) => {
      const el = document.querySelector(sel) as HTMLElement;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = where === "top" ? 0 : where === "middle" ? Math.round(max / 2) : max;
    },
    { sel: SCROLLER, where },
  );
  await page.waitForTimeout(500);
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page);

  const url = `${BASE}/practice/interviews/general`;
  const open = async (w: number, h: number) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Choose your interviewer/i }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1200);
  };

  for (const w of [1440, 1024, 768, 375]) {
    await open(w, w === 375 ? 812 : 900);
    for (const where of ["top", "middle", "bottom"] as const) {
      await scrollTo(page, where);
      await page.screenshot({ path: `${OUT}/${w}-${where}.png` });
    }
    console.log(`${w} overflow=${await overflow(page)}`);
  }

  // Filtered down to a few cards: the footer should be visible with no strip.
  await open(1440, 900);
  await page.getByPlaceholder("Any name").fill("an");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/1440-filtered-short.png` });

  await browser.close();
})();
