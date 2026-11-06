import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { asInputSnapshot } from "@/lib/report/snapshot";
import {
  appendServerVisibleTurns,
  emptyTechnicalEvidence,
  parseStoredTechnicalEvidence,
} from "@/lib/technical-interview/evidence";
import { buildTechnicalOpening } from "@/lib/technical-interview/opening";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The interviewer's spoken brief for a coding session.
 *
 * Server-authored and idempotent: the text is composed from the persisted
 * learner-visible snapshot and recorded as the first assistant turn. A reload,
 * a reconnecting avatar, or a double-mounted effect replays the same words
 * instead of appending a second greeting, because the transcript is the
 * server's own evidence (the browser may never author a visible turn).
 *
 * It is deliberately static rather than model-generated: the opening must
 * never paraphrase the problem into a hint, and a fixed brief cannot drift
 * into one. The model takes over from the candidate's first reply onward.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => null);
    const reportId =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).reportId
        : null;
    if (typeof reportId !== "string" || !reportId) {
      return response({ error: "Report not found" }, 404);
    }

    // Owner-scoped: a report belonging to someone else is indistinguishable
    // from a missing one.
    const report = await prisma.interactionReport.findFirst({
      where: {
        id: reportId,
        userId: currentUser.id,
        typeSlug: "technical-coding",
        status: "IN_PROGRESS",
      },
      select: { id: true, inputSnapshot: true, technicalEvidence: true },
    });
    const snapshot = report ? asInputSnapshot(report.inputSnapshot) : null;
    if (!report || snapshot?.kind !== "technical-coding") {
      return response({ error: "Technical assignment is unavailable." }, 409);
    }

    const prior =
      parseStoredTechnicalEvidence(report.technicalEvidence) ??
      emptyTechnicalEvidence();
    const existing = prior.visibleTurns[0];

    // Replay the recorded greeting rather than adding another one.
    if (existing?.role === "assistant") {
      return response({ opening: existing.content, replayed: true }, 200);
    }
    // The candidate has already spoken; a late greeting would be out of order.
    if (prior.visibleTurns.length > 0) {
      return response({ opening: null, replayed: true }, 200);
    }

    const opening = buildTechnicalOpening(snapshot.assignment);
    await prisma.interactionReport.update({
      where: { id: report.id },
      data: {
        technicalEvidence: appendServerVisibleTurns(prior, [
          { role: "assistant", content: opening },
        ]) as unknown as Prisma.InputJsonValue,
      },
    });

    return response({ opening, replayed: false }, 200);
  } catch (error) {
    console.error("Technical opening turn failed:", error);
    return response({ error: "Unable to start the interview." }, 500);
  }
}
