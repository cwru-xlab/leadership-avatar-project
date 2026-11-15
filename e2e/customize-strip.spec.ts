import { expect, test, type Page } from "@playwright/test";

/**
 * The customize page's condensed strip must read as part of the content
 * column, not as a bar floating over it.
 *
 * WHAT WENT WRONG. The strip carried `-mx-4 md:-mx-8` to cancel the content
 * column's padding and span it edge to edge. Measured, that made it 57px WIDER
 * than the cards on each side at every width — a dark slab overhanging
 * everything it covered, aligned to nothing, with square corners and no
 * shadow. It read as disconnected because geometrically it was.
 *
 * THE CONTRACT, asserted below:
 *  - the strip's left and right edges match the content column's padding box,
 *    so they land on the card edges below it (never wider);
 *  - it is flush with the top of the scrollport, with no canvas gap above it
 *    for page content to scroll through;
 *  - it carries a bottom radius and a shadow, the two cues that say "the page
 *    is scrolling under a pinned element".
 */

const STUDENT = { email: "student@case.edu", password: "student123" };
const WIDTHS = [375, 768, 1024, 1440];

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

/**
 * The strip lives in `PracticeHero`, OUTSIDE `<main>`, so it is found on the
 * document. Compared against the column's PADDING BOX (`clientLeft`-inset),
 * which is what the cards are laid out inside.
 */
const PROBE = `(() => {
  const main = document.querySelector("main");
  const sticky = document.querySelector("div.sticky");
  const strip = sticky ? sticky.firstElementChild : null;
  if (!strip) return { error: "no strip" };
  const mb = main.getBoundingClientRect();
  const sb = strip.getBoundingClientRect();
  const cs = getComputedStyle(main);
  const stripCs = getComputedStyle(strip);
  const contentLeft = mb.left + parseFloat(cs.paddingLeft);
  const contentRight = mb.right - parseFloat(cs.paddingRight);
  return {
    visible: stripCs.visibility,
    overhangLeft: Math.round(contentLeft - sb.left),
    overhangRight: Math.round(sb.right - contentRight),
    gapAbove: Math.round(sb.top - mb.top),
    bottomRadius: parseFloat(stripCs.borderBottomLeftRadius),
    hasShadow: stripCs.boxShadow !== "none"
  };
})()`;

test("the condensed strip is anchored to the content column", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 600 });
    // The customize route is the only page that gives PracticeHero an
    // `action`, which is what emits the strip.
    await page.goto("/practice/interviews/customize/general");
    await expect(page.getByRole("heading", { name: /The job/i })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200);

    // Unpinned: the strip must be hidden, not resting on the content.
    let probe = (await page.evaluate(PROBE)) as Record<string, unknown>;
    expect(probe.error, `${width}: strip not found`).toBeUndefined();
    expect(probe.visible, `${width}: strip visible before scrolling`).toBe("hidden");

    await page.evaluate(
      `(() => { const m = document.querySelector("main"); m.scrollTop = Math.round(m.scrollHeight * 0.45); })()`,
    );
    await page.waitForTimeout(600);

    probe = (await page.evaluate(PROBE)) as Record<string, unknown>;
    expect(probe.visible, `${width}: strip should be pinned mid-page`).toBe("visible");
    // Never wider than the column's content box. A 1px rounding allowance,
    // but no bleed: 57px of overhang each side is what this guards against.
    expect(probe.overhangLeft as number, `${width}: strip overhangs the column on the left`)
      .toBeLessThanOrEqual(1);
    expect(probe.overhangRight as number, `${width}: strip overhangs the column on the right`)
      .toBeLessThanOrEqual(1);
    // Flush with the scrollport, so nothing scrolls through a gap above it.
    expect(probe.gapAbove as number, `${width}: canvas gap above the strip`).toBeLessThanOrEqual(1);
    // The cues that join it to the page.
    expect(probe.bottomRadius as number, `${width}: strip has square bottom corners`)
      .toBeGreaterThan(0);
    expect(probe.hasShadow, `${width}: strip has no shadow to lift it over content`).toBe(true);
  }
});
