import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  distillPersona,
  MAX_PROFILE_TEXT_LENGTH,
} from "@/lib/interview/persona-distill";
import { consumeAttestation } from "@/lib/networking/attestation";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Attestation-gated persona distillation for the networking brought-in-person
 * path (16-CONTEXT.md decision 8).
 *
 * RETENTION: the pasted text is a third party's personal information. It is
 * used for exactly one non-streaming model call and is never written to
 * Prisma, S3, or any cache, and never logged — only lengths are logged.
 *
 * This route accepts pasted TEXT only. It must never fetch a student-supplied
 * URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.
 *
 * This route exists ONLY to put the attestation gate in front of the one
 * distiller. It deliberately shares `distillPersona` from
 * `lib/interview/persona-distill.ts` rather than adding a second distillation
 * path (16-CONTEXT.md decision 1).
 *
 * Two-point enforcement: (1) this route consumes an attestation before
 * distilling; (2) `POST /api/networking/persona` (plan 16-04) refuses to save
 * a persona unless its `attestationId` names an attestation owned by the
 * caller and ALREADY SPENT. A client that bypassed (1) by calling the ungated
 * Phase 8 interview distill route gets a persona sentence it cannot save as a
 * networking persona and cannot launch a networking session with — the
 * reachable bypass yields nothing usable. The interview route stays ungated
 * on purpose so Phase 8 callers keep their contract; a forgeable
 * `source`/`isNetworking` flag on that route is explicitly rejected.
 *
 * A spent attestation is NOT released if distillation fails — a failed model
 * call costs the student one re-tick, which is the correct trade against
 * making the gate re-usable.
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
    const attestationId = (body as { attestationId?: unknown } | null)
      ?.attestationId;

    if (typeof profileText !== "string" || !profileText.trim()) {
      return response({ error: "profileText is required" }, 400);
    }

    if (typeof attestationId !== "string" || !attestationId.trim()) {
      return response({ error: "attestationId is required" }, 400);
    }

    // LOAD-BEARING ORDER: consume BEFORE any model call. A non-ok result
    // returns immediately — no provider call has been made at this point.
    const gate = await consumeAttestation({
      attestationId,
      userId: currentUser.id,
      now: new Date(),
    });

    if (!gate.ok) {
      // Collapse not-found and not-owned into one opaque machine code so an
      // id cannot be probed. expired / stale-wording / already-consumed keep
      // distinct codes so the wizard can re-prompt usefully.
      const reason =
        gate.reason === "not-found" || gate.reason === "not-owned"
          ? "not-found"
          : gate.reason;

      return response(
        {
          error: "Please confirm the agreement before continuing.",
          reason,
        },
        403,
      );
    }

    const truncatedInput = profileText.trim().slice(0, MAX_PROFILE_TEXT_LENGTH);

    let distilled: { persona: string; displayName: string };

    try {
      distilled = await distillPersona(truncatedInput);
    } catch (error) {
      // Deliberate: the attestation was already spent above. A failed model
      // call does NOT release it — the student must re-tick.
      console.error(
        "Networking persona distillation failed",
        error instanceof Error ? error.constructor.name : typeof error,
      );

      return response(
        { error: "We could not process that description. Please try again." },
        502,
      );
    }

    const { persona, displayName } = distilled;

    if (!persona) {
      console.error("Networking persona distillation returned empty output");

      return response(
        { error: "We could not process that description. Please try again." },
        502,
      );
    }

    console.info("Networking persona distilled", {
      userId: currentUser.id,
      attestationId,
      inputLength: truncatedInput.length,
      outputLength: persona.length,
      hasDisplayName: displayName.length > 0,
    });

    return response({ persona, displayName, attestationId }, 200);
  } catch (error) {
    console.error("Networking persona distillation request failed:", error);

    return response(
      { error: "Unable to process that description. Please try again." },
      500,
    );
  }
}
