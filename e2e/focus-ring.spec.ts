import { expect, test, type Page } from "@playwright/test";

/**
 * App-wide keyboard focus ring. Under Tailwind v4 `outline-none` sets
 * `outline-style: none`, so `focus-visible:outline-2` alone draws nothing.
 * This tabs through real pages and requires every stop to show a ring
 * (an outline or a ring shadow), then checks a mouse click shows none.
 */
const SHOTS = ".loop-shots";
const INTERVIEW = "2cd23e87-49e4-4d94-a5b3-aeaa048589f5";
// Elevator pitch whose listener walked out: has the collapsed signals panel.
const ELEVATOR = "97d9f6b3-0cc5-4560-a6f9-1b89c3d7c08f";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice.johnson@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

type Stop = { label: string; outline: string; shadow: string; ring: boolean };

const readStop = (page: Page) =>
  page.evaluate((): Stop | null => {
    const el = document.activeElement as HTMLElement | null;
    // The Next.js dev overlay is not part of the app.
    if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
    const visible = (node: Element) => {
      const style = getComputedStyle(node);
      const hasOutline =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && !style.outlineColor.endsWith(", 0)");
      const hasShadow = style.boxShadow !== "none" && /rgba?\((?!0, 0, 0, 0\))/.test(style.boxShadow);
      return hasOutline || hasShadow;
    };
    // HeroUI text fields draw focus on their wrapper, not on the input.
    const wrapper = el.closest('[data-slot="input-wrapper"]');
    const style = getComputedStyle(wrapper ?? el);
    const outline = `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
    const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
    return { label: `${el.tagName.toLowerCase()} "${label}"`, outline, shadow: style.boxShadow, ring: visible(el) || (!!wrapper && visible(wrapper)) };
  });

async function tabThrough(page: Page, stops: number) {
  const seen: Stop[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    // Let transition-colors finish so the ring is read at its final color.
    await page.waitForTimeout(200);
    const stop = await readStop(page);
    if (stop) seen.push(stop);
  }
  return seen;
}

const PAGES = [
  { name: "practice", path: "/practice", stops: 14 },
  { name: "reports", path: "/reports", stops: 14 },
  { name: "report", path: `/reports/${INTERVIEW}`, stops: 24 },
  { name: "study-plans", path: "/study-plans", stops: 14 },
  { name: "paths", path: "/paths", stops: 14 },
  { name: "mastery", path: "/mastery", stops: 14 },
];

test.describe("keyboard focus ring", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const target of PAGES) {
    test(`every Tab stop shows a ring on ${target.name}`, async ({ page }) => {
      test.setTimeout(120_000);
      await signIn(page);
      await page.goto(target.path);
      await page.waitForLoadState("networkidle");
      await page.locator("main").click({ position: { x: 2, y: 2 } });
      const stops = await tabThrough(page, target.stops);
      expect(stops.length).toBeGreaterThan(3);
      const missing = stops.filter((stop) => !stop.ring);
      console.log(target.name, stops.map((s) => `${s.ring ? "ok " : "-- "}${s.label} | ${s.outline}`).join("\n"));
      await page.screenshot({ path: `${SHOTS}/focus-${target.name}.png` });
      expect(missing, JSON.stringify(missing, null, 2)).toEqual([]);
    });
  }

  test("report disclosures: ring on Tab, none on click", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${INTERVIEW}`);
    await expect(page.locator("#moments")).toBeVisible({ timeout: 45_000 });
    const delivery = page.getByRole("tab", { name: "Delivery" });
    await delivery.click();

    // Every disclosure summary or toggle on the Delivery tab.
    const toggles = page.locator("main summary, main button[aria-expanded]");
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const toggle = toggles.nth(i);
      if (!(await toggle.isVisible())) continue;
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      const style = await toggle.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(style, `mouse click on toggle ${i}`).toBe("none");
      await toggle.click();
    }

    // The same toggles reached with the keyboard draw a ring.
    await page.locator("h1").click();
    let ringed = 0;
    for (let i = 0; i < 60 && ringed < count; i++) {
      await page.keyboard.press("Tab");
      const isToggle = await page.evaluate(() => {
        const el = document.activeElement;
        return !!el && (el.tagName === "SUMMARY" || el.hasAttribute("aria-expanded")) && !!el.closest("main");
      });
      if (!isToggle) continue;
      const stop = await readStop(page);
      expect(stop!.ring, `keyboard focus on ${stop!.label}`).toBe(true);
      if (ringed === 0) await page.screenshot({ path: `${SHOTS}/focus-report-toggle.png` });
      ringed++;
    }
    expect(ringed).toBeGreaterThan(0);
  });

  test("walk-out signals summary: ring on Tab, none on click", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${ELEVATOR}`);
    const summary = page.getByTestId("disengagement-decline-panel").locator("summary");
    await expect(summary).toBeVisible({ timeout: 45_000 });
    await summary.click();
    expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    await summary.click();
    await page.locator("h1").click();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await summary.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(summary).toBeFocused();
    await page.waitForTimeout(200);
    expect((await readStop(page))!.ring).toBe(true);
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/focus-walkout-summary.png` });
  });

  test("Delivery tab stops all show a ring", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto(`/reports/${INTERVIEW}`);
    await expect(page.locator("#moments")).toBeVisible({ timeout: 45_000 });
    const delivery = page.getByRole("tab", { name: "Delivery" });
    await delivery.click();
    await delivery.focus();
    const stops = await tabThrough(page, 20);
    console.log("delivery", stops.map((s) => `${s.ring ? "ok " : "-- "}${s.label} | ${s.outline}`).join("\n"));
    expect(stops.filter((stop) => !stop.ring)).toEqual([]);
  });
});
