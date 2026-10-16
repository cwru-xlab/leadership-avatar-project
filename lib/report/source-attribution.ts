/**
 * The guarantee that a resume-attributed feedback item is impossible when
 * no resume was ever uploaded.
 *
 * WHY THIS EXISTS: the interview evaluator self-declares a `source` on each
 * strength/growth area (`lib/report/structured.ts`'s `FeedbackSource`) —
 * the same self-report mechanism Phase 12/18 already use for a closed
 * vocabulary. A model's self-declared source is not independently
 * verifiable when a resume DID exist, but when `resume_text` degrades to
 * the literal `(No resume was provided.)` (`lib/engine/evaluation.ts`), code
 * CAN and must guarantee the claim never survives: there is no document to
 * attribute anything to.
 *
 * Pure. No Prisma, no network, no React, no import outside `./structured`.
 * Applied inside `validateEvaluationResult` — the one server exit for a
 * report body — never inside a component.
 */

import type { StructuredReport } from "./structured";

export interface EnforceSourceAttributionResult {
  report: StructuredReport;
  /** Number of `resume`/`both` sources rewritten to `conversation`. */
  downgradedCount: number;
}

/**
 * Rewrites every unsupportable resume claim to `conversation` and returns a
 * new report object (the input is never mutated).
 *
 * - `opts.hasResume === true`: returned unchanged, `downgradedCount: 0`.
 * - `opts.hasResume === false`: every `source` of `"resume"` or `"both"` on
 *   both lists becomes `"conversation"`, counted. `null` and `"conversation"`
 *   are left exactly as they are — a null must never become `"conversation"`,
 *   because absence of a declaration is not a declaration.
 */
export function enforceSourceAttribution(
  report: StructuredReport,
  opts: { hasResume: boolean },
): EnforceSourceAttributionResult {
  if (opts.hasResume) {
    return { report, downgradedCount: 0 };
  }

  let downgradedCount = 0;

  const downgrade = <T extends { source?: StructuredReport["strengths"][number]["source"] }>(
    item: T,
  ): T => {
    if (item.source === "resume" || item.source === "both") {
      downgradedCount += 1;
      return { ...item, source: "conversation" };
    }
    return item;
  };

  const strengths = report.strengths.map(downgrade);
  const growthAreas = report.growth_areas.map(downgrade);

  return {
    report: { ...report, strengths, growth_areas: growthAreas },
    downgradedCount,
  };
}
