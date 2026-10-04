/**
 * PDF → PNG rasterizer for Phase 14 Practice Pitches.
 *
 *   - pdfjs-dist legacy Node build (`pdfjs-dist/legacy/build/pdf.mjs`)
 *   - @napi-rs/canvas via pdfjs's Node `canvasFactory` (required for Path2D
 *     clip/fill on real decks — hand-rolled `createCanvas` whites out)
 *   - slide image: long edge ≈ 1600px
 *   - thumbnail: 240px wide (downscale from full-res — a second page.render
 *     on the same Node process segfaulted during the spike)
 *
 * Never throws at the deck level: a single bad page yields a blank-but-sized
 * PNG with `renderFailed: true` so the rest of the deck still stores.
 *
 * Decision: `.planning/phases/14-practice-pitches/14-DECK-RENDER-DECISION.md`
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { join } from "path";

/** Slide image long-edge target (px). */
export const SLIDE_LONG_EDGE_PX = 1600;

/**
 * Local pdfjs asset roots (standard 14 fonts + CMaps).
 * Plain filesystem paths with trailing slash — pdfjs Node fetch uses
 * `fs.readFile`, not HTTP.
 */
function pdfjsAssetUrls(): {
  standardFontDataUrl: string;
  cMapUrl: string;
} {
  const root = join(process.cwd(), "node_modules", "pdfjs-dist");
  return {
    standardFontDataUrl: join(root, "standard_fonts") + "/",
    cMapUrl: join(root, "cmaps") + "/",
  };
}

/** Thumbnail width (px). Height follows aspect ratio. */
export const THUMB_WIDTH_PX = 240;

export type RasterizedSlide = {
  /** Zero-based page index — matches `lib/deck/types.ts` DeckSlide.index. */
  index: number;
  png: Buffer;
  thumbPng: Buffer;
  widthPx: number;
  heightPx: number;
  /** Set when this page failed to render; png/thumb are blank but sized. */
  renderFailed?: boolean;
};

/** pdfjs Node canvasFactory entry (`create` / `destroy`). */
type CanvasFactoryEntry = {
  canvas: {
    toBuffer: (mime: string) => Buffer;
    width: number;
    height: number;
  };
  context: {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
  };
};

type CanvasFactory = {
  create: (width: number, height: number) => CanvasFactoryEntry;
  destroy: (entry: CanvasFactoryEntry) => void;
};

function blankPng(width: number, height: number): Buffer {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return Buffer.from(canvas.toBuffer("image/png"));
}

function makeThumbFromPng(
  png: Buffer,
  fullWidth: number,
  fullHeight: number
): { thumbPng: Buffer; thumbW: number; thumbH: number } {
  const thumbW = THUMB_WIDTH_PX;
  const thumbH = Math.max(1, Math.round((fullHeight / fullWidth) * thumbW));
  // Synchronous path via createCanvas + loadImage is async; callers await.
  return { thumbPng: blankPng(thumbW, thumbH), thumbW, thumbH };
}

async function downscaleThumb(
  png: Buffer,
  fullWidth: number,
  fullHeight: number
): Promise<{ thumbPng: Buffer; thumbW: number; thumbH: number }> {
  const thumbW = THUMB_WIDTH_PX;
  const thumbH = Math.max(
    1,
    Math.round((fullHeight / Math.max(fullWidth, 1)) * thumbW)
  );
  try {
    const thumbCanvas = createCanvas(thumbW, thumbH);
    const thumbCtx = thumbCanvas.getContext("2d");
    const fullImg = await loadImage(png);
    thumbCtx.drawImage(fullImg, 0, 0, thumbW, thumbH);
    return {
      thumbPng: Buffer.from(thumbCanvas.toBuffer("image/png")),
      thumbW,
      thumbH,
    };
  } catch {
    return makeThumbFromPng(png, fullWidth, fullHeight);
  }
}

/**
 * Render one page using pdfjs's Node canvasFactory so Path2D polyfills match
 * the canvas clip/fill implementation (@napi-rs/canvas). Hand-creating a
 * canvas skips that setup and fails on Google Slides / complex path decks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderPageToPng(
  page: any,
  canvasFactory: CanvasFactory
): Promise<{
  png: Buffer;
  width: number;
  height: number;
}> {
  const base = page.getViewport({ scale: 1 });
  const scale = SLIDE_LONG_EDGE_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const entry = canvasFactory.create(width, height);
  try {
    entry.context.fillStyle = "#ffffff";
    entry.context.fillRect(0, 0, width, height);
    await page.render({
      canvasContext: entry.context,
      viewport,
      canvas: entry.canvas,
    }).promise;
    return {
      png: Buffer.from(entry.canvas.toBuffer("image/png")),
      width,
      height,
    };
  } finally {
    try {
      canvasFactory.destroy(entry);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Rasterize every page of a PDF to slide + thumbnail PNGs.
 * Does not throw — bad pages become blank PNGs with `renderFailed: true`.
 */
export async function rasterizePdf(buffer: Buffer): Promise<RasterizedSlide[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Copy — pdfjs may transfer/detach the underlying ArrayBuffer.
  const data = new Uint8Array(buffer);

  let doc;
  try {
    // disableFontFace: true — Node/@napi-rs/canvas has no working FontFace
    // path; false paints missing-glyph tofu boxes on Google Slides / real decks
    // while shapes still render. Glyph-path mode matches mozilla's node pdf2png.
    const { standardFontDataUrl, cMapUrl } = pdfjsAssetUrls();
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      standardFontDataUrl,
      cMapUrl,
      cMapPacked: true,
    });
    doc = await loadingTask.promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Whole-document failure: return a single blank slide so callers can record it.
    const png = blankPng(SLIDE_LONG_EDGE_PX, Math.round(SLIDE_LONG_EDGE_PX * 0.75));
    const thumb = await downscaleThumb(png, SLIDE_LONG_EDGE_PX, Math.round(SLIDE_LONG_EDGE_PX * 0.75));
    void detail;
    return [
      {
        index: 0,
        png,
        thumbPng: thumb.thumbPng,
        widthPx: SLIDE_LONG_EDGE_PX,
        heightPx: Math.round(SLIDE_LONG_EDGE_PX * 0.75),
        renderFailed: true,
      },
    ];
  }

  const canvasFactory = doc.canvasFactory as CanvasFactory;
  const slides: RasterizedSlide[] = [];
  const pageCount = doc.numPages;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const index = pageNumber - 1;
    try {
      const page = await doc.getPage(pageNumber);
      const { png, width, height } = await renderPageToPng(page, canvasFactory);
      const { thumbPng } = await downscaleThumb(png, width, height);
      slides.push({
        index,
        png,
        thumbPng,
        widthPx: width,
        heightPx: height,
      });
    } catch {
      // Per-page failure: blank-but-sized PNG (letter-ish default from prior pages or 1600×1200).
      const prior = slides[slides.length - 1];
      const widthPx = prior?.widthPx ?? SLIDE_LONG_EDGE_PX;
      const heightPx =
        prior?.heightPx ?? Math.round(SLIDE_LONG_EDGE_PX * 0.75);
      const png = blankPng(widthPx, heightPx);
      const { thumbPng } = await downscaleThumb(png, widthPx, heightPx);
      slides.push({
        index,
        png,
        thumbPng,
        widthPx,
        heightPx,
        renderFailed: true,
      });
    }
  }

  try {
    await doc.destroy();
  } catch {
    /* ignore */
  }

  return slides;
}
