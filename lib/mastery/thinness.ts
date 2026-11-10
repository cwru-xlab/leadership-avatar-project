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
 * The sum is over ACTIVITIES, not ledger rows (`computeMastery` collapses
 * them first): one session's rows are one reading of the student, so a
 * coached session with three graded legs is still one piece of evidence.
 *
 * Neither number below has been validated against real student data. They
 * are derived from the 21-CONTEXT.md example and the weight table's own
 * anchor (`LIVE_SESSION` weight = 1.0):
 *   - `thinBelowWeightSum = 3.0` — one or two unaided live sessions are thin.
 *     21-CONTEXT.md's EXACT example of a figure that "still displays, with
 *     thinness flagged" is "a competency backed by two sessions", so two has
 *     to land below the line (the earlier 2.0 put it just above).
 *   - `establishedAtWeightSum = 6.0` — roughly six unaided live sessions'
 *     worth. Past this point a figure stops swinging materially on one more
 *     data point: with the prior's two sessions, one more session moves it
 *     by at most ~1/9 of its distance from that session's score.
 *
 * A future calibration pass should grep this file for
 * "PROVISIONAL UNTIL CALIBRATED" before touching either number — the Phase
 * 20 convention for provisional figures (see `lib/mastery/weights.ts`'s
 * `CONTRIBUTION_WEIGHTS` for the sibling instance of this convention).
 */
export const THINNESS_THRESHOLDS = {
  /** Below this weighted sum, the figure is THIN. */
  thinBelowWeightSum: 3.0,
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
    disclosure: "No scored sessions or checks for this skill yet.",
  },
  THIN: {
    label: "Early read",
    disclosure:
      "One or two sessions can't settle a skill, so this starts near the middle of the scale and moves toward your real scores as you practice.",
  },
  EMERGING: {
    label: "Taking shape",
    disclosure: "There is real evidence behind this now, but a few more sessions could still move it.",
  },
  ESTABLISHED: {
    label: "Solid read",
    disclosure: null,
  },
};

/**
 * How sure the figure is, as filled steps out of 3, for the confidence pips.
 * Derived from the tier so the estimate and its confidence stay two separate
 * things a student reads separately, never one blended number.
 */
export const TIER_CONFIDENCE: Record<EvidenceTier, 0 | 1 | 2 | 3> = {
  NONE: 0,
  THIN: 1,
  EMERGING: 2,
  ESTABLISHED: 3,
};

/** Display rounding by tier: an early read is not known to the point. */
export function roundedPercentFor(percent: number, tier: EvidenceTier): number {
  return tier === "THIN" ? Math.round(percent / 5) * 5 : Math.round(percent);
}

/**
 * The one way a mastery percent becomes text: whole numbers only, to the
 * nearest 5 and "about" for a THIN figure, "about" for an EMERGING one. A
 * decimal would claim a precision no rubric-scored session has.
 */
export function displayPercentFor(
  percent: number | null,
  tier: EvidenceTier
): { rounded: number | null; approximate: boolean; display: string } {
  if (percent === null) {
    return { rounded: null, approximate: false, display: "Not yet measured" };
  }
  const rounded = roundedPercentFor(percent, tier);
  const approximate = tier !== "ESTABLISHED";
  return { rounded, approximate, display: `${approximate ? "about " : ""}${rounded}%` };
}

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
