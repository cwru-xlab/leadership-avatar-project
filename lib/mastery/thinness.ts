/**
 * Evidence-thinness tiers attached to every mastery figure.
 *
 * 21-CONTEXT.md names both failure modes explicitly: a thin figure must
 * never be WITHHELD (not shown at all), and must never be PRESENTED AS IF
 * WELL-EVIDENCED (shown bare, with no indication of how little sits behind
 * it). "A competency backed by two sessions still displays, with an
 * explicit indication of how little evidence sits behind it."
 *
 * The precedents named by 21-CONTEXT.md for how absence/thinness has been
 * presented elsewhere in this app: Phase 10's coverage handling
 * (`visualUnscoredReason` / `vocalUnscoredReason` carry WHY a thing is
 * unscored, rather than coercing the figure to a value) and Phase 12's thin
 * visual-data handling. The pattern both establish — and this module
 * follows — is: never coerce absence or thinness into a bare number; carry
 * a reason/disclosure alongside it instead.
 */

/** The four evidence tiers a mastery figure can carry. */
export const EVIDENCE_TIERS = ["NONE", "THIN", "EMERGING", "ESTABLISHED"] as const;

export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

/**
 * THINNESS_THRESHOLDS — PROVISIONAL UNTIL CALIBRATED.
 *
 * Both numbers are weight-sum thresholds, NOT raw contribution-count
 * thresholds. This is the discretion call 21-CONTEXT.md leaves open, and the
 * reasoning needs to be on record: a count-based threshold would treat four
 * model-graded rewrites (4 contributions x 0.20 weight = 0.8 of weighted
 * evidence, per `lib/mastery/weights.ts`'s `CONTRIBUTION_WEIGHTS`) as equal
 * evidence to four live sessions (4 x 1.00 = 4.0) — and the entire point of
 * 21-05's weight table is that those are NOT equal evidence. Thresholding on
 * the same weighted sum the figure itself is computed from keeps one notion
 * of "evidence" in the system, instead of a count-based notion for thinness
 * and a weight-based notion for the percentage disagreeing with each other.
 *
 * Neither number below has been validated against real student data. They
 * are derived from the 21-CONTEXT.md example and the weight table's own
 * anchor (`LIVE_SESSION` weight = 1.0):
 *   - `thinBelowWeightSum = 2.0` — roughly two unaided live sessions' worth
 *     of weighted evidence. This is the EXACT example 21-CONTEXT.md gives
 *     for "still displays, with thinness flagged" ("a competency backed by
 *     two sessions").
 *   - `establishedAtWeightSum = 6.0` — roughly six unaided live sessions'
 *     worth. Past this point a weighted mean stops swinging materially on
 *     one more data point (one more LIVE_SESSION contribution moves the
 *     mean by at most ~1/7 of its prior distance from that contribution's
 *     score, which is a small enough swing to call the figure settled
 *     rather than still finding its footing).
 *
 * A future calibration pass should grep this file for
 * "PROVISIONAL UNTIL CALIBRATED" before touching either number — the Phase
 * 20 convention for provisional figures (see `lib/mastery/weights.ts`'s
 * `CONTRIBUTION_WEIGHTS` for the sibling instance of this convention).
 */
export const THINNESS_THRESHOLDS = {
  /** Below this weighted sum, the figure is THIN. */
  thinBelowWeightSum: 2.0,
  /** At or above this weighted sum, the figure is ESTABLISHED. */
  establishedAtWeightSum: 6.0,
} as const;

/**
 * Per-tier disclosure copy, keyed by tier and co-located with the tier
 * definitions themselves. Putting the words a UI must show HERE — rather
 * than in a component — means a component cannot render a figure without
 * already having the matching disclosure string in hand. That is the
 * mechanical half of "never presented as if well-evidenced": there is no
 * code path that reaches a percent without also reaching its disclosure.
 */
export const TIER_DISCLOSURE: Record<
  EvidenceTier,
  { label: string; disclosure: string | null }
> = {
  NONE: {
    label: "Not yet measured",
    disclosure: "No scored sessions or checks for this competency yet.",
  },
  THIN: {
    label: "Early signal",
    disclosure:
      "Based on very little evidence so far — a session or two. Treat this figure as a first read, not a settled score.",
  },
  EMERGING: {
    label: "Building evidence",
    disclosure:
      "Based on a growing but still moderate amount of evidence. This figure will firm up with more sessions and checks.",
  },
  ESTABLISHED: {
    label: "Well-evidenced",
    disclosure: null,
  },
};

/**
 * Resolves the evidence tier for a mastery figure from its raw evidence
 * count and weighted-evidence sum.
 *
 * `evidenceCount === 0` is checked FIRST, and decided on COUNT rather than
 * weight. A zero weight sum with a non-zero count would mean a bug in the
 * weight table (every known `ContributionSource` has a positive weight per
 * `lib/mastery/weights.ts`), and conflating that bug with "no evidence"
 * would hide it behind a tier that looks like an ordinary, legitimate state
 * instead of surfacing as the data inconsistency it actually is.
 */
export function evidenceTierFor(args: {
  evidenceCount: number;
  weightSum: number;
}): EvidenceTier {
  const { evidenceCount, weightSum } = args;

  if (evidenceCount < 0) {
    throw new Error(
      `evidenceTierFor: evidenceCount must not be negative, got ${evidenceCount}`
    );
  }
  if (weightSum < 0) {
    throw new Error(
      `evidenceTierFor: weightSum must not be negative, got ${weightSum}`
    );
  }

  if (evidenceCount === 0) {
    return "NONE";
  }

  if (weightSum < THINNESS_THRESHOLDS.thinBelowWeightSum) {
    return "THIN";
  }

  if (weightSum >= THINNESS_THRESHOLDS.establishedAtWeightSum) {
    return "ESTABLISHED";
  }

  return "EMERGING";
}
