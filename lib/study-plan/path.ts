import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { COMPETENCIES, type CompetencyKey } from "../mastery/competencies";

/**
 * LOCKED by 21-CONTEXT.md: "bounded at 5-10 steps" is a product decision,
 * not a tuning knob. Unlike `lib/mastery/weights.ts`'s provisional numbers,
 * do NOT retune these in a later pass without a new decision recorded.
 *
 * `prisma/schema.prisma`'s `StudyPlanPathStep` deliberately does not enforce
 * this bound in SQL (see 21-03's own comment on that model) — `validatePathSteps`
 * below is therefore the ONLY place this bound is enforced. Removing this
 * check removes the bound entirely; the database will not catch it.
 */
export const PATH_STEP_BOUNDS = { min: 5, max: 10 } as const;

/**
 * Phase 23 adds VOICE_DRILL. The column is a plain String, so every row
 * written with the three older kinds stays valid unchanged.
 */
export const PATH_STEP_KINDS = [
  "KNOWLEDGE_CHECK",
  "COACHED_SESSION",
  "UNAIDED_SESSION",
  "VOICE_DRILL",
] as const;

export type PathStepKind = (typeof PATH_STEP_KINDS)[number];

/**
 * "IN_PROGRESS" is included even though `StudyPlanPathStep.status`'s own
 * comment only names "PENDING" | "COMPLETE" | "SKIPPED" — the status column
 * is a plain, unenforced String (21-03's pattern), so a future step-entry
 * state is representable without a migration, and the state-dependent
 * coached-reference rule below must still hold for it.
 */
export type PathStepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "SKIPPED";

export interface PathStepInput {
  /** 1-based, contiguous across the whole path. */
  position: number;
  kind: PathStepKind;
  competencyKey: CompetencyKey;
  /** REQ-118: stored at selection time, never recomputed on read. */
  selectionReason: string;
  knowledgeCheckId?: string | null;
  coachedSessionId?: string | null;
  /**
   * Defaults to "PENDING". `createPath` never writes anything else directly
   * (every step it creates starts PENDING); a non-PENDING value only shows
   * up here when `validatePathSteps` is asked to re-check an existing step
   * at a state transition (see `markStepComplete` below).
   */
  status?: PathStepStatus;
}

export class PathAlreadyExistsError extends Error {
  existingPathId: string;

  constructor(existingPathId: string) {
    super(`Study plan already has a path (${existingPathId}); it was not overwritten.`);
    this.name = "PathAlreadyExistsError";
    this.existingPathId = existingPathId;
  }
}

export type PathWithSteps = Prisma.StudyPlanPathGetPayload<{
  include: { steps: true };
}>;

const COMPETENCY_KEYS = new Set(COMPETENCIES.map((c) => c.key));

/**
 * Per-step kind/reference consistency, including the STATE-DEPENDENT coached
 * rule amended for 21-12 / 21-23:
 *
 * - KNOWLEDGE_CHECK: must carry its own knowledgeCheckId, in every status.
 *   The check is generated and persisted before the path is written (21-25
 *   assembles, 21-10 generates), so there is no ordering problem on this
 *   branch — the id is always available at validation time.
 * - UNAIDED_SESSION: must carry neither id, in every status.
 * - VOICE_DRILL (Phase 23): must carry neither id, in every status. Its
 *   VoiceDrill row hangs off the step (`VoiceDrill.pathStepId @unique`), the
 *   same direction CoachedSession uses, so the step needs no pointer column.
 * - Any other kind is rejected: the column is an unenforced String, and a
 *   typo'd kind would otherwise render as a step with no destination.
 * - COACHED_SESSION: must never carry a knowledgeCheckId. Its
 *   coachedSessionId is NULL-PERMITTED only while status === "PENDING" —
 *   `createCoachedSession` (21-12) requires an already-persisted step loaded
 *   by id through path -> studyPlan, so it cannot see a step still inside an
 *   uncommitted `createPath` transaction and takes no transaction client.
 *   Requiring the id at creation would make the pair unconstructible, so the
 *   step is created PENDING with a null id and 21-12 remains the step's ONLY
 *   coached-session creator, invoked at step-entry time by 21-23's route,
 *   which writes the id back onto the step. Once the step leaves PENDING the
 *   id is REQUIRED — a step that is IN_PROGRESS or COMPLETE with no coached
 *   session behind it is a step whose completion evidences nothing.
 */
function validateSingleStep(step: PathStepInput): string[] {
  const errors: string[] = [];
  const status = step.status ?? "PENDING";
  const hasKnowledgeCheckId = step.knowledgeCheckId != null;
  const hasCoachedSessionId = step.coachedSessionId != null;

  if (!COMPETENCY_KEYS.has(step.competencyKey)) {
    errors.push(`step ${step.position}: unknown competencyKey "${String(step.competencyKey)}"`);
  }

  if (!(PATH_STEP_KINDS as readonly string[]).includes(step.kind)) {
    errors.push(`step ${step.position}: unknown kind "${String(step.kind)}"`);
    return errors;
  }

  if (step.kind === "KNOWLEDGE_CHECK") {
    if (!hasKnowledgeCheckId) {
      errors.push(`step ${step.position}: KNOWLEDGE_CHECK step is missing knowledgeCheckId`);
    }
    if (hasCoachedSessionId) {
      errors.push(`step ${step.position}: KNOWLEDGE_CHECK step must not carry coachedSessionId`);
    }
  } else if (step.kind === "UNAIDED_SESSION") {
    if (hasKnowledgeCheckId) {
      errors.push(`step ${step.position}: UNAIDED_SESSION step must not carry knowledgeCheckId`);
    }
    if (hasCoachedSessionId) {
      errors.push(`step ${step.position}: UNAIDED_SESSION step must not carry coachedSessionId`);
    }
  } else if (step.kind === "VOICE_DRILL") {
    if (hasKnowledgeCheckId) {
      errors.push(`step ${step.position}: VOICE_DRILL step must not carry knowledgeCheckId`);
    }
    if (hasCoachedSessionId) {
      errors.push(`step ${step.position}: VOICE_DRILL step must not carry coachedSessionId`);
    }
  } else if (step.kind === "COACHED_SESSION") {
    if (hasKnowledgeCheckId) {
      errors.push(`step ${step.position}: COACHED_SESSION step must not carry knowledgeCheckId`);
    }
    if (!hasCoachedSessionId && status !== "PENDING") {
      // The amendment's REJECT half: a non-PENDING coached step with no
      // session behind it names the status it illegally left PENDING in.
      errors.push(
        `step ${step.position}: COACHED_SESSION step with status "${status}" must carry a ` +
          `coachedSessionId (only status "PENDING" may leave it null, since 21-12 is the sole ` +
          `creator and runs at step-entry time)`,
      );
    }
    // status === "PENDING" && !hasCoachedSessionId falls through with no
    // error: this is the amendment's ACCEPT half, asserted explicitly by the
    // verifier so a later "tightening" fails loudly instead of breaking the
    // coached entry route at runtime.
  }

  return errors;
}

/**
 * Pure, database-free. Exported so the verifier can run its bound/position/
 * kind-reference battery with no `DATABASE_URL`, and so `markStepComplete`
 * can re-run the state-dependent rule at the one moment a step actually
 * transitions off PENDING.
 */
export function validatePathSteps(steps: PathStepInput[]): string[] {
  const errors: string[] = [];

  if (steps.length < PATH_STEP_BOUNDS.min || steps.length > PATH_STEP_BOUNDS.max) {
    errors.push(
      `Path must have between ${PATH_STEP_BOUNDS.min} and ${PATH_STEP_BOUNDS.max} steps ` +
        `(locked by 21-CONTEXT.md); got ${steps.length}.`,
    );
  }

  const positions = steps.map((s) => s.position).slice().sort((a, b) => a - b);
  let positionsOk = true;
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] !== i + 1) {
      positionsOk = false;
      break;
    }
  }
  if (!positionsOk) {
    errors.push(
      `Step positions must be 1-based, contiguous and unique with no gaps or duplicates; ` +
        `got [${positions.join(", ")}].`,
    );
  }

  for (const step of steps) {
    errors.push(...validateSingleStep(step));
  }

  return errors;
}

/**
 * Creates a path as a child of a study plan the requesting user owns.
 *
 * Writes the path and all of its steps in ONE transaction (a nested
 * `create`), so a path can never exist with zero steps — a zero-step path
 * would pass the 5-10 bound on read (the bound is enforced here, before the
 * write, not by the schema) and render as an empty improvement plan.
 */
export async function createPath(args: {
  userId: string;
  studyPlanId: string;
  steps: PathStepInput[];
  selectionSnapshot: unknown;
}): Promise<PathWithSteps> {
  const { userId, studyPlanId, steps, selectionSnapshot } = args;

  // OWNERSHIP — a path is created from an API route; this is the only thing
  // stopping a path being attached to a study plan the caller does not own.
  const owned = await prisma.studyPlan.findFirst({
    where: { id: studyPlanId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error(`Study plan ${studyPlanId} does not exist or is not owned by user ${userId}`);
  }

  const violations = validatePathSteps(steps);
  if (violations.length > 0) {
    throw new Error(`Cannot create path for study plan ${studyPlanId}:\n${violations.join("\n")}`);
  }

  try {
    return await prisma.studyPlanPath.create({
      data: {
        studyPlanId,
        userId,
        selectionSnapshot: selectionSnapshot as Prisma.InputJsonValue,
        steps: {
          create: steps.map((step) => ({
            position: step.position,
            kind: step.kind,
            competencyKey: step.competencyKey,
            selectionReason: step.selectionReason,
            knowledgeCheckId: step.knowledgeCheckId ?? null,
            coachedSessionId: step.coachedSessionId ?? null,
            // createPath only ever writes PENDING steps — the caller never
            // supplies a status, so this is not read from `step.status`.
            status: "PENDING",
          })),
        },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // StudyPlanPath.studyPlanId is @unique — a second create for the same
      // plan throws here. Do NOT overwrite or delete the existing path: that
      // would be "carrying forward" by another name. Surface a named error
      // with the existing path's id so the caller can show it instead of a
      // raw database error code.
      const existing = await prisma.studyPlanPath.findUnique({
        where: { studyPlanId },
        select: { id: true },
      });
      throw new PathAlreadyExistsError(existing?.id ?? studyPlanId);
    }
    throw err;
  }
}

/**
 * Scoped by userId in the WHERE clause, not filtered after fetching.
 *
 * Returns null when the plan has no path yet — the normal state for any
 * StudyPlan row created before this phase shipped. Pre-Phase-21 plans must
 * render as "no path" rather than erroring; this is the REQ-120
 * backward-compatibility case.
 */
export async function readPathForStudyPlan(
  userId: string,
  studyPlanId: string,
): Promise<PathWithSteps | null> {
  return prisma.studyPlanPath.findFirst({
    where: { studyPlanId, userId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

/**
 * Marks a single step COMPLETE. Does NOT touch any other step and does NOT
 * require steps to be completed in order: 21-CONTEXT.md rules out unlocking
 * mechanics for this phase, so a sequential gate here would reintroduce
 * unlocking under a different name. An out-of-order completion is therefore
 * permitted on purpose, not an oversight a later contributor should "fix".
 */
export async function markStepComplete(userId: string, stepId: string): Promise<void> {
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: stepId, path: { userId } },
  });
  if (!step) {
    throw new Error(`Step ${stepId} does not exist or is not owned by user ${userId}`);
  }
  if (step.status === "COMPLETE") {
    throw new Error(`Step ${stepId} is already complete`);
  }

  // Re-run the state-dependent coached rule at the one moment the transition
  // actually happens: this is the REJECT half of the rule (a coached step
  // with a still-null coachedSessionId may not leave PENDING).
  const violations = validateSingleStep({
    position: step.position,
    kind: step.kind as PathStepKind,
    competencyKey: step.competencyKey as CompetencyKey,
    selectionReason: step.selectionReason,
    knowledgeCheckId: step.knowledgeCheckId,
    coachedSessionId: step.coachedSessionId,
    status: "COMPLETE",
  });
  if (violations.length > 0) {
    throw new Error(`Cannot complete step ${stepId}:\n${violations.join("\n")}`);
  }

  await prisma.studyPlanPathStep.update({
    where: { id: stepId },
    data: { status: "COMPLETE", completedAt: new Date() },
  });
}

/**
 * Every path the user has ever had, including superseded ones — this is how
 * an older path stays reachable. There is no is-latest flag and nothing here
 * filters a past path out: a later contributor looking for one will not find
 * it, and its absence is deliberate, not missing. `studyPlanTitle` is
 * included so the UI can say which plan owns each entry, since separate
 * paths are reached through their own associated study plan, never through a
 * shared list with its own identity.
 */
export async function listPathsForUser(userId: string): Promise<
  Array<{
    pathId: string;
    studyPlanId: string;
    studyPlanTitle: string;
    generatedAt: Date;
    stepCount: number;
    completeCount: number;
  }>
> {
  const paths = await prisma.studyPlanPath.findMany({
    where: { userId },
    orderBy: { generatedAt: "desc" },
    include: {
      studyPlan: { select: { title: true } },
      steps: { select: { status: true } },
    },
  });

  return paths.map((p) => ({
    pathId: p.id,
    studyPlanId: p.studyPlanId,
    studyPlanTitle: p.studyPlan.title,
    generatedAt: p.generatedAt,
    stepCount: p.steps.length,
    completeCount: p.steps.filter((s) => s.status === "COMPLETE").length,
  }));
}
