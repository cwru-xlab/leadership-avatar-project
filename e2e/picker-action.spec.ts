import { expect, test, type Page } from "@playwright/test";

/**
 * Guards the geometry of the interviewer picker's closing action.
 *
 * The step offers Continue twice: an in-flow footer at the end of the roster,
 * and a pinned pill while the footer is off screen (the roster is ~54 cards
 * deep, so an action parked under the last row costs a long scroll back).
 *
 * Both halves have regressed before, so both are measured rather than eyeballed:
 *
 *  - The FOOTER must never overlap a card. Its predecessor was a bordered dock
 *    that hovered on `sticky -bottom-16` and slid across the photographs.
 *  - The PILL must stay a pill. Its predecessor was a full-bleed 56px bar that
 *    cut 2-4 faces in half at every scroll position; over wall-to-wall
 *    photography a slab that wide reads as damage rather than chrome.
 *  - The pill must be absent at rest (it used to rest on top of the search
 *    field before the page scrolled) and absent at the bottom (where the
 *    footer is already on screen and two Continues compete).
 */

const STUDENT = { email: "student@case.edu", password: "student123" };
const WIDTHS = [375, 768, 1024, 1440];
/** A pill, not a bar: never more than this share of the content column. */
const MAX_PILL_SHARE = 0.7;

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

interface Box {
  shown: boolean;
  /** Card area the element covers, in CSS px squared. */
  obscuredPx: number;
  width: number;
}
interface Probe {
  colWidth: number;
  footer: Box;
  pill: Box;
}

/**
 * Measures TRUE 2D intersection with the cards, not just the horizontal band:
 * a narrow pill and a full-bleed bar share a band but obscure very different
 * amounts, and an earlier band-only check could not tell them apart.
 */
const PROBE = `(() => {
  const main = document.querySelector("main");
  const cards = Array.from(main.querySelectorAll("button[aria-pressed]"));
  const footer = Array.from(main.querySelectorAll("div.border-t")).filter(function (d) {
    return (d.textContent || "").indexOf("Continue") !== -1;
  })[0];
  const sticky = main.querySelector("div.sticky");
  const outer = sticky ? sticky.firstElementChild : null;
  const pill = outer ? outer.firstElementChild : null;

  function visible(r) { return r.bottom > 0 && r.top < main.clientHeight && r.height > 0; }
  function measure(bar) {
    if (!bar) return { shown: false, obscuredPx: 0, width: 0 };
    const b = bar.getBoundingClientRect();
    if (!visible(b)) return { shown: false, obscuredPx: 0, width: 0 };
    let obscured = 0;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (!visible(r)) continue;
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (w > 0 && h > 0) obscured += w * h;
    }
    return { shown: true, obscuredPx: Math.round(obscured), width: Math.round(b.width) };
  }
  const shown = outer && getComputedStyle(outer).visibility === "visible";
  return {
    colWidth: Math.round(main.clientWidth),
    footer: measure(footer),
    pill: shown ? measure(pill) : { shown: false, obscuredPx: 0, width: 0 }
  };
})()`;

async function scrollTo(page: Page, fraction: number) {
  await page.evaluate(`(() => {
    const m = document.querySelector("main");
    m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) * ${fraction});
  })()`);
  await page.waitForTimeout(450);
}

test("the picker's Continue is reachable without covering the roster", async ({ page }) => {
  test.setTimeout(240_000);
  // One sign-in, then resize: re-authenticating per width raced the login
  // form's hydration.
  await signIn(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/practice/interviews/general");
    await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);

    // Both views: the compact rows students land on, and the photo grid, whose
    // edge-to-edge imagery is what makes an overlay conspicuous.
    for (const view of ["Compact list", "Photo grid"]) {
      await page.getByRole("radio", { name: view }).click();
      await page.waitForTimeout(800);
      const where = `${width} ${view}`;

      await scrollTo(page, 0);
      let probe = (await page.evaluate(PROBE)) as Probe;
      expect(probe.pill.shown, `${where}: pill rests on the toolbar before scrolling`).toBe(false);

      await scrollTo(page, 0.5);
      probe = (await page.evaluate(PROBE)) as Probe;
      expect(probe.pill.shown, `${where}: no pinned Continue mid-roster`).toBe(true);
      expect(
        probe.pill.width,
        `${where}: pinned Continue spans the column like the old slab`,
      ).toBeLessThan(probe.colWidth * MAX_PILL_SHARE);
      expect(probe.footer.obscuredPx, `${where}: footer covers cards mid-roster`).toBe(0);

      await scrollTo(page, 1);
      probe = (await page.evaluate(PROBE)) as Probe;
      expect(probe.pill.shown, `${where}: pill still up with the footer on screen`).toBe(false);
      expect(probe.footer.shown, `${where}: footer missing at the end of the roster`).toBe(true);
      expect(probe.footer.obscuredPx, `${where}: footer covers cards at the end`).toBe(0);
    }
  }
});
