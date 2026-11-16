/**
 * Throwaway visual check for the pinned strip on both screens.
 * Run: npx tsx scripts/shoot-strips.ts   (dev server on :3000)
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots/strip-top";

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

async function scrollTo(page: Page, where: "top" | "middle" | "bottom") {
  await page.evaluate(
    ({ where }) => {
      const el = document.querySelector("main") as HTMLElement;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = where === "top" ? 0 : where === "middle" ? Math.round(max / 2) : max;
    },
    { where },
  );
  await page.waitForTimeout(500);
}

/** The gap between the column's top edge and the pinned strip — must be 0. */
async function gapAbove(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    const strip = main.querySelector("div.sticky")?.firstElementChild as HTMLElement | null;
    if (!strip) return "no strip";
    const s = strip.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    return `top=${Math.round(s.top - m.top)} left=${Math.round(s.left - m.left)} right=${Math.round(m.right - s.right)}`;
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page);

  const screens: Array<[string, string, RegExp]> = [
    ["customize", `${BASE}/practice/interviews/customize/general`, /The job/],
    ["picker", `${BASE}/practice/interviews/general`, /Choose your interviewer/i],
  ];

  for (const [name, url, ready] of screens) {
    for (const w of [1440, 768, 375]) {
      await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: ready }).waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1100);
      await scrollTo(page, "middle");
      await page.screenshot({ path: `${OUT}/${name}-${w}-middle.png` });
      console.log(`${name} ${w}: ${await gapAbove(page)}`);
    }
  }

  await browser.close();
})();
