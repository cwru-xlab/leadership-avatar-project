import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

/**
 * Load the pdfjs-dist legacy build for server-side use.
 *
 * pdfjs evaluates `new DOMMatrix()` at module load and polyfills it with a
 * runtime `require("@napi-rs/canvas")` that Vercel's file tracing cannot see.
 * Routes that never import the canvas package themselves (resume and job
 * description uploads) then shipped without it and every PDF failed with
 * "DOMMatrix is not defined". This static import makes the trace include it.
 */
export async function loadPdfjs() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= DOMMatrix;
  g.ImageData ??= ImageData;
  g.Path2D ??= Path2D;
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
