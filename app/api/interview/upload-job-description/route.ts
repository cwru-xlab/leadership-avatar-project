import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { intakePdfDocument } from "@/lib/interview/document-intake";
import { s3Storage } from "@/lib/s3-client";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Upload the job posting a student is practising for.
 *
 * Structural mirror of `app/api/interview/upload-resume/route.ts`, with the
 * PDF contract itself delegated to `lib/interview/document-intake.ts`.
 *
 * The original PDF is private in S3. Only its extracted text and an opaque
 * job-description ID return to the browser — the S3 key is logged only, and
 * later routes must re-derive it from the authenticated user plus that ID.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const formData = await request.formData();

    const intake = await intakePdfDocument(formData.get("file"), {
      label: "job posting",
    });

    if (!intake.ok) {
      return response({ error: intake.error }, intake.status);
    }

    const jobDescriptionId = randomUUID();
    let jobDescriptionS3Key: string;
    try {
      jobDescriptionS3Key = await s3Storage.saveInterviewJobDescription(
        currentUser.id,
        jobDescriptionId,
        intake.buffer
      );
    } catch (error) {
      console.error("Interview job description storage failed:", error);
      return response(
        { error: "Unable to save the job posting. Please try again." },
        502
      );
    }

    console.info("Interview job description uploaded", {
      userId: currentUser.id,
      jobDescriptionId,
      jobDescriptionS3Key,
      sizeBytes: intake.buffer.length,
    });

    return response(
      {
        success: true,
        jobDescriptionId,
        jobDescriptionText: intake.text,
      },
      201
    );
  } catch (error) {
    console.error("Interview job description upload failed:", error);
    return response(
      { error: "Unable to upload the job posting. Please try again." },
      500
    );
  }
}
