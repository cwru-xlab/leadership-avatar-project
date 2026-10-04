/**
 * Per-page PDF text extraction for Phase 14 deck intake.
 *
 * Shape follows 14-RESEARCH.md Pattern 2 (one string per `Pages` entry instead
 * of a joined blob). Implementation uses `pdfjs-dist` rather than in-process
 * `pdf2json`: pdf2json's fake worker keeps process-global state that returns
 * stale pages from a prior buffer under sequential load — verified against
 * the 14-03 fixtures. `lib/rag/document-processor.ts` is deliberately NOT
 * edited (still pdf2json for the RAG pipeline).
 */

import { normalizeDeckWhitespace } from "./pptx-extract";

/**
 * Extract one text string per PDF page, in page order.
 * Rejects (throws) on corrupt PDFs — intake maps the throw to
 * `corrupt-pdf` / `password-protected`.
 */
export async function extractPerPageText(buffer: Buffer): Promise<string[]> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Copy — pdfjs may transfer/detach the underlying ArrayBuffer.
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      // Node: no browser worker; disable to keep extraction in-process.
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const doc = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pieces: string[] = [];

      for (const item of content.items) {
        if (item && typeof item === "object" && "str" in item) {
          const str = (item as { str?: string }).str;

          if (typeof str === "string" && str.length > 0) {
            pieces.push(str);
          }
        }
      }

      pages.push(normalizeDeckWhitespace(pieces.join(" ")));
    }

    await doc.destroy();

    return pages;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Normalize so intake's password / corrupt mapping still works.
    if (/password|encrypted|encrypt/i.test(message)) {
      throw new Error(`PDF parsing error: ${message}`);
    }

    throw new Error(`PDF parsing error: ${message}`);
  }
}
