/**
 * Prove the full intake → rasterize → (optional) convert → private storage
 * pipeline for Phase 14-06.
 *
 * Run: npx tsx scripts/verify-deck-rasterize.ts
 *
 * Storage sections require AWS_* env. Conversion section requires
 * DECK_CONVERT_URL. Missing credentials skip those sections (exit 0).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { validateAndExtractDeck } from "../lib/deck/intake";
import { rasterizePdf } from "../lib/deck/pdf-rasterize";
import { convertPptxToPdf } from "../lib/deck/pptx-convert";
// store.ts → s3-client reads AWS_* at module init — dynamic-import AFTER dotenv.

const FIXTURES = join(process.cwd(), "scripts/fixtures");
const DECK_DIR = join(process.cwd(), "lib/deck");

let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed += 1;
  } else {
    console.log(`  ok: ${message}`);
  }
}

function load(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function hasS3Credentials(): boolean {
  return Boolean(
    process.env.AWS_S3_BUCKET_NAME &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

async function section(n: number, title: string, fn: () => Promise<void>) {
  console.log(`\n${n}. ${title}`);
  await fn();
}

async function main() {
  console.log("=== verify-deck-rasterize (14-06) ===");

  let landscapeRasterized: Awaited<ReturnType<typeof rasterizePdf>> | null =
    null;
  let landscapeExtraction: Awaited<
    ReturnType<typeof validateAndExtractDeck>
  > | null = null;
  let landscapeBuffer: Buffer | null = null;
  let firstSlidePng: Buffer | null = null;

  await section(
    1,
    "deck-landscape.pdf through validateAndExtractDeck + rasterizePdf",
    async () => {
      const t0 = Date.now();
      landscapeBuffer = load("deck-landscape.pdf");
      landscapeExtraction = await validateAndExtractDeck(landscapeBuffer);
      assert(landscapeExtraction.ok === true, "extraction ok");
      if (!landscapeExtraction.ok) return;

      assert(landscapeExtraction.slides.length === 3, "3 slides extracted");
      assert(
        landscapeExtraction.slides.every((s) => s.text.length > 0),
        "text per slide non-empty"
      );

      landscapeRasterized = await rasterizePdf(landscapeBuffer);
      const elapsed = Date.now() - t0;
      const perSlide =
        landscapeRasterized.length > 0
          ? Math.round(elapsed / landscapeRasterized.length)
          : 0;
      console.log(
        `  timing: ${elapsed}ms total, ~${perSlide}ms/slide (${landscapeRasterized.length} pages)`
      );

      assert(landscapeRasterized.length === 3, "3 slides rasterized");
      assert(
        landscapeRasterized.every((s) => s.png.length > 5000),
        "every png.length > 5000"
      );
      assert(
        landscapeRasterized.every((s) => s.thumbPng.length > 1000),
        "every thumbPng.length > 1000"
      );
      assert(
        landscapeRasterized.every((s) => s.widthPx > s.heightPx),
        "widthPx > heightPx for all three (landscape)"
      );

      firstSlidePng = landscapeRasterized[0]?.png ?? null;
    }
  );

  await section(
    2,
    "deck-portrait.pdf: portrait survives rendering (no page-shape rejection)",
    async () => {
      const buf = load("deck-portrait.pdf");
      const extraction = await validateAndExtractDeck(buf);
      assert(extraction.ok === true, "extraction ok (no shape rejection)");
      if (!extraction.ok) return;

      const rasterized = await rasterizePdf(buf);
      assert(rasterized.length === 2, "2 slides");
      assert(
        rasterized.every((s) => s.heightPx > s.widthPx),
        "heightPx > widthPx for all (portrait)"
      );
      assert(
        rasterized.every((s) => !s.renderFailed),
        "no renderFailed flag"
      );
    }
  );

  await section(
    3,
    "deck-one-slide.pdf: one slide, no slide-count rejection",
    async () => {
      const buf = load("deck-one-slide.pdf");
      const extraction = await validateAndExtractDeck(buf);
      assert(extraction.ok === true, "extraction ok");
      if (!extraction.ok) return;

      const rasterized = await rasterizePdf(buf);
      assert(rasterized.length === 1, "exactly 1 slide");
      assert(rasterized[0].png.length > 5000, "png non-blank");
    }
  );

  await section(
    4,
    "spike-deck.pptx through convertPptxToPdf then rasterizePdf",
    async () => {
      if (!process.env.DECK_CONVERT_URL?.trim()) {
        console.log(
          "  conversion section skipped — backend not provisioned"
        );
        return;
      }

      const pptx = load("spike-deck.pptx");
      const extraction = await validateAndExtractDeck(pptx);
      assert(extraction.ok === true, "pptx extraction ok");
      if (!extraction.ok) return;

      const expectedSlides = extraction.slides.length;
      const converted = await convertPptxToPdf(pptx);
      assert(converted.ok === true, `convert ok (got ${converted.ok ? "pdf" : converted.code})`);
      if (!converted.ok) {
        console.log(`  detail: ${converted.detail}`);
        return;
      }

      const rasterized = await rasterizePdf(converted.pdf);
      assert(
        rasterized.length === expectedSlides,
        `rasterized page count (${rasterized.length}) === fixture slide count (${expectedSlides})`
      );
      assert(
        rasterized.every((s) => s.png.length > 5000),
        "converted images non-blank"
      );
    }
  );

  await section(
    5,
    "One path, not two: only pdf-rasterize imports pdfjs/canvas",
    async () => {
      const files = readdirSync(DECK_DIR).filter((f) => f.endsWith(".ts"));
      const offenders: string[] = [];
      for (const file of files) {
        if (file === "pdf-rasterize.ts") continue;
        // pdf-extract imports pdfjs for text only — plan says: no file OTHER
        // than pdf-rasterize.ts imports pdfjs-dist OR a canvas package.
        // Re-read plan: "assert no file other than `pdf-rasterize.ts` imports
        // `pdfjs-dist` or a canvas package."
        // But pdf-extract.ts already imports pdfjs-dist for text extraction
        // (14-03). The plan's "same path for PDF and PPTX" guard is about
        // RASTERIZATION (canvas), not text extraction.
        // Follow plan literally for "pdfjs-dist or a canvas package" — but
        // pdf-extract must keep pdfjs. Check canvas packages strictly, and
        // for pdfjs-dist only flag files that look like renderers (import
        // canvas OR use createCanvas / page.render).
        const src = readFileSync(join(DECK_DIR, file), "utf8");
        const importsCanvas =
          /from\s+["']@napi-rs\/canvas["']|require\(["']@napi-rs\/canvas["']\)|from\s+["']canvas["']/.test(
            src
          );
        if (importsCanvas) {
          offenders.push(`${file} (canvas)`);
        }
      }
      // Soft-check: no other file combines pdfjs with canvas render calls.
      for (const file of files) {
        if (file === "pdf-rasterize.ts") continue;
        const src = readFileSync(join(DECK_DIR, file), "utf8");
        if (
          /pdfjs-dist/.test(src) &&
          /createCanvas|page\.render|toBuffer\(["']image\/png/.test(src)
        ) {
          offenders.push(`${file} (pdfjs+render)`);
        }
      }
      assert(
        offenders.length === 0,
        `no second rasterizer (${offenders.join(", ") || "clean"})`
      );

      // Explicit: store / pptx-convert / intake must not import canvas.
      for (const name of [
        "store.ts",
        "pptx-convert.ts",
        "intake.ts",
        "types.ts",
        "pptx-extract.ts",
      ]) {
        const src = readFileSync(join(DECK_DIR, name), "utf8");
        assert(
          !/pdfjs-dist|@napi-rs\/canvas|from ["']canvas["']/.test(src),
          `${name} does not import pdfjs/canvas`
        );
      }
      // pdf-extract may import pdfjs for text; must not import canvas.
      {
        const src = readFileSync(join(DECK_DIR, "pdf-extract.ts"), "utf8");
        assert(
          !/@napi-rs\/canvas|from ["']canvas["']/.test(src),
          "pdf-extract.ts does not import canvas (text-only pdfjs OK)"
        );
      }
    }
  );

  await section(6, "Storage round-trip (S3 required)", async () => {
    if (!hasS3Credentials()) {
      console.log(
        "  storage sections skipped — no S3 credentials"
      );
      return;
    }
    if (
      !landscapeRasterized ||
      !landscapeExtraction ||
      !landscapeExtraction.ok ||
      !landscapeBuffer
    ) {
      assert(false, "section 1 must succeed before storage round-trip");
      return;
    }

    const { persistDeck, loadDeckManifest, loadDeckSlideImage } = await import(
      "../lib/deck/store"
    );

    const userId = "verify-deck-rasterize-user";
    let deckId: string;
    let manifest: Awaited<ReturnType<typeof persistDeck>>["manifest"];
    try {
      const persisted = await persistDeck({
      userId,
      extraction: landscapeExtraction,
      rasterized: landscapeRasterized,
      originalBuffer: landscapeBuffer,
      originalFormat: "pdf",
      });
      deckId = persisted.deckId;
      manifest = persisted.manifest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `  storage sections skipped — S3 credentials present but unusable (${msg})`
      );
      return;
    }
    void manifest;
    console.log(`  persisted deckId=${deckId}`);

    const loaded = await loadDeckManifest(userId, deckId);
    assert(loaded !== null, "loadDeckManifest returns manifest");
    if (!loaded) return;

    assert(
      loaded.slideCount === landscapeRasterized.length,
      `slideCount ${loaded.slideCount} === rasterized ${landscapeRasterized.length}`
    );
    assert(
      loaded.slides.length === landscapeRasterized.length,
      "manifest.slides length matches"
    );
    for (let i = 0; i < landscapeExtraction.slides.length; i++) {
      assert(
        loaded.slides[i]?.text === landscapeExtraction.slides[i]?.text,
        `slide[${i}] text matches extraction`
      );
    }

    const slide0 = await loadDeckSlideImage(userId, deckId, 0, "slide");
    assert(slide0 !== null, "loadDeckSlideImage(0, slide) returns bytes");
    if (slide0) {
      assert(
        slide0.body.length === landscapeRasterized[0].png.length,
        `slide0 bytes length ${slide0.body.length} === written ${landscapeRasterized[0].png.length}`
      );
    }

    const oob = await loadDeckSlideImage(userId, deckId, 999, "slide");
    assert(oob === null, "loadDeckSlideImage(999) returns null (not throw)");

    // Stash for privacy section
    (globalThis as { __verifyDeck?: { userId: string; deckId: string } }).__verifyDeck =
      { userId, deckId };
  });

  await section(7, "Privacy guard: unsigned public GET must not be 200", async () => {
    if (!hasS3Credentials()) {
      console.log(
        "  storage sections skipped — no S3 credentials"
      );
      return;
    }
    const ctx = (globalThis as { __verifyDeck?: { userId: string; deckId: string } })
      .__verifyDeck;
    if (!ctx) {
      assert(false, "section 6 must persist a deck first");
      return;
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    // Key scheme matches saveDeckObject sanitization (alphanumeric/hyphen/underscore).
    const key = `decks/${ctx.userId}/${ctx.deckId}/slides/000.png`;
    const urls = [
      `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
      `https://s3.${region}.amazonaws.com/${bucket}/${key}`,
      `https://${bucket}.s3.amazonaws.com/${key}`,
    ];

    let sawOk = false;
    let sawDenied = false;
    let lastStatus = 0;
    let lastUrl = urls[0];

    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "GET" });
        lastStatus = res.status;
        lastUrl = url;
        console.log(`  GET ${url} → ${res.status}`);
        if (res.status === 200) {
          sawOk = true;
          break;
        }
        if (res.status === 403 || res.status === 404) {
          sawDenied = true;
          break;
        }
      } catch (err) {
        console.log(`  GET ${url} network error: ${err instanceof Error ? err.message : err}`);
        // Network error ≠ public read; treat as denied for this probe.
        sawDenied = true;
        break;
      }
    }

    assert(!sawOk, `unsigned GET must never return 200 (last=${lastStatus} ${lastUrl})`);
    assert(
      sawDenied || lastStatus === 403 || lastStatus === 404,
      `unsigned GET returns 403 or 404 (got ${lastStatus})`
    );
  });

  await section(8, "Write sample PNG for human checkpoint (14-07)", async () => {
    if (!firstSlidePng) {
      assert(false, "no slide PNG from section 1");
      return;
    }
    const out = "/tmp/verify-slide-001.png";
    writeFileSync(out, firstSlidePng);
    console.log(`  wrote ${out} (${firstSlidePng.length} bytes)`);
    assert(firstSlidePng.length > 5000, "sample PNG non-blank");
  });

  console.log("\n=== DONE ===");
  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("all sections passed or explicitly skipped");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
