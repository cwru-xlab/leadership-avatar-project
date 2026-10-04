/**
 * Shared deck intake types for Phase 14 (Practice Pitches).
 *
 * Validation is MINIMUM ONLY (CONTEXT.md): genuine PDF/PPTX, within size,
 * pages/slides extract. No page-shape or slide-count rejection. No warning
 * tier and no "start without a deck" path — the result is a binary union.
 */

/**
 * 25MB — chosen larger than the 10MB resume cap because decks carry images.
 * This is the ONLY size-shaped rejection; there is deliberately no slide-count
 * or page-shape rejection.
 */
export const MAX_DECK_SIZE_BYTES = 25 * 1024 * 1024;

export type DeckFormat = "pdf" | "pptx";

/**
 * One page (PDF) or slide (PPTX) of extracted text.
 *
 * `index` is **zero-based** and is the single index convention used everywhere
 * in Phase 14 (storage keys, the viewer, the high-water mark). Do not introduce
 * a 1-based variant — that is how off-by-ones creep between plans.
 */
export type DeckSlide = { index: number; text: string };

export type DeckExtraction = {
  ok: true;
  format: DeckFormat;
  slides: DeckSlide[];
};

export type DeckRejectionCode =
  | "empty"
  | "too-large"
  | "unknown-format"
  | "corrupt-pdf"
  | "corrupt-pptx"
  | "no-extractable-pages"
  | "password-protected";

/**
 * `reason` and `fix` are BOTH required fields. CONTEXT.md forbids a generic
 * failure: every rejection must name what failed and the next action. Do not
 * add an optional-fix variant.
 */
export type DeckRejection = {
  ok: false;
  code: DeckRejectionCode;
  reason: string;
  fix: string;
};

/**
 * Frozen rejection copy — lives once so reviewers can grep it. Voice matches
 * the resume-upload error style (plain, specific, actionable).
 */
export const DECK_REJECTIONS: Record<
  DeckRejectionCode,
  { reason: string; fix: string }
> = {
  empty: {
    reason: "That file is empty.",
    fix: "Pick the deck file again — it looks like the upload was interrupted.",
  },
  "too-large": {
    reason: "That deck is larger than the 25MB limit.",
    fix: "Re-export it with compressed images, or split it, and upload again.",
  },
  "unknown-format": {
    reason: "That file is not a PDF or a PowerPoint (.pptx) deck.",
    fix: "Export your deck as PDF or .pptx and upload that file. Google Slides decks work once you use File → Download → PDF.",
  },
  "corrupt-pdf": {
    reason: "That file claims to be a PDF but could not be read.",
    fix: "Re-export the deck as a PDF from your slide app and try again.",
  },
  "corrupt-pptx": {
    reason:
      "That .pptx file could not be opened — it may be damaged or may be an older .ppt saved with the wrong extension.",
    fix: "Open it in PowerPoint or Keynote and re-save it as .pptx, then upload again.",
  },
  "no-extractable-pages": {
    reason: "No slides could be read out of that deck.",
    fix: "If the deck is a scan or an image export, re-export it from the original slide file so the text is selectable, then try again.",
  },
  "password-protected": {
    reason: "That deck is password-protected.",
    fix: "Remove the password or export an unprotected copy, then upload again.",
  },
};
