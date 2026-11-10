/**
 * Text normalization and limits shared by the browser and the server.
 *
 * A PDF over the direct-upload size is read in the browser and only its text
 * is sent (`components/practice/steps/pdf-upload.ts`), because Vercel rejects
 * request bodies over 4.5 MB. Both paths must turn a PDF into the same text,
 * so the cleanup lives here, free of Node and DOM imports, and
 * `documentProcessor.cleanText` delegates to it.
 */

/**
 * Most characters a text-only upload may carry after cleanup. Interviews use
 * the first 60,000 (`MAX_RESUME_TEXT_LENGTH` in `lib/engine/session.ts`), so
 * this leaves generous headroom while keeping the JSON body well under the
 * platform limit (200,000 characters is at most ~800 KB of UTF-8).
 */
export const MAX_EXTRACTED_TEXT_CHARS = 200_000;

/** Collapse runs of whitespace the way extracted PDF text needs. */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "") // Postgres JSON cannot store NUL
    .replace(/[^\S\n]+/g, " ") // Collapse spaces and tabs, keep line breaks
    .replace(/ ?\n ?/g, "\n") // Drop spaces hugging a line break
    .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double newline
    .trim(); // Remove leading/trailing whitespace
}
