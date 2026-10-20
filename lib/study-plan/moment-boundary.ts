/**
 * The SCOPED EXCEPTION to the study-plan privacy boundary.
 *
 * `lib/study-plan/generate.ts` carries a hard filter: the model receives only
 * anonymous report ordinals, two score aggregates, and closed-vocabulary
 * rubric label/rating strings. That filter is correct for study-plan
 * synthesis and stays UNCHANGED by this module.
 *
 * 21-CONTEXT.md locks the opposite requirement for knowledge checks and
 * coached practice: content must be generated from the student's OWN session
 * moments — real transcript turns, quoted verbatim (REQ-110) — not a generic
 * authored bank. A closed-vocabulary feed cannot satisfy that. Both
 * requirements cannot hold on one path, so this module opens a SECOND,
 * NAMED, narrower path instead of loosening the first.
 *
 * See `.planning/phases/21-adaptive-mastery-path/21-PRIVACY-BOUNDARY.md` for
 * the full written record: what this widens, why, and what it does not
 * permit.
 *
 * This module does NOT import from, and must never import from,
 * `./generate` — that file's filter is the thing this module's own verifier
 * (`scripts/verify-moment-boundary.ts`) proves is unchanged.
 */
import type { SessionMoment } from "./moments";

/**
 * The exception, as data rather than prose, so it can be asserted against
 * rather than merely read.
 */
export const MOMENT_BOUNDARY_POLICY = {
  permits: [
    "the student's own verbatim transcript turns, for the user whose checks are being generated",
    "the avatar's immediately preceding turn, as the setup the student was responding to",
    "the student's own report growth-area titles and the competency keys they map to",
  ],
  forbids: [
    "the student's name, email, employer, school, or any resume field",
    "any OTHER person's name or identity, including a third-party persona pasted for networking distillation",
    "report prose beyond growth-area titles",
    "any turn from a report the requesting user does not own",
    "the deck, its slides, or any uploaded artifact text",
  ],
  scope: "knowledge-check and coached-session generation only — NOT study-plan synthesis",
  unchanged_path: "lib/study-plan/generate.ts keeps its closed-vocabulary filter",
} as const;

/** PROVISIONAL UNTIL CALIBRATED: 12 moments is enough slack for a 5-10 step
 * path's worth of knowledge checks without needing every moment a session
 * produced. */
export const MAX_MOMENTS = 12;

/** PROVISIONAL UNTIL CALIBRATED: 8,000 characters keeps one generation
 * request comfortably inside a single completion call without truncating a
 * quote mid-sentence. */
export const MAX_TOTAL_CHARACTERS = 8_000;

export interface MomentGenerationPayload {
  moments: SessionMoment[];
  /** Moments dropped because redaction would have altered a quotable span. */
  droppedForRedaction: number;
  /** Moments dropped solely because the moment/character caps bound. */
  droppedForCap: number;
  totalCharacters: number;
}

interface PrepareArgs {
  requestingUserId: string;
  moments: SessionMoment[];
  /** The userId that produced each entry in `moments`, SAME LENGTH and SAME
   * ORDER as `moments`. Checked against `requestingUserId` before any text is
   * touched. */
  momentOwnerUserIds: string[];
  /**
   * REQUIRED, not optional. Redaction rewrites the student's own display
   * names to `[me]`, and it cannot do that without being told what those
   * names are. An optional parameter here would let a caller silently skip
   * redaction by forgetting it — the exact failure this boundary exists to
   * prevent. Callers (21-10, 21-25) must always supply this.
   */
  selfNames: string[];
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
// Phone-shaped digit runs: at least 7 digits, allowing common separators.
const PHONE_PATTERN = /\b(?:\+?\d[\d\-.\s()]{6,}\d)\b/g;

/**
 * Redacts a text field in place and reports whether anything changed.
 *
 * NOTE ON SCOPE: this is a STRUCTURAL redactor, not a semantic one. It
 * catches emails, URLs, phone-shaped digit runs, and the requesting
 * student's own name tokens — patterns it can recognize by shape or by an
 * exact name match it was explicitly given. It does NOT attempt general
 * named-entity recognition or any model-based PII detection: a model
 * judgement call inside a privacy guarantee is exactly the pattern
 * 21-CONTEXT.md's deterministic-over-model constraint rules out. The
 * residual risk this accepts — an arbitrary third party the student
 * happened to name aloud mid-session, which this redactor cannot
 * recognize — is recorded in 21-PRIVACY-BOUNDARY.md, not hidden here. The
 * mitigation in place is that ANY moment altered by this function is
 * dropped entirely by the caller, never sent redacted.
 */
function redact(text: string, selfNames: string[]): { output: string; changed: boolean } {
  let output = text;
  output = output.replace(EMAIL_PATTERN, "[email]");
  output = output.replace(URL_PATTERN, "[link]");
  output = output.replace(PHONE_PATTERN, "[phone]");

  for (const name of selfNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "g");
    output = output.replace(pattern, "[me]");
  }

  return { output, changed: output !== text };
}

/**
 * Prepares a capped, redacted, ownership-checked payload of session moments
 * for a knowledge-check or coached-practice generator. The ONLY path by
 * which transcript text may reach a model call.
 */
export function prepareMomentsForGeneration(args: PrepareArgs): MomentGenerationPayload {
  const { requestingUserId, moments, momentOwnerUserIds, selfNames } = args;

  // 1. OWNERSHIP FIRST — before any text is touched. This is the only check
  // whose failure means a cross-user leak, so nothing else runs first.
  for (const ownerId of momentOwnerUserIds) {
    if (ownerId !== requestingUserId) {
      throw new Error(
        "prepareMomentsForGeneration: moment ownership mismatch — refusing to generate.",
      );
    }
  }

  // 2. REDACTION. A moment whose studentText is altered by redaction is
  // DROPPED entirely, never sent in redacted form — a redacted line can no
  // longer satisfy REQ-110's verbatim guarantee, and a question quoting
  // `[email]` would be a misquote of the student.
  let droppedForRedaction = 0;
  const survivingRedaction: SessionMoment[] = [];
  for (const moment of moments) {
    const studentResult = redact(moment.studentText, selfNames);
    const avatarText = moment.precedingAvatarText;
    const avatarResult =
      avatarText !== null ? redact(avatarText, selfNames) : { output: null, changed: false };

    if (studentResult.changed) {
      droppedForRedaction += 1;
      continue;
    }

    survivingRedaction.push({
      ...moment,
      // studentText is guaranteed byte-identical to the input here, since
      // studentResult.changed is false.
      studentText: moment.studentText,
      precedingAvatarText: avatarResult.changed ? avatarResult.output : avatarText,
    });
  }

  // 3. CAP. At most MAX_MOMENTS and at most MAX_TOTAL_CHARACTERS, whichever
  // binds first, keeping the most recent (by turnIndex).
  const mostRecentFirst = [...survivingRedaction].sort((a, b) => b.turnIndex - a.turnIndex);

  const kept: SessionMoment[] = [];
  let totalCharacters = 0;
  let droppedForCap = 0;
  let capBound = false;

  for (const moment of mostRecentFirst) {
    const momentChars =
      moment.studentText.length + (moment.precedingAvatarText?.length ?? 0);

    if (!capBound && kept.length < MAX_MOMENTS && totalCharacters + momentChars <= MAX_TOTAL_CHARACTERS) {
      kept.push(moment);
      totalCharacters += momentChars;
    } else {
      // Once either cap binds, everything older (we are iterating
      // most-recent-first) is dropped too, so "most recent survives" holds
      // without a later, smaller moment sneaking back in past a cap that
      // already bound.
      capBound = true;
      droppedForCap += 1;
    }
  }

  // Restore chronological order (original turnIndex ascending) for the
  // survivors, since "most recent" was only needed to decide who survives.
  kept.sort((a, b) => a.turnIndex - b.turnIndex);

  return {
    moments: kept,
    droppedForRedaction,
    droppedForCap,
    totalCharacters,
  };
}
