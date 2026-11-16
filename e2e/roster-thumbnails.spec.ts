import { expect, test, type Page } from "@playwright/test";

/**
 * The compact roster row's thumbnail: its size, its framing, and what both
 * cost in scrolling.
 *
 * WHY THIS EXISTS. The picker's compact list is one of two views, and its
 * thumbnail shipped at 44px with a plain centred `object-fit: cover`. The
 * verdict on that was "the images are quite a bit too small since it will be
 * difficult for users to make out what the avatar looks like", and measuring
 * the roster found the dominant cause was FRAMING, not pixels: every
 * `previewUrl` is 16:9, and the five Weatherhead faculty were filmed STANDING,
 * so a centred square crop spent the thumbnail on a torso, a desk and a
 * bookshelf with the head at only ~17% of frame height — about a 7px face.
 *
 * The fix was a per-shoot-family head crop plus 44 -> 56px. Each assertion
 * below pins one half of that, because each has a specific way of silently
 * regressing:
 *
 *  - SIZE. 56px is deliberate, not incidental. It is the thumbnail that made a
 *    cropped face comfortable; reverting to 44px restores the complaint, and
 *    `size-11`/`size-14` is a one-character edit away from happening by
 *    accident.
 *  - THE VERTICAL CROP IS A TRANSFORM, NOT AN `object-position`. This is the
 *    assertion most at risk of a well-meaning "simplification". A 16:9 still
 *    covering a 1:1 box renders at 78.2x44 for a 44px box — `overflowY` is
 *    exactly ZERO, so there is no vertical slack for `object-position` to
 *    slide and a head-biased `50% 0%` is a literal no-op. Only a scale can
 *    crop in on a face. So the spec asserts a real `matrix(...)` with a scale
 *    > 1 AND that `object-position` is still centred VERTICALLY, which is what
 *    proves the vertical framing is carried by the transform.
 *  - THE HORIZONTAL CROP IS THE OPPOSITE, AND THAT IS NOT A CONTRADICTION.
 *    `overflowX` is 16/9 - 1 = 0.778 BOX WIDTHS, which is ample slack, so
 *    `object-position` X is live and is the right tool for a subject the shoot
 *    did not centre. Two avatars need it: the `Tech Expert` shoot (Bryan,
 *    Elenora) seats its subject at ~64% of frame width behind a wall of
 *    monitors, and a crop about 50% put a face at the edge of the box — the
 *    bug this third test exists for. The framing module previously asserted in
 *    a comment that EVERY subject was centred; that claim was generalised from
 *    a twelve-avatar sample that did not include this shoot, so the test below
 *    pins BOTH directions: the two off-centre avatars carry a non-50% X, and
 *    the rest of the roster carries exactly 50%. The second half is what stops
 *    a future "offset everything a bit" from re-breaking the 52 that are fine.
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

/**
 * The avatars whose SHOOT does not centre them, and so legitimately carry a
 * non-50% `object-position` X. One shoot, two people: the `Tech Expert` set
 * frames both at ~64% of frame width behind a wall of monitors.
 *
 * Named, not derived: the point of this list is that the exceptions are
 * KNOWN and exhaustive, which is exactly what the old "every subject is
 * centred" comment got wrong.
 */
const OFF_CENTRE = ["Bryan", "Elenora"];

/** Both views, at the four widths the picker is designed against. */
const WIDTHS = [375, 768, 1024, 1440] as const;

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

/**
 * Every compact row's horizontal framing, keyed by the row's own name.
 *
 * `object-position` is read as the two computed components rather than as the
 * whole string, because the two axes carry different meanings here: Y must stay
 * inert at 50%, while X is the horizontal correction.
 */
const X_PROBE = `(() => {
  return Array.from(document.querySelectorAll("main button[aria-pressed]")).map((row) => {
    const img = row.querySelector("img");
    const name = (row.querySelector("h3, h4") || {}).textContent || "";
    if (!img) return { name: name.trim(), x: "none", y: "none", scale: 0, naturalWidth: 0 };
    const cs = getComputedStyle(img);
    const parts = cs.objectPosition.split(/\\s+/);
    const m = cs.transform.match(/matrix\\(([^,]+),/);
    return {
      name: name.trim(),
      x: parts[0],
      y: parts[1],
      scale: m ? parseFloat(m[1]) : 1,
      naturalWidth: img.naturalWidth
    };
  }).filter((r) => r.name);
})()`;

/**
 * For named photo-grid cards, which band of the SOURCE frame the card actually
 * shows, in percent of source width.
 *
 * The card is `object-fit: cover` on a portrait-ish box, so a 16:9 still is
 * cropped at the SIDES — which is the opposite of the compact row's problem and
 * is why an off-centre subject has to be checked here too. The visible band is
 * derived from the cover geometry rather than guessed.
 */
const CARD_PROBE = (names: string[]) => `(() => {
  const want = ${JSON.stringify(names)};
  const out = [];
  for (const card of document.querySelectorAll("main button[aria-pressed]")) {
    const name = ((card.querySelector("h3, h4") || {}).textContent || "").trim();
    if (want.indexOf(name) === -1) continue;
    const img = card.querySelector("img");
    if (!img || !img.naturalWidth) continue;
    const boxW = img.offsetWidth, boxH = img.offsetHeight;
    const srcAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = boxW / boxH;
    // Cover: the tighter axis fills, the other overflows and is clipped.
    let visibleLeft = 0, visibleRight = 100;
    if (srcAspect > boxAspect) {
      const shown = boxAspect / srcAspect;        // fraction of source width
      visibleLeft = (1 - shown) / 2 * 100;
      visibleRight = 100 - visibleLeft;
    }
    out.push({ name: name, visibleLeft: +visibleLeft.toFixed(1), visibleRight: +visibleRight.toFixed(1) });
  }
  return out;
})()`;

test("the compact row's thumbnail is big enough and cropped to the face", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);

  // This spec is about the COMPACT ROW, so select that view explicitly rather
  // than relying on which view opens first — the default is a product decision
  // that has already changed once (rows, then the photo grid) and this spec
  // should not break or silently start measuring cards when it changes again.
  await page.getByRole("radio", { name: "Compact list" }).click();
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

    // The VERTICAL crop is NOT an object-position offset, which would be
    // inert: a 16:9 still covering a 1:1 box has zero vertical overflow to
    // slide. X is checked separately, because horizontally it is NOT inert and
    // two avatars legitimately carry an offset there.
    expect(
      t.objectPosition.split(/\s+/)[1],
      `${who}: vertical framing moved to an inert object-position`,
    ).toBe("50%");

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

/**
 * Horizontal framing: the two avatars their shoot did not centre are offset,
 * and the other 52 are not.
 *
 * Asserted across all four widths and in BOTH views, because the compact row
 * and the photo card are separate renderers of the same still and a framing
 * value wired into only one of them is exactly the kind of half-fix this bug
 * started as.
 */
test("the thumbnail is cropped on the subject, not on the frame's centre", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 375 ? 700 : 900 });
    await openPicker(page);
    await page.getByRole("radio", { name: "Compact list" }).click();
    await page.waitForTimeout(900);
    await page.evaluate(
      `Promise.all(Array.from(document.querySelectorAll("main button[aria-pressed] img"))
         .map((i) => i.decode().catch(() => {})))`,
    );

    const framing = (await page.evaluate(X_PROBE)) as {
      name: string;
      x: string;
      y: string;
      scale: number;
      naturalWidth: number;
    }[];
    console.log(
      `${width} off-centre:`,
      JSON.stringify(framing.filter((f) => f.x !== "50%")),
    );
    expect(framing.length, `${width}: roster came back short`).toBeGreaterThan(40);

    for (const row of framing) {
      // The vertical axis stays inert on every row, at every width: that is
      // the invariant the whole transform-based crop rests on.
      expect(row.y, `${row.name}: object-position Y must stay centred`).toBe("50%");
      expect(row.naturalWidth, `${row.name}: preview still did not load`).toBeGreaterThan(
        0,
      );
      expect(row.scale, `${row.name}: thumbnail is not cropped in`).toBeGreaterThan(1);

      if (OFF_CENTRE.includes(row.name)) {
        // The reported bug. A centred crop on this shoot puts the face at the
        // edge of the box, so X must have moved — and toward the subject,
        // which is to the RIGHT of frame centre in this shoot.
        const x = Number.parseFloat(row.x);
        expect(
          x,
          `${row.name}: this shoot does not centre its subject, so the thumbnail must offset X`,
        ).toBeGreaterThan(60);
        expect(x, `${row.name}: X offset ran past the frame`).toBeLessThanOrEqual(100);
      } else {
        // And the other 52 are untouched. This half is what stops a blanket
        // offset from being applied to faces that are already correct.
        expect(
          row.x,
          `${row.name}: this shoot centres its subject, so X must stay at 50%`,
        ).toBe("50%");
      }
    }

    // The PHOTO GRID shows the whole frame height, so it needs no crop — but
    // it must still render the off-centre subjects' faces, not crop them away.
    // Asserted as a visible-band containment rather than a pixel diff: the
    // card is `object-fit: cover`, so a narrow card eats the frame's sides.
    await page.getByRole("radio", { name: "Photo grid" }).click();
    await page.waitForTimeout(900);
    const cards = (await page.evaluate(CARD_PROBE(OFF_CENTRE))) as {
      name: string;
      visibleLeft: number;
      visibleRight: number;
    }[];
    console.log(`${width} grid cards:`, JSON.stringify(cards));
    for (const card of cards) {
      // ~64% of frame width is where this shoot puts its subject.
      expect(
        card.visibleLeft,
        `${width} grid: ${card.name}'s face is cropped off the left of the card`,
      ).toBeLessThan(60);
      expect(
        card.visibleRight,
        `${width} grid: ${card.name}'s face is cropped off the right of the card`,
      ).toBeGreaterThan(68);
    }
  }
});
