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
  reasonForDegradedCheck,
  PLACEHOLDER_KNOWLEDGE_CHECK_ID,
} from "@/lib/study-plan/next-step";
import { loadGenerationSources } from "@/lib/study-plan/checks/sources";
import { generateChecksForCompetency } from "@/lib/study-plan/checks/generate";
import { readCoachedSession } from "@/lib/study-plan/coached/instance";
import { loadCoachedEvidence } from "@/lib/study-plan/coached/evidence";
import {
  selectCoachedMomentsFromReports,
  NoQualifyingMomentError,
} from "@/lib/study-plan/coached/moment-selection";
import { ENGINE_TYPES } from "@/lib/engine/registry";
import { SHARED_RUBRIC_DIMENSION_KEYS } from "@/lib/engine/types";

export const runtime = "nodejs";
// Raised like the existing generate route: this POST makes several model
// calls (one generation round trip per KNOWLEDGE_CHECK step).
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "Study plan not found" };

/**
 * 21-CONTEXT.md locks the 5-10 bound as a product decision (see
 * lib/study-plan/path.ts's PATH_STEP_BOUNDS); this is just this route's own
 * default request size within that bound. selectPathSteps clamps it anyway,
 * so an out-of-range value here would never actually violate the bound.
 */
const DEFAULT_DESIRED_STEP_COUNT = 7;

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
// Practice-entry derivation for UNAIDED_SESSION steps
// ---------------------------------------------------------------------------

/**
 * A competency has no single owning interaction type (its `dimensionKeys`
 * span several types, by design — see lib/mastery/competencies.ts's own
 * COMPETENCIES comment). There is therefore no stored mapping to read. This
 * derives ONE representative type deterministically: the first ENGINE_TYPES
 * entry (fixed array order, never iteration-order-of-a-Set) whose own
 * `extraRubricDimensions` claims one of this competency's NON-SHARED
 * dimension keys. The four shared keys (visual/vocal/content/behavioral)
 * are deliberately excluded from the match — every type has them, so
 * matching on them would make the "first ENGINE_TYPES entry" always win
 * regardless of which competency is asked about.
 *
 * Pure, database-free, deterministic for a given COMPETENCIES/ENGINE_TYPES
 * snapshot. Returns null only if a competency's dimensionKeys are entirely
 * shared keys — not true for any competency in the current catalog, but
 * guarded rather than assumed.
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
  /** STORED verbatim — see readPathForStudyPlan's own doc comment. Never
   * recomputed here. */
  selectionReason: string;
  status: string;
  completedAt: string | null;
  knowledgeCheckId: string | null;
  coachedSessionId: string | null;
  /** UNAIDED_SESSION's destination type slug, derived — see
   * practiceSlugForCompetency above. Null for the other two kinds. */
  practiceSlug: string | null;
  /** KNOWLEDGE_CHECK artifact for display. Deliberately NOT the full
   * KnowledgeCheck row — no answer-key field, no payload (the card itself
   * fetches that through the keyless attempt route; this DTO only tells the
   * panel whether to show "answered" vs "pending"). */
  check: { format: string; prompt: string; hasAttempt: boolean } | null;
  /** CoachedSession's DERIVED phase (lib/study-plan/coached/instance.ts),
   * read via readCoachedSession — no S3 read, no fresh-session creation.
   * "NOT_STARTED" when the step has never been entered (coachedSessionId
   * still null). Null for the other two kinds. */
  coachedPhase: "NOT_STARTED" | "REPLAY" | "FRESH" | "COMPLETE" | null;
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
 * Builds the GET DTO. Also closes a gap 21-22's attempt route disclosed in
 * its own comment: that route deliberately never marks a KNOWLEDGE_CHECK
 * step COMPLETE once answered ("a second writer there would let a step
 * complete without the path's own invariants being re-checked") and names
 * "the path route" as where that write belongs. Without this, an answered
 * check step would stay PENDING forever and nextStepFor would never advance
 * past it. Re-checked on every GET, scoped to this one user's own path, and
 * done through markStepComplete (21-08) so the state-dependent validation
 * rule still runs at the transition.
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

  // Auto-complete: a PENDING KNOWLEDGE_CHECK step whose check has been
  // answered gets marked COMPLETE here, mutating the in-memory row so both
  // this DTO and nextStepFor (below) see the up-to-date status without a
  // second read.
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
      practiceSlug: kind === "UNAIDED_SESSION" ? practiceSlugForCompetency(competencyKey) : null,
      check,
      coachedPhase,
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
 * 404. A 404 here would make the client treat a perfectly valid study plan
 * as missing just because it predates this phase.
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
      select: { id: true, sourceReportIds: true },
    });
    if (!studyPlan) return response(NOT_FOUND, 404);

    // 1. MASTERY — deterministic arithmetic, no model call.
    const contributions = await readContributions(currentUser.id);
    const mastery = computeMastery(contributions, new Date());

    // 2. SOURCE ASSEMBLY — delegated entirely to loadGenerationSources
    // (21-25). This route performs no S3 read and no transcript/user query
    // of its own; reportIds are the SPECIFIC reports this study plan was
    // generated from, read off the StudyPlan row itself, not widened to
    // "all of this user's reports."
    const rawReportIds = studyPlan.sourceReportIds;
    const reportIds = Array.isArray(rawReportIds)
      ? rawReportIds.filter((id): id is string => typeof id === "string")
      : [];

    const sources = await loadGenerationSources(currentUser.id, reportIds);

    // 3. PRE-CHECK, not generate-then-discard: a competency ABSENT from
    // momentsByCompetency (21-25's own distinction — absent, not
    // present-and-empty) has no usable moment and cannot host a check or a
    // coached step. Checking this BEFORE generation avoids spending a model
    // call (and non-deterministic latency, under a 60s maxDuration) on a
    // competency this route already knows cannot produce a check.
    const unavailableCompetencies: CompetencyKey[] = COMPETENCIES.map((c) => c.key).filter(
      (key) => !sources.momentsByCompetency.has(key),
    );

    // COACHED PLACEMENT GUARD (22-CONTEXT.md, 22-07 Task 3). A coached step is
    // placed only on a competency where entry will find a qualifying turn:
    // the walk below calls selectCoachedMomentsFromReports, the SAME
    // isQualifyingMoment-based selector entry uses, so placement and entry
    // cannot disagree and a placed step cannot dead-end (the 409 path is
    // reachable only if data changed after placement).
    //
    // 1. Interim candidates: competencies the plan's own source reports scored
    //    AND that have a moment (scored evidence and moments come from
    //    different sources; either alone produced a self-contradictory reason).
    const evidence = await loadCoachedEvidence(currentUser.id, reportIds);
    const interimCoachedEvidence = new Map(
      Array.from(evidence.entries()).filter(([key]) => sources.momentsByCompetency.has(key)),
    );

    // 2. Pure, deterministic first pass, only to get the availability ranking.
    const firstPass = selectPathSteps({
      mastery,
      desiredCount: DEFAULT_DESIRED_STEP_COUNT,
      unavailableCompetencies,
      coachedEvidence: interimCoachedEvidence,
    });

    // 3. Walk the ranking; stop at the FIRST competency that has a qualifying
    //    moment. Latency: in the common case only ONE competency's reports are
    //    scored (reports in parallel, one model call each) inside this route's
    //    existing maxDuration; scores are cached, so entry re-scores nothing.
    const coachedEvidence = new Map<CompetencyKey, { lowestPercent: number }>();
    for (const ranked of firstPass.ranking) {
      const candidate = interimCoachedEvidence.get(ranked.competencyKey);
      if (!candidate) continue;
      try {
        await selectCoachedMomentsFromReports({
          userId: currentUser.id,
          reportIds,
          competencyKey: ranked.competencyKey,
        });
        coachedEvidence.set(ranked.competencyKey, candidate);
        break;
      } catch (error) {
        if (error instanceof NoQualifyingMomentError) continue;
        // Scoring infrastructure trouble must not block path generation:
        // treat this competency as not placeable and keep walking.
        console.warn(
          `Study-plan path ${planId}: coached qualification check failed for ${ranked.competencyKey}:`,
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }

    // 4. Second pure pass with ONLY the qualified competency (empty =>
    //    coachedOmitted).
    const selection = selectPathSteps({
      mastery,
      desiredCount: DEFAULT_DESIRED_STEP_COUNT,
      unavailableCompetencies,
      coachedEvidence,
    });
    if (selection.coachedOmitted) {
      console.warn(`Study-plan path ${planId}: no competency qualified for a coached step`);
    }

    // 4. ATTACH REAL CHECK IDS. This loop is the hazard closure: every
    // KNOWLEDGE_CHECK step selectPathSteps produced carries
    // PLACEHOLDER_KNOWLEDGE_CHECK_ID (lib/study-plan/next-step.ts's own
    // documented sentinel, never meant to survive past this route). Each is
    // replaced with a REAL KnowledgeCheck.id below, or the step is converted
    // to UNAIDED_SESSION — never left as the placeholder.
    const degradedSteps: Array<{ position: number; competencyKey: CompetencyKey }> = [];
    const usedCheckIds = new Set<string>();
    const finalSteps: PathStepInput[] = [];

    for (const step of selection.steps) {
      if (step.kind !== "KNOWLEDGE_CHECK") {
        finalSteps.push(step);
        continue;
      }

      const moments = sources.momentsByCompetency.get(step.competencyKey) ?? [];

      let createdCheckId: string | null = null;
      if (moments.length > 0) {
        // Every moment this module ever sees belongs to the single
        // requesting user (loadGenerationSources only ever assembles one
        // user's own sources) — so the aligned ownerIds array is just that
        // id, repeated. This is not a shortcut around 21-07's ownership
        // contract; it is what the contract reduces to for a single-user
        // assembly.
        const momentOwnerUserIds = moments.map(() => currentUser.id);

        const outcome = await generateChecksForCompetency({
          userId: currentUser.id,
          studyPlanId: planId,
          competencyKey: step.competencyKey,
          selfNames: sources.selfNames,
          moments,
          momentOwnerUserIds,
          transcriptsByReportId: sources.transcriptsByReportId,
          desiredCount: 1,
        });

        if (outcome.ok && outcome.created > 0) {
          const created = await prisma.knowledgeCheck.findFirst({
            where: {
              studyPlanId: planId,
              userId: currentUser.id,
              competencyKey: step.competencyKey,
              id: { notIn: Array.from(usedCheckIds) },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          });
          if (created) createdCheckId = created.id;
        }
      }

      if (createdCheckId) {
        usedCheckIds.add(createdCheckId);
        finalSteps.push({ ...step, knowledgeCheckId: createdCheckId });
      } else {
        // GENERATION FAILED, OR NO MOMENT WAS AVAILABLE: degrade to
        // UNAIDED_SESSION rather than failing the whole request. Recorded in
        // `degradedSteps` so a systematically failing generator stays
        // visible instead of silently producing a path of plain sessions.
        degradedSteps.push({ position: step.position, competencyKey: step.competencyKey });
        // The stored reason must describe the step actually stored, so the
        // check clause is rewritten (deterministically) for a practice session.
        finalSteps.push({
          ...step,
          kind: "UNAIDED_SESSION",
          selectionReason: reasonForDegradedCheck(step.selectionReason),
          knowledgeCheckId: null,
          coachedSessionId: null,
        });
      }
    }

    // HAZARD GUARD (second line, belt-and-braces): nothing above should ever
    // leave the placeholder attached, but assert it explicitly, right before
    // persisting, rather than trusting the loop silently.
    const leaked = finalSteps.find((s) => s.knowledgeCheckId === PLACEHOLDER_KNOWLEDGE_CHECK_ID);
    if (leaked) {
      throw new Error(
        `Refusing to persist path: step ${leaked.position} still carries PLACEHOLDER_KNOWLEDGE_CHECK_ID`,
      );
    }

    // 5. COACHED_SESSION steps are created PENDING with coachedSessionId:
    // null — DECIDED by 21-08's amendment, not re-derived here.
    // createCoachedSession (21-12) is the ONLY creator, invoked at
    // step-entry time by 21-23's route. Attempting to create it inside this
    // same transaction is unimplementable (createCoachedSession takes no
    // transaction client and re-queries the step by id), so it is not
    // attempted.

    try {
      const path = await createPath({
        userId: currentUser.id,
        studyPlanId: planId,
        steps: finalSteps,
        selectionSnapshot: selection.ranking,
      });
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
