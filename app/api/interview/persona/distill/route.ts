import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  distillPersona,
  MAX_PROFILE_TEXT_LENGTH,
} from "@/lib/interview/persona-distill";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * One-shot persona distillation (REQ-22).
 *
 * Turns pasted "who is interviewing you" text into a short persona string the
 * client holds and later sends once, at session start, as part of assembling
 * a session-constant `InterviewType`-shaped object (REQ-23). This route never
 * runs per chat turn.
 *
 * RETENTION: the pasted text is a third party's personal information. It is
 * used for exactly one non-streaming model call and is never written to
 * Prisma, S3, or any cache, and never logged — only lengths are logged.
 *
 * This route accepts pasted TEXT only. It must never fetch a student-supplied
 * URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.
 *
 * The distillation logic now lives in `lib/interview/persona-distill.ts` so the
 * networking path can gate it without a second distiller; this route's contract is
 * unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return response({ error: "Invalid JSON body" }, 400);
    }

    const profileText = (body as { profileText?: unknown } | null)?.profileText;

    if (typeof profileText !== "string" || !profileText.trim()) {
      return response({ error: "profileText is required" }, 400);
    }

    const truncatedInput = profileText.trim().slice(0, MAX_PROFILE_TEXT_LENGTH);

    let distilled: { persona: string; displayName: string };

    try {
      distilled = await distillPersona(truncatedInput);
    } catch (error) {
      console.error(
        "Interview persona distillation failed",
        error instanceof Error ? error.constructor.name : typeof error,
      );

      return response(
        { error: "We could not process that description. Please try again." },
        502,
      );
    }

    const { persona, displayName } = distilled;

    if (!persona) {
      console.error("Interview persona distillation returned empty output");

      return response(
        { error: "We could not process that description. Please try again." },
        502,
      );
    }

    console.info("Interview persona distilled", {
      userId: currentUser.id,
      inputLength: truncatedInput.length,
      outputLength: persona.length,
      hasDisplayName: displayName.length > 0,
    });

    return response({ persona, displayName }, 200);
  } catch (error) {
    console.error("Interview persona distillation request failed:", error);

    return response(
      { error: "Unable to process that description. Please try again." },
      500,
    );
  }
}
