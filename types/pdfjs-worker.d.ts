// pdfjs-dist ships no types for its worker entry. It is only loaded by
// lib/pdfjs-node.ts and handed to pdfjs as globalThis.pdfjsWorker.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
