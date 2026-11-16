import { chromium, type Page } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots/picker-list";

async function signIn(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill("student@case.edu");
    await page.locator('input[type="password"]').fill("student123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try { await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }); return; } catch { console.log("retry login"); }
  }
  throw new Error("could not sign in");
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    return {
      scrollHeight: main.scrollHeight,
      viewport: main.clientHeight,
      screens: +(main.scrollHeight / main.clientHeight).toFixed(1),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page);

  for (const w of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
    await page.goto(`${BASE}/practice/interviews/general`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Choose your interviewer/i }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(1400);

    const list = await metrics(page);
    await page.screenshot({ path: `${OUT}/list-${w}-top.png` });
    console.log(`${w} LIST  screens=${list.screens} height=${list.scrollHeight} overflowX=${list.overflowX}`);

    // Switch to the photo grid and measure the same page.
    await page.getByRole("radio", { name: "Photo grid" }).click();
    await page.waitForTimeout(900);
    const grid = await metrics(page);
    await page.screenshot({ path: `${OUT}/grid-${w}-top.png` });
    console.log(`${w} GRID  screens=${grid.screens} height=${grid.scrollHeight} overflowX=${grid.overflowX}`);
  }

  // Selection must survive a view switch.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/practice/interviews/general`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Choose your interviewer/i }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1400);
  const before = await page.locator('button[aria-pressed="true"]').first().textContent();
  await page.getByRole("radio", { name: "Photo grid" }).click();
  await page.waitForTimeout(700);
  const after = await page.locator('button[aria-pressed="true"]').first().textContent();
  console.log(`selection kept across views: ${JSON.stringify(before?.slice(0, 30))} -> ${JSON.stringify(after?.slice(0, 30))}`);

  await browser.close();
})();
