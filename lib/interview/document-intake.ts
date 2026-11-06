/**
 * The ONE place the interview PDF intake contract lives.
 *
 * Pure apart from the existing `documentProcessor` call: no Next, no S3, no
 * Prisma, no auth. A route composes this with authentication and persistence;
 * this module decides only whether a byte stream is an acceptable interview
 * document and what text it carries.
 *
 * The check ORDER is load-bearing and mirrors the Phase 3 resume route
 * (`app/api/interview/upload-resume/route.ts`) exactly: cheap metadata checks
 * first, then the magic-byte check, and only THEN extraction. The magic-byte
 * check must stay before extraction or any persistence because MIME types
 * come from the browser and can be forged — a `.exe` renamed to `.pdf` with a
 * spoofed `Content-Type: application/pdf` must never reach the parser or S3.
 *
 * Quick task 003, decision 3: the resume route is deliberately NOT refactored
 * onto this module (its Phase 3 contract is locked). `scripts/verify-job-
 * description-intake.ts` pins the resume route's literal constants against
 * these so the two contracts cannot silently drift.
 *
 * `intakeExtractedText` is the second door: a PDF over the direct-upload size
 * is read in the browser (Vercel rejects request bodies over 4.5 MB) and only
 * its text arrives. Both upload routes, the resume route included, use it for
 * that path; their PDF path is unchanged.
 */
import { documentProcessor, PdfPasswordError } from "@/lib/rag/document-processor";
import {
  MAX_EXTRACTED_TEXT_CHARS,
  cleanExtractedText,
} from "@/lib/interview/extracted-text";

export const PDF_MIME_TYPE = "application/pdf";

/** 10MB ceiling — identical to the resume route's `MAX_RESUME_SIZE_BYTES`. */
export const MAX_INTERVIEW_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Every PDF, by spec, begins with this five-byte header. */
export const PDF_MAGIC_BYTES = "%PDF-";

/**
 * The slice of the web `File` API this module actually needs. Declared
 * structurally so the module stays testable with a plain object and carries no
 * dependency on the DOM lib or on `formData.get`'s union type.
 */
export interface IntakeFileLike {
  type: string;
  name?: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type IntakePdfResult =
  | { ok: true; buffer: Buffer; text: string }
  | { ok: false; status: number; error: string };

function isFileLike(value: unknown): value is IntakeFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IntakeFileLike).size === "number" &&
    typeof (value as IntakeFileLike).arrayBuffer === "function"
  );
}

/**
 * Validate and extract text from an interview PDF.
 *
 * `opts.label` is interpolated into the human-facing error strings (e.g.
 * "job posting") so this module carries no per-caller copy.
 */
export async function intakePdfDocument(
  file: unknown,
  opts: { label: string },
): Promise<IntakePdfResult> {
  const label = opts.label;

  if (!file || typeof file === "string" || !isFileLike(file)) {
    return { ok: false, status: 400, error: `A ${label} PDF must be provided` };
  }

  // Some browsers send a real .pdf as application/octet-stream or with no
  // type at all, so a .pdf name is enough here; the magic-byte check below is
  // what actually decides.
  if (file.type !== PDF_MIME_TYPE && !/\.pdf$/i.test(file.name ?? "")) {
    return {
      ok: false,
      status: 400,
      error: `Only PDF ${label} files are supported. Save or export it as a PDF, then upload it.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, status: 400, error: `The ${label} PDF is empty` };
  }

  if (file.size > MAX_INTERVIEW_DOCUMENT_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `${label} PDF exceeds the 10MB limit`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // MIME types come from the browser and can be forged. Check the PDF header
  // before passing a file to the parser or persisting it anywhere.
  if (buffer.subarray(0, 5).toString("ascii") !== PDF_MAGIC_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `The uploaded ${label} file is not a valid PDF`,
    };
  }

  let text: string;
  try {
    text = documentProcessor.cleanText(
      await documentProcessor.extractText(buffer, PDF_MIME_TYPE),
    );
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      return {
        ok: false,
        status: 422,
        error: "That PDF is password-protected. Save a copy without a password, then upload it.",
      };
    }
    console.error(`Interview ${label} parsing failed:`, error);
    return {
      ok: false,
      status: 422,
      error: "We could not read that PDF. It may be damaged. Export it again as a PDF, then upload it.",
    };
  }

  if (!text) {
    return {
      ok: false,
      status: 422,
      error: `No readable text was found in that PDF. It looks like a scan or photo. Upload a text-based ${label} PDF.`,
    };
  }

  return { ok: true, buffer, text };
}

/**
 * Body of a text-only upload: a PDF over the direct-upload size that the
 * browser read itself (`components/practice/steps/pdf-upload.ts`).
 */
export interface ExtractedTextUpload {
  text: string;
  fileName: string;
  fileSize: number;
}

/**
 * Largest JSON body a text-only upload may send. The text cap below is at
 * most ~800 KB of UTF-8; this allows for JSON escaping on top of that.
 */
export const MAX_EXTRACTED_TEXT_BODY_BYTES = 2 * 1024 * 1024;

export type IntakeTextResult =
  | { ok: true; text: string; fileName: string; fileSize: number }
  | { ok: false; status: number; error: string };

/**
 * Validate the text a browser extracted from a PDF.
 *
 * The bytes never reach the server on this path, so the `%PDF-` check and the
 * extraction ran in the browser. What the server can still hold to the same
 * contract: the declared file is a PDF within the 10MB limit, the text is a
 * string, it cleans up exactly as server-extracted text does, it is not empty
 * (a scan) and it is not larger than anything an interview could use.
 * `opts.scannedError` keeps each route's existing scan wording.
 */
export function intakeExtractedText(
  body: unknown,
  opts: { label: string; scannedError?: string },
): IntakeTextResult {
  const label = opts.label;
  const upload = (body ?? {}) as Partial<Record<keyof ExtractedTextUpload, unknown>>;

  if (typeof body !== "object" || body === null || typeof upload.text !== "string") {
    return { ok: false, status: 400, error: `A ${label} PDF must be provided` };
  }

  const fileName = typeof upload.fileName === "string" ? upload.fileName : "";
  if (!/\.pdf$/i.test(fileName)) {
    return {
      ok: false,
      status: 400,
      error: `Only PDF ${label} files are supported. Save or export it as a PDF, then upload it.`,
    };
  }

  const fileSize = upload.fileSize;
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, status: 400, error: `The ${label} PDF is empty` };
  }
  if (fileSize > MAX_INTERVIEW_DOCUMENT_BYTES) {
    return { ok: false, status: 400, error: `${label} PDF exceeds the 10MB limit` };
  }

  const text = cleanExtractedText(upload.text);
  if (!text) {
    return {
      ok: false,
      status: 422,
      error:
        opts.scannedError ??
        `No readable text was found in that PDF. It looks like a scan or photo. Upload a text-based ${label} PDF.`,
    };
  }
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    return {
      ok: false,
      status: 413,
      error: `That ${label} has more text than an interview can use. Upload a shorter PDF.`,
    };
  }

  return { ok: true, text, fileName: fileName.slice(0, 255), fileSize };
}

/**
 * Read a text-only upload's JSON body. The declared length is checked first
 * and the actual bytes after, since a chunked request declares none.
 */
export async function readExtractedTextBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  const tooLarge = {
    ok: false as const,
    status: 413,
    error: "That PDF has more text than an interview can use. Upload a shorter PDF.",
  };
  if (declared > MAX_EXTRACTED_TEXT_BODY_BYTES) return tooLarge;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_EXTRACTED_TEXT_BODY_BYTES) return tooLarge;
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "The upload was not valid JSON" };
  }
}
