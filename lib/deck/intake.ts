/**
 * Deck intake: magic-byte format detection, size gate, and dispatch to
 * per-page/per-slide text extractors.
 *
 * Client-supplied MIME types are forgeable; this codebase already treats
 * byte-signature checking as settled for PDF (see upload-resume). PPTX is
 * the ZIP local-file-header signature PK\x03\x04.
 *
 * Never throws — every path returns DeckExtraction | DeckRejection.
 */

import { extractPerPageText } from "./pdf-extract";
import { extractPerSlideText } from "./pptx-extract";
import {
  DECK_REJECTIONS,
  MAX_DECK_SIZE_BYTES,
  type DeckExtraction,
  type DeckFormat,
  type DeckRejection,
  type DeckRejectionCode,
  type DeckSlide,
} from "./types";

function reject(code: DeckRejectionCode): DeckRejection {
  const copy = DECK_REJECTIONS[code];

  return { ok: false, code, reason: copy.reason, fix: copy.fix };
}

/**
 * Detect deck format from magic bytes. Returns null when neither PDF nor
 * ZIP-container PPTX signature matches.
 */
export function detectDeckFormat(buffer: Buffer): DeckFormat | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "pdf";
  }
  // ZIP local file header — every .pptx begins with these four bytes.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "pptx";
  }

  return null;
}

/** OLE2 compound-file signature (D0 CF 11 E0 A1 B1 1A E1) — legacy .ppt/.doc/.xls. */
export function isLegacyOfficeFile(buffer: Buffer): boolean {
  const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return buffer.length >= OLE2.length && OLE2.every((b, i) => buffer[i] === b);
}

function looksPasswordProtected(error: unknown, buffer: Buffer): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes("password") ||
    message.includes("encrypted") ||
    message.includes("encrypt")
  ) {
    return true;
  }
  // PDF encryption dictionary marker (best-effort; corrupt files may also contain it).
  const head = buffer
    .subarray(0, Math.min(buffer.length, 64 * 1024))
    .toString("latin1");

  return head.includes("/Encrypt");
}

/**
 * Validate buffer + filename and extract per-slide text.
 * Order: empty → too-large → unknown-format → extract → map errors.
 */
export async function validateAndExtractDeck(
  buffer: Buffer,
  _filename?: string,
): Promise<DeckExtraction | DeckRejection> {
  if (buffer.length === 0) {
    return reject("empty");
  }
  if (buffer.length > MAX_DECK_SIZE_BYTES) {
    return reject("too-large");
  }

  const format = detectDeckFormat(buffer);

  if (format === null) {
    // Pre-2007 PowerPoint (.ppt) is an OLE2 compound file, not a ZIP. Name it
    // so the student knows to re-save, rather than "not a PowerPoint deck".
    if (isLegacyOfficeFile(buffer)) {
      return reject("legacy-ppt");
    }
    return reject("unknown-format");
  }

  try {
    const texts =
      format === "pdf"
        ? await extractPerPageText(buffer)
        : await extractPerSlideText(buffer);

    if (texts.length === 0) {
      return reject("no-extractable-pages");
    }

    const slides: DeckSlide[] = texts.map((text, index) => ({ index, text }));

    return { ok: true, format, slides };
  } catch (error) {
    if (looksPasswordProtected(error, buffer)) {
      return reject("password-protected");
    }

    return reject(format === "pdf" ? "corrupt-pdf" : "corrupt-pptx");
  }
}
