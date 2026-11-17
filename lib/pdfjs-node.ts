import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

/**
 * Load the pdfjs-dist legacy build for server-side use.
 *
 * pdfjs evaluates `new DOMMatrix()` at module load and polyfills it with a
 * runtime `require("@napi-rs/canvas")` that Vercel's file tracing cannot see.
 * Routes that never import the canvas package themselves (resume and job
 * description uploads) then shipped without it and every PDF failed with
 * "DOMMatrix is not defined". This static import makes the trace include it.
 *
 * The worker has the same problem. On Node pdfjs runs a "fake worker" that it
 * loads with `import(workerSrc)` (a variable path), so the trace never includes
 * pdf.worker.mjs and, on Vercel, every PDF failed with "Setting up fake worker
 * failed". The deck route only worked because its font paths pull in the whole
 * package. Importing the worker by a literal path here traces it, and handing
 * it to pdfjs as `globalThis.pdfjsWorker` skips the dynamic import entirely.
 */
export async function loadPdfjs() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= DOMMatrix;
  g.ImageData ??= ImageData;
  g.Path2D ??= Path2D;
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
