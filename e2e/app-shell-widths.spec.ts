import { expect, test, type Page } from "@playwright/test";

/**
 * App-shell width guard.
 *
 * The shell's flex direction and the nav's shape MUST flip at the same width.
 * They did not: `app/layout.tsx` used `md:flex-row` (768px) while
 * `components/auth-navbar.tsx` only becomes a sidebar at `min-[900px]`, so
 * between 768 and 899px the MOBILE top bar was laid out as a row item and ate
 * 378px of width — every page in the app-shell frame rendered into a 358px
 * column with dead canvas beside it, truncating choice tiles mid-word.
 *
 * This locks the invariant that actually matters, at the exact band edges:
 * below 900px there is no sidebar and the content column starts at the page
 * padding; at 900px and up it clears the 256px sidebar. A future breakpoint
 * edit that desynchronises the two files fails here.
 */
const STUDENT = { email: "student@case.edu", password: "student123" };
const SIDEBAR_WIDTH = 256;
/** `MainContent`: 16px page padding below `md`, 32px at `md` and above. */
const PAGE_PADDING = 32;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

for (const width of [375, 768, 899, 900, 1024, 1440]) {
  test(`app shell gives the content column its full width at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    // Any app-shell page would do; this one is dense with choice tiles, so a
    // squeezed column shows up as truncated text rather than just whitespace.
    await page.goto("/practice/interviews/customize/general");
    await page.getByRole("heading", { name: "Your interviewer" }).waitFor({ timeout: 45_000 });

    const { x, columnWidth, sidebarVisible } = await page.evaluate(() => {
      const section = document.querySelector(
        "section[aria-labelledby='customize-interviewer']",
      )!;
      const rect = section.getBoundingClientRect();
      const sidebar = document.querySelector("aside.min-\\[900px\\]\\:flex");
      return {
        x: Math.round(rect.x),
        columnWidth: Math.round(rect.width),
        sidebarVisible: sidebar ? getComputedStyle(sidebar).display !== "none" : false,
      };
    });

    if (width < 900) {
      expect(sidebarVisible, `${width}px: sidebar must be hidden`).toBe(false);
      expect(x, `${width}px: content pushed right by a stray row item`).toBeLessThanOrEqual(
        PAGE_PADDING,
      );
      expect(
        columnWidth,
        `${width}px: content column is only ${columnWidth}px wide`,
      ).toBeGreaterThan(width - PAGE_PADDING * 2 - 16);
    } else {
      expect(sidebarVisible, `${width}px: sidebar must be shown`).toBe(true);
      expect(x, `${width}px: content must clear the sidebar`).toBeGreaterThanOrEqual(
        SIDEBAR_WIDTH,
      );
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${width}px: horizontal overflow`).toBeLessThanOrEqual(0);
  });
}
