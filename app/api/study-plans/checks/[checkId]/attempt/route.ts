import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  type CheckFormat,
  type CheckPayload,
  validateCheckPayload,
} from "@/lib/study-plan/checks/types";
import {
  submitAndGrade,
  AlreadyAnsweredError,
  CheckNotFoundError,
  RewriteGradingFailedError,
} from "@/lib/study-plan/checks/grade";

export const runtime = "nodejs";
// Raised only for REWRITE_WEAK_LINE's model-graded call — the three closed
// formats never reach a model, so 30s (not 60s, which is a generation-batch
// number) is plenty for a single grading round trip.
export const maxDuration = 30;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "Knowledge check not found" };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Thrown by readResponseBody for a malformed/missing field, named so the
 * route can return 400 with the specific offending field rather than a
 * generic message.
 */
class BodyValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "BodyValidationError";
  }
}

/**
 * Validates the SHAPE of the per-format response BEFORE calling into
 * grading — presence and type only. Range/count checks (out-of-range index,
 * wrong blank count) are 21-11's job (gradeDeterministic) and surface as a
 * generic thrown Error, which the POST handler below maps to 400 as well
 * (see the catch-all comment there).
 */
function readResponseBody(format: CheckFormat, body: unknown): unknown {
  if (!isRecord(body)) {
    throw new BodyValidationError("body", "Request body must be a JSON object.");
  }
  switch (format) {
    case "MULTIPLE_CHOICE": {
      if (typeof body.selectedIndex !== "number") {
        throw new BodyValidationError(
          "selectedIndex",
          "selectedIndex must be a number."
        );
      }
      return { selectedIndex: body.selectedIndex };
    }
    case "PICK_BETTER_RESPONSE": {
      if (typeof body.betterIndex !== "number") {
        throw new BodyValidationError(
          "betterIndex",
          "betterIndex must be a number."
        );
      }
      return { betterIndex: body.betterIndex };
    }
    case "FILL_IN_BLANK": {
      if (
        !Array.isArray(body.blanks) ||
        !body.blanks.every((entry) => typeof entry === "string")
      ) {
        throw new BodyValidationError(
          "blanks",
          "blanks must be an array of strings."
        );
      }
      return { blanks: body.blanks };
    }
    case "REWRITE_WEAK_LINE": {
      if (typeof body.rewrittenLine !== "string" || body.rewrittenLine.length === 0) {
        throw new BodyValidationError(
          "rewrittenLine",
          "rewrittenLine must be a non-empty string."
        );
      }
      return { rewrittenLine: body.rewrittenLine };
    }
    default: {
      const exhaustive: never = format;
      throw new BodyValidationError("format", `Unknown check format: ${String(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The keyless DTO — the load-bearing export of this file.
// ---------------------------------------------------------------------------

export interface KeylessCheckDTO {
  id: string;
  format: CheckFormat;
  competencyKey: string;
  prompt: string;
  /**
   * `CheckPayload` (lib/study-plan/checks/types.ts) was already modelled
   * keyless at 21-06 — none of its four shapes carry a correct-answer field.
   * The answer lives ONLY in the knowledge check's separate answer-key
   * database column, which this DTO never reads. Re-validating the stored
   * payload through `validateCheckPayload` (rather than casting the row's
   * JSON directly) reconstructs an object with EXACTLY the known fields, so
   * an accidental extra property on the stored row can never leak through
   * this function.
   */
  payload: CheckPayload;
  quotedText: {
    text: string;
    sourceReportId: string;
    turnIndex: number;
  } | null;
}

export interface KnowledgeCheckRowForDTO {
  id: string;
  format: string;
  competencyKey: string;
  prompt: string;
  payload: unknown;
  quotedText: string | null;
  sourceReportId: string | null;
  quotedTurnIndex: number | null;
}

/**
 * Pure function, no Prisma import reachable from this call path — Task 4's
 * verifier asserts over its output with a hand-built row literal and no
 * running server. Deliberately never reads a key-bearing field off the row:
 * the type above does not even declare one, so there is nothing here to
 * accidentally forward even if the caller passed a fuller row object in.
 */
export function toKeylessCheckDTO(row: KnowledgeCheckRowForDTO): KeylessCheckDTO {
  const format = row.format as CheckFormat;
  const payload = validateCheckPayload(format, row.payload);
  const quotedText =
    row.quotedText !== null &&
    row.sourceReportId !== null &&
    row.quotedTurnIndex !== null
      ? {
          text: row.quotedText,
          sourceReportId: row.sourceReportId,
          turnIndex: row.quotedTurnIndex,
        }
      : null;

  return {
    id: row.id,
    format,
    competencyKey: row.competencyKey,
    prompt: row.prompt,
    payload,
    quotedText,
  };
}

export interface AttemptMarkDTO {
  id: string;
  score: number;
  correct: boolean | null;
  gradedBy: "DETERMINISTIC" | "MODEL";
  detail: string;
  contested: boolean;
}

async function loadAttemptMark(
  checkId: string,
  userId: string
): Promise<AttemptMarkDTO | null> {
  const attempt = await prisma.knowledgeCheckAttempt.findFirst({
    where: { knowledgeCheckId: checkId, userId },
    include: { contest: { select: { id: true } } },
  });
  if (!attempt) return null;
  return {
    id: attempt.id,
    score: attempt.score ?? 0,
    correct: attempt.correct,
    gradedBy: (attempt.gradedBy as "DETERMINISTIC" | "MODEL") ?? "DETERMINISTIC",
    // 21-11's DeterministicGrade.detail (stored as graderRationale) is the
    // only moment the correct option's TEXT is revealed — after the answer
    // is already submitted and locked by the unique constraint.
    detail: attempt.graderRationale ?? "",
    contested: attempt.contest !== null,
  };
}

/**
 * GET the check as the student must see it — keyless, with a replayed mark
 * if one already exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { checkId } = await params;
    if (typeof checkId !== "string" || !UUID_REGEX.test(checkId)) {
      return response(NOT_FOUND, 404);
    }

    // Ownership is a WHERE clause, not a post-check — a check belonging to
    // another user is indistinguishable from a missing one. A 403 here would
    // confirm the row exists for a different student, which is itself a leak.
    const row = await prisma.knowledgeCheck.findFirst({
      where: { id: checkId, userId: currentUser.id },
    });
    if (!row) return response(NOT_FOUND, 404);

    const check = toKeylessCheckDTO(row);
    const attempt = await loadAttemptMark(checkId, currentUser.id);

    return response({ check, attempt }, 200);
  } catch (error) {
    console.error("Knowledge check fetch failed:", error);
    return response({ error: "Unable to load this knowledge check." }, 500);
  }
}

/**
 * POST an answer and return the mark.
 *
 * THIS ROUTE IS KEYED ON THE CHECK, NOT THE ATTEMPT — `[checkId]`, not
 * `[attemptId]`. Before a submission, no attempt row exists yet, so there is
 * nothing else it could be keyed on. 21-15's sibling route,
 * `app/api/study-plans/check-attempts/[attemptId]/contest/route.ts`, keys on the
 * ATTEMPT instead, because a contest always targets an already-graded
 * attempt. The two routes living one path segment apart with different id
 * semantics is exactly the kind of thing a later reader "corrects" into a
 * bug — it is not a bug; it is two different resources at two different
 * moments in the same flow.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { checkId } = await params;
    if (typeof checkId !== "string" || !UUID_REGEX.test(checkId)) {
      return response(NOT_FOUND, 404);
    }

    // Loaded ONLY to learn the format so the body can be shape-validated
    // before grading — submitAndGrade below re-loads and re-scopes by
    // {id, userId} itself, so ownership is never decided by this read alone.
    const row = await prisma.knowledgeCheck.findFirst({
      where: { id: checkId, userId: currentUser.id },
      select: { format: true },
    });
    if (!row) return response(NOT_FOUND, 404);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return response({ error: "Request body must be JSON." }, 400);
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = readResponseBody(row.format as CheckFormat, rawBody);
    } catch (error) {
      if (error instanceof BodyValidationError) {
        return response({ error: error.message, field: error.field }, 400);
      }
      throw error;
    }

    const outcome = await submitAndGrade({
      userId: currentUser.id,
      knowledgeCheckId: checkId,
      response: parsedResponse,
      // No callModel passed — the real model path is wanted here. The
      // injectable stub exists for 21-11's own battery, not for this route.
    });

    // NOTE, DELIBERATE OMISSION: this route does NOT mark the owning path
    // step complete. Step completion belongs to 21-08's step-completion
    // helper and the path route — a second writer here would let a step
    // complete without the path's own invariants (ordering, prerequisites)
    // being re-checked. See this plan's SUMMARY for where a check step's
    // completion actually happens.
    return response(
      {
        attempt: {
          id: outcome.attemptId,
          score: outcome.score,
          correct: outcome.correct,
          gradedBy: outcome.gradedBy,
          detail: outcome.detail,
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof AlreadyAnsweredError) {
      const { checkId } = await params;
      const currentUser = await authenticate(request);
      const existing = currentUser
        ? await loadAttemptMark(checkId, currentUser.id)
        : null;
      return response(
        {
          error: "This check has already been answered.",
          attempt: existing,
        },
        409
      );
    }
    if (error instanceof CheckNotFoundError) {
      return response(NOT_FOUND, 404);
    }
    if (error instanceof RewriteGradingFailedError) {
      // An external model-call failure, not a bad client input — surfaced
      // distinctly from the 400s above so the client can offer a retry
      // rather than showing a field-level validation message.
      return response(
        { error: "Grading is temporarily unavailable. Please try again." },
        502
      );
    }
    if (error instanceof Error) {
      // 21-11's gradeDeterministic/gradeFillInBlank/etc. THROW plain Errors
      // on an unanswerable submission (out-of-range index, wrong blank
      // count) rather than marking it wrong — that must surface as a 400,
      // not a 500, since it is a malformed request, not a server fault.
      return response({ error: error.message }, 400);
    }
    console.error("Knowledge check submission failed:", error);
    return response({ error: "Unable to grade this submission." }, 500);
  }
}
