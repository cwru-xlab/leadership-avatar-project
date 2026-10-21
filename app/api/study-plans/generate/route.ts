import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  createStudyPlanDraftToken,
  hasStudyPlanDraftSecret,
} from "@/lib/study-plan/draft-token";
import { asScoreMap } from "@/lib/report/snapshot";
import {
  extractBehavioralSignals,
  generateStudyPlan,
  type AnonymousBehavioralReport,
} from "@/lib/study-plan/generate";

/** Interview practice typeSlugs — study plans synthesize interview feedback only. */
const INTERVIEW_TYPE_SLUGS = [
  "general",
  "technical",
  "consulting",
  "early-career",
] as const;

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ANONYMOUS_SOURCE_BYTES = 60_000;
const MAX_SOURCE_REPORTS = 50;
/**
 * Per-plan cap on how many completed interviews a single study plan is
 * synthesized from. Exported so the picker UI (`app/reports/page.tsx`) and
 * the verifier (`scripts/verify-study-plan-selection.ts`) both read one
 * number. Distinct from `MAX_SOURCE_REPORTS` above: that guard refuses a
 * pathological history outright, while this cap is what keeps a normal
 * request from ever reaching that guard in the first place.
 */
export const MAX_REPORTS_PER_PLAN = 10;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Parses an optional `{ reportIds?: string[] }` body defensively. A missing
 * body, invalid JSON, a non-array `reportIds`, or a `reportIds` containing a
 * non-string all degrade to "no selection" — never a thrown error.
 */
async function parseSelectedReportIds(request: NextRequest): Promise<string[] | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const reportIds = (body as { reportIds?: unknown }).reportIds;
  if (!Array.isArray(reportIds) || reportIds.length === 0) return null;
  if (!reportIds.every((id) => typeof id === "string" && id.length > 0)) return null;
  return reportIds;
}

/**
 * Generates an unsaved study-plan preview. Raw reports never leave this server:
 * the model receives only anonymous report ordinals, two score aggregates, and
 * locally extracted closed-vocabulary rubric label/rating strings.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    // A preview cannot be saved without this secret, so reject a broken deploy
    // before fetching reports or spending an OpenAI completion.
    if (!hasStudyPlanDraftSecret()) {
      console.error("Study-plan previews are not configured");
      return response({ error: "Study-plan previews are not configured." }, 503);
    }

    const selectedReportIds = await parseSelectedReportIds(request);

    if (selectedReportIds && selectedReportIds.length > MAX_REPORTS_PER_PLAN) {
      return response(
        {
          error: `You can select at most ${MAX_REPORTS_PER_PLAN} interviews per study plan.`,
        },
        400
      );
    }

    // Count how many reports exist at all, so the response can honestly
    // state how many were considered out of how many exist — the same
    // honesty MAX_SOURCE_REPORTS's 413 below is protecting.
    const eligibleReportCount = await prisma.interactionReport.count({
      where: {
        userId: currentUser.id,
        status: "READY",
        reportMarkdown: { not: null },
        typeSlug: { in: [...INTERVIEW_TYPE_SLUGS] },
      },
    });

    let eligibleRows: Array<{ id: string; scores: unknown; reportMarkdown: string | null }>;

    if (selectedReportIds) {
      // OWNERSHIP IN THE WHERE CLAUSE, never a post-filter: `userId:
      // currentUser.id` is what makes it impossible for a foreign report to
      // enter the result, even when its id is supplied directly.
      const rows = await prisma.interactionReport.findMany({
        where: {
          id: { in: selectedReportIds },
          userId: currentUser.id,
          status: "READY",
          reportMarkdown: { not: null },
          typeSlug: { in: [...INTERVIEW_TYPE_SLUGS] },
        },
        orderBy: { completedAt: "asc" },
        select: {
          id: true,
          scores: true,
          reportMarkdown: true,
        },
      });

      if (rows.length < selectedReportIds.length) {
        const ineligibleCount = selectedReportIds.length - rows.length;
        return response(
          {
            error: `${ineligibleCount} of the selected interview${
              ineligibleCount === 1 ? "" : "s"
            } ${ineligibleCount === 1 ? "is" : "are"} not eligible for a study plan.`,
          },
          400
        );
      }

      eligibleRows = rows;
    } else {
      // Default path: no explicit selection. This is the ONLY path where
      // MAX_SOURCE_REPORTS's guard still applies — a caller that supplies a
      // selection has already capped the set at MAX_REPORTS_PER_PLAN above,
      // so a large total history (like alice.johnson@case.edu's 56 reports)
      // never reaches this guard once a selection is made. A direct API
      // call with no body still hits it, exactly as before.
      if (eligibleReportCount > MAX_SOURCE_REPORTS) {
        return response(
          { error: "Your completed feedback history is too large to synthesize safely." },
          413
        );
      }

      // Most recent MAX_REPORTS_PER_PLAN, newest first in the query so
      // `take` keeps the right ones, then reordered oldest-first below to
      // match the existing ordinal assignment.
      const rows = await prisma.interactionReport.findMany({
        where: {
          userId: currentUser.id,
          status: "READY",
          reportMarkdown: { not: null },
          typeSlug: { in: [...INTERVIEW_TYPE_SLUGS] },
        },
        orderBy: { completedAt: "desc" },
        take: MAX_REPORTS_PER_PLAN,
        select: {
          id: true,
          scores: true,
          reportMarkdown: true,
        },
      });
      eligibleRows = rows.reverse();
    }

    if (eligibleRows.length === 0) {
      return response(
        {
          code: "NO_COMPLETED_REPORTS",
          error: "Complete an interview with feedback before generating a study plan.",
        },
        409
      );
    }

    const reports: AnonymousBehavioralReport[] = eligibleRows.map((row, index) => {
      const scores = asScoreMap(row.scores);
      return {
        reportNumber: index + 1,
        contentScore: scores?.content ?? null,
        behavioralScore: scores?.behavioral ?? null,
        behavioralFeedbackSignals: extractBehavioralSignals(row),
      };
    });

    // Refuse to silently omit older reports. The model source contains only the
    // anonymous data above, but every eligible report is still represented.
    if (new TextEncoder().encode(JSON.stringify(reports)).byteLength > MAX_ANONYMOUS_SOURCE_BYTES) {
      return response(
        { error: "Your completed feedback is too large to synthesize safely." },
        413
      );
    }

    const result = await generateStudyPlan(reports);
    if (!result.ok) {
      console.error("Study-plan generation failed", {
        model: result.model,
        reportCount: reports.length,
        reason: result.reason,
      });
      return response({ error: "Unable to generate your study plan. Please try again." }, 502);
    }

    let draftToken: string;
    try {
      draftToken = await createStudyPlanDraftToken({
        userId: currentUser.id,
        content: result.content,
        sourceReportIds: eligibleRows.map((row) => row.id),
        sourceReportCount: eligibleRows.length,
        generationModel: result.model,
      });
    } catch (error) {
      console.error("Study-plan draft creation failed:", error);
      return response({ error: "Study-plan previews are not configured." }, 503);
    }

    return response(
      {
        content: result.content,
        sourceReportCount: eligibleRows.length,
        // Honest accounting, same spirit as the 413 this plan keeps: a
        // student is never told "every report was considered" when it
        // wasn't. `consideredReportCount` is how many actually fed this
        // plan; `eligibleReportCount` is how many exist in total.
        consideredReportCount: eligibleRows.length,
        eligibleReportCount,
        draftToken,
      },
      200
    );
  } catch (error) {
    console.error("Study-plan generation request failed:", error);
    return response({ error: "Unable to prepare your study plan." }, 500);
  }
}
