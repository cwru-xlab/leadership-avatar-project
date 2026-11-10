/**
 * The report check-in: one question per flagged visual observation, asked of
 * the student at the top of their own report.
 *
 * WHY: every detector behind these flags is UNTUNED (see `body-thresholds.ts`)
 * and the camera sees motion, not reasons (see `VisualDescriptiveObservations`
 * in `lib/metrics/types.ts`). Asking the one person who knows turns a flag that
 * may well be wrong into a calibration record, and lets the student take the
 * flag off their own report when it was wrong.
 *
 * WHAT THIS NEVER DOES. An answer never changes a score, never regenerates the
 * report and never reaches a model. "Yes" adds one FIXED coaching line from
 * this file; "No" and "Something else" hide that flag's rows on this report
 * for display only. The stored measurement is never edited, so the record
 * survives every answer and every change of answer.
 *
 * WORDING RULES, binding on every entry below: describe what the camera saw
 * and when, then ask. Never name a cause as fact, never accuse, coach in the
 * second person. "Something else" always lists the innocent explanations the
 * detector cannot tell apart from the flagged one. Ask about the OBSERVATION,
 * not the act — "Was there food or a drink on camera?", never "Were you
 * eating?": the camera saw an object and some motion, and the difference is
 * the whole distance between a question and an accusation.
 *
 * CORROBORATE BEFORE ASKING. A question costs the student attention and
 * implies the detector has a case, so a flag built on geometry alone waits for
 * an independent witness: both eating questions require the object model to
 * have ALSO seen a cup, bottle or food (`hasFoodOrDrink`). Measured on this
 * project's own reports, the uncorroborated version asked about eating on 5 of
 * the 8 sessions recorded since the signals shipped, and the two genuine
 * firings had zero seconds of food or drink in frame. A detector may describe
 * what it saw on the report; it must clear a higher bar to interrupt.
 *
 * ONE QUESTION PER HYPOTHESIS. `hand_at_mouth` and `mouth_movement` both test
 * "was this student eating", so only one of them ever asks — see their `when`
 * functions. Two questions about one hypothesis read as an accusation being
 * pressed rather than a check.
 *
 * ADDING A FLAG (notes reading, lying down, camera motion, yawning...): add an
 * id to `CHECK_IN_FLAG_IDS` and one entry to `CHECK_IN_FLAGS`. Detection,
 * wording, options, validation, hiding, storage and the calibration tally all
 * read from that one entry. Do not add a detector here: an entry only reads a
 * field the capture pipeline already stores.
 *
 * STORAGE: answers live under `check_in` on the report row's `visualMetrics`
 * JSON (`STORED_CHECK_IN_KEY`), which every reader of that column strips —
 * see `withoutStoredCheckIn` in `lib/metrics/types.ts`. This module stays
 * pure (no react, no prisma) so the route, the page and the tally script all
 * run the same rules.
 */
import { formatTimecode } from "@/lib/metrics/bands";
import type {
  VisualDescriptiveEpisodeKind,
  VisualEpisodeKind,
  VisualMetrics,
} from "@/lib/metrics/types";

export { STORED_CHECK_IN_KEY } from "@/lib/metrics/types";

/** Bumped only if a stored entry's shape changes incompatibly. */
export const CHECK_IN_VERSION = 1;

export const CHECK_IN_FLAG_IDS = [
  "hand_at_mouth",
  "mouth_movement",
  "hand_shape",
  "another_person",
  "phone",
] as const;
export type CheckInFlagId = (typeof CHECK_IN_FLAG_IDS)[number];

export const CHECK_IN_ANSWERS = ["yes", "no", "other"] as const;
export type CheckInAnswer = (typeof CHECK_IN_ANSWERS)[number];

/** Button labels for the three answers. One vocabulary for every flag. */
export const CHECK_IN_ANSWER_LABELS: Record<CheckInAnswer, string> = {
  yes: "Yes",
  no: "No",
  other: "Something else",
};

/**
 * Seconds a phone must have been visible before the check-in asks about it.
 * Higher than `PHONE_MIN_VISIBLE_S` (which only gates the Observations row),
 * because asking takes the student's attention and a few seconds of a
 * misdetection is not worth it. UNTUNED, like every threshold it sits on;
 * the calibration tally exists to tune it.
 */
export const PHONE_CHECK_IN_MIN_SECONDS = 10;

/**
 * Arrivals at the mouth before the check-in will ASK, against the three
 * (`HAND_AT_MOUTH_REPEAT_MIN_EVENTS`) that put the row on the report. Double
 * the detector's own "repeated" minimum, on the same precedent as
 * `PHONE_CHECK_IN_MIN_SECONDS`: the Observations row states what was seen, but
 * interrupting the student deserves more than the weakest trip the detector
 * can produce.
 *
 * HONEST LIMIT: this gate alone would NOT have suppressed the false positives
 * that prompted it — two real sessions measured 6 and 7 arrivals and neither
 * involved eating. `hasFoodOrDrink` is what suppresses those. This only stops
 * a bare three-arrival trip from costing the student a question.
 *
 * It reads `hand_at_mouth_events`, the count of ALL arrivals in the session
 * rather than just those inside a reported run, because that is the only count
 * stored. The run itself is still required, via `descriptiveWhen`.
 */
export const HAND_AT_MOUTH_CHECK_IN_MIN_EVENTS = 6;

export interface CheckInOption {
  id: string;
  label: string;
}

/** What one flag hides from the report's DISPLAY after "No" or "Something else". */
interface CheckInHides {
  descriptiveKinds?: VisualDescriptiveEpisodeKind[];
  episodeKinds?: VisualEpisodeKind[];
  /** Band-row labels from `lib/metrics/bands.ts` that state this flag. */
  rowLabels?: string[];
}

interface CheckInFlagDefinition {
  id: CheckInFlagId;
  /**
   * When this flag is eligible, a phrase saying when it was seen ("from 2:08
   * to 3:38", "at 5:08", "during the session"); otherwise null. Reads only
   * what the pipeline stored.
   */
  when: (visual: VisualMetrics) => string | null;
  question: (when: string) => string;
  /**
   * Fixed. Shown only after "Yes". Never model-written. Takes the practice
   * type's `CheckInLead` so a pitch is not told "in a real interview".
   */
  yesCoaching: (lead: CheckInLead) => string;
  /** Revealed by "Something else". The last entry is always the catch-all. */
  otherOptions: readonly CheckInOption[];
  hides: CheckInHides;
}

/**
 * How a "Yes" coaching line opens, naming the real situation this practice
 * stands in for ("In a real interview", "When you pitch for real"). Each
 * practice type declares its own on its report chrome
 * (`components/practice/ReportChrome.tsx`), so this module never learns a
 * type slug. The default covers a caller with no type.
 */
export type CheckInLead = string;
export const DEFAULT_CHECK_IN_LEAD: CheckInLead = "In the real conversation";

const OTHER_REASON: CheckInOption = { id: "other", label: "Another reason" };

/**
 * Whether a cup, bottle or food was ALSO seen this session.
 *
 * WHY BOTH EATING QUESTIONS REQUIRE IT. `hand_at_mouth_repeated` and
 * `mouth_movement_silent` are geometry: a fingertip near the lips, and a jaw
 * that kept moving. `VisualDescriptiveObservations` already states the limit
 * ("Not 'eating': sipping water, medical eating needs, tics and thinking
 * habits all read the same"), and `visualObservationRows` already refuses to
 * show the cup row without one of these two signals. The object model is the
 * one independent witness to actual food or drink, and nothing consulted it
 * before asking the student whether they had been eating.
 *
 * Measured across this project's own stored reports: of the sessions that
 * asked, the two genuine ones recorded ZERO seconds of food or drink in
 * frame, and only the seeded fixture had any. That is the whole false-positive
 * rate this gate removes.
 *
 * ABSENT IS NOT ZERO, and neither asks: 0 is the object model reporting it saw
 * none, absent is the model never having run (see the field's own comment in
 * `types.ts`). Neither corroborates, and an uncorroborated guess is what put
 * this question on nearly every report.
 */
function hasFoodOrDrink(v: VisualMetrics): boolean {
  const seconds = v.observations?.food_or_drink_visible_seconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0;
}

/**
 * The hand-at-mouth question's own eligibility, named so `mouth_movement` can
 * stand down whenever this one speaks. Not a method on `CHECK_IN_FLAGS`, which
 * would have to reference itself mid-initialiser.
 */
function handAtMouthWhen(v: VisualMetrics): string | null {
  if (!hasFoodOrDrink(v)) return null;
  const events = v.observations?.hand_at_mouth_events;
  if (typeof events !== "number" || events < HAND_AT_MOUTH_CHECK_IN_MIN_EVENTS) {
    return null;
  }
  return descriptiveWhen(v, "hand_at_mouth_repeated");
}

export const CHECK_IN_FLAGS: Record<CheckInFlagId, CheckInFlagDefinition> = {
  hand_at_mouth: {
    id: "hand_at_mouth",
    // THE ONE EATING QUESTION whenever the hand signal fired, whether or not
    // the mouth signal did. Both rest on the same hypothesis, the student can
    // only answer it once, and being asked about eating twice in one report is
    // most of what made this check-in read as an accusation. `mouth_movement`
    // stands down whenever this entry speaks, so `hides` covers BOTH kinds —
    // one answer now settles both rows.
    when: handAtMouthWhen,
    // Describes the two things the camera saw, then asks about the OBSERVATION
    // rather than the act, as `phone` does ("Was there a phone in view?").
    // The old wording named eating as the hypothesis and demoted water, a
    // medical need, a habit and a mask to "Something else", which this
    // module's own WORDING RULES forbid: never name a cause as fact.
    question: (when) =>
      `We noticed your hand at your mouth repeatedly ${when}, and a cup, bottle or food in frame. Was there food or a drink on camera?`,
    yesCoaching:
      (lead) => `${lead}, finish eating before you join and keep food off camera. A quick sip of water is fine.`,
    otherOptions: [
      { id: "water", label: "Sipping water" },
      { id: "medical", label: "A medical need" },
      { id: "habit", label: "A habit, like nail biting" },
      { id: "mask", label: "Wearing a mask" },
      OTHER_REASON,
    ],
    hides: { descriptiveKinds: ["hand_at_mouth_repeated", "mouth_movement_silent"] },
  },
  mouth_movement: {
    id: "mouth_movement",
    // Asks ONLY when the hand question did not, so no report ever carries two
    // questions about eating. Kept as its own flag id rather than folded into
    // the entry above so answers stored before the merge still parse and still
    // hide their row.
    when: (v) =>
      hasFoodOrDrink(v) && handAtMouthWhen(v) === null
        ? descriptiveWhen(v, "mouth_movement_silent")
        : null,
    question: (when) =>
      `We noticed your mouth moving while you weren't speaking ${when}, and a cup, bottle or food in frame. Was there food or a drink on camera?`,
    yesCoaching: (lead) => `${lead}, finish eating and set gum aside before you join.`,
    otherOptions: [
      { id: "thinking", label: "Thinking or mouthing words" },
      { id: "medical", label: "A medical need" },
      { id: "habit", label: "A habit or tic" },
      { id: "mask", label: "Wearing a mask" },
      OTHER_REASON,
    ],
    hides: { descriptiveKinds: ["mouth_movement_silent"] },
  },
  hand_shape: {
    id: "hand_shape",
    when: (v) => descriptiveWhen(v, "middle_finger_extended"),
    question: (when) =>
      `We noticed a hand shape that can read as an offensive gesture ${when}. Was that intentional?`,
    yesCoaching: (lead) => `${lead}, that gesture could end the exchange. Keep your hands open and relaxed.`,
    otherOptions: [
      { id: "glasses", label: "Adjusting my glasses or face" },
      { id: "signing", label: "Signing" },
      { id: "resting", label: "How my hand naturally rests" },
      OTHER_REASON,
    ],
    hides: { descriptiveKinds: ["middle_finger_extended"] },
  },
  another_person: {
    id: "another_person",
    // The session-level flag is the report's own verdict ("Another person
    // detected"); episodes, when present, only say when.
    when: (v) =>
      Array.isArray(v.posture_flags) && v.posture_flags.includes("multiple_faces_detected")
        ? (episodesWhen(v.episodes ?? [], "multiple_faces", v) ?? "during the session")
        : null,
    question: (when) =>
      `We noticed what looked like another person in frame ${when}. Was someone else there with you?`,
    yesCoaching: (lead) => `${lead}, find a private space so it's just you on camera.`,
    otherOptions: [
      { id: "picture", label: "A photo or poster behind me" },
      { id: "screen", label: "A face on a screen behind me" },
      { id: "passing", label: "Someone passed by briefly" },
      OTHER_REASON,
    ],
    hides: { episodeKinds: ["multiple_faces"], rowLabels: ["Others in frame"] },
  },
  phone: {
    id: "phone",
    // "Visible", never "using": the model sees a phone-shaped object, not
    // what anyone does with it.
    when: (v) => {
      const seconds = v.observations?.phone_visible_seconds;
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < PHONE_CHECK_IN_MIN_SECONDS) {
        return null;
      }
      return descriptiveWhen(v, "phone_visible") ?? `for about ${Math.round(seconds)} seconds`;
    },
    question: (when) => `We noticed a phone visible in frame ${when}. Was there a phone in view?`,
    yesCoaching: (lead) => `${lead}, put your phone away and out of frame before you join.`,
    otherOptions: [
      { id: "object", label: "Another object, like a remote or wallet" },
      { id: "screen", label: "A tablet or second screen" },
      OTHER_REASON,
    ],
    hides: { descriptiveKinds: ["phone_visible"], rowLabels: ["Phone in frame"] },
  },
};

// ---------------------------------------------------------------------------
// Timing phrases
// ---------------------------------------------------------------------------

/** How many ranges a question names before "and N more times". */
const RANGES_NAMED = 2;

function descriptiveWhen(v: VisualMetrics, kind: VisualDescriptiveEpisodeKind): string | null {
  return episodesWhen(v.observations?.episodes ?? [], kind, v);
}

function episodesWhen<K extends string>(
  episodes: { kind: K; start_s: number; end_s: number }[],
  kind: K,
  v: VisualMetrics,
): string | null {
  // Same clock as `descriptiveEpisodeRanges` in bands.ts, so a question and
  // the Observations row quote identical times.
  const raw = v.coverage?.capture_offset_s;
  const offset = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const ranges = episodes
    .filter((episode) => episode.kind === kind)
    .sort((a, b) => a.start_s - b.start_s)
    .map((episode) => ({
      start: formatTimecode(episode.start_s + offset),
      end: formatTimecode(episode.end_s + offset),
    }));
  if (ranges.length === 0) return null;
  const phrase = ({ start, end }: { start: string; end: string }) =>
    start === end ? `at ${start}` : `from ${start} to ${end}`;
  const named = ranges.slice(0, RANGES_NAMED).map(phrase);
  const more = ranges.length - RANGES_NAMED;
  if (more > 0) return `${named.join(", ")} and ${more} more ${more === 1 ? "time" : "times"}`;
  return named.join(" and ");
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface CheckInQuestion {
  id: CheckInFlagId;
  question: string;
  yesCoaching: string;
  otherOptions: readonly CheckInOption[];
}

/**
 * The questions a report should ask, in catalog order. Empty for a legacy
 * report, a camera-off session and a session that flagged nothing. The
 * caller decides READY: a pending or failed report has no body to sit above.
 */
export function eligibleCheckIns(
  cameraMode: string | null | undefined,
  visual: VisualMetrics | null | undefined,
  lead: CheckInLead = DEFAULT_CHECK_IN_LEAD,
): CheckInQuestion[] {
  if (cameraMode !== "ON" || !visual) return [];
  const out: CheckInQuestion[] = [];
  for (const id of CHECK_IN_FLAG_IDS) {
    const flag = CHECK_IN_FLAGS[id];
    const when = flag.when(visual);
    if (when) {
      out.push({ id, question: flag.question(when), yesCoaching: flag.yesCoaching(lead), otherOptions: flag.otherOptions });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stored answers: closed vocabulary in, closed vocabulary out
// ---------------------------------------------------------------------------

export interface CheckInEntry {
  answer: CheckInAnswer;
  /** An `otherOptions` id. Present exactly when `answer` is "other". */
  reason?: string;
  /** ISO time of the latest answer. */
  at: string;
}

export type CheckInAnswers = Partial<Record<CheckInFlagId, CheckInEntry>>;

export interface StoredCheckIn {
  version: typeof CHECK_IN_VERSION;
  answers: CheckInAnswers;
}

function isFlagId(value: unknown): value is CheckInFlagId {
  return typeof value === "string" && (CHECK_IN_FLAG_IDS as readonly string[]).includes(value);
}

function isAnswer(value: unknown): value is CheckInAnswer {
  return typeof value === "string" && (CHECK_IN_ANSWERS as readonly string[]).includes(value);
}

function isReasonFor(flag: CheckInFlagId, value: unknown): value is string {
  return typeof value === "string" && CHECK_IN_FLAGS[flag].otherOptions.some((option) => option.id === value);
}

/**
 * Narrows a stored `check_in` value. Anything outside the vocabulary is
 * dropped entry by entry, so one bad entry never loses the others.
 */
export function asStoredCheckIn(value: unknown): CheckInAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers = (value as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  const out: CheckInAnswers = {};
  for (const [flag, raw] of Object.entries(answers)) {
    if (!isFlagId(flag) || !raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (!isAnswer(entry.answer)) continue;
    if (entry.answer === "other" ? !isReasonFor(flag, entry.reason) : entry.reason !== undefined) continue;
    const at = typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at)) ? entry.at : null;
    if (!at) continue;
    out[flag] = entry.answer === "other"
      ? { answer: "other", reason: entry.reason as string, at }
      : { answer: entry.answer, at };
  }
  return out;
}

export type CheckInInput = { flag: CheckInFlagId; answer: CheckInAnswer; reason?: string };

/**
 * Strict request-body check: exactly `flag`, `answer` and, for "other" only,
 * `reason`, each from its closed vocabulary. Any extra key is a rejection.
 */
export function parseCheckInInput(body: unknown): CheckInInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const allowed = new Set(["flag", "answer", "reason"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  const { flag, answer, reason } = record;
  if (!isFlagId(flag) || !isAnswer(answer)) return null;
  if (answer === "other") return isReasonFor(flag, reason) ? { flag, answer, reason } : null;
  return reason === undefined ? { flag, answer } : null;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** The fixed coaching lines a report shows, one per "Yes", in catalog order. */
export function checkInCoaching(answers: CheckInAnswers, lead: CheckInLead = DEFAULT_CHECK_IN_LEAD): string[] {
  return CHECK_IN_FLAG_IDS.filter((id) => answers[id]?.answer === "yes").map((id) => CHECK_IN_FLAGS[id].yesCoaching(lead));
}

/**
 * The report's visual block with every flag the student answered "No" or
 * "Something else" to taken out, plus the band-row labels to drop. DISPLAY
 * ONLY: scores were set by the evaluator and nothing here reaches them.
 */
export function applyCheckInHiding(
  visual: VisualMetrics,
  answers: CheckInAnswers,
): { visual: VisualMetrics; hiddenRowLabels: Set<string> } {
  const descriptive = new Set<string>();
  const scored = new Set<string>();
  const hiddenRowLabels = new Set<string>();
  for (const id of CHECK_IN_FLAG_IDS) {
    const answer = answers[id]?.answer;
    if (answer !== "no" && answer !== "other") continue;
    const { hides } = CHECK_IN_FLAGS[id];
    hides.descriptiveKinds?.forEach((kind) => descriptive.add(kind));
    hides.episodeKinds?.forEach((kind) => scored.add(kind));
    hides.rowLabels?.forEach((label) => hiddenRowLabels.add(label));
  }
  if (descriptive.size === 0 && scored.size === 0) return { visual, hiddenRowLabels };
  return {
    visual: {
      ...visual,
      episodes: (visual.episodes ?? []).filter((episode) => !scored.has(episode.kind)),
      ...(visual.observations
        ? {
            observations: {
              ...visual.observations,
              episodes: (visual.observations.episodes ?? []).filter((episode) => !descriptive.has(episode.kind)),
            },
          }
        : {}),
    },
    hiddenRowLabels,
  };
}
