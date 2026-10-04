/**
 * Per-page PDF text extraction for Phase 14 deck intake.
 *
 * This is a restructuring of the existing pdf2json loop in
 * `lib/rag/document-processor.ts` (14-RESEARCH.md Pattern 2): that module
 * walks `pdfData.Pages` and JOINS every page into one string. Here we push
 * each page's accumulated text into an array instead.
 *
 * `lib/rag/document-processor.ts` is deliberately NOT edited — it is shared
 * by the RAG pipeline and has its own callers.
 */

import PDFParser from "pdf2json";

import { normalizeDeckWhitespace } from "./pptx-extract";

/**
 * Extract one text string per PDF page, in page order.
 * Rejects (throws) on corrupt PDFs via pdf2json's error event — intake maps
 * the throw to `corrupt-pdf` / `password-protected`.
 */
export async function extractPerPageText(buffer: Buffer): Promise<string[]> {
  try {
    const pdfParser = new PDFParser();

    return new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", (errData: any) => {
        reject(new Error(`PDF parsing error: ${errData.parserError}`));
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          const pages: string[] = [];

          pdfData.Pages.forEach((page: any) => {
            let pageText = "";

            page.Texts.forEach((text: any) => {
              text.R.forEach((run: any) => {
                try {
                  pageText += decodeURIComponent(run.T);
                } catch {
                  pageText += run.T;
                }
              });
            });
            pages.push(normalizeDeckWhitespace(pageText));
          });
          resolve(pages);
        } catch (error) {
          reject(new Error(`Failed to extract text from PDF data: ${error}`));
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  } catch {
    throw new Error("Failed to extract text from PDF");
  }
}
