/**
 * Decides what a student practises next, deterministically and explainably.
 *
 * 21-CONTEXT.md locks that "what's next" targets the weakest competency first
 * and is "deterministic and explainable", and this phase's hard constraint is
 * deterministic derivation over model judgement for anything consequential.
 * A model asked "what should this student practise next" would give a
 * plausible, unreproducible, unarguable answer; `selectPathSteps` gives one
 * the student can be shown and can disagree with. No model call, no network
 * read, no database read — pure arithmetic and string-building over an
 * already-computed `MasteryResult` (21-09) and 21-13's `EvidenceTier`.
 *
 * RANKING, as a documented ordered comparator (`compareCompetencies`) so
 * every tie is broken by a declared rule rather than by iteration order:
 *   1. A NONE-tier competency (no evidence at all) outranks ANY measured
 *      competency and is ranked first among NONE-tier peers too — an
 *      unmeasured competency is the largest unknown, and letting a
 *      never-practised competency fall out of the comparison as a coerced
 *      zero would be the opposite of adaptive. This is checked as an
 *      EXPLICIT branch before any numeric comparison runs, specifically so
 *      `null` is never substituted into an arithmetic expression.
 *   2. Primary — currentPercent ascending (weakest current form first). A
 *      competency with lifetime evidence but no CURRENT evidence (current
 *      window stale, not absent) falls back to its lifetime figure for this
 *      comparison, rather than being treated as null here — that case
 *      already failed the NONE-tier branch above, so it is "measured, just
 *      not recently," not "unmeasured."
 *   3. Secondary — lifetimePercent ascending. Two competencies level on
 *      current form are separated by whether the weakness is long-standing.
 *   4. Tertiary — evidence tier ascending (NONE < THIN < EMERGING <
 *      ESTABLISHED). A thin figure is less trustworthy, so gathering more
 *      evidence on it is worth more than acting on a confident one.
 *   5. Final tie-break — `TIE_BREAK_ORDER`, derived from `COMPETENCIES`'
 *      `order` field and exported so the tie-break is inspectable and the
 *      battery can assert it directly. Never falls through to array order
 *      or string collation on the key — both are stable-looking accidents.
 *
 * STEP KIND ASSIGNMENT: position 1 gets a COACHED_SESSION on the highest-ranked
 * AVAILABLE competency that also has SCORED EVIDENCE (the required
 * `coachedEvidence` input, built from the plan's own source reports -- see
 * 22-CONTEXT.md and coached/evidence.ts). A moment alone is not enough: the
 * moment source and the mastery ledger are different sources, and composing
 * them produced a self-contradictory reason. If no competency qualifies,
 * position 1 is a KNOWLEDGE_CHECK instead and `coachedOmitted` is true; positions 2..(n-1) get KNOWLEDGE_CHECK, cycling through
 * the available ranking (repeating the weakest ones if the catalog is
 * smaller than the minimum); the LAST step is always UNAIDED_SESSION on the
 * TRUE overall weakest competency, even if it is unavailable — an unaided
 * session reworks no specific past moment, so it needs no source moment and
 * can still host the transfer test for a competency with none available. A
 * competency excluded via `unavailableCompetencies` therefore never appears
 * in positions 1..(n-1) (which both need a source moment), so it can never
 * collide there with the final step's kind — no separate "skip if duplicate"
 * branch is needed; the exclusion itself prevents the duplicate by
 * construction. This mirrors coached mode's own replay-then-fresh logic at
 * the path level: scaffolded first, unaided last.
 */
import {
  COMPETENCIES,
  type CompetencyKey,
} from "../mastery/competencies";
import { evidenceTierFor, type EvidenceTier } from "../mastery/thinness";
import type { MasteryResult } from "../mastery/compute";
import type { CoachedEvidence } from "./coached/evidence";
import {
  PATH_STEP_BOUNDS,
  type PathStepInput,
  type PathStepKind,
  type PathWithSteps,
} from "./path";

/**
 * Sentinel written onto every `KNOWLEDGE_CHECK` step this module emits.
 * `validatePathSteps` only checks that a KNOWLEDGE_CHECK step carries SOME
 * non-null id (structural presence), not that the id is real — this module
 * has no access to a generated check (that is 21-10/21-25's job, wired by
 * 21-19 AFTER calling `selectPathSteps` and BEFORE calling `createPath`).
 * A caller that calls `createPath` with this sentinel still attached has a
 * bug; it must replace every occurrence with a real `KnowledgeCheck.id`
 * first.
 */
export const PLACEHOLDER_KNOWLEDGE_CHECK_ID = "__PENDING_GENERATION__";

/** Ranked-order tie-break, derived from `COMPETENCIES`' own `order` field —
 * never hand-maintained as a second list. Exported so the tie-break is
 * inspectable and the battery can assert against it directly. */
export const TIE_BREAK_ORDER: readonly CompetencyKey[] = COMPETENCIES.slice()
  .sort((a, b) => a.order - b.order)
  .map((c) => c.key);

export interface StepSelection {
  /** 5..10 (PATH_STEP_BOUNDS), positions 1..n contiguous. */
  steps: PathStepInput[];
  ranking: Array<{
    competencyKey: CompetencyKey;
    rank: number;
    currentPercent: number | null;
    lifetimePercent: number | null;
    tier: EvidenceTier;
    reason: string;
  }>;
  /** True when no competency had scored evidence, so the path has no coached step. */
  coachedOmitted: boolean;
}

interface RankedCompetency {
  competencyKey: CompetencyKey;
  currentPercent: number | null;
  lifetimePercent: number | null;
  tier: EvidenceTier;
}

function labelFor(key: CompetencyKey): string {
  const found = COMPETENCIES.find((c) => c.key === key);
  // Every real CompetencyKey is in COMPETENCIES by construction; the
  // fallback to the raw key only guards a malformed synthetic test fixture.
  return found ? found.label : key;
}

const TIER_RANK: Record<EvidenceTier, number> = {
  NONE: 0,
  THIN: 1,
  EMERGING: 2,
  ESTABLISHED: 3,
};

/**
 * The ordered comparator. Returns negative when `a` should rank before `b`
 * (i.e. `a` is weaker / higher priority).
 */
function compareCompetencies(a: RankedCompetency, b: RankedCompetency): number {
  // Rule: NONE-tier (no evidence at all) always outranks any measured
  // competency, checked as its own branch BEFORE any numeric comparison so
  // a null figure is never silently coerced into an arithmetic expression.
  if (a.tier === "NONE" && b.tier !== "NONE") return -1;
  if (b.tier === "NONE" && a.tier !== "NONE") return 1;

  // Primary: currentPercent ascending. A null currentPercent on a non-NONE
  // competency means "stale, not absent" (the NONE branch above already
  // caught "absent") — fall back to lifetimePercent for THIS comparison only.
  const aCurrent = a.currentPercent ?? a.lifetimePercent;
  const bCurrent = b.currentPercent ?? b.lifetimePercent;
  if (aCurrent !== null && bCurrent !== null && aCurrent !== bCurrent) {
    return aCurrent - bCurrent;
  }

  // Secondary: lifetimePercent ascending.
  if (
    a.lifetimePercent !== null &&
    b.lifetimePercent !== null &&
    a.lifetimePercent !== b.lifetimePercent
  ) {
    return a.lifetimePercent - b.lifetimePercent;
  }

  // Tertiary: evidence tier ascending (less trustworthy first).
  const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
  if (tierDiff !== 0) return tierDiff;

  // Final tie-break: the declared, exported order. Never array order, never
  // string collation on the key.
  return (
    TIE_BREAK_ORDER.indexOf(a.competencyKey) -
    TIE_BREAK_ORDER.indexOf(b.competencyKey)
  );
}

/**
 * Builds the explanatory reason for a ranked competency, independent of any
 * step kind. Names the competency's LABEL (never its key) and, when a
 * figure exists, the figure and the evidence tier that drove the decision.
 */
function baseReasonFor(ranked: RankedCompetency, rank: number): string {
  const label = labelFor(ranked.competencyKey);

  if (ranked.tier === "NONE") {
    return `${label} has no scored evidence yet, so it is ranked ahead of every measured competency.`;
  }

  const figure = ranked.currentPercent ?? ranked.lifetimePercent;
  const figureKind = ranked.currentPercent !== null ? "current" : "lifetime";
  const tierWord = ranked.tier.toLowerCase();

  if (rank === 1) {
    return `${label} is your weakest ${figureKind} competency at ${figure}% (${tierWord} evidence).`;
  }
  return `${label} is ranked #${rank} by ${figureKind} competency strength, at ${figure}% (${tierWord} evidence).`;
}

/**
 * The coached reason is written from scored evidence and never calls the
 * NONE-tier base sentence ("no scored evidence yet"), which would contradict
 * a coached step by construction.
 */
function coachedReasonFor(
  ranked: RankedCompetency,
  rank: number,
  evidence: { lowestPercent: number },
): string {
  const label = labelFor(ranked.competencyKey);
  if (ranked.tier === "NONE") {
    return `${label} has no mastery figure yet, but the sessions this plan was built from scored it at ${evidence.lowestPercent}%. This coached session reworks one of your own moments from those sessions where it was weakest.`;
  }
  return `${baseReasonFor(ranked, rank)} This coached session reworks one of your own moments where it was weakest.`;
}

/** Appends the kind-specific clause a step's stored reason carries, on top
 * of the shared base reason. */
function stepReasonFor(
  baseReason: string,
  kind: Exclude<PathStepKind, "COACHED_SESSION">,
): string {
  if (kind === "KNOWLEDGE_CHECK") {
    return `${baseReason} This knowledge check targets it directly.`;
  }
  return `${baseReason} This unaided session is the transfer test — proving it without scaffolding.`;
}

function clampDesiredCount(desiredCount: number): number {
  return Math.max(
    PATH_STEP_BOUNDS.min,
    Math.min(PATH_STEP_BOUNDS.max, Math.round(desiredCount))
  );
}

export function selectPathSteps(args: {
  mastery: MasteryResult;
  desiredCount: number;
  /** Competency keys with no available source moment — cannot host a check
   * or a coached step. */
  unavailableCompetencies?: readonly CompetencyKey[];
  /** REQUIRED: competencies the plan's source sessions actually scored (and
   * that have a moment). Only these can host the coached step. */
  coachedEvidence: ReadonlyMap<
    CompetencyKey,
    Pick<CoachedEvidence, "lowestPercent">
  >;
}): StepSelection {
  const {
    mastery,
    desiredCount,
    unavailableCompetencies = [],
    coachedEvidence,
  } = args;

  if (mastery.competencies.length === 0) {
    throw new Error(
      "selectPathSteps: mastery.competencies must not be empty — the catalog has at least one competency"
    );
  }

  const unavailableSet = new Set(unavailableCompetencies);

  const candidates: RankedCompetency[] = mastery.competencies.map((c) => ({
    competencyKey: c.competencyKey,
    currentPercent: c.currentPercent,
    lifetimePercent: c.lifetimePercent,
    tier: evidenceTierFor({
      evidenceCount: c.lifetimeEvidenceCount,
      weightSum: c.lifetimeWeightSum,
    }),
  }));

  const sorted = candidates.slice().sort(compareCompetencies);

  const ranking = sorted.map((c, idx) => {
    const rank = idx + 1;
    return {
      competencyKey: c.competencyKey,
      rank,
      currentPercent: c.currentPercent,
      lifetimePercent: c.lifetimePercent,
      tier: c.tier,
      reason: baseReasonFor(c, rank),
    };
  });

  // The TRUE overall weakest — used for the final transfer-test step even if
  // it is unavailable, since UNAIDED_SESSION needs no source moment.
  const overallWeakest = ranking[0];

  // Everything except the overall weakest's own "unaided-only" case must
  // come from the AVAILABLE pool — a competency with no source moment
  // cannot host a COACHED_SESSION or a KNOWLEDGE_CHECK.
  const availableRanking = ranking.filter(
    (r) => !unavailableSet.has(r.competencyKey)
  );
  const pool = availableRanking.length > 0 ? availableRanking : ranking;

  const n = clampDesiredCount(desiredCount);

  const coachedEntry = pool.find((r) => coachedEvidence.has(r.competencyKey));
  const coachedOmitted = coachedEntry === undefined;

  const steps: PathStepInput[] = [];
  for (let position = 1; position <= n - 1; position += 1) {
    if (position === 1 && coachedEntry) {
      const evidence = coachedEvidence.get(coachedEntry.competencyKey)!;
      const ranked = sorted[coachedEntry.rank - 1];
      steps.push({
        position,
        kind: "COACHED_SESSION",
        competencyKey: coachedEntry.competencyKey,
        selectionReason: coachedReasonFor(ranked, coachedEntry.rank, evidence),
        knowledgeCheckId: null,
        coachedSessionId: null,
        status: "PENDING",
      });
      continue;
    }
    const entry = pool[(position - 1) % pool.length];
    steps.push({
      position,
      kind: "KNOWLEDGE_CHECK",
      competencyKey: entry.competencyKey,
      selectionReason: stepReasonFor(entry.reason, "KNOWLEDGE_CHECK"),
      knowledgeCheckId: PLACEHOLDER_KNOWLEDGE_CHECK_ID,
      coachedSessionId: null,
      status: "PENDING",
    });
  }

  // Final step: always UNAIDED_SESSION on the overall weakest competency.
  steps.push({
    position: n,
    kind: "UNAIDED_SESSION",
    competencyKey: overallWeakest.competencyKey,
    selectionReason: stepReasonFor(overallWeakest.reason, "UNAIDED_SESSION"),
    knowledgeCheckId: null,
    coachedSessionId: null,
    status: "PENDING",
  });

  return { steps, ranking, coachedOmitted };
}

/**
 * Returns the lowest-`position` step whose `status` is `PENDING`, with its
 * STORED `selectionReason` — never recomputed. Mastery moves between
 * generation and completion, so recomputing would show the student a reason
 * that no longer matches the step they were actually given. Returns `null`
 * when every step is COMPLETE or SKIPPED (or there are no steps at all).
 *
 * Does NOT skip ahead and does NOT gate on earlier steps: the first pending
 * step by position, regardless of what came before — 21-CONTEXT.md rules out
 * unlocking, so an out-of-order completion elsewhere in the path must not
 * change what comes back here.
 */
export function nextStepFor(
  path: PathWithSteps
): { step: PathWithSteps["steps"][number]; reason: string } | null {
  const pending = path.steps.filter((s) => s.status === "PENDING");
  if (pending.length === 0) {
    return null;
  }

  let lowest = pending[0];
  for (const step of pending) {
    if (step.position < lowest.position) {
      lowest = step;
    }
  }

  return { step: lowest, reason: lowest.selectionReason };
}
