import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { COMPETENCIES, type CompetencyKey } from "@/lib/mastery/competencies";
import { readContributions } from "@/lib/mastery/ledger";
import { computeMastery } from "@/lib/mastery/compute";
import {
  createPath,
  readPathForStudyPlan,
  markStepComplete,
  PathAlreadyExistsError,
  type PathStepInput,
  type PathStepKind,
  type PathWithSteps,
} from "@/lib/study-plan/path";
import {
  selectPathSteps,
  nextStepFor,
  reasonForDegradedCheckToDrill,
  PLACEHOLDER_KNOWLEDGE_CHECK_ID,
} from "@/lib/study-plan/next-step";
import { loadGenerationSources } from "@/lib/study-plan/checks/sources";
import { generateChecksForCompetency } from "@/lib/study-plan/checks/generate";
import { readCoachedSession } from "@/lib/study-plan/coached/instance";
import { coachedEvidenceFromReports } from "@/lib/study-plan/coached/evidence";
import {
  selectCoachedMomentsFromReports,
  NoQualifyingMomentError,
} from "@/lib/study-plan/coached/moment-selection";
import {
  planEvidenceFromReports,
  priorityThemesFromContent,
  themeMatchesFromPlan,
} from "@/lib/study-plan/plan-targets";
import {
  buildDrillSessionContexts,
  generateDrillBriefs,
  type DrillRequest,
} from "@/lib/study-plan/drill/brief";
import { getEngineType } from "@/lib/engine/registry";
import { asInputSnapshot } from "@/lib/report/snapshot";
import {
  createVoiceDrillsForSteps,
  readDrillSummaries,
  readLinkedReportIds,
  type DrillSummary,
} from "@/lib/study-plan/drill/repository";
import { resolveProveIt } from "@/lib/study-plan/prove-it";
import { ENGINE_TYPES } from "@/lib/engine/registry";
import { SHARED_RUBRIC_DIMENSION_KEYS } from "@/lib/engine/types";

export const runtime = "nodejs";
// Raised like the existing generate route: this POST makes several model
// calls (coached qualification per target, one check per KNOWLEDGE_CHECK
// step, one batched drill-brief call), run concurrently where independent.
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "Study plan not found" };

/**
 * The step-count CAP passed to selectPathSteps (Phase 23: desiredCount is a
 * cap, clamped into the 5-10 bound locked by 21-CONTEXT.md). With three fully
 * evidenced targets the learn -> drill -> rework blocks plus the prove-it
 * step use all ten; thinner evidence produces a shorter path.
 */
const DEFAULT_DESIRED_STEP_COUNT = 10;

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

// ---------------------------------------------------------------------------
// Practice-entry derivation for UNAIDED_SESSION steps that are not prove-it
// ---------------------------------------------------------------------------

/**
 * A competency has no single owning interaction type (its `dimensionKeys`
 * span several types, by design). This derives ONE representative type
 * deterministically: the first ENGINE_TYPES entry whose own
 * `extraRubricDimensions` claims one of this competency's NON-SHARED
 * dimension keys. Used only for an UNAIDED_SESSION that is NOT the path's
 * final prove-it step (pre-Phase-23 degraded steps), and as the fallback
 * when a prove-it source cannot be resolved.
 */
function practiceSlugForCompetency(competencyKey: CompetencyKey): string | null {
  const competency = COMPETENCIES.find((c) => c.key === competencyKey);
  if (!competency) return null;

  const sharedKeys: readonly string[] = SHARED_RUBRIC_DIMENSION_KEYS;
  const nonSharedKeys = competency.dimensionKeys.filter((k) => !sharedKeys.includes(k));
  if (nonSharedKeys.length === 0) return null;

  for (const type of ENGINE_TYPES) {
    const claims = type.extraRubricDimensions.some((dim) => nonSharedKeys.includes(dim.key));
    if (claims) return type.slug;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET — read the path, resolving each step's artifact for display
// ---------------------------------------------------------------------------

export interface PathStepDTO {
  id: string;
  position: number;
  kind: PathStepKind;
  competencyKey: CompetencyKey;
  competencyLabel: string;
  /** STORED verbatim — never recomputed here. */
  selectionReason: string;
  status: string;
  completedAt: string | null;
  knowledgeCheckId: string | null;
  coachedSessionId: string | null;
  /** UNAIDED_SESSION's destination type slug. For the final prove-it step it
   * is the plan's source practice type; otherwise derived from the
   * competency. Null for every other kind. */
  practiceSlug: string | null;
  /** KNOWLEDGE_CHECK artifact for display — never the answer key. */
  check: { format: string; prompt: string; hasAttempt: boolean } | null;
  /** CoachedSession's derived phase; null for other kinds. */
  coachedPhase: "NOT_STARTED" | "REPLAY" | "FRESH" | "COMPLETE" | null;
  /** VOICE_DRILL: brief/attempt counts only — never a score. */
  drill: DrillSummary | null;
  /** Final UNAIDED_SESSION only: the pre-filled practice href and its brief. */
  proveIt: { href: string; brief: string; typeLabel: string; linked: boolean } | null;
}

export interface PathDTO {
  id: string;
  generatedAt: string;
  steps: PathStepDTO[];
  nextStep: { stepId: string; reason: string } | null;
}

function labelFor(key: CompetencyKey): string {
  return COMPETENCIES.find((c) => c.key === key)?.label ?? key;
}

/**
 * Builds the GET DTO and closes two completion gaps on read, both through
 * markStepComplete (so the state-dependent validation still runs):
 *   - a PENDING KNOWLEDGE_CHECK step whose check has been answered;
 *   - a prove-it UNAIDED_SESSION step whose linked live-session report is
 *     READY (Phase 23). Graded by the normal live pipeline; this only marks
 *     the step.
 */
export async function buildPathDTO(userId: string, path: PathWithSteps): Promise<PathDTO> {
  const knowledgeCheckIds = path.steps
    .map((s) => s.knowledgeCheckId)
    .filter((id): id is string => typeof id === "string" && id !== PLACEHOLDER_KNOWLEDGE_CHECK_ID);
  const coachedSessionIds = path.steps
    .map((s) => s.coachedSessionId)
    .filter((id): id is string => typeof id === "string");

  const checkRows = knowledgeCheckIds.length
    ? await prisma.knowledgeCheck.findMany({
        where: { id: { in: knowledgeCheckIds }, userId },
        // Explicit select, never the answer-key column — the narrow DTO guarantee.
        select: { id: true, format: true, prompt: true },
      })
    : [];
  const checkById = new Map(checkRows.map((c) => [c.id, c]));

  const attemptRows = knowledgeCheckIds.length
    ? await prisma.knowledgeCheckAttempt.findMany({
        where: { knowledgeCheckId: { in: knowledgeCheckIds }, userId },
        select: { knowledgeCheckId: true },
      })
    : [];
  const hasAttemptForCheck = new Set(attemptRows.map((a) => a.knowledgeCheckId));

  for (const step of path.steps) {
    if (
      step.kind === "KNOWLEDGE_CHECK" &&
      step.status === "PENDING" &&
      step.knowledgeCheckId &&
      hasAttemptForCheck.has(step.knowledgeCheckId)
    ) {
      await markStepComplete(userId, step.id);
      step.status = "COMPLETE";
      step.completedAt = new Date();
    }
  }

  // Phase 23 reads — tolerant: an unmigrated database yields empty maps.
  const [linkedReportIds, drillSummaries] = await Promise.all([
    readLinkedReportIds(path.id),
    readDrillSummaries(
      userId,
      path.steps.filter((s) => s.kind === "VOICE_DRILL").map((s) => s.id),
    ),
  ]);

  if (linkedReportIds.size > 0) {
    const linkedReports = await prisma.interactionReport.findMany({
      where: { id: { in: Array.from(linkedReportIds.values()) }, userId },
      select: { id: true, status: true },
    });
    const readyIds = new Set(linkedReports.filter((r) => r.status === "READY").map((r) => r.id));
    for (const step of path.steps) {
      const linked = linkedReportIds.get(step.id);
      if (step.kind === "UNAIDED_SESSION" && step.status !== "COMPLETE" && linked && readyIds.has(linked)) {
        await markStepComplete(userId, step.id);
        step.status = "COMPLETE";
        step.completedAt = new Date();
      }
    }
  }

  const finalStep = path.steps.reduce<PathWithSteps["steps"][number] | null>(
    (max, s) => (!max || s.position > max.position ? s : max),
    null,
  );
  const proveIt =
    finalStep && finalStep.kind === "UNAIDED_SESSION"
      ? await resolveProveIt(userId, finalStep.id).catch((error) => {
          console.warn("Prove-it resolution failed:", error instanceof Error ? error.name : "UnknownError");
          return null;
        })
      : null;

  const coachedPhaseById = new Map<string, "REPLAY" | "FRESH" | "COMPLETE">();
  for (const id of coachedSessionIds) {
    const session = await readCoachedSession(userId, id);
    if (session) coachedPhaseById.set(id, session.phase);
  }

  const steps: PathStepDTO[] = path.steps.map((step) => {
    const competencyKey = step.competencyKey as CompetencyKey;
    const kind = step.kind as PathStepKind;

    const check =
      kind === "KNOWLEDGE_CHECK" && step.knowledgeCheckId
        ? (() => {
            const row = checkById.get(step.knowledgeCheckId as string);
            if (!row) return null;
            return {
              format: row.format,
              prompt: row.prompt,
              hasAttempt: hasAttemptForCheck.has(row.id),
            };
          })()
        : null;

    const coachedPhase =
      kind === "COACHED_SESSION"
        ? step.coachedSessionId
          ? coachedPhaseById.get(step.coachedSessionId) ?? "NOT_STARTED"
          : "NOT_STARTED"
        : null;

    const isProveIt = proveIt !== null && proveIt.stepId === step.id;

    return {
      id: step.id,
      position: step.position,
      kind,
      competencyKey,
      competencyLabel: labelFor(competencyKey),
      selectionReason: step.selectionReason,
      status: step.status,
      completedAt: step.completedAt ? step.completedAt.toISOString() : null,
      knowledgeCheckId: step.knowledgeCheckId,
      coachedSessionId: step.coachedSessionId,
      practiceSlug:
        kind === "UNAIDED_SESSION"
          ? isProveIt
            ? proveIt!.typeSlug
            : practiceSlugForCompetency(competencyKey)
          : null,
      check,
      coachedPhase,
      drill:
        kind === "VOICE_DRILL"
          ? drillSummaries.get(step.id) ?? { hasBrief: false, attemptCount: 0, completedAttemptCount: 0 }
          : null,
      proveIt: isProveIt
        ? {
            href: proveIt!.href,
            brief: proveIt!.brief,
            typeLabel: proveIt!.typeLabel,
            linked: linkedReportIds.has(step.id),
          }
        : null,
    };
  });

  const next = nextStepFor(path);

  return {
    id: path.id,
    generatedAt: path.generatedAt.toISOString(),
    steps,
    nextStep: next ? { stepId: next.step.id, reason: next.reason } : null,
  };
}

/**
 * A plan without a path is the normal state for EVERY pre-Phase-21 plan
 * (REQ-120's backward-compatibility case) — 200 with `{ path: null }`, never
 * 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { planId } = await params;

    const path = await readPathForStudyPlan(currentUser.id, planId);
    if (!path) return response({ path: null }, 200);

    const dto = await buildPathDTO(currentUser.id, path);
    return response({ path: dto }, 200);
  } catch (error) {
    console.error("Study-plan path fetch failed:", error);
    return response({ error: "Unable to load this plan's path." }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST — generate the path for this plan
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const currentUser = await authenticate(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { planId } = await params;
    if (typeof planId !== "string" || !UUID_REGEX.test(planId)) {
      return response(NOT_FOUND, 404);
    }

    const studyPlan = await prisma.studyPlan.findFirst({
      where: { id: planId, userId: currentUser.id },
      select: { id: true, sourceReportIds: true, content: true },
    });
    if (!studyPlan) return response(NOT_FOUND, 404);

    // 1. MASTERY — deterministic arithmetic, no model call. Global gaps only
    //    fill slots the plan's own signals leave (23-CONTEXT.md).
    const contributions = await readContributions(currentUser.id);
    const mastery = computeMastery(contributions, new Date());

    // 2. SOURCE ASSEMBLY — delegated entirely to loadGenerationSources. The
    //    reportIds are the SPECIFIC reports this plan was generated from.
    const rawReportIds = studyPlan.sourceReportIds;
    const reportIds = Array.isArray(rawReportIds)
      ? rawReportIds.filter((id): id is string => typeof id === "string")
      : [];

    const [sources, sourceReports] = await Promise.all([
      loadGenerationSources(currentUser.id, reportIds),
      reportIds.length
        ? prisma.interactionReport.findMany({
            where: { id: { in: reportIds }, userId: currentUser.id, status: "READY" },
            select: { id: true, userId: true, scores: true, createdAt: true, typeSlug: true, inputSnapshot: true },
          })
        : Promise.resolve([]),
    ]);

    // 3. PRE-CHECK: a competency absent from momentsByCompetency cannot host
    //    a coached step; its knowledge check is generated in concept mode.
    const unavailableCompetencies: CompetencyKey[] = COMPETENCIES.map((c) => c.key).filter(
      (key) => !sources.momentsByCompetency.has(key),
    );

    // 4. PLAN-OWN SIGNALS (pure, deterministic): scored competencies from the
    //    plan's own reports, and its priority themes.
    const planEvidence = planEvidenceFromReports(sourceReports);
    const themeMatches = themeMatchesFromPlan(priorityThemesFromContent(studyPlan.content));

    // 5. COACHED PLACEMENT GUARD (22-07): a coached step is placed only where
    //    entry will find a qualifying turn — the SAME selector entry uses.
    //    Phase 23: checked for every TARGET (not just the first), in parallel.
    const evidence = coachedEvidenceFromReports(sourceReports);
    const interimCoachedEvidence = new Map(
      Array.from(evidence.entries()).filter(([key]) => sources.momentsByCompetency.has(key)),
    );
    const firstPass = selectPathSteps({
      mastery,
      desiredCount: DEFAULT_DESIRED_STEP_COUNT,
      unavailableCompetencies,
      coachedEvidence: interimCoachedEvidence,
      planEvidence,
      themeMatches,
    });
    const qualification = await Promise.all(
      firstPass.targets
        .filter((key) => interimCoachedEvidence.has(key))
        .map(async (key) => {
          try {
            await selectCoachedMomentsFromReports({ userId: currentUser.id, reportIds, competencyKey: key });
            return key;
          } catch (error) {
            if (!(error instanceof NoQualifyingMomentError)) {
              console.warn(
                `Study-plan path ${planId}: coached qualification check failed for ${key}:`,
                error instanceof Error ? error.name : "UnknownError",
              );
            }
            return null;
          }
        }),
    );
    const coachedEvidence = new Map<CompetencyKey, { lowestPercent: number }>();
    for (const key of qualification) {
      if (key) coachedEvidence.set(key, interimCoachedEvidence.get(key)!);
    }

    // 6. Final pure selection with only the qualified coached competencies.
    const selection = selectPathSteps({
      mastery,
      desiredCount: DEFAULT_DESIRED_STEP_COUNT,
      unavailableCompetencies,
      coachedEvidence,
      planEvidence,
      themeMatches,
    });
    if (selection.coachedOmitted) {
      console.warn(`Study-plan path ${planId}: no target qualified for a coached step`);
    }

    // 7. ATTACH REAL CHECK IDS (hazard closure). Each KNOWLEDGE_CHECK step's
    //    placeholder is replaced with a real KnowledgeCheck.id, or the step
    //    degrades to a VOICE_DRILL (Phase 23: the path keeps exactly ONE
    //    UNAIDED_SESSION, the final prove-it step). One check per block, so
    //    the check steps target distinct competencies and run concurrently.
    const degradedSteps: Array<{ position: number; competencyKey: CompetencyKey }> = [];
    const generated = await Promise.all(
      selection.steps.map(async (step): Promise<PathStepInput> => {
        if (step.kind !== "KNOWLEDGE_CHECK") return step;
        const moments = sources.momentsByCompetency.get(step.competencyKey) ?? [];
        let createdCheckId: string | null = null;
        // With moments: the student-grounded check (verbatim gate intact).
        // Without: a CONCEPT check that quotes nobody (generate.ts concept
        // mode discards any quote). Both are graded by the existing grader.
        const outcome = await generateChecksForCompetency({
          userId: currentUser.id,
          studyPlanId: planId,
          competencyKey: step.competencyKey,
          selfNames: sources.selfNames,
          moments,
          // Single-user assembly: every moment belongs to the requester.
          momentOwnerUserIds: moments.map(() => currentUser.id),
          transcriptsByReportId: sources.transcriptsByReportId,
          desiredCount: 1,
          concept: moments.length === 0,
        });
        if (outcome.ok && outcome.created > 0) {
          const created = await prisma.knowledgeCheck.findFirst({
            where: { studyPlanId: planId, userId: currentUser.id, competencyKey: step.competencyKey },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          });
          if (created) createdCheckId = created.id;
        }
        if (createdCheckId) return { ...step, knowledgeCheckId: createdCheckId };
        degradedSteps.push({ position: step.position, competencyKey: step.competencyKey });
        return {
          ...step,
          kind: "VOICE_DRILL",
          selectionReason: reasonForDegradedCheckToDrill(step.selectionReason),
          knowledgeCheckId: null,
          coachedSessionId: null,
        };
      }),
    );
    const finalSteps = generated.sort((a, b) => a.position - b.position);
    degradedSteps.sort((a, b) => a.position - b.position);

    // HAZARD GUARD (second line): never persist the placeholder.
    const leaked = finalSteps.find((s) => s.knowledgeCheckId === PLACEHOLDER_KNOWLEDGE_CHECK_ID);
    if (leaked) {
      throw new Error(
        `Refusing to persist path: step ${leaked.position} still carries PLACEHOLDER_KNOWLEDGE_CHECK_ID`,
      );
    }

    // 8. VOICE_DRILL BRIEFS — template for every drill, one gated model call
    //    that may tailor them (lib/study-plan/drill/brief.ts). Never fails
    //    generation: a model failure leaves the templates.
    const drillCountByCompetency = new Map<CompetencyKey, number>();
    const drillRequests: DrillRequest[] = finalSteps
      .filter((s) => s.kind === "VOICE_DRILL")
      .map((s) => {
        const variant = drillCountByCompetency.get(s.competencyKey) ?? 0;
        drillCountByCompetency.set(s.competencyKey, variant + 1);
        return {
          position: s.position,
          competencyKey: s.competencyKey,
          variant,
          theme: themeMatches.get(s.competencyKey)?.theme ?? null,
        };
      });
    // D4: what the source sessions say about the student (type, role/industry,
    // questions actually asked) so every drill prompt is specific to them.
    const sessionContexts = buildDrillSessionContexts(
      sourceReports.map((r) => {
        const snap = asInputSnapshot(r.inputSnapshot);
        const interview = snap && snap.kind === "interview" ? snap : null;
        return {
          id: r.id,
          typeName: getEngineType(r.typeSlug)?.name ?? "interview",
          roleTitle: interview?.roleTitle ?? null,
          industry: interview?.industry ?? null,
        };
      }),
      sources.transcriptsByReportId,
      sources.selfNames,
    );
    const drillBriefs = await generateDrillBriefs({
      userId: currentUser.id,
      requests: drillRequests,
      sessionContexts,
      momentsByCompetency: sources.momentsByCompetency,
      transcriptsByReportId: sources.transcriptsByReportId,
      selfNames: sources.selfNames,
      callModel: process.env.OPENAI_API_KEY ? undefined : null,
    });
    if (drillBriefs.discarded.length > 0) {
      console.warn(
        `Study-plan path ${planId}: ${drillBriefs.discarded.length} drill brief candidate(s) discarded; templates kept`,
      );
    }

    // 9. COACHED_SESSION steps are created PENDING with coachedSessionId null
    //    (21-08 amendment); the coached entry route is the sole creator.

    try {
      const path = await createPath({
        userId: currentUser.id,
        studyPlanId: planId,
        steps: finalSteps,
        selectionSnapshot: selection.ranking,
      });

      // Drill rows hang off the persisted steps. Not in createPath's
      // transaction: a failure here is logged, and the drill GET rebuilds a
      // missing brief from the deterministic template on first open.
      try {
        await createVoiceDrillsForSteps(
          currentUser.id,
          path.steps
            .filter((s) => s.kind === "VOICE_DRILL" && drillBriefs.briefs.has(s.position))
            .map((s) => ({ pathStepId: s.id, brief: drillBriefs.briefs.get(s.position)! })),
        );
      } catch (error) {
        console.error(
          `Study-plan path ${planId}: voice drill briefs not stored (lazy template fallback applies):`,
          error instanceof Error ? error.name : "UnknownError",
        );
      }

      const dto = await buildPathDTO(currentUser.id, path);
      return response({ path: dto, degradedSteps }, 201);
    } catch (error) {
      if (error instanceof PathAlreadyExistsError) {
        // Do NOT regenerate or replace — a new path comes from a new study
        // plan, never from re-posting to an existing one.
        return response({ error: error.message, pathId: error.existingPathId }, 409);
      }
      throw error;
    }
  } catch (error) {
    console.error("Study-plan path generation failed:", error);
    return response({ error: "Unable to generate a path for this study plan." }, 500);
  }
}
