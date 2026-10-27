/**
 * THE ONLY HTTP ENTRY INTO COACHED MODE (REQ-113).
 *
 * Keyed by `stepId` — a user-owned `COACHED_SESSION` path step — and
 * NOTHING ELSE. There is no `/api/coached/[sessionId]/start`, no
 * `/api/practice/coached`, and no route that accepts a type slug. Adding
 * any sibling entry point (a convenience route that lets a client start or
 * resume coached mode by any identifier other than a path step it owns)
 * would VIOLATE REQ-113 — read `lib/study-plan/coached/runtime.ts` and
 * `.planning/phases/22-coached-mode/22-CONTEXT.md` before adding one.
 * Phase 22: the coach (not an engine session) runs the legs; PATCH carries
 * `turn` | `advance` | `complete`. `scripts/verify-coached-entry.ts` section 1 walks every
 * `route.ts` under `app/api/` and asserts EXACTLY ONE mentions
 * `enterCoachedStep` / `completeCoachedSession` — this file.
 *
 * No verb here accepts a `coachedSessionId` from the client. It is always
 * resolved from the step, which is owned through `path.userId` — an id
 * taken from the request body could belong to someone else.
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  enterCoachedStep,
  advanceToFresh,
  completeCoachedSession,
  takeCoachTurn,
  CoachedLegNotDoneError,
  ReplayMomentUnavailableError,
  NoEligibleReplayTargetError,
  CoachedSessionNotStartedError,
  CoachedLegOrderError,
} from "@/lib/study-plan/coached/runtime";
import { CoachTurnOrderError, UnspokenAttemptError } from "@/lib/study-plan/coached/coach";
import { NotReachableOutsideAPathError } from "@/lib/study-plan/coached/instance";

export const runtime = "nodejs";
export const maxDuration = 60; // entry may score a few reports; a coach turn is a grade + a generation

const MAX_UTTERANCE_CHARS = 4000;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authenticate(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

/**
 * 404 on a missing or non-owned step, and 404 (NOT 400) when the step's
 * `kind` is not `COACHED_SESSION` — a wrong-kind step id is indistinguishable
 * to the client from a nonexistent coached step, and saying which it is
 * would leak the step's kind.
 */
const STEP_NOT_FOUND = { error: "Coached step not found" };

/**
 * POST — enter the step. Creates the coached session on first entry (via
 * `enterCoachedStep`'s default `createIfMissing: true`), resumes on a
 * repeat call. 201 with the `CoachedLegView`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId } = await params;

    const leg = await enterCoachedStep({ userId: currentUser.id, stepId });
    return response({ leg }, 201);
  } catch (error) {
    if (error instanceof NotReachableOutsideAPathError) {
      return response(STEP_NOT_FOUND, 404);
    }
    if (error instanceof NoEligibleReplayTargetError) {
      return response(
        {
          error:
            "None of the sessions this plan was built from has a moment that shows this skill clearly enough to rework.",
        },
        409,
      );
    }
    if (error instanceof ReplayMomentUnavailableError) {
      return response(
        { error: "The original session's transcript could not be read." },
        409,
      );
    }
    console.error("Coached step entry failed:", error);
    return response({ error: "Unable to enter this coached step." }, 500);
  }
}

/**
 * GET — the current leg, for resume and for 21-24's polling. Passes
 * `createIfMissing: false` so a GET can NEVER create a session — a GET that
 * creates is a GET a browser prefetch could start a session with. 404 when
 * no session exists yet; the client then POSTs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId } = await params;

    const leg = await enterCoachedStep(
      { userId: currentUser.id, stepId },
      { createIfMissing: false },
    );
    return response({ leg }, 200);
  } catch (error) {
    if (
      error instanceof NotReachableOutsideAPathError ||
      error instanceof CoachedSessionNotStartedError
    ) {
      return response(STEP_NOT_FOUND, 404);
    }
    if (error instanceof ReplayMomentUnavailableError) {
      return response(
        { error: "The original session's transcript could not be read." },
        409,
      );
    }
    console.error("Coached step read failed:", error);
    return response({ error: "Unable to read this coached step." }, 500);
  }
}

/**
 * PATCH — a coach turn, advance, or finish, discriminated on body `action`
 * (`turn` | `advance` | `complete`). Any other `action` is 400; there is no
 * default verb. `advance` and `complete` take no leg-control fields: the
 * coach, not the client, decides when a leg is done. `complete` MAY carry an
 * optional `metrics` block ({ cameraMode, visual, vocal } — the same
 * `SessionMetricsPayload` shape a practice finish sends). Camera ON without
 * stored video-analysis consent is forced OFF. Derived JSON only, never media.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response({ error: "Request body must be JSON." }, 400);
    }
    if (!body || typeof body !== "object") {
      return response({ error: "Request body must be a JSON object." }, 400);
    }

    const action = (body as Record<string, unknown>).action;

    if (action !== "turn" && action !== "advance" && action !== "complete") {
      return response({ error: `Unknown action "${String(action)}".` }, 400);
    }

    // Resolve the step -> coachedSessionId ourselves; never accept one from
    // the client on any verb.
    const step = await loadStepForPatch(currentUser.id, stepId);
    if (!step) return response(STEP_NOT_FOUND, 404);
    if (!step.coachedSessionId) {
      return response(STEP_NOT_FOUND, 404);
    }
    const coachedSessionId = step.coachedSessionId;

    const currentLegOrNull = async () =>
      (
        await enterCoachedStep(
          { userId: currentUser.id, stepId },
          { createIfMissing: false },
        ).catch(() => null)
      );

    if (action === "turn") {
      const raw = (body as Record<string, unknown>).utterance;
      let utterance: { text: string; spokenDurationMs: number } | null = null;
      if (raw !== undefined && raw !== null) {
        const u = raw as Record<string, unknown>;
        if (
          typeof raw !== "object" ||
          typeof u.text !== "string" ||
          u.text.trim().length === 0 ||
          u.text.length > MAX_UTTERANCE_CHARS
        ) {
          return response(
            { error: `utterance.text must be a non-empty string of at most ${MAX_UTTERANCE_CHARS} characters.` },
            400,
          );
        }
        if (
          typeof u.spokenDurationMs !== "number" ||
          !Number.isInteger(u.spokenDurationMs) ||
          u.spokenDurationMs <= 0
        ) {
          return response({ error: "utterance.spokenDurationMs must be a positive integer." }, 400);
        }
        utterance = { text: u.text, spokenDurationMs: u.spokenDurationMs };
      }
      try {
        const { coachTurn: result, leg } = await takeCoachTurn({
          userId: currentUser.id,
          stepId,
          utterance,
        });
        // The client contract is the FLAT coach turn ({ speech, move,
        // awaiting, demonstration, closedAtSoftCap }). `takeCoachTurn`
        // returns `{ coachTurn: CoachTurnResult }`, and CoachTurnResult itself
        // wraps `{ coachTurn, legState }`; sending it unwrapped made the shell
        // read `speech` as undefined, so the avatar was asked to speak nothing
        // (UAT G2: "the avatar doesn't speak in coach mode") and no
        // demonstration ever rendered.
        return response({ coachTurn: result.coachTurn, leg }, 200);
      } catch (error) {
        if (error instanceof UnspokenAttemptError) {
          return response({ error: "That attempt was not spoken aloud." }, 400);
        }
        if (error instanceof CoachTurnOrderError || error instanceof CoachedLegOrderError) {
          const current = await currentLegOrNull();
          return response(
            { error: "That turn is not available right now.", currentLeg: current?.leg ?? null },
            409,
          );
        }
        throw error;
      }
    }

    try {
      if (action === "advance") {
        const leg = await advanceToFresh({ userId: currentUser.id, coachedSessionId });
        return response({ leg }, 200);
      }
      const { contributionsWritten } = await completeCoachedSession({
        userId: currentUser.id,
        coachedSessionId,
        metrics: (body as Record<string, unknown>).metrics,
      });
      return response({ contributionsWritten }, 200);
    } catch (error) {
      if (error instanceof CoachedLegOrderError || error instanceof CoachedLegNotDoneError) {
        const current = await currentLegOrNull();
        return response(
          {
            error:
              error instanceof CoachedLegNotDoneError
                ? "The coach has not closed this leg yet."
                : action === "advance"
                  ? "Session cannot advance from its current leg."
                  : "Session cannot be completed from its current leg.",
            currentLeg: current?.leg ?? null,
            ...(error instanceof CoachedLegNotDoneError ? { legReady: false } : {}),
          },
          409,
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof NotReachableOutsideAPathError) {
      return response(STEP_NOT_FOUND, 404);
    }
    console.error("Coached step update failed:", error);
    return response({ error: "Unable to update this coached step." }, 500);
  }
}

/** Resolves the step's `coachedSessionId`, scoped by ownership — the ONLY
 * source of the session id for PATCH; never read from the request body. */
async function loadStepForPatch(userId: string, stepId: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.studyPlanPathStep.findFirst({
    where: { id: stepId, path: { userId }, kind: "COACHED_SESSION" },
    select: { coachedSessionId: true },
  });
}
