/**
 * Private deck storage for Phase 14 Practice Pitches.
 *
 * A deck is an engine INSTANCE (like CaseStudy): originals, per-slide PNGs,
 * thumbnails, and a JSON manifest all live under server-derived S3 keys.
 * There is deliberately NO Prisma table — adding one would be a second
 * pattern for the same kind of student-authored instance.
 *
 * No function in this module returns a URL.
 */

import { randomUUID } from "crypto";
import { s3Storage } from "@/lib/s3-client";
import type { DeckExtraction, DeckFormat } from "./types";
import type { RasterizedSlide } from "./pdf-rasterize";

/**
 * The deck's only metadata record. There is deliberately NO Prisma table —
 * a deck is an engine INSTANCE and this codebase already stores
 * student-authored instances (CaseStudy) in S3, so adding a table would be a
 * second pattern for the same thing and a second migration.
 */
export type DeckManifest = {
  deckId: string;
  format: DeckFormat;
  slideCount: number;
  createdAt: string;
  slides: {
    index: number;
    text: string;
    widthPx: number;
    heightPx: number;
    renderFailed?: boolean;
  }[];
  /** Present when extraction slide count ≠ rasterized page count. */
  extractionSlideCountMismatch?: {
    extractionCount: number;
    rasterizedCount: number;
  };
};

function padIndex(index: number): string {
  return String(index).padStart(3, "0");
}

function slideKey(index: number): string {
  return `slides/${padIndex(index)}.png`;
}

function thumbKey(index: number): string {
  return `thumbs/${padIndex(index)}.png`;
}

export type PersistDeckInput = {
  userId: string;
  extraction: DeckExtraction;
  rasterized: RasterizedSlide[];
  originalBuffer: Buffer;
  originalFormat: DeckFormat;
};

export type PersistDeckResult = {
  deckId: string;
  manifest: DeckManifest;
};

/**
 * Persist original + slide images + thumbs + manifest under
 * decks/{userId}/{deckId}/…. Manifest is written LAST so a partial write
 * is never readable as a complete deck.
 *
 * Rasterized page count is authoritative for slide identity when it disagrees
 * with extraction (images gate navigation and the avatar).
 */
export async function persistDeck(
  input: PersistDeckInput
): Promise<PersistDeckResult> {
  const { userId, extraction, rasterized, originalBuffer, originalFormat } =
    input;
  const deckId = randomUUID();

  const originalExt = originalFormat === "pdf" ? "pdf" : "pptx";
  const originalContentType =
    originalFormat === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  await s3Storage.saveDeckObject(
    userId,
    deckId,
    `original.${originalExt}`,
    originalBuffer,
    originalContentType
  );

  const textByIndex = new Map(
    extraction.slides.map((s) => [s.index, s.text] as const)
  );

  for (const slide of rasterized) {
    await s3Storage.saveDeckObject(
      userId,
      deckId,
      slideKey(slide.index),
      slide.png,
      "image/png"
    );
    await s3Storage.saveDeckObject(
      userId,
      deckId,
      thumbKey(slide.index),
      slide.thumbPng,
      "image/png"
    );
  }

  const extractionCount = extraction.slides.length;
  const rasterizedCount = rasterized.length;

  const manifest: DeckManifest = {
    deckId,
    format: originalFormat,
    slideCount: rasterizedCount,
    createdAt: new Date().toISOString(),
    slides: rasterized.map((slide) => {
      const entry: DeckManifest["slides"][number] = {
        index: slide.index,
        text: textByIndex.get(slide.index) ?? "",
        widthPx: slide.widthPx,
        heightPx: slide.heightPx,
      };
      if (slide.renderFailed) {
        entry.renderFailed = true;
      }
      return entry;
    }),
  };

  if (extractionCount !== rasterizedCount) {
    manifest.extractionSlideCountMismatch = {
      extractionCount,
      rasterizedCount,
    };
  }

  // Manifest LAST — incomplete decks lack this object and are unreadable.
  await s3Storage.saveDeckObject(
    userId,
    deckId,
    "manifest.json",
    JSON.stringify(manifest),
    "application/json"
  );

  return { deckId, manifest };
}

/** Load the deck manifest, or null if missing / not yet complete. */
export async function loadDeckManifest(
  userId: string,
  deckId: string
): Promise<DeckManifest | null> {
  const obj = await s3Storage.getDeckObject(userId, deckId, "manifest.json");
  if (!obj) return null;
  try {
    return JSON.parse(obj.body.toString("utf8")) as DeckManifest;
  } catch {
    return null;
  }
}

/**
 * Load a slide or thumbnail PNG by zero-based index.
 * Bounds-checks against the manifest; out-of-range → null (not an error).
 */
export async function loadDeckSlideImage(
  userId: string,
  deckId: string,
  index: number,
  variant: "slide" | "thumb"
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  const manifest = await loadDeckManifest(userId, deckId);
  if (!manifest) return null;
  if (index >= manifest.slideCount) return null;

  const relativeKey = variant === "slide" ? slideKey(index) : thumbKey(index);
  return s3Storage.getDeckObject(userId, deckId, relativeKey);
}
