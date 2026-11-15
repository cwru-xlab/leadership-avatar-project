import { expect, test, type Page } from "@playwright/test";

/**
 * The compact roster row's thumbnail: its size, its framing, and what both
 * cost in scrolling.
 *
 * WHY THIS EXISTS. The picker's compact list defaults on, and its thumbnail
 * shipped at 44px with a plain centred `object-fit: cover`. The verdict on that
 * was "the images are quite a bit too small since it will be difficult for
 * users to make out what the avatar looks like", and measuring the roster found
 * the dominant cause was FRAMING, not pixels: every `previewUrl` is 16:9, and
 * the five Weatherhead faculty were filmed STANDING, so a centred square crop
 * spent the thumbnail on a torso, a desk and a bookshelf with the head at only
 * ~17% of frame height — about a 7px face.
 *
 * The fix was a per-shoot-family head crop plus 44 -> 56px. Each assertion
 * below pins one half of that, because each has a specific way of silently
 * regressing:
 *
 *  - SIZE. 56px is deliberate, not incidental. It is the thumbnail that made a
 *    cropped face comfortable; reverting to 44px restores the complaint, and
 *    `size-11`/`size-14` is a one-character edit away from happening by
 *    accident.
 *  - THE CROP IS A TRANSFORM, NOT AN `object-position`. This is the assertion
 *    most at risk of a well-meaning "simplification". A 16:9 still covering a
 *    1:1 box renders at 78.2x44 for a 44px box — `overflowY` is exactly ZERO,
 *    so there is no vertical slack for `object-position` to slide and a
 *    head-biased `50% 0%` is a literal no-op. Only a scale can crop in on a
 *    face. So the spec asserts a real `matrix(...)` with a scale > 1 AND that
 *    `object-position` is still centred, which is what proves the framing is
 *    carried by the transform.
 *  - THE CROP IS CLIPPED. The transform has to be clipped by a PARENT, because
 *    `overflow` does not apply to replaced elements: a transform on the <img>
 *    alone spills a 2.7x-magnified photo across the row and over its own
 *    rounded corners. The thumbnail's own box must therefore stay 56px even
 *    though its rendered content is far larger.
 *  - FACULTY GET MORE CROP THAN STOCK. The two scales come from measuring head
 *    height per shoot family (faculty standing ~0.17 of frame, stock seated
 *    ~0.32-0.34). Collapsing them to one global value would under-crop the
 *    faculty — the exact faces that were worst — so the spec asserts the
 *    faculty scale is strictly the larger one rather than hardcoding both.
 *  - THE IMAGE IS REALLY THERE. A crop is indistinguishable from a broken
 *    image in a layout assertion, so `naturalWidth > 0` is checked on every
 *    row. This also catches a magnified <img> that renders as a blank box.
 *  - A SCROLL BUDGET. The whole reason the compact list exists is density: the
 *    photo grid is ~6.9 viewport-heights at 1440 and the list was ~2.84. The
 *    thumbnail bump takes the list to ~3.06 (~8%), which is the accepted
 *    price. The budget below is what stops a future "just make them bigger"
 *    from quietly spending the saving that justified this view, and it is
 *    asserted RELATIVE to the grid as well as absolutely, so it keeps meaning
 *    if the roster's length changes.
 *
 * ACCESSIBILITY. The thumbnail is decorative (`alt=""`) on purpose: the
 * adjacent name is the accessible label, and alt text here would make a screen
 * reader announce every interviewer twice. That is asserted, because "fixing"
 * an empty alt looks like an improvement.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };

/** The shipped thumbnail edge, in CSS px. */
const THUMB = 56;
/** The five custom faculty avatars — the standing shoot that needs most crop. */
const FACULTY = "Scott Cowen";
/** A seated stock face, for the other rule. */
const STOCK = "Emily";

/**
 * Scroll budget for the compact list, in viewport-heights, measured at the
 * shipped treatment with headroom for a row of roster churn. 1440 shipped at
 * ~3.06 and 375 at ~9.25.
 */
const LIST_BUDGET: Readonly<Record<number, number>> = { 1440: 3.4, 375: 10.0 };

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

async function openPicker(page: Page) {
  await page.goto("/practice/interviews/general");
  await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

interface Thumb {
  /** The image's own LAYOUT size, which a transform does not affect. */
  boxW: number;
  boxH: number;
  objectFit: string;
  objectPosition: string;
  /** Horizontal scale parsed out of the computed matrix. */
  scale: number;
  naturalWidth: number;
  alt: string | null;
  /** Whether a parent clips the magnified image. */
  clipped: boolean;
}

/**
 * Measures one named row's thumbnail.
 *
 * Reads `offsetWidth`/`offsetHeight`, NOT `getBoundingClientRect()`: a scaled
 * image's client rect is `scale` times its layout size and would report 151px
 * for a 56px thumbnail. The layout box is the number that matters here because
 * it is what the row reserves and therefore what sets the row's height.
 */
const THUMB_PROBE = (name: string) => `(() => {
  const rows = Array.from(document.querySelectorAll("main button[aria-pressed]"));
  const row = rows.find((r) => (r.textContent || "").indexOf(${JSON.stringify(name)}) !== -1);
  if (!row) return null;
  const img = row.querySelector("img");
  if (!img) return null;
  const cs = getComputedStyle(img);
  const m = cs.transform.match(/matrix\\(([^,]+),/);
  // A clipping ancestor between the image and the row is what contains the
  // magnified photo; walk up rather than assuming a particular nesting depth.
  let clipped = false;
  for (let el = img.parentElement; el && el !== row.parentElement; el = el.parentElement) {
    if (getComputedStyle(el).overflow === "hidden") { clipped = true; break; }
  }
  return {
    boxW: img.offsetWidth,
    boxH: img.offsetHeight,
    objectFit: cs.objectFit,
    objectPosition: cs.objectPosition,
    scale: m ? parseFloat(m[1]) : 1,
    naturalWidth: img.naturalWidth,
    alt: img.getAttribute("alt"),
    clipped: clipped
  };
})()`;

/** Viewport-heights of scrollable content, plus every row's loaded state. */
const LIST_PROBE = `(() => {
  const main = document.querySelector("main");
  const rows = Array.from(main.querySelectorAll("button[aria-pressed]"));
  let broken = 0;
  let firstPitch = 0;
  for (const r of rows) {
    const img = r.querySelector("img");
    if (img && (!img.complete || img.naturalWidth === 0)) broken += 1;
  }
  if (rows[0]) firstPitch = Math.round(rows[0].getBoundingClientRect().height);
  return {
    screens: +(main.scrollHeight / main.clientHeight).toFixed(2),
    rowCount: rows.length,
    rowHeight: firstPitch,
    broken: broken
  };
})()`;

test("the compact row's thumbnail is big enough and cropped to the face", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);

  // Compact list is the default, but assert it rather than assume it: this
  // whole spec is about that view.
  await expect(page.getByRole("radio", { name: "Compact list" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Every still really decoded, so a framing assertion cannot pass against a
  // broken image.
  await page.evaluate(
    `Promise.all(Array.from(document.querySelectorAll("main button[aria-pressed] img"))
       .map((i) => i.decode().catch(() => {})))`,
  );

  const faculty = (await page.evaluate(THUMB_PROBE(FACULTY))) as Thumb | null;
  const stock = (await page.evaluate(THUMB_PROBE(STOCK))) as Thumb | null;
  expect(faculty, `no row found for ${FACULTY}`).not.toBeNull();
  expect(stock, `no row found for ${STOCK}`).not.toBeNull();
  if (!faculty || !stock) return;
  console.log("faculty thumb:", JSON.stringify(faculty));
  console.log("stock thumb:", JSON.stringify(stock));

  for (const [who, t] of [
    [FACULTY, faculty],
    [STOCK, stock],
  ] as const) {
    // SIZE. The layout box, which a transform does not inflate.
    expect(t.boxW, `${who}: thumbnail width`).toBe(THUMB);
    expect(t.boxH, `${who}: thumbnail height`).toBe(THUMB);

    // The still really loaded — a crop and a broken image look alike in layout.
    expect(t.naturalWidth, `${who}: preview still did not load`).toBeGreaterThan(0);

    // FRAMING. A real magnification, carried by a transform.
    expect(t.objectFit, `${who}: thumbnail must still cover its box`).toBe("cover");
    expect(t.scale, `${who}: thumbnail is not cropped in on the face`).toBeGreaterThan(1);

    // The crop is NOT an object-position offset, which would be inert: a 16:9
    // still covering a 1:1 box has zero vertical overflow to slide.
    expect(t.objectPosition, `${who}: framing moved to an inert object-position`).toBe(
      "50% 50%",
    );

    // The magnified image is clipped by its parent, or it spills over the row.
    expect(t.clipped, `${who}: magnified thumbnail is not clipped by a parent`).toBe(true);

    // Decorative on purpose: the adjacent name is the label.
    expect(t.alt, `${who}: thumbnail alt must stay empty`).toBe("");
  }

  // The standing faculty shoot needs strictly more crop than the seated stock
  // one. Asserted as a relation, so retuning either value stays legal while
  // collapsing them to one global scale fails.
  expect(
    faculty.scale,
    "faculty need a tighter crop than stock faces (standing vs seated shoot)",
  ).toBeGreaterThan(stock.scale);
});

test("the bigger thumbnail keeps the compact list's density win", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
    await openPicker(page);

    await page.getByRole("radio", { name: "Compact list" }).click();
    await page.waitForTimeout(900);
    const list = (await page.evaluate(LIST_PROBE)) as {
      screens: number;
      rowCount: number;
      rowHeight: number;
      broken: number;
    };
    console.log(`${width} list:`, JSON.stringify(list));

    expect(list.rowCount, `${width}: roster came back short`).toBeGreaterThan(40);
    expect(list.broken, `${width}: rows with an unloaded thumbnail`).toBe(0);
    // The row must still be a ROW. 74px is the shipped pitch; this catches a
    // thumbnail bump that quietly turns the list back into a card grid.
    expect(list.rowHeight, `${width}: compact row is no longer compact`).toBeLessThanOrEqual(84);

    expect(
      list.screens,
      `${width}: compact list exceeds its scroll budget — the density win is the reason this view exists`,
    ).toBeLessThanOrEqual(LIST_BUDGET[width]);

    // And the saving against the photo grid, which is what the list is FOR.
    await page.getByRole("radio", { name: "Photo grid" }).click();
    await page.waitForTimeout(900);
    const grid = (await page.evaluate(LIST_PROBE)) as { screens: number };
    console.log(`${width} grid:`, JSON.stringify(grid));
    expect(
      list.screens,
      `${width}: compact list no longer saves meaningful scrolling over the grid`,
    ).toBeLessThan(grid.screens * 0.6);
  }
});
