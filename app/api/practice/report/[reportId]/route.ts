/**
 * THE ONE report-GET endpoint for every interaction type (REQ-59).
 *
 * Returns the unified `ReportDTO` from `InteractionReport`. A report owned
 * by someone else is a 404, never a 403. Backfilled pre-Phase-13 rows load
 * through this path with scores, metrics, structured body and snapshot
 * intact (REQ-65/66).
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getReportForUser } from "@/lib/report/handlers";
import { prisma } from "@/lib/prisma";
import { MAX_TECHNICAL_HINTS } from "@/lib/technical-interview/types";

export const runtime = "nodejs";


function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Prisma's code for "the column this query selected does not exist in the
 * database" — i.e. the deployed schema is behind the deployed code.
 */
const PRISMA_MISSING_COLUMN = "P2022";
/** Postgres: relation (table) does not exist. */
const PG_UNDEFINED_TABLE = "42P01";

/**
 * Classifies a read failure into a coarse, non-sensitive reason code.
 *
 * Deliberately derived from error CODES only. Prisma/Postgres error
 * messages name tables, columns, hosts and sometimes parameter values, so
 * neither the message nor the raw code is ever put in the response body —
 * only this fixed vocabulary. Full detail goes to the server log.
 */
function classifyReadFailure(error: unknown): "SCHEMA_OUT_OF_DATE" | "UNAVAILABLE" {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === PRISMA_MISSING_COLUMN) return "SCHEMA_OUT_OF_DATE";
  const text = error instanceof Error ? error.message : "";
  if (text.includes(PG_UNDEFINED_TABLE)) return "SCHEMA_OUT_OF_DATE";
  return "UNAVAILABLE";
}

/**
 * Furthest hint stage reached for the workspace indicator.
 *
 * This is a DISPLAY read, not the security boundary. The authoritative ledger
 * lives in `app/api/interaction/chat/route.ts`. A candidate whose checkpoint
 * already shows an early-stage idea may receive Hint 2 or 3 first, so a row
 * count would incorrectly invite them to request redundant, unavailable tiers.
 */
async function technicalHintProgress(reportId: string): Promise<number> {
  try {
    const result = await prisma.technicalInterviewHint.aggregate({
      where: { reportId },
      _max: { tier: true },
    });
    return Math.max(0, Math.min(MAX_TECHNICAL_HINTS, result._max.tier ?? 0));
  } catch (error) {
    console.error("Technical hint ledger progress failed; reporting 0 used:", {
      reportId,
      reason: classifyReadFailure(error),
      error,
    });
    return 0;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { reportId } = await params;
    const result = await getReportForUser(currentUser.id, reportId);

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    const technicalHintCount =
      result.report.typeSlug === "technical-coding"
        ? await technicalHintProgress(reportId)
        : undefined;
    return response(
      {
        report: result.report,
        ...(technicalHintCount !== undefined ? { technicalHintCount } : {}),
      },
      200,
    );
  } catch (error) {
    // Full detail (message, table/column names, driver code) stays in the
    // server log. The body carries only a fixed reason code so an operator
    // can tell "deployed schema is behind deployed code" apart from a
    // generic outage without exposing DB internals to the client.
    const reason = classifyReadFailure(error);
    console.error("Practice report fetch failed:", { reason, error });
    return response(
      {
        error:
          reason === "SCHEMA_OUT_OF_DATE"
            ? "This report is temporarily unavailable while the service finishes updating. Please try again shortly."
            : "Unable to load the report.",
        reason,
      },
      500,
    );
  }
}
