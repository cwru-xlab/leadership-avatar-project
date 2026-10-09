/**
 * Pure, deterministic hostility and severe-content classification over
 * student text. This module decides NOTHING about termination or
 * walk-outs — it only classifies a string into one of three tiers. The
 * avatar's own structured cue (Phase 18's `rising` / `high` disengagement
 * cue) can accelerate an already-computed signal elsewhere, but it can
 * NEVER reach this module and can never decide hostility on its own
 * (REQ-79's invariant, unchanged). No model call, no I/O, no clock, no
 * randomness: the same input text always returns the same verdict.
 *
 * The core design constraint (REQ-97): these difficult-conversation
 * scenarios are *about* confrontation — firing someone, confronting a low
 * performer, declining a senior's request — and firm, uncomfortable
 * language is the POINT, not a defect. Only language aimed AT THE PERSON
 * counts as hostile: insults, contempt, threats against their standing.
 * Judgement of their WORK, PERFORMANCE, a DECISION, a POSITION, a
 * SITUATION or a RESULT is firm, not hostile, however harsh the adjective.
 * A detector that fires on the seeded "firing someone" conversation's
 * intended register is broken, not strict.
 *
 * ============================================================================
 * CALIBRATION — every number below is PROVISIONAL UNTIL CALIBRATED
 * ============================================================================
 * Phase 18's calibration policy applies verbatim (18-VALIDATION.md):
 * "Do not retune thresholds, weights, or cue acceleration without explicit
 * human calibration approval." Nothing in this module has been tuned
 * against a live session or a human-labelled transcript. The ONLY evidence
 * behind every constant in this file is `scripts/verify-hostility-detector.ts`'s
 * fixture corpus — the false-positive corpus built from the seven seeded
 * scenarios' own register, the true-positive corpus of person-targeted
 * attacks, and the severe-content placeholder corpus. That is a reasonable
 * starting point (12-TUNING.md's precedent: record what a number is based
 * on, do not imply it was tuned) but it is NOT a human-reviewed calibration
 * pass, and none of these numbers may be changed without that review:
 *
 *   - SHOUTING_CAPS_RATIO (0.6), SHOUTING_MIN_LENGTH (15),
 *     SHOUTING_MIN_WORDS (4): chosen so "HR", "OK", and short acronyms can
 *     never qualify as shouting, and so the two ALL-CAPS corpus rows in
 *     `HOSTILE` ("I DON'T CARE WHAT YOU THINK...", "YOU ARE THE PROBLEM
 *     HERE...") trip while no `FIRM_NOT_HOSTILE` row (none of which uses
 *     sustained caps) ever does. No real shouting session was measured.
 *   - The leet-substitution map and the single-letter-padding collapse
 *     regex: based on common evasion patterns named in the plan
 *     (`f*ck`, `i d i o t`), not measured against real evasion attempts.
 *     No corpus row in the current fixture exercises this path end to end.
 * ============================================================================
 */

export const HOSTILITY_TIERS = ["none", "hostile", "severe"] as const;
export type HostilityTier = (typeof HOSTILITY_TIERS)[number];

export interface HostilityVerdict {
  tier: HostilityTier;
  /** True iff tier === "severe". Convenience flag for callers. */
  severe: boolean;
  /**
   * Which rule-groups fired, for the eventual report's effect text. This is
   * ALWAYS the rule-group name (e.g. "insult", "severe_harassment") and
   * NEVER the matched span — no caller can accidentally quote a slur or an
   * insult back out of this module by reading `matched`.
   */
  matched: string[];
}

// ---------------------------------------------------------------------------
// Normalization — evasion handling (PROVISIONAL, see header)
// ---------------------------------------------------------------------------

/** 0 -> o, 1 -> i, 3 -> e, 4 -> a, @ -> a, $ -> s, 7 -> t. */
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  $: "s",
  "7": "t",
};

/** Matches a run of single letters separated by spaces/punctuation, e.g. "i d i o t" or "f*ck". */
const SPACED_LETTER_RUN = /\b(?:[a-z](?:[\s._*-]+))+[a-z]\b/g;

/**
 * Lowercases, maps common leet substitutions, and collapses character
 * padding / separator evasion so lexicon matching is not defeated by
 * `i-d-i-o-t` or `f*ck`. Used ONLY for lexicon matching, never for the
 * ALL-CAPS shouting signal (which reads the original text).
 */
function normalizeForMatching(text: string): string {
  let working = text.toLowerCase();

  working = working.replace(/[01347@$]/g, (char) => LEET_MAP[char] ?? char);
  working = working.replace(SPACED_LETTER_RUN, (run) =>
    run.replace(/[\s._*-]+/g, ""),
  );

  return working;
}

/** Splits on clause boundaries so a distant pronoun cannot be joined to a judgement about a position. */
const CLAUSE_BOUNDARY = /[.!?;,]+|\band\b|\bbut\b/gi;

function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_BOUNDARY)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Targeting — the TARGETING rule is the whole design
// ---------------------------------------------------------------------------

/** Second-person reference: the only thing that makes an attack term about THIS listener. */
const SECOND_PERSON_PATTERN = /\b(you|your|you're|yourself)\b/i;

/**
 * Judgement of WORK, PERFORMANCE, a DECISION, a POSITION, a SITUATION or a
 * RESULT is never hostile, even when harsh ("unacceptable", "final
 * warning", "this is a mess"). When an attack-adjacent clause's object is
 * one of these, the clause is firm, not hostile — corpus rows:
 * "Your performance has been unacceptable and this is your final warning."
 * (confront-low-performer), "This decision is final..." (fire-team-member).
 */
const POSITION_OBJECT_PATTERN =
  /\b(performance|work|decision|approach|proposal|plan|situation|result|outcome|grade|rubric|process|deadline|request|scope|project|employment)\b/i;

/**
 * A consequence stated about a PROCESS (HR, a formal process, a
 * performance plan, escalation, termination, a grade appeal, a deadline, a
 * contract) is not a threat to the person. Corpus rows: "I will escalate
 * this to HR if we cannot agree a plan.", "If this does not change there
 * will be a formal process."
 */
const PROCESS_CONSEQUENCE_PATTERN =
  /\b(hr|human resources|formal process|performance (plan|review)|escalat\w*|terminat\w*|grade appeal|written warning|contract|deadline|rubric)\b/i;

function hasPersonTargeting(clause: string): boolean {
  return SECOND_PERSON_PATTERN.test(clause);
}

// ---------------------------------------------------------------------------
// HOSTILE lexicon — grouped attack terms, each its own `matched` string
// ---------------------------------------------------------------------------

/** Demeaning nouns/adjectives applied to a person. Requires explicit second-person targeting in the same clause. */
const INSULT_TERMS =
  /\b(idiot|useless|pathetic|moron|loser|incompetent|garbage|trash|a joke|waste of time)\b/;

/**
 * Self-contained sneering phrases — inherently aimed at the listener, no
 * separate targeting check needed (the phrase already addresses "you").
 */
const CONTEMPT_PHRASES =
  /\b(anyone competent would|anyone smart would|anyone decent would|are you (stupid|dumb|serious|kidding))\b/;

/**
 * Self-contained profanity phrases whose object is the listener (imperative
 * commands carry an implied "you" with no literal pronoun — "shut the hell
 * up" still addresses the person being spoken to).
 */
const PROFANITY_AT_PERSON_PHRASES =
  /\b(shut (the hell )?up|screw you|go to hell|get lost|f[*]?ck you)\b/;

/**
 * Harm/consequence aimed at the PERSON's standing, not a process. Each
 * phrase is self-contained and inherently targeted. `PROCESS_CONSEQUENCE_PATTERN`
 * vetoes this category for a clause that also names a legitimate process —
 * see corpus rows above.
 */
const THREAT_TO_PERSON_PHRASES =
  /\b(you'?ll regret|you will regret|regret this.{0,20}i promise|make sure you never|come after you|watch yourself|ruin your (life|career|reputation)|end your career|destroy your (career|reputation)|never work (in this industry|here) again)\b/;

// ---------------------------------------------------------------------------
// ALL-CAPS shouting signal — computed on the ORIGINAL text (PROVISIONAL)
// ---------------------------------------------------------------------------

const SHOUTING_CAPS_RATIO = 0.6;
const SHOUTING_MIN_LENGTH = 15;
const SHOUTING_MIN_WORDS = 4;

/**
 * Minimum length/word-count floors so short acronyms ("HR", "OK") can never
 * qualify as shouting on their own.
 */
function isShoutingSignal(original: string): boolean {
  const trimmed = original.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  if (
    trimmed.length < SHOUTING_MIN_LENGTH ||
    words.length < SHOUTING_MIN_WORDS
  ) {
    return false;
  }

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");

  if (letters.length === 0) return false;

  const upperLetters = letters.replace(/[^A-Z]/g, "");

  return upperLetters.length / letters.length >= SHOUTING_CAPS_RATIO;
}

// ---------------------------------------------------------------------------
// SEVERE lexicon — a separate, deliberately minimal, enumerable tier
// ---------------------------------------------------------------------------

/**
 * Severe content fires regardless of targeting — a slur does not need a
 * "you". The real-word list here is minimal and deliberately incomplete:
 * this phase proves the TIER exists and is separate from ordinary
 * hostility, not a dictionary audit. Each entry is a category, not a slur
 * list, so no real slur text needs to live in this file; the placeholder
 * tokens below exist ONLY so the fixture corpus can prove the tier is
 * reachable without committing real slur text to the repo.
 */
const SEVERE_HARASSMENT_PHRASES =
  /\b(wear something (tighter|sexier).{0,20}(like watching|like looking)|nicer to me in private.{0,30}go (a lot )?better|keep touching (my|your) (arm|hand|leg).{0,40}where it goes)\b/i;

/**
 * Masked placeholder tokens used only by `scripts/verify-hostility-detector.ts`'s
 * SEVERE corpus, so the fixture never needs to commit a real slur. A real
 * deployment's severe lexicon is edited in THIS one place.
 */
export const SEVERE_PLACEHOLDER_TOKENS = [
  "[SLUR_PLACEHOLDER_ETHNIC]", // stands for an ethnic/racial slur
  "[SLUR_PLACEHOLDER_GENDER]", // stands for a gender-based slur
  "[SLUR_PLACEHOLDER_ORIENTATION]", // stands for a slur targeting sexual orientation
] as const;

const SEVERE_PLACEHOLDER_PATTERN = new RegExp(
  SEVERE_PLACEHOLDER_TOKENS.map((token) =>
    token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"),
  "i",
);

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export function detectHostility(text: string): HostilityVerdict {
  const matched = new Set<string>();

  // --- SEVERE tier: checked first, fires regardless of targeting ---------
  if (SEVERE_PLACEHOLDER_PATTERN.test(text)) {
    matched.add("severe_identity_slur");
  }
  if (SEVERE_HARASSMENT_PHRASES.test(normalizeForMatching(text))) {
    matched.add("severe_harassment");
  }

  if (matched.size > 0) {
    return { tier: "severe", severe: true, matched: sortUnique(matched) };
  }

  // --- HOSTILE tier: attack term AND person-targeting, clause by clause --
  const normalized = normalizeForMatching(text);
  const clauses = splitClauses(normalized);

  for (const clause of clauses) {
    const positionObject = POSITION_OBJECT_PATTERN.test(clause);
    const processConsequence = PROCESS_CONSEQUENCE_PATTERN.test(clause);

    if (CONTEMPT_PHRASES.test(clause)) {
      matched.add("contempt");
    }

    if (PROFANITY_AT_PERSON_PHRASES.test(clause)) {
      matched.add("profanity_at_person");
    }

    if (
      THREAT_TO_PERSON_PHRASES.test(clause) &&
      !processConsequence // a consequence stated about a process is not a threat
    ) {
      matched.add("threat_to_person");
    }

    if (
      INSULT_TERMS.test(clause) &&
      hasPersonTargeting(clause) &&
      !positionObject // judgement of the position/decision/result is firm, not hostile
    ) {
      matched.add("insult");
    }
  }

  // Shouting counts as hostile only when it co-occurs with second-person
  // targeting ANYWHERE in the text (shouting is a whole-message signal,
  // read from the ORIGINAL text, not the clause-split normalized copy).
  if (isShoutingSignal(text) && SECOND_PERSON_PATTERN.test(text)) {
    matched.add("shouting");
  }

  if (matched.size > 0) {
    return { tier: "hostile", severe: false, matched: sortUnique(matched) };
  }

  return { tier: "none", severe: false, matched: [] };
}

function sortUnique(values: Set<string>): string[] {
  return Array.from(values).sort();
}
