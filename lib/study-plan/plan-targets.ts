/**
 * PLAN-FIRST TARGETING (23-CONTEXT.md, "Path design decisions", 2026-10-24):
 * "a plan's path ranks the plan's OWN weak skills first (its source sessions'
 * lowest-scored competencies / priority themes); global mastery gaps only
 * fill remaining slots."
 *
 * PURE: no database, no model call, no clock. Two plan-own signals are read:
 *
 *   1. SCORED — the evaluator's per-session scores on the plan's OWN source
 *      reports (`InteractionReport.scores`), mapped dimension -> competency by
 *      the single REQ-124 mapping (`contributionInputsFromScoreMap`), never
 *      re-derived here. Ranked by the MEAN across those sessions (see
 *      `PlanEvidence.meanPercent` for why the mean, not the minimum).
 *   2. THEME — the plan's `priorityThemes`, matched to competencies by a
 *      closed, reviewable keyword table (`THEME_KEYWORDS`). A model is not
 *      asked to classify a theme: the match must be reproducible and arguable
 *      (21-CONTEXT.md: "deterministic and explainable").
 *
 * Everything else (including never-measured competencies) is GLOBAL fill.
 */
import { COMPETENCIES, type CompetencyKey } from "../mastery/competencies";
import { contributionInputsFromScoreMap } from "../mastery/from-report";
import { asScoreMap } from "../report/snapshot";

export interface PlanEvidence {
  competencyKey: CompetencyKey;
  /**
   * Mean per-session figure (whole percent) across the plan's source reports
   * that scored this competency. The MEAN, not the minimum: a plan is often
   * built from 10-35 sessions, and with that many the minimum is 0% for
   * nearly every competency (one bad session floors it), which would rank by
   * tie-break alone. The minimum is still carried for the coached reason.
   */
  meanPercent: number;
  lowestPercent: number;
  scoredReportCount: number;
  /** Report ids that scored it, oldest-first as supplied. */
  scoredReportIds: string[];
}

/** PURE. One entry per competency at least one source report scored. */
export function planEvidenceFromReports(
  reports: ReadonlyArray<{ id: string; userId: string; scores: unknown; createdAt: Date }>,
): Map<CompetencyKey, PlanEvidence> {
  const sums = new Map<CompetencyKey, { total: number; values: number[]; ids: string[] }>();
  for (const report of reports) {
    const scores = asScoreMap(report.scores);
    if (!scores) continue;
    const { inputs } = contributionInputsFromScoreMap({
      scores,
      userId: report.userId,
      // Placeholder source: read-only computation, nothing is written.
      source: "LIVE_SESSION",
      occurredAt: report.createdAt,
      sourceReportId: report.id,
    });
    for (const input of inputs) {
      const entry = sums.get(input.competencyKey) ?? { total: 0, values: [], ids: [] };
      entry.total += input.rawScore;
      entry.values.push(input.rawScore);
      entry.ids.push(report.id);
      sums.set(input.competencyKey, entry);
    }
  }
  const out = new Map<CompetencyKey, PlanEvidence>();
  for (const [key, entry] of sums) {
    out.set(key, {
      competencyKey: key,
      meanPercent: Math.round((entry.total / entry.values.length) * 100),
      lowestPercent: Math.round(Math.min(...entry.values) * 100),
      scoredReportCount: entry.values.length,
      scoredReportIds: entry.ids,
    });
  }
  return out;
}

/**
 * CLOSED keyword table, one regex per competency, matched case-insensitively
 * on word boundaries against a theme's title (and, only when the title
 * matches nothing, its `whyItMatters`). PROVISIONAL UNTIL CALIBRATED: it is a
 * reviewable list, not a classifier; a theme matching nothing simply adds no
 * THEME signal (it never guesses).
 */
export const THEME_KEYWORDS: Readonly<Record<CompetencyKey, RegExp>> = {
  delivery_presence:
    /\b(eye contact|body language|posture|presence|delivery|pace|pacing|filler\w*|vocal\w*|voice|tone|gestur\w*|composure|poise|confiden\w*|nervous\w*|energy|enthusias\w*)\b/i,
  structure_and_clarity:
    /\b(structur\w*|star|organi[sz]\w*|clarity|clarif\w*|clear\w*|framework\w*|storytelling|narrative\w*|logical\w*|coheren\w*|articulat\w*)\b/i,
  concision_and_focus:
    /\b(concis\w*|brevity|succinct\w*|rambl\w*|focus\w*|to the point|wordy|verbos\w*)\b/i,
  audience_attunement:
    /\b(rapport|empath\w*|listen\w*|audience\w*|connect\w*|tailor\w*|curiosity|engag\w*|relationship\w*|reading the room|emotional\w*)\b/i,
  holding_position_under_pressure:
    /\b(pushback|push back|objection\w*|pressure|negotiat\w*|assert\w*|firm\w*|defend\w*|stand your ground|tough questions|difficult questions)\b/i,
  credibility_of_the_case:
    /\b(evidence|data|metric\w*|quantif\w*|credib\w*|specific\w*|examples?|proof|numbers|impact|substantiat\w*|concrete)\b/i,
  outcome_achievement:
    /\b(goals?|outcomes?|next steps?|closing|call to action|objectives?|follow[- ]up|commitment\w*)\b/i,
};

export interface ThemeMatch {
  competencyKey: CompetencyKey;
  /** The plan's priority number of the best (lowest) matching theme. */
  priority: number;
  /** That theme's title, verbatim from the plan. */
  theme: string;
}

/** PURE. Competencies matched by at least one priority theme, best priority kept. */
export function themeMatchesFromPlan(
  themes: ReadonlyArray<{ priority: number; theme: string; whyItMatters?: string }>,
): Map<CompetencyKey, ThemeMatch> {
  const out = new Map<CompetencyKey, ThemeMatch>();
  const ordered = themes.slice().sort((a, b) => a.priority - b.priority);
  for (const t of ordered) {
    let keys = COMPETENCIES.map((c) => c.key).filter((k) => THEME_KEYWORDS[k].test(t.theme));
    if (keys.length === 0 && t.whyItMatters) {
      keys = COMPETENCIES.map((c) => c.key).filter((k) => THEME_KEYWORDS[k].test(t.whyItMatters!));
    }
    for (const key of keys) {
      if (!out.has(key)) out.set(key, { competencyKey: key, priority: t.priority, theme: t.theme });
    }
  }
  return out;
}

/** Reads `priorityThemes` off a stored plan's `content` defensively (Json). */
export function priorityThemesFromContent(
  content: unknown,
): Array<{ priority: number; theme: string; whyItMatters?: string }> {
  if (!content || typeof content !== "object") return [];
  const raw = (content as Record<string, unknown>).priorityThemes;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ priority: number; theme: string; whyItMatters?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.theme !== "string" || typeof t.priority !== "number") continue;
    out.push({
      priority: t.priority,
      theme: t.theme,
      whyItMatters: typeof t.whyItMatters === "string" ? t.whyItMatters : undefined,
    });
  }
  return out;
}
