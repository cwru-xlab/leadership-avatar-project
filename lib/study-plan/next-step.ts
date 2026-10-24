/**
 * Decides what a student practises next, deterministically and explainably.
 *
 * 21-CONTEXT.md locks that "what's next" is "deterministic and explainable",
 * and this phase's hard constraint is deterministic derivation over model
 * judgement for anything consequential. `selectPathSteps` is pure arithmetic
 * and string-building: no model call, no network read, no database read.
 *
 * PHASE 23 (23-CONTEXT.md "Path design decisions", user, 2026-10-24):
 *
 * TARGETING — plan-first. The ranking has four ordered groups:
 *   1. SCORED (weak): competencies the plan's OWN source sessions scored
 *      BELOW `WEAK_THRESHOLD_PERCENT` on average (`planEvidence`), weakest
 *      mean first. Ties: a competency related to a priority theme first (best
 *      theme priority), then the global comparator below.
 *   2. THEME: competencies related ONLY to the plan's priority themes
 *      (`themeMatches`) and not scored by its sessions, best theme priority
 *      first, then the global comparator.
 *   3. GLOBAL: competencies the plan does not speak to, by the global
 *      comparator. A never-measured competency is an "absent" gap and ranks
 *      first here (NONE tier).
 *   4. STRONG: competencies the plan's sessions scored AT OR ABOVE the
 *      threshold, weakest mean first. User decision (2026-10-24): "only plan
 *      skills below 70% (average) count as weak targets. Plan skills at or
 *      above 70% rank BELOW plan themes and global gaps."
 *   With no plan signal at all, the ranking is exactly the global one.
 *
 * GLOBAL COMPARATOR (`compareCompetencies`, unchanged from Phase 21): a
 * NONE-tier competency first (explicit branch, null never coerced), then
 * current percent ascending (falling back to lifetime when stale), lifetime
 * ascending, evidence tier ascending, and finally `TIE_BREAK_ORDER` (never
 * array order or key collation).
 *
 * ORDER — learn -> drill -> rework -> prove. For each of the top
 * `MAX_TARGETS` ranked competencies, one BLOCK:
 *   KNOWLEDGE_CHECK (only when a source moment exists — `unavailableCompetencies`
 *   excludes it), then 1-2 VOICE_DRILL (a drill needs no moment), then
 *   COACHED_SESSION (only when `coachedEvidence` qualifies it — the route's
 *   placement guard). The path ends with ONE UNAIDED_SESSION on the #1 target:
 *   the pre-filled prove-it session, which needs no moment.
 *
 * BUDGET — 5..10 steps (PATH_STEP_BOUNDS, product decision). `desiredCount`
 * is the CAP (clamped into the bounds): blocks are dropped from the end while
 * over it; the #1 target gets a second drill when there is room; below the
 * minimum, later targets get a second drill, then further ranked competencies
 * get a block. Every step's stored reason names the plan signal that put it
 * there (REQ-118: the stored reason is the one that drove selection).
 */
import {
  COMPETENCIES,
  type CompetencyKey,
} from "../mastery/competencies";
import { evidenceTierFor, type EvidenceTier } from "../mastery/thinness";
import type { MasteryResult } from "../mastery/compute";
import type { CoachedEvidence } from "./coached/evidence";
import type { PlanEvidence, ThemeMatch } from "./plan-targets";
import {
  PATH_STEP_BOUNDS,
  type PathStepInput,
  type PathStepKind,
  type PathWithSteps,
} from "./path";

/**
 * Sentinel written onto every `KNOWLEDGE_CHECK` step this module emits.
 * `validatePathSteps` only checks that a KNOWLEDGE_CHECK step carries SOME
 * non-null id; the path route replaces every occurrence with a real
 * `KnowledgeCheck.id` (or degrades the step) before calling `createPath`.
 */
export const PLACEHOLDER_KNOWLEDGE_CHECK_ID = "__PENDING_GENERATION__";

/** Ranked-order tie-break, derived from `COMPETENCIES`' own `order` field. */
export const TIE_BREAK_ORDER: readonly CompetencyKey[] = COMPETENCIES.slice()
  .sort((a, b) => a.order - b.order)
  .map((c) => c.key);

/** User decision (2026-10-24): a plan skill is WEAK only below this average
 * percent; at or above it, it ranks after themes and global gaps. */
export const WEAK_THRESHOLD_PERCENT = 70;

/** How many weak skills a path targets (23-CONTEXT.md: "typically the top 2-3"). */
export const MAX_TARGETS = 3;
/** Drills per target (23-CONTEXT.md: "1-2 VOICE_DRILL steps"). */
export const MAX_DRILLS_PER_TARGET = 2;

export type TargetBasis = "SCORED" | "THEME" | "GLOBAL" | "STRONG";

export interface RankingEntry {
  competencyKey: CompetencyKey;
  rank: number;
  /** Global mastery figures — kept on every entry: the since-plan baseline
   * (app/api/mastery/since-plan) reads these off the frozen snapshot. */
  currentPercent: number | null;
  lifetimePercent: number | null;
  tier: EvidenceTier;
  basis: TargetBasis;
  /** Mean percent across the plan's source sessions (SCORED only). */
  planMeanPercent: number | null;
  planScoredReportCount: number | null;
  /** Best matching priority theme, verbatim (null when none matched). */
  theme: string | null;
  themePriority: number | null;
  reason: string;
}

export interface StepSelection {
  /** 5..10 (PATH_STEP_BOUNDS), positions 1..n contiguous. */
  steps: PathStepInput[];
  ranking: RankingEntry[];
  /** True when no target qualified for a coached step. */
  coachedOmitted: boolean;
  /** The competencies the blocks target, in path order (#1 first). */
  targets: CompetencyKey[];
}

interface RankedCompetency {
  competencyKey: CompetencyKey;
  currentPercent: number | null;
  lifetimePercent: number | null;
  tier: EvidenceTier;
}

function labelFor(key: CompetencyKey): string {
  const found = COMPETENCIES.find((c) => c.key === key);
  return found ? found.label : key;
}

const TIER_RANK: Record<EvidenceTier, number> = {
  NONE: 0,
  THIN: 1,
  EMERGING: 2,
  ESTABLISHED: 3,
};

/** The global comparator. Negative when `a` is weaker / higher priority. */
function compareCompetencies(a: RankedCompetency, b: RankedCompetency): number {
  if (a.tier === "NONE" && b.tier !== "NONE") return -1;
  if (b.tier === "NONE" && a.tier !== "NONE") return 1;

  const aCurrent = a.currentPercent ?? a.lifetimePercent;
  const bCurrent = b.currentPercent ?? b.lifetimePercent;
  if (aCurrent !== null && bCurrent !== null && aCurrent !== bCurrent) {
    return aCurrent - bCurrent;
  }

  if (
    a.lifetimePercent !== null &&
    b.lifetimePercent !== null &&
    a.lifetimePercent !== b.lifetimePercent
  ) {
    return a.lifetimePercent - b.lifetimePercent;
  }

  const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
  if (tierDiff !== 0) return tierDiff;

  return (
    TIE_BREAK_ORDER.indexOf(a.competencyKey) -
    TIE_BREAK_ORDER.indexOf(b.competencyKey)
  );
}

// ---------------------------------------------------------------------------
// Reasons — template-based, one sentence per signal that drove selection
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function globalFigureSentence(ranked: RankedCompetency): string {
  const label = labelFor(ranked.competencyKey);
  if (ranked.tier === "NONE") {
    return `${label} has no scored evidence yet: it has never been measured, so it counts as an absent gap in your overall mastery.`;
  }
  const figure = ranked.currentPercent ?? ranked.lifetimePercent;
  const figureKind = ranked.currentPercent !== null ? "current" : "lifetime";
  return `${label} is at ${figure}% ${figureKind} in your overall mastery (${ranked.tier.toLowerCase()} evidence).`;
}

function baseReasonFor(
  entry: Omit<RankingEntry, "reason">,
  ranked: RankedCompetency,
  targetRank: number | null,
): string {
  const label = labelFor(entry.competencyKey);
  const targetPhrase =
    targetRank !== null ? `this plan's #${targetRank} target` : "one of this plan's own skills";
  if (entry.basis === "SCORED") {
    const n = entry.planScoredReportCount ?? 0;
    const themeClause = entry.theme
      ? `, and it is related to your plan theme "${entry.theme}"`
      : "";
    return `${label} is ${targetPhrase}: the ${n} ${plural(n, "session", "sessions")} this plan was built from scored it ${entry.planMeanPercent}% on average, below the ${WEAK_THRESHOLD_PERCENT}% weak-skill line${themeClause}.`;
  }
  if (entry.basis === "THEME") {
    return `${label} is ${targetPhrase}: it is related to your plan theme "${entry.theme}", though the sessions this plan was built from did not score it directly.`;
  }
  if (entry.basis === "STRONG") {
    const n = entry.planScoredReportCount ?? 0;
    return `${label} is already at ${entry.planMeanPercent}% on average across the ${n} ${plural(n, "session", "sessions")} this plan was built from, at or above the ${WEAK_THRESHOLD_PERCENT}% weak-skill line, so it ranks after the plan's weak skills, themes and gaps.`;
  }
  return `${globalFigureSentence(ranked)} It is not one of this plan's own weak skills, so it fills a remaining slot.`;
}

const KNOWLEDGE_CHECK_CLAUSE = "This knowledge check covers the concept first.";
const DRILL_CLAUSE = "This short voice drill is a spoken rep on it, graded at the end.";
const SECOND_DRILL_CLAUSE = "This second voice drill is another spoken rep before you move on.";
const COACHED_CLAUSE = "This coached session reworks one of your own moments where it was weakest.";
const UNAIDED_CLAUSE =
  "This final live session is the transfer test: the same kind of session this plan came from, set up as before, with no coaching.";
const DEGRADED_UNAIDED_CLAUSE =
  "No moment from your sessions could anchor a written exercise for it, so this step is a live practice session on it instead.";
const DEGRADED_DRILL_CLAUSE =
  "No moment from your sessions could anchor a written exercise for it, so this step is a short voice drill on it instead.";

function stripCheckSentences(checkReason: string): string {
  return checkReason
    .replace(KNOWLEDGE_CHECK_CLAUSE, "")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() !== "" && !/knowledge check/i.test(sentence))
    .join(" ")
    .trim();
}

/**
 * LEGACY (pre-Phase-23 degrade branch): rewrites a KNOWLEDGE_CHECK reason
 * for a step stored as UNAIDED_SESSION. Kept exported so existing callers and
 * the battery keep working; the Phase 23 route degrades to VOICE_DRILL.
 */
export function reasonForDegradedCheck(checkReason: string): string {
  const base = stripCheckSentences(checkReason);
  return base ? `${base} ${DEGRADED_UNAIDED_CLAUSE}` : DEGRADED_UNAIDED_CLAUSE;
}

/**
 * Phase 23 degrade branch: a KNOWLEDGE_CHECK whose generation failed becomes
 * a VOICE_DRILL (a drill needs no moment), so the path keeps exactly ONE
 * UNAIDED_SESSION — the final prove-it step. Deterministic; the result never
 * mentions a knowledge check.
 */
export function reasonForDegradedCheckToDrill(checkReason: string): string {
  const base = stripCheckSentences(checkReason);
  return base ? `${base} ${DEGRADED_DRILL_CLAUSE}` : DEGRADED_DRILL_CLAUSE;
}

function clampDesiredCount(desiredCount: number): number {
  return Math.max(
    PATH_STEP_BOUNDS.min,
    Math.min(PATH_STEP_BOUNDS.max, Math.round(desiredCount))
  );
}

interface Block {
  entry: RankingEntry;
  knowledgeCheck: boolean;
  drills: number;
  coached: boolean;
}

function blockSize(b: Block): number {
  return (b.knowledgeCheck ? 1 : 0) + b.drills + (b.coached ? 1 : 0);
}

export function selectPathSteps(args: {
  mastery: MasteryResult;
  /** The step-count CAP, clamped into PATH_STEP_BOUNDS. */
  desiredCount: number;
  /** Competency keys with no available source moment — cannot host a check
   * or a coached step (a drill and the final session need no moment). */
  unavailableCompetencies?: readonly CompetencyKey[];
  /** REQUIRED: competencies qualified for a coached step (scored by the
   * plan's source sessions AND with a qualifying moment). */
  coachedEvidence: ReadonlyMap<
    CompetencyKey,
    Pick<CoachedEvidence, "lowestPercent">
  >;
  /** Plan-own SCORED signal (planEvidenceFromReports). */
  planEvidence?: ReadonlyMap<
    CompetencyKey,
    Pick<PlanEvidence, "meanPercent" | "scoredReportCount">
  >;
  /** Plan-own THEME signal (themeMatchesFromPlan). */
  themeMatches?: ReadonlyMap<CompetencyKey, Pick<ThemeMatch, "priority" | "theme">>;
}): StepSelection {
  const {
    mastery,
    desiredCount,
    unavailableCompetencies = [],
    coachedEvidence,
    planEvidence = new Map(),
    themeMatches = new Map(),
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

  const basisOf = (c: RankedCompetency): TargetBasis => {
    const ev = planEvidence.get(c.competencyKey);
    if (ev) return ev.meanPercent < WEAK_THRESHOLD_PERCENT ? "SCORED" : "STRONG";
    return themeMatches.has(c.competencyKey) ? "THEME" : "GLOBAL";
  };
  const GROUP_RANK: Record<TargetBasis, number> = { SCORED: 0, THEME: 1, GLOBAL: 2, STRONG: 3 };

  const sorted = candidates.slice().sort((a, b) => {
    const ga = basisOf(a);
    const gb = basisOf(b);
    if (ga !== gb) return GROUP_RANK[ga] - GROUP_RANK[gb];
    if (ga === "SCORED" || ga === "STRONG") {
      const ma = planEvidence.get(a.competencyKey)!.meanPercent;
      const mb = planEvidence.get(b.competencyKey)!.meanPercent;
      if (ma !== mb) return ma - mb;
    }
    if (ga === "SCORED" || ga === "THEME") {
      const pa = themeMatches.get(a.competencyKey)?.priority ?? Number.POSITIVE_INFINITY;
      const pb = themeMatches.get(b.competencyKey)?.priority ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return compareCompetencies(a, b);
  });

  const n = clampDesiredCount(desiredCount);
  const targetCount = Math.min(MAX_TARGETS, sorted.length);

  const ranking: RankingEntry[] = sorted.map((c, idx) => {
    const ev = planEvidence.get(c.competencyKey);
    const theme = themeMatches.get(c.competencyKey);
    const partial: Omit<RankingEntry, "reason"> = {
      competencyKey: c.competencyKey,
      rank: idx + 1,
      currentPercent: c.currentPercent,
      lifetimePercent: c.lifetimePercent,
      tier: c.tier,
      basis: basisOf(c),
      planMeanPercent: ev ? ev.meanPercent : null,
      planScoredReportCount: ev ? ev.scoredReportCount : null,
      theme: theme ? theme.theme : null,
      themePriority: theme ? theme.priority : null,
    };
    return { ...partial, reason: baseReasonFor(partial, c, idx < targetCount ? idx + 1 : null) };
  });

  const makeBlock = (entry: RankingEntry): Block => ({
    entry,
    knowledgeCheck: !unavailableSet.has(entry.competencyKey),
    drills: 1,
    coached:
      !unavailableSet.has(entry.competencyKey) && coachedEvidence.has(entry.competencyKey),
  });

  const blocks: Block[] = ranking.slice(0, targetCount).map(makeBlock);
  const total = () => blocks.reduce((sum, b) => sum + blockSize(b), 0) + 1;

  // Over the cap: drop targets from the end (the #1 target always stays).
  while (total() > n && blocks.length > 1) blocks.pop();
  // Room left: the #1 target gets its second drill.
  if (total() < n && blocks[0].drills < MAX_DRILLS_PER_TARGET) blocks[0].drills += 1;
  // Below the minimum: second drills for later targets, then more blocks.
  let nextRank = blocks.length;
  while (total() < PATH_STEP_BOUNDS.min) {
    const lacking = blocks.find((b) => b.drills < MAX_DRILLS_PER_TARGET);
    if (lacking) {
      lacking.drills += 1;
    } else if (nextRank < ranking.length) {
      // A fill block starts as one drill and only grows while it fits under
      // the cap, so reaching the minimum can never overshoot it.
      const full = makeBlock(ranking[nextRank]);
      const fill: Block = { ...full, knowledgeCheck: false, coached: false };
      blocks.push(fill);
      if (full.knowledgeCheck && total() + 1 <= n) fill.knowledgeCheck = true;
      if (full.coached && total() + 1 <= n) fill.coached = true;
      nextRank += 1;
    } else {
      // Only reachable with a synthetic catalog of one or two competencies:
      // round-robin extra drills so the minimum step count still holds.
      blocks[(total() - 1) % blocks.length].drills += 1;
    }
  }

  const steps: PathStepInput[] = [];
  const push = (kind: PathStepKind, entry: RankingEntry, reason: string) => {
    steps.push({
      position: steps.length + 1,
      kind,
      competencyKey: entry.competencyKey,
      selectionReason: reason,
      knowledgeCheckId: kind === "KNOWLEDGE_CHECK" ? PLACEHOLDER_KNOWLEDGE_CHECK_ID : null,
      coachedSessionId: null,
      status: "PENDING",
    });
  };

  for (const block of blocks) {
    const base = block.entry.reason;
    if (block.knowledgeCheck) {
      push("KNOWLEDGE_CHECK", block.entry, `${base} ${KNOWLEDGE_CHECK_CLAUSE}`);
    }
    for (let d = 0; d < block.drills; d += 1) {
      push("VOICE_DRILL", block.entry, `${base} ${d === 0 ? DRILL_CLAUSE : SECOND_DRILL_CLAUSE}`);
    }
    if (block.coached) {
      const ev = coachedEvidence.get(block.entry.competencyKey)!;
      // A coached step is written from SCORED evidence and must never carry
      // the NONE-tier "no scored evidence yet" sentence (Phase 22 bug: a
      // self-contradictory reason was observed verbatim in the browser).
      const coachedBase =
        block.entry.basis === "SCORED"
          ? base
          : block.entry.tier === "NONE"
            ? `${labelFor(block.entry.competencyKey)} has no mastery figure yet, but the sessions this plan was built from scored it at ${ev.lowestPercent}% at their lowest.`
            : `${base} The sessions this plan was built from scored it at ${ev.lowestPercent}% at their lowest.`;
      push("COACHED_SESSION", block.entry, `${coachedBase} ${COACHED_CLAUSE}`);
    }
  }

  // Final: ONE prove-it UNAIDED_SESSION on the #1 target.
  push("UNAIDED_SESSION", blocks[0].entry, `${blocks[0].entry.reason} ${UNAIDED_CLAUSE}`);

  return {
    steps,
    ranking,
    coachedOmitted: !blocks.some((b) => b.coached),
    targets: blocks.map((b) => b.entry.competencyKey),
  };
}

/**
 * Returns the step to continue with, with its STORED `selectionReason` —
 * never recomputed. Mastery moves between generation and completion, so
 * recomputing would show the student a reason that no longer matches the
 * step they were actually given.
 *
 * Order: the lowest-`position` IN_PROGRESS step first (work already started,
 * e.g. an entered coached session, is resumed before anything new), else the
 * lowest-`position` PENDING step. Returns `null` only when every step is
 * COMPLETE or SKIPPED (or there are no steps at all). This is the single
 * source of truth for "what's next" — the path view adds no fallback.
 *
 * Does NOT gate on earlier steps: 21-CONTEXT.md rules out unlocking, so an
 * out-of-order completion elsewhere in the path must not change what comes
 * back here.
 */
export function nextStepFor(
  path: PathWithSteps
): { step: PathWithSteps["steps"][number]; reason: string } | null {
  const lowestWithStatus = (status: string) => {
    let lowest: PathWithSteps["steps"][number] | null = null;
    for (const step of path.steps) {
      if (step.status !== status) continue;
      if (!lowest || step.position < lowest.position) lowest = step;
    }
    return lowest;
  };

  const next = lowestWithStatus("IN_PROGRESS") ?? lowestWithStatus("PENDING");
  return next ? { step: next, reason: next.selectionReason } : null;
}
