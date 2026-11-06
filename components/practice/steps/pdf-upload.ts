/**
 * Client-side helpers shared by the resume and job-posting upload steps.
 *
 * The server is the authority on what a PDF is (it checks the `%PDF-` bytes);
 * these checks only save a round trip and must never reject a file the server
 * would accept.
 *
 * Two upload paths, one response shape. A PDF at or under
 * `DIRECT_UPLOAD_MAX_BYTES` is posted as-is, exactly as before. A larger one
 * (up to the 10 MB limit) would be rejected by Vercel, whose functions refuse
 * request bodies over 4.5 MB, so the browser reads it with pdfjs-dist and
 * posts only the text. The PDF is never compressed or altered, and it is not
 * uploaded straight to S3 (that needs bucket CORS outside this repo).
 */

import { cleanExtractedText, MAX_EXTRACTED_TEXT_CHARS } from "@/lib/interview/extracted-text";

/** Value for the file input's `accept`: the extension helps pickers that ignore MIME. */
export const PDF_ACCEPT = ".pdf,application/pdf";

/**
 * Safari and Windows browsers can report a real .pdf as
 * `application/octet-stream` or with an empty type, so the name counts too.
 */
/** Larger PDFs are read in the browser; see the header. */
export const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export const SIGNED_OUT_MESSAGE = "Your sign-in has expired. Sign in again, then upload the PDF.";

/** Login page link that explains why and comes back to this page. */
export function signInAgainHref(): string {
  const here = `${window.location.pathname}${window.location.search}`;
  return `/login?error=session_expired&returnTo=${encodeURIComponent(here)}`;
}

export function isSignedOut(
  response: Pick<Response, "status" | "redirected" | "url"> | null,
): boolean {
  if (response?.status === 401) return true;
  return response?.redirected === true && /\/login(?:[?#]|$)/.test(response.url);
}

export function looksLikePdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * A specific, student-facing message for a failed upload response. Platform
 * errors (body too large, gateway timeout, expired sign-in) arrive without
 * the route's JSON `error`, so map them by status instead of falling back to
 * a message that blames the file.
 *
 * Middleware answers a signed-out API request with a 401. A redirect to
 * /login still counts as one, in case a proxy or an older deployment sends it.
 */
export function uploadFailureMessage(
  response: Pick<Response, "status" | "redirected" | "url"> | null,
  serverError?: string,
): string {
  if (isSignedOut(response)) return SIGNED_OUT_MESSAGE;
  const status = response?.status ?? 0;
  if (status === 413 && !serverError) {
    return "That PDF is too large to upload. Save a smaller copy, for example with Print → Save as PDF, then try again.";
  }
  if (serverError) return serverError;
  if (status === 504 || status === 408) {
    return "Reading that PDF took too long. Try again, or upload a smaller PDF.";
  }
  return "We could not process that PDF. Try again in a moment.";
}

const DAMAGED_MESSAGE =
  "We could not read that PDF. It may be damaged. Export it again as a PDF, then upload it.";

/**
 * Text of a PDF, read in the browser with the same pdfjs-dist calls the server
 * uses (`lib/rag/document-processor.ts`) and the same cleanup, so both paths
 * produce the same text. pdfjs-dist loads only when a large PDF is picked.
 * Failures carry the server's own wording.
 */
async function readPdfText(
  file: File,
  messages: { notPdf: string; scanned: string },
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return { ok: false, error: messages.notPdf };
  }

  // The legacy build carries the polyfills older Safari needs.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("./pdf-text.worker.ts", import.meta.url),
      { type: "module" },
    );
  }

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "PasswordException") {
      return {
        ok: false,
        error: "That PDF is password-protected. Save a copy without a password, then upload it.",
      };
    }
    return { ok: false, error: DAMAGED_MESSAGE };
  }

  try {
    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) fullText += item.str + (item.hasEOL ? "\n" : "");
      }
      fullText += "\n";
    }
    const text = cleanExtractedText(fullText);
    if (!text) return { ok: false, error: messages.scanned };
    // Interviews use the first 60,000 characters, so trimming past the cap
    // drops nothing an interview would have read.
    return { ok: true, text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS) };
  } catch {
    return { ok: false, error: DAMAGED_MESSAGE };
  } finally {
    await doc.destroy();
  }
}

/**
 * Post a PDF to an interview upload route, choosing the path by size (see the
 * header). Throws an Error with a student-facing message when the PDF cannot
 * be read here or the request never reaches the server; any response,
 * successful or not, is returned for the caller to check as before.
 */
export async function sendInterviewPdf<T>(
  file: File,
  endpoint: string,
  messages: { notPdf: string; scanned: string },
): Promise<{ response: Response; data: T & { error?: string }; readOnDevice: boolean }> {
  const readOnDevice = file.size > DIRECT_UPLOAD_MAX_BYTES;
  let init: RequestInit;
  if (readOnDevice) {
    const read = await readPdfText(file, messages).catch(() => ({
      ok: false as const,
      error: DAMAGED_MESSAGE,
    }));
    if (!read.ok) throw new Error(read.error);
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: read.text, fileName: file.name, fileSize: file.size }),
    };
  } else {
    const formData = new FormData();
    formData.append("file", file);
    init = { method: "POST", body: formData };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, init);
  } catch {
    throw new Error("The upload could not reach the server. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { response, data, readOnDevice };
}
