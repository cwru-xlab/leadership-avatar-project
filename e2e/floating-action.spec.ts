import { expect, test, type Page } from "@playwright/test";

/**
 * The scrolled-away primary action on this app's two long setup pages — the
 * interviewer picker and the interview customization form — is a compact pill
 * floating in the top-right of the content column
 * (`components/shell/FloatingAction`). Both halves of its contract have
 * regressed before, so both are measured rather than eyeballed.
 *
 * WHAT WENT WRONG, TWICE. Each page had grown its own pinned CWRU Blue BAR
 * across the top of the content column, and both failed:
 *
 *  - THE BAR COULD NOT REACH THE EDGES. `<main>` is the scrollport and it is
 *    centred and capped (`mx-auto max-w-[1144px]` plus `px-4 md:px-8`, see
 *    `components/main-content.tsx`). Past 1144px of content area a gutter opens
 *    on each side that nothing rendered inside main can cross, so the bar
 *    stopped short of the sidebar on the left and the viewport on the right and
 *    read as clipped. An earlier version instead carried `-mx-4 md:-mx-8` and
 *    measured 57px WIDER than the cards on each side. Neither aligned to
 *    anything on the page.
 *  - THE BAR DOUBLED THE PRIMARY ACTION. On the customize page it stayed pinned
 *    at the bottom, where the form's own "Continue to setup" is on screen, so
 *    two competing CWRU Blue Continues were up at once.
 *
 * THE CONTRACT, asserted below at four widths on both pages:
 *  - the pill is DOWN at rest, so it never sits on the content at its natural
 *    position (on the picker that position is directly over the filter toolbar's
 *    search field);
 *  - the pill is UP once the page's real in-flow action has left the scrollport;
 *  - exactly ONE primary Continue control is hit-testable at a time, which is
 *    the doubled-action bug stated as a measurement;
 *  - the pill stays inside the content column: right edge on the column's
 *    padding box, never over the 256px sidebar or the mobile header below
 *    900px, and never a bar (well under the column width);
 *  - no horizontal overflow, the classic symptom of a botched bleed;
 *  - the back link and the page title survive in flow, because the bar used to
 *    carry them and the pill deliberately does not.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };
const WIDTHS = [375, 768, 1024, 1440];
/** A pill, not a bar: never more than this share of the content column. */
const MAX_PILL_SHARE = 0.7;
/** The persistent sidebar's width and the width it appears at, from `components/auth-navbar.tsx`. */
const SIDEBAR_WIDTH = 256;
const SIDEBAR_FROM = 900;

async function signIn(page: Page) {
  await page.goto("/login");
  const email = page.locator('input[type="email"]');
  const password = page.locator('input[type="password"]');
  // Assert the values survived: typing before the form hydrates gets silently
  // reset and submits an empty form.
  await expect(async () => {
    await email.fill(STUDENT.email);
    await password.fill(STUDENT.password);
    expect(await email.inputValue()).toBe(STUDENT.email);
    expect(await password.inputValue()).toBe(STUDENT.password);
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

interface Probe {
  shown: boolean;
  width: number;
  colWidth: number;
  /** Distance from the pill's right edge to the content column's padding box. */
  rightOffset: number;
  /** Pixels by which the pill crosses the sidebar's right edge. Must be <= 0. */
  intoSidebar: number;
  /** Pixels by which the pill crosses the mobile header's bottom. Must be <= 0. */
  intoHeader: number;
  /** Primary Continue controls that are visible AND hit-testable right now. */
  liveContinues: number;
  overflow: number;
}

/**
 * The pill is the first child of the only `div.sticky` in the column. Its
 * visibility is driven by `visible`/`invisible` plus `inert`, so "shown" reads
 * the computed visibility rather than presence in the DOM.
 *
 * `liveContinues` counts BUTTONS whose label starts with "Continue" and which
 * are both inside the scrollport and actually on top at their own centre
 * (`elementFromPoint`). The hit test is what makes this catch the real bug: an
 * `invisible` pill is excluded, and so is a footer button scrolled under it.
 */
const PROBE = `(() => {
  const main = document.querySelector("main");
  const sticky = main.querySelector("div.sticky");
  const outer = sticky ? sticky.firstElementChild : null;
  const pill = outer ? outer.firstElementChild : null;
  if (!pill) return { error: "no pill" };
  const mb = main.getBoundingClientRect();
  const cs = getComputedStyle(main);
  const pb = pill.getBoundingClientRect();
  const shown = getComputedStyle(outer).visibility === "visible";
  const contentRight = mb.right - parseFloat(cs.paddingRight);
  const sidebar = Array.from(document.querySelectorAll("aside")).filter(function (a) {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.left < 1;
  })[0];
  const header = document.querySelector("header.min-\\\\[900px\\\\]\\\\:hidden");

  let live = 0;
  for (const b of document.querySelectorAll("button")) {
    const label = (b.textContent || "").trim();
    if (label.indexOf("Continue") !== 0) continue;
    const r = b.getBoundingClientRect();
    if (r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
    if (getComputedStyle(b).visibility !== "visible") continue;
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (hit && (b === hit || b.contains(hit))) live += 1;
  }

  return {
    shown: shown,
    width: Math.round(pb.width),
    colWidth: Math.round(mb.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
    rightOffset: Math.round((contentRight - pb.right) * 10) / 10,
    intoSidebar: sidebar ? Math.round(sidebar.getBoundingClientRect().right - pb.left) : -9999,
    intoHeader: header ? Math.round(header.getBoundingClientRect().bottom - pb.top) : -9999,
    liveContinues: live,
    overflow: document.documentElement.scrollWidth - window.innerWidth
  };
})()`;

/** Scroll the column (NOT the window: `<main>` is the scrollport). */
async function scrollTo(page: Page, fraction: number) {
  await page.evaluate(`(() => {
    const m = document.querySelector("main");
    m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) * ${fraction});
  })()`);
  await page.waitForTimeout(500);
}

const PAGES = [
  {
    name: "picker",
    url: "/practice/interviews/general",
    heading: "Choose your interviewer",
    backLabel: /Interview practice|Interview/i,
  },
  {
    name: "customize",
    url: "/practice/interviews/customize/general",
    heading: "The job",
    backLabel: /Interview practice/i,
  },
];

test("the floating action replaces one primary, never doubles it", async ({ page }) => {
  test.setTimeout(420_000);
  // One sign-in, then resize: re-authenticating per width raced the login
  // form's hydration.
  await signIn(page);

  for (const target of PAGES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(target.url);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(1500);
      const where = `${target.name} @${width}`;

      // The bar used to carry the back link and the title; the pill does not,
      // so both must still be in flow and keyboard-reachable.
      const back = page.getByRole("link", { name: target.backLabel }).first();
      await expect(back, `${where}: back link missing from the in-flow hero`).toBeVisible();
      await back.focus();
      expect(await back.evaluate((el) => el === document.activeElement), `${where}: back link not focusable`).toBe(true);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
        `${where}: page title missing from the in-flow hero`,
      ).toBeVisible();

      // AT REST. The pill's natural position is the top of the column — on the
      // picker, directly over the toolbar's search field — so it must be down.
      await scrollTo(page, 0);
      let probe = (await page.evaluate(PROBE)) as Probe & { error?: string };
      expect(probe.error, `${where}: pill not found`).toBeUndefined();
      expect(probe.shown, `${where}: pill rests on the content before scrolling`).toBe(false);
      expect(probe.overflow, `${where}: horizontal overflow at rest`).toBeLessThanOrEqual(0);

      // SCROLLED. Mid-page the real action is off screen, so the pill stands in
      // for it — and is the ONLY primary Continue that can be clicked.
      await scrollTo(page, 0.45);
      probe = (await page.evaluate(PROBE)) as Probe;
      expect(probe.shown, `${where}: no pinned Continue mid-page`).toBe(true);
      expect(probe.liveContinues, `${where}: competing primary actions mid-page`).toBe(1);
      // A pill, not the bar it replaced.
      expect(probe.width, `${where}: pinned Continue spans the column like the old bar`).toBeLessThan(
        probe.colWidth * MAX_PILL_SHARE,
      );
      // Aligned to the column's padding box, which is where the cards end.
      expect(Math.abs(probe.rightOffset), `${where}: pill right edge off the content column`).toBeLessThanOrEqual(1);
      // Clear of the shell. Above 900px the sidebar is a real 256px column; the
      // mobile header replaces it below that.
      if (width >= SIDEBAR_FROM) {
        expect(probe.intoSidebar, `${where}: pill crosses the ${SIDEBAR_WIDTH}px sidebar`).toBeLessThanOrEqual(0);
      } else {
        expect(probe.intoHeader, `${where}: pill tucks under the mobile header`).toBeLessThanOrEqual(0);
      }
      expect(probe.overflow, `${where}: horizontal overflow while pinned`).toBeLessThanOrEqual(0);

      // AT THE BOTTOM. The real in-flow action is on screen, so the pill
      // retires: this is the doubled-Continue bug, stated as a measurement.
      await scrollTo(page, 1);
      probe = (await page.evaluate(PROBE)) as Probe;
      expect(probe.shown, `${where}: pill still up with the real action on screen`).toBe(false);
      expect(probe.liveContinues, `${where}: wrong number of primary actions at the end`).toBe(1);
    }
  }
});
