/**
 * The pre-filled prove-it step (lib/study-plan/prove-it.ts).
 *
 * GET  -> `{ proveIt: ProveItInfo }`: the practice type, the wizard prefill
 *         and the brief for the path's FINAL UNAIDED_SESSION step. 404 for any
 *         other step (wrong kind, not final, not owned) — indistinguishable on
 *         purpose.
 * POST -> body `{ reportId }`: links the live session the student launched
 *         from this step. The report must be the student's own, of the
 *         prove-it type, and started after the path was generated. The step
 *         goes IN_PROGRESS; the path GET completes it once the report is
 *         READY. Practice routes are not involved: this is the only write.
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { linkRejection, resolveProveIt } from "@/lib/study-plan/prove-it";
import { setLinkedReport } from "@/lib/study-plan/drill/repository";

export const runtime = "nodejs";

const NOT_FOUND = { error: "Prove-it step not found" };

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authenticate(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);
    const { stepId } = await params;
    const proveIt = await resolveProveIt(currentUser.id, stepId);
    if (!proveIt) return response(NOT_FOUND, 404);
    return response({ proveIt }, 200);
  } catch (error) {
    console.error("Prove-it fetch failed:", error);
    return response({ error: "Unable to load this step." }, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);
    const { stepId } = await params;
    const body = (await request.json().catch(() => ({}))) as { reportId?: unknown };
    if (typeof body.reportId !== "string" || body.reportId.length > 64) {
      return response({ error: "reportId is required." }, 400);
    }

    const proveIt = await resolveProveIt(currentUser.id, stepId);
    if (!proveIt) return response(NOT_FOUND, 404);

    const [report, path] = await Promise.all([
      prisma.interactionReport.findFirst({
        where: { id: body.reportId, userId: currentUser.id },
        select: { typeSlug: true, createdAt: true, status: true },
      }),
      prisma.studyPlanPath.findFirst({
        where: { studyPlanId: proveIt.planId, userId: currentUser.id },
        select: { generatedAt: true },
      }),
    ]);
    if (!path) return response(NOT_FOUND, 404);

    const rejection = linkRejection({
      report,
      expectedTypeSlug: proveIt.typeSlug,
      pathGeneratedAt: path.generatedAt,
    });
    if (rejection) return response({ error: `Cannot link this session: ${rejection}.` }, 409);

    const linked = await setLinkedReport(currentUser.id, stepId, body.reportId);
    if (!linked) return response({ error: "This step is already complete." }, 409);
    return response({ linked: true }, 200);
  } catch (error) {
    console.error("Prove-it link failed:", error);
    return response({ error: "Unable to link this session." }, 500);
  }
}
