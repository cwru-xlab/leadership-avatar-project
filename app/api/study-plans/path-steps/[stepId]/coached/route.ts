/**
 * THE ONLY HTTP ENTRY INTO COACHED MODE (REQ-113).
 *
 * Keyed by `stepId` — a user-owned `COACHED_SESSION` path step — and
 * NOTHING ELSE. There is no `/api/coached/[sessionId]/start`, no
 * `/api/practice/coached`, and no route that accepts a type slug. Adding
 * any sibling entry point (a convenience route that lets a client start or
 * resume coached mode by any identifier other than a path step it owns)
 * would VIOLATE REQ-113 — read `lib/study-plan/coached/runtime.ts` and
 * `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md`
 * before adding one. `scripts/verify-coached-entry.ts` section 1 walks every
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
  ReplayMomentUnavailableError,
  NoEligibleReplayTargetError,
  CoachedSessionNotStartedError,
  CoachedLegOrderError,
} from "@/lib/study-plan/coached/runtime";
import { NotReachableOutsideAPathError } from "@/lib/study-plan/coached/instance";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    if (error instanceof ReplayMomentUnavailableError || error instanceof NoEligibleReplayTargetError) {
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
 * PATCH — advance or finish, discriminated on body `action`. Any other
 * `action` is 400; there is no default verb.
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

    // Resolve the step -> coachedSessionId ourselves; never accept one from
    // the client on any verb.
    const step = await loadStepForPatch(currentUser.id, stepId);
    if (!step) return response(STEP_NOT_FOUND, 404);
    if (!step.coachedSessionId) {
      return response(STEP_NOT_FOUND, 404);
    }
    const coachedSessionId = step.coachedSessionId;

    if (action === "advance") {
      const replayReportId = (body as Record<string, unknown>).replayReportId;
      if (typeof replayReportId !== "string" || !replayReportId) {
        return response({ error: "replayReportId must be a string." }, 400);
      }
      try {
        const leg = await advanceToFresh({
          userId: currentUser.id,
          coachedSessionId,
          replayReportId,
        });
        return response({ leg }, 200);
      } catch (error) {
        if (error instanceof CoachedLegOrderError) {
          const current = await enterCoachedStep(
            { userId: currentUser.id, stepId },
            { createIfMissing: false },
          ).catch(() => null);
          return response(
            {
              error: "Session is not in REPLAY.",
              currentLeg: current?.leg ?? null,
            },
            409,
          );
        }
        throw error;
      }
    }

    if (action === "complete") {
      const reportId = (body as Record<string, unknown>).reportId;
      if (typeof reportId !== "string" || !reportId) {
        return response({ error: "reportId must be a string." }, 400);
      }
      try {
        const { contributionsWritten } = await completeCoachedSession({
          userId: currentUser.id,
          coachedSessionId,
          reportId,
        });
        return response({ contributionsWritten }, 200);
      } catch (error) {
        if (error instanceof CoachedLegOrderError) {
          const current = await enterCoachedStep(
            { userId: currentUser.id, stepId },
            { createIfMissing: false },
          ).catch(() => null);
          return response(
            {
              error: "Session is not in FRESH.",
              currentLeg: current?.leg ?? null,
            },
            409,
          );
        }
        throw error;
      }
    }

    return response({ error: `Unknown action "${String(action)}".` }, 400);
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
