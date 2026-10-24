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
 */
import { documentProcessor } from "@/lib/rag/document-processor";

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

  if (file.type !== PDF_MIME_TYPE) {
    return {
      ok: false,
      status: 400,
      error: `Only PDF ${label} files are supported`,
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
    console.error(`Interview ${label} parsing failed:`, error);
    return {
      ok: false,
      status: 422,
      error: `We could not read text from that PDF`,
    };
  }

  if (!text) {
    return {
      ok: false,
      status: 422,
      error: `No readable text was found in that PDF. Upload a text-based ${label} PDF.`,
    };
  }

  return { ok: true, buffer, text };
}
