import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  raiseContest,
  NotFoundError,
  NotGradedError,
  InvalidReasonError,
  AlreadyContestedError,
} from "@/lib/study-plan/checks/contest";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * THE AFFORDANCE THAT CALLS THIS ROUTE IS NOT IN THIS PLAN. 21-22 owns the
 * check-taking component and folds a "Contest this grading" control into the
 * post-submission result view, POSTing here. This plan ships the endpoint
 * and its semantics only — REQ-112 ("contest from the surface that showed
 * them the mark") is NOT fully satisfied by this plan alone; it is only
 * complete once 21-22 adds the calling affordance. 21-20's validation should
 * check both halves.
 *
 * Placed at `checks/[attemptId]/contest/`, NOT nested under a `[planId]`.
 * `attemptId` is globally unique and `raiseContest` already resolves
 * ownership through its own join on `userId`, so nesting under a plan id
 * would add a second identifier that could disagree with the first (a
 * mismatched planId would either need its own lookup — duplicating the
 * ownership check — or be silently ignored, which is worse than not having
 * it at all).
 *
 * No GET, no DELETE, no resolution endpoint here, deliberately. A student
 * withdrawing a contest would need the reversal reconsidered, and that
 * product decision has not been made — leaving it out is better than
 * guessing. `resolveContest` (UPHELD/REJECTED) is reachable only from a
 * script in this plan; there is no admin review UI in this phase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { attemptId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response({ error: "Request body must be JSON." }, 400);
    }

    const reason =
      body && typeof body === "object" && "reason" in body
        ? (body as { reason: unknown }).reason
        : undefined;

    if (typeof reason !== "string") {
      return response({ error: "reason must be a string." }, 400);
    }

    const result = await raiseContest({
      userId: currentUser.id,
      attemptId,
      reason,
    });

    return response(
      {
        contestId: result.contestId,
        contributionsReversed: result.contributionsReversed,
        checkFlagged: result.checkFlagged,
      },
      201
    );
  } catch (error) {
    if (error instanceof InvalidReasonError) {
      return response({ error: error.message }, 400);
    }
    if (error instanceof NotGradedError) {
      return response({ error: error.message }, 400);
    }
    if (error instanceof NotFoundError) {
      // SAME status/message whether the attempt does not exist or belongs
      // to another user — distinguishing them would turn this endpoint into
      // an id oracle an attacker could use to enumerate other students'
      // attempt ids.
      return response({ error: "Knowledge check attempt not found" }, 404);
    }
    if (error instanceof AlreadyContestedError) {
      return response(
        { error: error.message, existingContestId: error.existingContestId },
        409
      );
    }

    // Never return a raw Prisma/error body here — the existing study-plan
    // routes do not, and a database error string can carry column and
    // constraint names.
    console.error("Grading contest failed:", error);
    return response({ error: "Unable to raise this contest." }, 500);
  }
}
