/**
 * Before/after contact sheets for the compact row's thumbnail framing, at the
 * magnification needed to judge whether a face is recognisable.
 *
 * WHY. `scripts/measure-roster-framing.ts` says where each subject sits in its
 * source still; this says what the 56px thumbnail actually renders. The two
 * are different questions, and the second is the one the bug was filed about.
 *
 * WHAT IT PRODUCES, in `screenshots/roster-framing/`:
 *   - `thumbs-after-*.png`: every one of the 54 shipped thumbnails, each
 *     captured at its real 56px and then drawn 4x so a face can be assessed,
 *     12 to a sheet with the name under each. This is the deliverable: all 54
 *     faces, large enough to say out loud whether each is recognisable.
 *   - `compare-tech-expert.png`: the two reported avatars BEFORE (the shipped
 *     `object-position: 50% 50%`, forced back on) and AFTER, beside two
 *     correctly-framed neighbours as a control. This is the before/after.
 *   - `list-*-technical.png` / `grid-*-technical.png`: both views at 375, 768,
 *     1024 and 1440, scrolled to the Technical section, so the framing can be
 *     judged in situ rather than only as isolated crops.
 *
 * Captured from the LIVE page rather than recomputed, so what is judged is the
 * composition of <img>, transform, clip and object-position as it actually
 * ships — not this script's idea of it.
 *
 * Run with the dev server up: `npx tsx scripts/shoot-thumb-framing.ts`.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots/roster-framing";
/** Magnification applied to each captured 56px thumbnail. */
const ZOOM = 4;

async function signIn(page: Page) {
  for (let i = 0; i < 6; i += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    for (let a = 0; a < 12; a += 1) {
      await email.fill("student@case.edu");
      await password.fill("student123");
      if (
        (await email.inputValue()) === "student@case.edu" &&
        (await password.inputValue()) === "student123"
      ) {
        break;
      }
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
      return;
    } catch {
      console.log("retry login");
    }
  }
  throw new Error("could not sign in");
}

async function openPicker(page: Page) {
  await page.goto(`${BASE}/practice/interviews/general`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Choose your interviewer" })
    .waitFor({ timeout: 60_000 });
  // Assert the VIEW, do not assume it: the compact list is the default but the
  // choice persists, and the photo grid's card also contains an <img> inside an
  // `overflow-hidden` parent, so a grid shot looks plausible and is wrong.
  await page.getByRole("radio", { name: "Compact list" }).click();
  await page.waitForTimeout(1200);
  // Every still really decoded, so a framing shot cannot be of a blank box.
  await page.evaluate(
    `Promise.all(Array.from(document.querySelectorAll("main button[aria-pressed] img"))
       .map((i) => i.decode().catch(() => {})))`,
  );
  const box = await page
    .locator("main button[aria-pressed] img")
    .first()
    .evaluate((i) => (i as HTMLImageElement).offsetWidth);
  if (box !== 56) throw new Error(`expected the 56px compact thumbnail, got ${box}px`);
}

/** Row names, in roster order. */
async function rowNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("main button[aria-pressed]"))
      .map((r) => (r.querySelector("h3, h4")?.textContent ?? "").trim())
      .filter(Boolean),
  );
}

/**
 * Screenshots one named row's 56px thumbnail wrapper.
 *
 * The name match is EXACT. A substring match looks fine and is wrong: "Ryan"
 * is a substring of "Bryan", so a loose filter silently shoots the wrong row
 * and — on this roster — captures the very avatar the fix was about under a
 * neighbour's name.
 */
async function shootThumb(page: Page, name: string): Promise<Buffer> {
  const row = page
    .locator("main button[aria-pressed]")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  // The clip is the <img>'s PARENT, located from the image rather than by
  // class: the row is itself an `overflow-hidden` candidate in some states.
  return row.locator("img").first().locator("..").screenshot();
}

/** Tiles magnified thumbnails into a labelled contact sheet. */
async function sheetInPage({
  shots,
  cols,
  zoom,
}: {
  shots: { png: string; label: string }[];
  cols: number;
  zoom: number;
}): Promise<string> {
  const imgs = await Promise.all(
    shots.map(async (s) => {
      const i = new Image();
      i.src = s.png;
      await i.decode();
      return i;
    }),
  );
  const cell = 56 * zoom;
  const pad = 10;
  const labelH = 22;
  const rows = Math.ceil(imgs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * (cell + pad) + pad;
  canvas.height = rows * (cell + pad + labelH) + pad;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Nearest-neighbour: a smoothed 4x upscale would hide exactly the kind of
  // edge-of-box crop this sheet exists to show.
  ctx.imageSmoothingEnabled = false;
  imgs.forEach((img, n) => {
    const x = pad + (n % cols) * (cell + pad);
    const y = pad + Math.floor(n / cols) * (cell + pad + labelH);
    ctx.drawImage(img, x, y, cell, cell);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = "#e9e9ef";
    ctx.font = "15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(shots[n].label, x + cell / 2, y + cell + 16, cell);
  });
  return canvas.toDataURL("image/png");
}

function writeDataUrl(path: string, dataUrl: string) {
  writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));
}

const toPng = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

/**
 * The shipped framing, forced back to a centred `object-position`: the BEFORE
 * state. Applied in the page rather than by reverting the module, so one run
 * captures both states of the same build.
 */
const FORCE_CENTRED = `(() => {
  for (const img of document.querySelectorAll("main button[aria-pressed] img")) {
    img.style.objectPosition = "50% 50%";
  }
})()`;

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() => {
    (globalThis as unknown as { __name?: unknown }).__name ??= <T,>(fn: T) => fn;
  });
  await signIn(page);
  await openPicker(page);

  const names = await rowNames(page);
  console.log(`${names.length} rows`);

  // AFTER: all 54, as shipped.
  const after: { png: string; label: string }[] = [];
  for (const name of names) {
    after.push({ png: toPng(await shootThumb(page, name)), label: name });
  }
  const perSheet = 12;
  for (let i = 0; i < after.length; i += perSheet) {
    writeDataUrl(
      `${OUT}/thumbs-after-${i / perSheet + 1}.png`,
      await page.evaluate(sheetInPage, {
        shots: after.slice(i, i + perSheet),
        cols: 6,
        zoom: ZOOM,
      }),
    );
  }
  console.log(`wrote ${Math.ceil(after.length / perSheet)} after-sheets`);

  // BEFORE/AFTER for the two reported avatars, with two centred neighbours as
  // a control: the control pair must be IDENTICAL in both halves, which is
  // what proves the fix is scoped to the shoot that needed it.
  const subjects = ["Bryan", "Elenora"];
  const controls = ["Dexter", "Emily"];
  const pick = [...subjects, ...controls];
  const afterPair = pick.map((n) => after.find((a) => a.label === n)!);
  await page.evaluate(FORCE_CENTRED);
  await page.waitForTimeout(250);
  const beforePair: { png: string; label: string }[] = [];
  for (const name of pick) {
    beforePair.push({ png: toPng(await shootThumb(page, name)), label: `${name} BEFORE` });
  }
  writeDataUrl(
    `${OUT}/compare-tech-expert.png`,
    await page.evaluate(sheetInPage, {
      shots: [
        ...beforePair,
        ...afterPair.map((a) => ({ ...a, label: `${a.label} AFTER` })),
      ],
      cols: 4,
      zoom: ZOOM,
    }),
  );
  console.log("wrote compare-tech-expert.png");

  // The two views at the four widths the picker is designed against, so the
  // framing can be judged in situ and not only as isolated crops.
  await page.evaluate(`location.reload()`).catch(() => {});
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await openPicker(page);
    // Scroll the Technical section into view: the reported avatars are there,
    // and a top-of-page shot would not show them.
    await page
      .getByRole("heading", { name: "Bryan", exact: true })
      .first()
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/list-${width}-technical.png` });

    await page.getByRole("radio", { name: "Photo grid" }).click();
    await page.waitForTimeout(900);
    await page
      .getByRole("heading", { name: "Bryan", exact: true })
      .first()
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/grid-${width}-technical.png` });
    console.log(`wrote ${width} list + grid`);
  }

  await browser.close();
})();
