/**
 * Web Worker entry for pdfjs-dist in the browser (see `pdf-upload.ts`).
 * Importing the pdfjs worker inside a worker context starts its message
 * handler. Kept as our own file so the server build, which lists pdfjs-dist
 * in `serverExternalPackages`, never resolves the worker as an asset.
 */
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
