/**
 * Measures where the SUBJECT'S FACE actually sits in every roster preview
 * still, so `lib/avatar-framing.ts` can be tuned against numbers rather than
 * against a contact sheet.
 *
 * WHY. The compact row's thumbnail framing shipped with a hardcoded horizontal
 * origin of 50% and a header comment claiming every subject sat "within a few
 * points of the frame's horizontal centre". That claim was generalised from
 * four probe grids covering twelve avatars; the two `Tech Expert` shoots were
 * never in the sample and are framed well off centre, so their thumbnails
 * cropped a face to the edge of the 56px box. This script exists so the claim
 * can be exhaustive next time: it covers ALL of them, horizontally AND
 * vertically.
 *
 * WHAT IT ACTUALLY PRODUCES, AND WHAT IS AUTHORITATIVE. Read this before
 * trusting the numbers it prints.
 *
 *   - The RULED STRIPS (`ruler-{faculty,stock}-*.png`) are the measurement.
 *     Each is a head-band crop at 700px with a 2.5%-pitch ruler across it,
 *     labelled every 10% and with a solid white line at 50%, which is enough
 *     to read a face's centre off the image to within a point or two. The
 *     values that went into `lib/avatar-framing.ts` were read off these.
 *   - The AUTOMATED PASS (the `auto=` figure, and `measurements.json`) is a
 *     first cut that flags candidates. DO NOT paste it into the framing table.
 *     It is skin-tone based, and skin-tone classification does not survive
 *     these backgrounds: `faculty-skin-masks.png` shows entire cream walls,
 *     oak cabinet runs and bookshelf spines classifying as skin in the five
 *     standing faculty shoots, so the automated reading lands on a cabinet
 *     about as often as on a head. Three variants were tried — plain profile
 *     peak, connected-component blob shape, and the flank-subtracting matched
 *     filter kept below — and all three agree on the clean seated shoots and
 *     all three are unreliable on the office ones. The matched filter is kept
 *     because being right on the seated 49 is still worth having as a
 *     cross-check, not because its faculty numbers mean anything.
 *
 * THE AUTOMATED METHOD, for what it is worth:
 *   1. The bytes are fetched in Node and handed to the page as a data URL, so
 *      the canvas stays same-origin and `getImageData` is not tainted.
 *   2. The still is resampled to 480px wide and every pixel classified as skin
 *      by the CONJUNCTION of Peer et al. (2003) RGB and a YCbCr chrominance
 *      box.
 *   3. Skin is summed per column within the vertical band that shoot family
 *      keeps its heads in, and the face is the window maximising its own skin
 *      density MINUS the density of the flanks beside it — a wall or a cabinet
 *      run is a plateau and scores ~0, while an isolated head scores high.
 *   4. The reading is that window's density-weighted centroid; the vertical
 *      extent comes from the same window's own columns, hairline to collar.
 *
 * Run with the dev server up: `npx tsx scripts/measure-roster-framing.ts`.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots/roster-framing";
/** Width every still is resampled to before classification. */
const SAMPLE_W = 480;
/** Deviation from centre, in percent of frame width, that counts as material. */
const MATERIAL = 3;
/**
 * The vertical slice of the frame each shoot family keeps its HEADS in, as
 * fractions of height. From the already-shipped per-family vertical rule: the
 * faculty were filmed standing, so their heads are high and small in frame,
 * while the stock roster is seated at a desk. Restricting the horizontal search
 * to this band is what keeps a desk, a keyboard and two hands out of the
 * reading.
 */
const FACULTY_BAND: [number, number] = [0.02, 0.3];
const STOCK_BAND: [number, number] = [0.08, 0.5];

interface Option {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  faculty: boolean;
}

interface Measurement {
  /** Density-weighted centroid of the face window, percent of source width. */
  faceX: number;
  /** The face window's own edges, percent of source width. */
  faceLeft: number;
  faceRight: number;
  /** Head top (hairline) and chin within that window, percent of height. */
  headTop: number;
  headBottom: number;
  /** Skin pixels inside the window, at sample resolution. */
  skinPixels: number;
  sourceW: number;
  sourceH: number;
}

async function signIn(page: Page) {
  for (let i = 0; i < 6; i += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    // The form clears its inputs until hydration lands, so assert the values
    // survived rather than submitting an empty form.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await email.fill("student@case.edu");
      await password.fill("student123");
      if (
        (await email.inputValue()) === "student@case.edu" &&
        (await password.inputValue()) === "student123"
      ) {
        break;
      }
      await page.waitForTimeout(500);
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

/** Skin classification + matched-filter face peak, run in the page. */
async function measureInPage({
  dataUrl,
  sampleW,
  band,
}: {
  dataUrl: string;
  sampleW: number;
  band: [number, number];
}): Promise<Measurement | null> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = sampleW;
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const skin = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; p += 1, i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    // Peer et al. (2003), uniform daylight.
    if (
      !(r > 95 && g > 40 && b > 20 && mx - mn > 15 && Math.abs(r - g) > 15 && r > g && r > b)
    ) {
      continue;
    }
    // YCbCr chrominance box — rejects some of the wood, warm wall and amber
    // light that pass the RGB rule on their own. Not all of it: see the
    // matched filter below, which is what actually makes this reliable.
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (Y < 70 || Cb < 80 || Cb > 135 || Cr < 133 || Cr > 180) continue;
    skin[p] = 1;
  }

  // Skin per column, over the vertical band this shoot family keeps its heads
  // in. Banding is the first filter: it drops the hands on the desk and most
  // of the room.
  const y0 = Math.max(0, Math.round(h * band[0]));
  const y1 = Math.min(h, Math.round(h * band[1]));
  const col = new Int32Array(w);
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (skin[y * w + x]) col[x] += 1;
    }
  }

  // MATCHED FILTER, not a plain peak. Skin colour alone cannot tell a face
  // from oak cabinets or a warm cream wall — see
  // `screenshots/roster-framing/mask-*.png`, where whole walls classify as
  // skin. What distinguishes a head is that it is ISOLATED: a narrow column of
  // skin with hair, shoulder or background either side. So each candidate is
  // scored as its own skin density MINUS the density of the two flanks beside
  // it, which zeroes out a wall or a cabinet run (a plateau scores ~0) while
  // leaving a head's score high.
  const face = Math.max(6, Math.round(w * 0.11));
  const flank = Math.max(5, Math.round(w * 0.08));
  const sum = new Int32Array(w + 1);
  for (let x = 0; x < w; x += 1) sum[x + 1] = sum[x] + col[x];
  const range = (a: number, b: number) =>
    sum[Math.min(w, Math.max(0, b))] - sum[Math.min(w, Math.max(0, a))];
  let left = -1;
  let bestScore = -Infinity;
  for (let x = 0; x + face <= w; x += 1) {
    const centre = range(x, x + face) / face;
    const flanks =
      (range(x - flank, x) + range(x + face, x + face + flank)) / (2 * flank);
    const score = centre - flanks;
    if (score > bestScore) {
      bestScore = score;
      left = x;
    }
  }
  if (left < 0 || bestScore <= 0) return null;
  const right = Math.min(w - 1, left + face - 1);

  // Centroid inside the window, weighted by each column's skin density.
  let num = 0;
  let den = 0;
  for (let x = left; x <= right; x += 1) {
    num += (x + 0.5) * col[x];
    den += col[x];
  }
  if (den === 0) return null;

  // Vertical extent within the face's OWN columns: hairline (where skin
  // starts) to chin (where the collar ends it). Measured over the full height
  // rather than the band, so a chin below the band is reported, not clipped.
  const rowCount = new Int32Array(h);
  let maxRow = 0;
  for (let y = 0; y < h; y += 1) {
    let c = 0;
    for (let x = left; x <= right; x += 1) if (skin[y * w + x]) c += 1;
    rowCount[y] = c;
    if (c > maxRow) maxRow = c;
  }
  const rowT = Math.max(2, maxRow * 0.25);
  let top = -1;
  let bottom = -1;
  for (let y = y0; y < h; y += 1) {
    if (rowCount[y] >= rowT) {
      if (top === -1) top = y;
      bottom = y;
      continue;
    }
    if (top === -1) continue;
    // A gap of more than 4% of height below an established run ends the head.
    let gap = 0;
    let yy = y;
    while (yy < h && rowCount[yy] < rowT) {
      gap += 1;
      yy += 1;
    }
    if (gap > Math.max(3, Math.round(h * 0.04))) break;
    y = yy - 1;
  }
  if (top === -1) return null;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    faceX: round((num / den / w) * 100),
    faceLeft: round((left / w) * 100),
    faceRight: round(((right + 1) / w) * 100),
    headTop: round((top / h) * 100),
    headBottom: round(((bottom + 1) / h) * 100),
    skinPixels: den,
    sourceW: img.naturalWidth,
    sourceH: img.naturalHeight,
  };
}

/**
 * A ruled, head-band CROP: percentage gridlines at 2.5% pitch, labelled every
 * 10%, so a face centre can be READ off the image to within a point or two.
 *
 * This is the sheet a human reads, and on this roster it is the AUTHORITY, not
 * a sanity check on the automated pass. See the header note on why: skin-tone
 * classification is not trustworthy against these backgrounds, so the numbers
 * that went into `lib/avatar-framing.ts` were read off these strips.
 */
async function rulerInPage({
  dataUrl,
  label,
  m,
  band,
}: {
  dataUrl: string;
  label: string;
  m: Measurement | null;
  band: [number, number];
}): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const sx = 0;
  const sy = img.naturalHeight * band[0];
  const sh = img.naturalHeight * (band[1] - band[0]);
  const w = 700;
  const h = Math.round((w * sh) / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h + 36;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, img.naturalWidth, sh, 0, 0, w, h);

  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (let p = 2.5; p < 100; p += 2.5) {
    const x = (p / 100) * w;
    const major = p % 10 === 0;
    const mid = p === 50;
    ctx.strokeStyle = mid
      ? "rgba(255,255,255,0.95)"
      : major
        ? "rgba(90,200,255,0.8)"
        : "rgba(90,200,255,0.28)";
    ctx.lineWidth = mid ? 2 : 1;
    ctx.setLineDash(mid || major ? [] : [2, 6]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    if (major) {
      ctx.setLineDash([]);
      ctx.fillStyle = "#0b0b0f";
      ctx.fillRect(x - 12, h + 1, 24, 14);
      ctx.fillStyle = mid ? "#fff" : "#5ac8ff";
      ctx.fillText(String(p), x, h + 12);
    }
  }
  ctx.setLineDash([]);
  if (m) {
    // The automated first pass, marked so a reader can confirm or overrule it.
    ctx.strokeStyle = "rgba(255,45,85,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((m.faceX / 100) * w, 0);
    ctx.lineTo((m.faceX / 100) * w, h);
    ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "14px ui-monospace, monospace";
  ctx.fillText(label, 5, h + 31);
  return canvas.toDataURL("image/png");
}

/** A faculty skin-mask sheet, as evidence for why the classifier is not trusted. */
async function maskInPage({
  dataUrl,
  label,
}: {
  dataUrl: string;
  label: string;
}): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = 420;
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h + 20;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = ctx.createImageData(w, h);
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let ok =
      r > 95 && g > 40 && b > 20 && mx - mn > 15 && Math.abs(r - g) > 15 && r > g && r > b;
    if (ok) {
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      ok = !(Y < 70 || Cb < 80 || Cb > 135 || Cr < 133 || Cr > 180);
    }
    out.data[i] = ok ? 255 : 18;
    out.data[i + 1] = ok ? 60 : 18;
    out.data[i + 2] = ok ? 60 : 18;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, w, 0);
  ctx.fillStyle = "#fff";
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillText(`${label} — classified as skin (red)`, 5, h + 15);
  return canvas.toDataURL("image/png");
}

/** One overlay tile: the still with its measurement drawn on it. */
async function overlayInPage({
  dataUrl,
  m,
  label,
}: {
  dataUrl: string;
  m: Measurement | null;
  label: string;
}): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = 480;
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h + 20;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h + 20);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.setLineDash([]);
  if (m) {
    // The measured face window, so the measurement can be checked by eye.
    ctx.strokeStyle = "#34c759";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      (m.faceLeft / 100) * w,
      (m.headTop / 100) * h,
      ((m.faceRight - m.faceLeft) / 100) * w,
      ((m.headBottom - m.headTop) / 100) * h,
    );
    ctx.strokeStyle = "#ff2d55";
    ctx.beginPath();
    ctx.moveTo((m.faceX / 100) * w, 0);
    ctx.lineTo((m.faceX / 100) * w, h);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.font = "13px -apple-system, system-ui, sans-serif";
  ctx.fillText(label, 5, h + 15);
  return canvas.toDataURL("image/png");
}

/** Tiles overlay tiles into one contact sheet. */
async function sheetInPage({
  tiles,
  cols,
}: {
  tiles: string[];
  cols: number;
}): Promise<string> {
  const imgs = await Promise.all(
    tiles.map(async (t) => {
      const i = new Image();
      i.src = t;
      await i.decode();
      return i;
    }),
  );
  const tw = imgs[0].naturalWidth;
  const th = imgs[0].naturalHeight;
  const rows = Math.ceil(imgs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * tw;
  canvas.height = rows * th;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  imgs.forEach((i, n) =>
    ctx.drawImage(i, (n % cols) * tw, Math.floor(n / cols) * th),
  );
  return canvas.toDataURL("image/png");
}

function writeDataUrl(path: string, dataUrl: string) {
  writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // `tsx` compiles with esbuild's `keepNames`, which wraps every function in a
  // `__name(...)` helper that does not exist inside the page. Supplying an
  // identity stub is what lets the measurement functions be passed as real
  // functions (and so take arguments) instead of as opaque strings.
  await page.addInitScript(() => {
    (globalThis as unknown as { __name?: unknown }).__name ??= <T>(fn: T) => fn;
  });
  await signIn(page);

  const options = (await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/interview/interviewers`);
    const json = (await res.json()) as { interviewers: unknown[] };
    return json.interviewers;
  }, BASE)) as Option[];
  console.log(`catalog: ${options.length} interviewers`);

  // A same-origin page, so the canvas stays clean.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  const rows: (Option & { m: Measurement | null })[] = [];
  const tiles: string[] = [];
  /** Ruled strips, kept per family: the two crops have different heights. */
  const rulers: Record<"faculty" | "stock", string[]> = { faculty: [], stock: [] };
  /** Skin masks for the faculty, which is where the classifier breaks down. */
  const masks: string[] = [];
  for (const option of options) {
    if (!option.previewUrl) {
      console.log(`${option.name}: no previewUrl`);
      rows.push({ ...option, m: null });
      continue;
    }
    const res = await fetch(option.previewUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:image/webp;base64,${buf.toString("base64")}`;
    const m = await page.evaluate(measureInPage, {
      dataUrl,
      sampleW: SAMPLE_W,
      // The vertical band each shoot family keeps its heads in, from the
      // already-measured per-family vertical rule: faculty stand, so their
      // heads sit high and small; the stock roster is seated at a desk.
      band: option.faculty ? FACULTY_BAND : STOCK_BAND,
    });
    rows.push({ ...option, m });
    const dx = m ? m.faceX - 50 : NaN;
    const label = `${option.name}${option.faculty ? " [F]" : ""} x=${m?.faceX ?? "?"} dx=${
      m ? dx.toFixed(1) : "?"
    } head=${m?.headTop ?? "?"}-${m?.headBottom ?? "?"}`;
    tiles.push(await page.evaluate(overlayInPage, { dataUrl, m, label }));
    rulers[option.faculty ? "faculty" : "stock"].push(
      await page.evaluate(rulerInPage, {
        dataUrl,
        m,
        band: (option.faculty ? [0, 0.36] : [0.02, 0.62]) as [number, number],
        label: `${option.name}${option.faculty ? " [F]" : ""}  auto=${m?.faceX ?? "?"}`,
      }),
    );
    if (option.faculty) {
      masks.push(await page.evaluate(maskInPage, { dataUrl, label: option.name }));
    }
    console.log(
      `${option.faculty ? "FACULTY" : "stock  "} ${option.name.padEnd(20)} ` +
        `faceX=${String(m?.faceX ?? "?").padStart(6)} dx=${(m ? dx.toFixed(1) : "?").padStart(6)} ` +
        `head=${String(m?.headTop ?? "?").padStart(5)}..${String(m?.headBottom ?? "?").padStart(5)} ` +
        `headH=${m ? (m.headBottom - m.headTop).toFixed(1).padStart(5) : "?"} ` +
        `src=${m?.sourceW}x${m?.sourceH}`,
    );
  }

  const perSheet = 12;
  for (let i = 0; i < tiles.length; i += perSheet) {
    const sheet = await page.evaluate(sheetInPage, {
      tiles: tiles.slice(i, i + perSheet),
      cols: 4,
    });
    writeDataUrl(`${OUT}/measure-overlays-${i / perSheet + 1}.png`, sheet);
  }

  // The ruled sheets are the ones a human reads, and on this roster they are
  // the authority. Three strips per sheet, large enough to name the 2.5%
  // column a face sits in.
  for (const family of ["faculty", "stock"] as const) {
    const strips = rulers[family];
    for (let i = 0; i < strips.length; i += 3) {
      const sheet = await page.evaluate(sheetInPage, {
        tiles: strips.slice(i, i + 3),
        cols: 1,
      });
      writeDataUrl(`${OUT}/ruler-${family}-${i / 3 + 1}.png`, sheet);
    }
  }

  // The faculty skin masks: the standing office shoots are where the
  // classifier breaks down, and this sheet is the evidence for saying so.
  writeDataUrl(
    `${OUT}/faculty-skin-masks.png`,
    await page.evaluate(sheetInPage, { tiles: masks, cols: 1 }),
  );

  writeFileSync(
    `${OUT}/measurements.json`,
    `${JSON.stringify(
      rows.map((r) => ({
        avatarId: r.avatarId,
        name: r.name,
        faculty: r.faculty,
        ...r.m,
      })),
      null,
      2,
    )}\n`,
  );

  const measured = rows.filter((r) => r.m);
  const off = measured
    .filter((r) => Math.abs(r.m!.faceX - 50) >= MATERIAL)
    .sort((a, b) => Math.abs(b.m!.faceX - 50) - Math.abs(a.m!.faceX - 50));
  console.log(
    `\n${off.length} of ${rows.length} deviate >= ${MATERIAL}pt from centre (${
      rows.length - measured.length
    } unmeasurable):`,
  );
  for (const r of off) {
    console.log(
      `  ${r.name.padEnd(20)} faceX=${r.m!.faceX} dx=${(r.m!.faceX - 50).toFixed(1)} ` +
        `head=${r.m!.headTop}..${r.m!.headBottom}  ${r.avatarId}`,
    );
  }

  // Vertical, reported alongside: the shipped rule assumes faculty heads near
  // 8..26% and stock heads near 12..49%, and a shoot that breaks that needs
  // saying out loud rather than quietly leaving mis-framed.
  const band = (rs: typeof rows) => {
    const tops = rs.map((r) => r.m!.headTop).sort((a, b) => a - b);
    const bots = rs.map((r) => r.m!.headBottom).sort((a, b) => a - b);
    return `top ${tops[0]}..${tops[tops.length - 1]}, chin ${bots[0]}..${bots[bots.length - 1]}`;
  };
  console.log(`\nfaculty vertical: ${band(measured.filter((r) => r.faculty))}`);
  console.log(`stock vertical:   ${band(measured.filter((r) => !r.faculty))}`);

  await browser.close();
})();
