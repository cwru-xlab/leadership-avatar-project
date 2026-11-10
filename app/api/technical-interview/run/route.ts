import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  buildPublicHarness,
  toPublicExecutionResult,
  validateTechnicalExecutionRequest,
} from "@/lib/technical-interview/execution";
import { resolveTechnicalAssignment } from "@/lib/technical-interview/assignments.server";
import { getPythonSandbox } from "@/lib/technical-interview/sandbox";
import { prisma } from "@/lib/prisma";
import { asInputSnapshot } from "@/lib/report/snapshot";

export const runtime = "nodejs";
export const maxDuration = 15;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Runs only server-reconstructed, requested public tests for an active coding report. */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => null);
    const validated = validateTechnicalExecutionRequest(body);
    if (!validated.ok) return response({ error: validated.error }, 400);

    const reportId = body && typeof body === "object" ? (body as Record<string, unknown>).reportId : null;
    if (typeof reportId !== "string" || !reportId) {
      return response({ error: "Report not found" }, 404);
    }

    // Owner-scoped lookup intentionally makes a non-owner report indistinguishable
    // from a missing one.
    const report = await prisma.interactionReport.findFirst({
      where: { id: reportId, userId: currentUser.id },
      select: { id: true, typeSlug: true, status: true, inputSnapshot: true },
    });
    if (!report) return response({ error: "Report not found" }, 404);
    if (report.typeSlug !== "technical-coding") {
      return response({ error: "Report not found" }, 404);
    }
    if (report.status !== "IN_PROGRESS") {
      return response({ error: "This coding session has already been submitted." }, 409);
    }

    const snapshot = asInputSnapshot(report.inputSnapshot);
    if (snapshot?.kind !== "technical-coding") {
      console.error("Technical run rejected: invalid report snapshot", { reportId: report.id });
      return response({ error: "Technical assignment is unavailable." }, 409);
    }

    const resolved = resolveTechnicalAssignment(snapshot.assignmentId, snapshot.assignmentVersion, snapshot.assignmentHash);
    if (!resolved) {
      console.error("Technical run rejected: assignment version mismatch", { reportId: report.id, assignmentId: snapshot.assignmentId });
      return response({ error: "Technical assignment is unavailable." }, 409);
    }

    const harness = buildPublicHarness(resolved.assignment, validated.value.requestedTestIds);
    if (!harness) return response({ error: "One or more visible tests are invalid." }, 400);

    const result = await getPythonSandbox().executePython({
      source: validated.value.source,
      harness,
      limits: resolved.assignment.executionLimits,
      correlationId: validated.value.idempotencyKey,
    });
    const safeResult = toPublicExecutionResult(result);

    if (safeResult.errorCategory === "unavailable") {
      return response(
        { error: "Code execution is not available yet. No code was run.", execution: safeResult },
        503,
      );
    }

    return response({ execution: safeResult }, 200);
  } catch (error) {
    console.error("Technical visible-test run failed:", error);
    return response({ error: "Unable to run visible tests." }, 500);
  }
}
