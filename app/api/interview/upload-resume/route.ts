import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  intakeExtractedText,
  readExtractedTextBody,
} from "@/lib/interview/document-intake";
import { documentProcessor, PdfPasswordError } from "@/lib/rag/document-processor";
import { s3Storage } from "@/lib/s3-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const SCANNED_RESUME_ERROR =
  "No readable text was found in that PDF. It looks like a scan or photo. Export your resume from Word, Google Docs or Pages as a PDF, then upload it.";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Upload a resume for a pending interview session.
 *
 * The original PDF is private in S3. Only its extracted text and an opaque
 * resume ID return to the browser; later interview/report routes must derive
 * the S3 key server-side from the authenticated user and that ID.
 *
 * A PDF over the direct-upload size arrives as JSON text instead (the browser
 * read it, because Vercel rejects bodies over 4.5 MB). That path stores the
 * cleaned text privately in place of the PDF and answers with the same shape.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    if (request.headers.get("content-type")?.startsWith("application/json")) {
      return await uploadExtractedText(request, currentUser.id);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return response({ error: "A resume PDF must be provided" }, 400);
    }

    // Some browsers send a real .pdf as application/octet-stream or with no
    // type at all, so a .pdf name is enough here; the %PDF- check below is
    // what actually decides.
    if (file.type !== PDF_MIME_TYPE && !/\.pdf$/i.test(file.name)) {
      return response(
        {
          error: "Only PDF resumes are supported. Save or export your resume as a PDF, then upload it.",
          receivedType: file.type || "unknown",
        },
        400
      );
    }

    if (file.size === 0) {
      return response({ error: "The resume PDF is empty" }, 400);
    }

    if (file.size > MAX_RESUME_SIZE_BYTES) {
      return response({ error: "Resume PDF exceeds the 10MB limit" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // MIME types come from the browser and can be forged. Check the PDF header
    // before passing a file to the parser or persisting it to S3.
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return response({ error: "The uploaded file is not a valid PDF" }, 400);
    }

    let resumeText: string;
    try {
      resumeText = documentProcessor.cleanText(
        await documentProcessor.extractText(buffer, PDF_MIME_TYPE)
      );
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        return response(
          { error: "That PDF is password-protected. Save a copy without a password, then upload it." },
          422
        );
      }
      console.error("Interview resume parsing failed:", error);
      return response(
        { error: "We could not read that PDF. It may be damaged. Export it again as a PDF, then upload it." },
        422
      );
    }

    if (!resumeText) {
      return response({ error: SCANNED_RESUME_ERROR }, 422);
    }

    const resumeId = randomUUID();
    let resumeS3Key: string;
    try {
      resumeS3Key = await s3Storage.saveInterviewResume(currentUser.id, resumeId, buffer);
    } catch (error) {
      console.error("Interview resume storage failed:", error);
      return response({ error: "Unable to save the resume. Please try again." }, 502);
    }

    console.info("Interview resume uploaded", {
      userId: currentUser.id,
      resumeId,
      resumeS3Key,
      sizeBytes: buffer.length,
    });

    return response({ success: true, resumeId, resumeText }, 201);
  } catch (error) {
    console.error("Interview resume upload failed:", error);
    return response({ error: "Unable to upload the resume. Please try again." }, 500);
  }
}

async function uploadExtractedText(request: NextRequest, userId: string) {
  const read = await readExtractedTextBody(request);
  if (!read.ok) {
    return response({ error: read.error }, read.status);
  }
  const intake = intakeExtractedText(read.body, {
    label: "resume",
    scannedError: SCANNED_RESUME_ERROR,
  });
  if (!intake.ok) {
    return response({ error: intake.error }, intake.status);
  }

  const resumeId = randomUUID();
  let resumeS3Key: string;
  try {
    resumeS3Key = await s3Storage.saveInterviewDocumentText("resume", userId, resumeId, intake.text);
  } catch (error) {
    console.error("Interview resume text storage failed:", error);
    return response({ error: "Unable to save the resume. Please try again." }, 502);
  }

  console.info("Interview resume text uploaded", {
    userId,
    resumeId,
    resumeS3Key,
    pdfSizeBytes: intake.fileSize,
    textLength: intake.text.length,
  });

  return response({ success: true, resumeId, resumeText: intake.text }, 201);
}
