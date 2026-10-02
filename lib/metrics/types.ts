/**
 * Phase 10 shared metric contract — the single source of truth for the
 * shape of visual/vocal measurement data flowing from in-browser capture
 * through the finish routes, both evaluators, and both report pages.
 *
 * This module is the DEPENDENCY, never the dependent: it must never import
 * from `lib/interview/`, `lib/scenario/`, `react`, `@prisma/client` or
 * `next`. Everything downstream imports this; this imports nothing
 * downstream.
 *
 * Governing principle (see `.planning/phases/10-video-audio-metrics/10-CONTEXT.md`):
 * an undetected face while the camera is ON is POOR PERFORMANCE, not missing
 * data. This file separates the LIVENESS signals (did the pipeline actually
 * run) from the DETECTION signals (what did it see) into two distinct
 * sub-objects — `VisualCoverage` / `VocalCoverage` vs the measured fields —
 * so no future edit can accidentally derive scorability from a detection
 * ratio. See `lib/metrics/coverage.ts` for the discriminator that consumes
 * this split.
 */

/** Whether the student opted into camera capture for this session. Locked at
 * session start — see CONTEXT.md "Camera mode is locked at session start". */
export type CameraMode = "ON" | "OFF";

/**
 * The closed vocabulary of posture-related flags this pipeline may emit.
 * Deliberately restricted to what face-landmark data can actually defend.
 * Slouching, fidgeting and phone-checking are NOT measurable from face
 * landmarks and must NEVER appear here — emitting them would violate
 * `lib/interview/prompts.ts`'s "do not estimate" rule (the evaluator prompt
 * explicitly forbids inferring metrics that were not really measured).
 *
 * `multiple_faces_detected` is the one flag here that is not about the
 * student's own body: it reports that more than one face was present in the
 * frame for a meaningful share of the session. It lives in this list rather
 * than in its own field because it shares the same consumer contract —
 * `lib/metrics/ingest.ts`'s `sanitizePostureFlags` validates against this
 * exact constant, so extending the tuple extends the server-side allowlist.
 */
export const VISUAL_POSTURE_FLAGS = [
  "face_partially_out_of_frame",
  "high_head_movement",
  "multiple_faces_detected",
] as const;

export type VisualPostureFlag = (typeof VISUAL_POSTURE_FLAGS)[number];

/**
 * Behaviours this pipeline CANNOT measure, declared explicitly and in-band on
 * every payload.
 *
 * This exists because an empty `posture_flags` array turned out to be
 * dangerously ambiguous: it is indistinguishable from "we looked and it was
 * fine". A real session in which several people were in frame making obscene
 * gestures was reported back to the student as a STRENGTH — "minimal obvious
 * fidgeting or posture concerns detected" — because the evaluator was asked
 * to comment on posture, handed an empty array, and had nothing else to go on.
 *
 * Saying nothing was not enough; the payload has to say "this was never
 * looked at". Every entry here is something the evaluator prompts forbid
 * commenting on, scoring, or describing as absent. Entries leave this list
 * only when a pipeline that genuinely measures them lands.
 */
export const VISUAL_NOT_MEASURED = [
  "fidgeting",
  "phone_checking",
  "background_environment",
] as const;

/**
 * The full closed vocabulary `VisualMetrics.not_measured` may ever contain —
 * `VISUAL_NOT_MEASURED`'s permanently-unmeasurable entries, plus
 * `hand_gestures`/`body_posture`, which plan 12-06 moved from "permanently
 * unmeasurable" to "per-session conditional" now that real producers for
 * both ship. `resolveNotMeasured` below decides, per session, whether either
 * conditional entry belongs in the list — based on whether THIS session's
 * data actually cleared the usability floor, never a standing declaration
 * that the pipeline cannot measure the capability at all.
 *
 * This is the vocabulary `lib/metrics/ingest.ts`'s server-side allowlist must
 * validate against, NOT the narrower `VISUAL_NOT_MEASURED` — allowlisting
 * against the narrower constant would silently drop a genuine
 * `body_posture`/`hand_gestures` entry from a real payload, which is the same
 * "absence reads as a clean bill of health" failure this file's header
 * comment already warns about, just relocated to the ingest boundary.
 */
export const VISUAL_NOT_MEASURED_VOCABULARY = [
  ...VISUAL_NOT_MEASURED,
  "hand_gestures",
  "body_posture",
] as const;

export type VisualNotMeasured = (typeof VISUAL_NOT_MEASURED_VOCABULARY)[number];

/**
 * The closed vocabulary of visual excursions the engine may report.
 *
 * An episode is a contiguous RUN during which a condition held — not a single
 * bad sample. Session averages flatten exactly the information a student can
 * act on: someone steady through four answers who fell apart on the fifth
 * reads identically to someone mediocre throughout. Episodes carry the
 * timestamps that let feedback say WHEN, and (joined against the transcript)
 * what was being discussed at the time.
 */
export const VISUAL_EPISODE_KINDS = [
  /** No face detected at all. */
  "off_camera",
  /** Face detected, but head pose outside the forward cone. */
  "gaze_away",
  /** Face detected, but its centre outside the central region of frame. */
  "off_center",
  /** More than one face in frame. */
  "multiple_faces",
  /** Sustained head movement above the steadiness threshold. */
  "high_movement",
  /**
   * SCORED body kinds (Phase 12). `minimal_gesturing` and
   * `excessive_gesturing` are the two ends of ONE curve — REQ-50's
   * three-band treatment (too still / well-judged / excessive) means both
   * are reportable findings, the same way monotone volume is a finding, not
   * just a loud-volume detector with a silent floor.
   */
  "excessive_gesturing",
  "minimal_gesturing",
  /** Hands lingering near the face — its own distinct signal from general
   * gesticulation rate, never folded into the gesture-rate curve above. */
  "hands_near_face",
  /** Sustained drift away from the student's OWN opening posture baseline.
   * Baseline-relative by construction — never an absolute-posture judgement
   * against a fixed ideal. See `lib/metrics/body-thresholds.ts`. */
  "posture_drift",
] as const;

export type VisualEpisodeKind = (typeof VISUAL_EPISODE_KINDS)[number];

export interface VisualEpisode {
  kind: VisualEpisodeKind;
  /** Seconds elapsed from CAPTURE start — not session start. Add
   * `VisualCoverage.capture_offset_s` to convert into transcript time. */
  start_s: number;
  end_s: number;
  /** 0-1. Fraction of windows inside the run that actually tripped the
   * condition, so a solid 40-second absence outranks a flickering one. */
  severity: number;
}

/**
 * The landmark groups a body-posture reading can be built from, gated on
 * MediaPipe's per-landmark `visibility` score (see `VisualPostureSignal`
 * usage sites for the floor). A typical head-and-shoulders webcam frame will
 * usually clear `shoulder_line`/`forward_head` but not `torso_lean`/
 * `torso_openness`, since those need the hips (landmarks 23/24) to be in
 * frame at all:
 *   - `shoulder_line`     needs pose landmarks 11 (left shoulder) and 12
 *                         (right shoulder).
 *   - `forward_head`      needs landmark 0 (nose) plus 7/8 (ears).
 *   - `torso_lean`        needs hips 23/24 plus the shoulders above.
 *   - `torso_openness`    needs hips 23/24 plus the shoulders above.
 * Phase 12 Plan 02 shipped this vocabulary; plan 12-06 lands the producer that
 * populates it (`lib/metrics/visual-capture.ts`'s posture-baseline/drift
 * derivation). `body_posture` is no longer a permanent `VISUAL_NOT_MEASURED`
 * entry as of that plan — whether it appears in a given session's
 * `not_measured` list is now decided per-session by `resolveNotMeasured`,
 * based on whether this array came back non-empty.
 */
export const VISUAL_POSTURE_SIGNALS = [
  "shoulder_line",
  "forward_head",
  "torso_lean",
  "torso_openness",
] as const;

export type VisualPostureSignal = (typeof VISUAL_POSTURE_SIGNALS)[number];

/**
 * The LIVENESS block for visual capture, tracked entirely independently of
 * detection outcome. This is REQ-42's mechanism: it must remain a separate
 * sub-object so no future edit can accidentally derive "did the pipeline
 * run" from "how often did it see a face". See `resolveVisualOutcome` in
 * `lib/metrics/coverage.ts`, which reads ONLY this block (plus
 * `analyzer_error`) to decide scorability.
 */
export interface VisualCoverage {
  /** Wall-clock seconds from capture start to session end. */
  session_seconds: number;
  /** Accumulated seconds the video track's `readyState` was `"live"`. */
  track_live_seconds: number;
  /** `floor(track_live_seconds * sample_hz)` — how many samples SHOULD have
   * been produced given how long the track was actually alive. */
  expected_samples: number;
  /** Samples the detector actually returned a result for — face found OR
   * not found both count as processed. This is a liveness count, not a
   * detection count. */
  processed_samples: number;
  /** Subset of `processed_samples` where a face was found. Deliberately NOT
   * consulted by `resolveVisualOutcome`'s scorability decision — see
   * `lib/metrics/coverage.ts`. Used only for scoring and for the separate
   * `isPoorVisualCoverage` disclosure predicate. */
  face_detected_samples: number;
  /** Processed samples taken while the student was speaking. Not a denominator
   * for any reported rate — retained as the audit trail for how the session
   * divided between talking and listening. */
  speaking_samples: number;
  /** Processed samples taken while the student was NOT speaking. The
   * denominator behind `attentiveness_pct`. */
  listening_samples: number;
  /**
   * Seconds between session start (`report.startedAt`, which transcript turn
   * timestamps are relative to) and CAPTURE start. Capture is deliberately
   * deferred until the avatar stream connects, so the two clocks never share
   * a zero point.
   *
   * Every episode timestamp is in capture time; every transcript timestamp is
   * in session time. Reporting an episode against the wrong clock silently
   * attributes it to the wrong sentence — plausibly, and with no visible
   * symptom. This field is the bridge, and it exists as stored data rather
   * than a re-derived guess for exactly that reason.
   */
  capture_offset_s: number;
  /** The configured throttle rate (see `METRICS_SAMPLE_HZ`). */
  sample_hz: number;
  /** True if landmarker init threw, or the detect loop threw a
   * non-recoverable error. The strongest liveness failure signal — outranks
   * every ratio below it. */
  analyzer_error: boolean;
}

/**
 * A SEPARATE, closed vocabulary for descriptive-only visual excursions —
 * deliberately NOT a widening of `VisualEpisodeKind`. Fidgeting and a phone
 * in frame are measured and reported, but REQ-52/REQ-54 require they never
 * be scored and never be rendered inline with the scored `episodes` array.
 * Keeping the two as genuinely separate TypeScript types, rather than a
 * shared union with a "descriptive" tag, makes "a fidget episode entered the
 * scored array" a compile error rather than a runtime discipline to
 * remember — the same mechanism `VisualCoverage` already uses to keep
 * liveness structurally separate from detection (see this file's header
 * comment).
 */
export const VISUAL_DESCRIPTIVE_EPISODE_KINDS = [
  "fidgeting",
  "phone_visible",
] as const;

export type VisualDescriptiveEpisodeKind = (typeof VISUAL_DESCRIPTIVE_EPISODE_KINDS)[number];

export interface VisualDescriptiveEpisode {
  kind: VisualDescriptiveEpisodeKind;
  /** Seconds elapsed from CAPTURE start — same clock as `VisualEpisode`. */
  start_s: number;
  end_s: number;
  /** 0-1. A DESCRIPTIVE intensity only — e.g. "what fraction of windows in
   * this run tripped the fidget band." Nothing downstream may multiply this
   * into a score; it exists purely to let the Observations section say "a
   * lot" vs "a little" about a run it is already describing, not grading. */
  severity: number;
}

/**
 * Measured-but-never-scored visual observations (REQ-52/REQ-53/REQ-54).
 *
 * NOTHING IN THIS INTERFACE MAY BE READ BY ANY BAND OR SCORING FUNCTION.
 * `visualBands()` and `visualBodyLanguageBands()` in `lib/metrics/bands.ts`
 * must never access `m.observations` — only `visualObservationRows()` may.
 * This is enforced by keeping this interface structurally separate from
 * every scored field on `VisualMetrics`, not by a convention to remember.
 *
 * Why: fidgeting overlaps heavily with stimming, ADHD and anxiety
 * presentations, and a phone sitting on the desk in shot is not misconduct.
 * Describing either is defensible ("your hands were in motion for 60% of
 * the session"); deducting a score for either is not, and a student who
 * challenges it would be right to.
 */
export interface VisualDescriptiveObservations {
  /** 0-100. Percentage of processed samples whose hand motion fell inside
   * the fidget band (see `FIDGET_MAX_AMPLITUDE`/
   * `FIDGET_MIN_DIRECTION_CHANGES_PER_S` in `body-thresholds.ts`) — a
   * DISTINCT low-amplitude, high-frequency pattern from the scored gesture
   * rate, never "gesticulation above an extra threshold." */
  fidget_pct: number;
  /** Total seconds a phone was visible in frame, across the whole session. */
  phone_visible_seconds: number;
  /** Absolute shoulder-line tilt in degrees, or `null` when shoulders were
   * never measurable for this session. An absolute reading, shown ONLY in
   * the Observations section, never as a grade — the SCORED posture signal
   * is `posture_drift_mean`/`posture_drift_max_s` below, relative to the
   * student's own opening baseline. */
  posture_shoulder_tilt_deg: number | null;
  /** Absolute forward-head offset, or `null` when never measurable. Same
   * absolute-vs-drift distinction as `posture_shoulder_tilt_deg`. */
  posture_forward_head_offset: number | null;
  /** Descriptive excursions — see `VisualDescriptiveEpisode`. Structurally
   * unable to enter the scored `VisualMetrics.episodes` array: the two are
   * different TypeScript types, not two entries in one list. */
  episodes: VisualDescriptiveEpisode[];
}

/**
 * The measured visual payload. All fields are REQUIRED: the pipeline either
 * produces the full block or omits it entirely (`visual: null` on
 * `SessionMetricsPayload`) — it never produces a half-block.
 *
 * Phase 12 fields below (`gesture_rate_per_min` through `observations`) are
 * OPTIONAL (`?`) on this interface, unlike the Phase 10 fields above: legacy
 * stored rows and Phase 10-shaped rows genuinely lack them, and
 * `lib/metrics/bands.ts` already has an established discipline of OMITTING
 * rather than defaulting a missing row (see `visualBands`'s "On camera" /
 * "Others in frame" comments) — these new fields follow that same
 * discipline rather than breaking it.
 */
export interface VisualMetrics {
  /**
   * 0-100. Percentage of ALL PROCESSED samples where a face was detected AND
   * head yaw/pitch fell inside a forward cone. A measured forward-gaze proxy
   * derived from head pose — NOT literal pupil tracking — but a measurement,
   * not a transcript estimate, which is what
   * `lib/interview/prompts.ts`'s missing-data rule cares about.
   *
   * Spans the WHOLE session, deliberately: engagement is expected throughout,
   * not only while the student holds the floor. Listening behaviour is ALSO
   * broken out separately as `attentiveness_pct` — the two are complementary,
   * not alternatives, and this one is the headline figure.
   */
  eye_contact_pct: number;
  /**
   * 0-100. Percentage of samples processed while the student was NOT speaking
   * in which they were oriented toward the screen.
   *
   * A subset of the same measurement `eye_contact_pct` aggregates, isolated so
   * that disengagement while someone else is talking is visible on its own
   * rather than diluted across the session. Note this is orientation toward
   * the SCREEN, which the camera sits at — for attentiveness that is exactly
   * the question, even though it could not support a claim about literal eye
   * contact.
   */
  attentiveness_pct: number;
  /**
   * 0-100. Percentage of PROCESSED samples where a face was detected AND that
   * face's bounding-box centre sat inside the central region of the frame.
   *
   * The denominator is PROCESSED samples, deliberately — NOT face-detected
   * samples. Dividing by face-detected samples (which this metric originally
   * did) made the value structurally incapable of falling for absence: a
   * student detected 20% of the session but centred whenever visible scored
   * 100%, and was reported back as "Consistently centred". Absence is poor
   * performance, not missing data — the same principle `eye_contact_pct`
   * above already encodes and `lib/metrics/coverage.ts` is built on.
   */
  camera_centered_pct: number;
  /**
   * 0-100. Percentage of PROCESSED samples in which a face was detected at
   * all — how much of the session the student was actually on camera.
   *
   * Derived from the same counter as `coverage.face_detected_samples`, but
   * this is the SCORING surface and that is the LIVENESS surface. Before this
   * field existed the detection ratio reached the report only through
   * `isPoorVisualCoverage`'s disclosure sentence, so "barely on camera" could
   * not move a score. The two must stay separate: see the note on
   * `VisualCoverage.face_detected_samples` and `lib/metrics/coverage.ts:49-56`.
   */
  face_presence_pct: number;
  /** True if the mean luma of the face region across samples fell inside an
   * acceptable range. */
  lighting_ok: boolean;
  /** Closed vocabulary only — see `VISUAL_POSTURE_FLAGS`. */
  posture_flags: VisualPostureFlag[];
  /** Emitted verbatim from `VISUAL_NOT_MEASURED` on every payload, so the
   * evaluator is told what it has no input for rather than inferring it from
   * an empty `posture_flags`. See `VISUAL_NOT_MEASURED` for why. */
  not_measured: VisualNotMeasured[];
  /** Timestamped excursions — see `VISUAL_EPISODE_KINDS`. The aggregates above
   * drive the SCORE; these drive the commentary. Capped and ordered by
   * duration, so the list is the most significant episodes rather than all
   * of them. */
  episodes: VisualEpisode[];
  /** Liveness block — see `VisualCoverage`. Tracked independently of the
   * detection fields above. */
  coverage: VisualCoverage;

  // --- Phase 12: scored body-language fields. All optional — see this
  // interface's header comment for why. Every producer for these fields
  // ships in a LATER plan (12-06/12-07); this plan is contract-only.

  /** Gestures per minute, derived from hand-landmark displacement crossing
   * `GESTURE_AMPLITUDE_MIN`. One half of the three-band gesturing curve —
   * see `GESTURE_RATE_STILL_MAX`/`GESTURE_RATE_EXCESSIVE_MIN` in
   * `body-thresholds.ts`. */
  gesture_rate_per_min?: number;
  /** 0-1. Mean normalized wrist displacement per gesture — the other half of
   * the gesturing curve, alongside rate. */
  gesture_amplitude_mean?: number;
  /** 0-100. Percentage of processed samples where a hand sat above shoulder
   * height. Descriptive input to the "Gesturing" band, not scored on its
   * own. */
  hands_above_shoulder_pct?: number;
  /** 0-100. Percentage of processed samples where a hand sat within
   * `HANDS_NEAR_FACE_RADIUS` of the face — its OWN scored signal, distinct
   * from general gesticulation rate (REQ-50). */
  hands_near_face_pct?: number;
  /** 0-1. Mean magnitude of drift away from the session's own opening
   * posture baseline — SCORED, baseline-relative, never an absolute-posture
   * judgement. See Pattern 3 in `12-RESEARCH.md`. */
  posture_drift_mean?: number;
  /** Longest single sustained posture-drift run, in seconds. */
  posture_drift_max_s?: number;
  /** Which landmark groups actually cleared the visibility floor for this
   * session — the input to the "Measured from" row, rendered
   * UNCONDITIONALLY (REQ-51's "every posture comment states which signals
   * were available"), including the empty-array case. */
  posture_signals_measured?: VisualPostureSignal[];
  /** Measured-but-never-scored observations — see
   * `VisualDescriptiveObservations`'s header comment for why this is a
   * separate type rather than a widened scored field. Read ONLY by
   * `visualObservationRows()`/`timelineRows()` in `bands.ts`. */
  observations?: VisualDescriptiveObservations;
}

/**
 * Pure. Returns the entries of `VISUAL_NOT_MEASURED_VOCABULARY` that a
 * session genuinely could not observe, given what its producers actually
 * attempted to measure and what they actually found usable this session.
 *
 * Replaces the unconditional `[...VISUAL_NOT_MEASURED]` spread that
 * `lib/metrics/visual-capture.ts` used before plan 12-06. A session whose
 * body was never in frame must still declare `body_posture` unmeasured
 * rather than silently report a zero — the same failure mode
 * `VISUAL_NOT_MEASURED`'s own header comment already documents for the
 * original face-only pipeline (an empty flags array read as "verified
 * clean").
 *
 * `handSignals`/`postureSignals` answer a DIFFERENT question than
 * `fidget`/`phone` do, and that asymmetry is deliberate: hand and posture
 * producers now ship unconditionally (12-06), so the question for them is
 * "did THIS session's data clear the usability floor" (e.g.
 * `posture_signals_measured.length > 0`) — never "did the pipeline attempt
 * to run," which would be true almost every session and would mask a body
 * that was simply never in frame. `fidget`/`phone` still answer the older
 * "does a producer exist at all" question until 12-07 ships theirs.
 *
 * `background_environment` is ALWAYS returned — its aesthetic half is
 * permanently out of scope (see 12-CONTEXT.md's Deferred Ideas) and no
 * producer in this phase or any planned future one measures it.
 */
export function resolveNotMeasured(measured: {
  handSignals: boolean;
  postureSignals: boolean;
  fidget: boolean;
  phone: boolean;
}): VisualNotMeasured[] {
  const out: VisualNotMeasured[] = [];
  if (!measured.handSignals) out.push("hand_gestures");
  if (!measured.postureSignals) out.push("body_posture");
  if (!measured.fidget) out.push("fidgeting");
  if (!measured.phone) out.push("phone_checking");
  out.push("background_environment");
  return out;
}

/**
 * The LIVENESS block for vocal capture — the vocal-side mirror of
 * `VisualCoverage`, discriminating "the student typed instead of spoke"
 * (a modality choice, never a penalty — REQ-44) from "speech happened but
 * could not be analyzed" (a technical failure) from "there wasn't enough
 * spoken material to score" (a modality outcome, not weak delivery).
 */
export interface VocalCoverage {
  /** Turns the student delivered by voice. */
  spoken_turns: number;
  /** Turns the student delivered by typing. */
  typed_turns: number;
  /** Spoken turns whose word-timing analysis actually returned. A spoken
   * turn whose STT call failed counts as spoken but NOT analyzed — this is
   * the vocal liveness signal. */
  analyzed_turns: number;
  /** Total measured spoken audio duration, in seconds. */
  spoken_seconds: number;
  /** True if the analyzer threw a non-recoverable error. */
  analyzer_error: boolean;
}

/**
 * One spoken turn's delivery, retained rather than summed away.
 *
 * `aggregateTurnWords` already computed every field here per turn and folded
 * it straight into session totals. Keeping the granularity is what lets the
 * report say a student was fluent describing one project and hesitant on
 * another — which a single session-wide "Pace: Well paced" erases entirely.
 *
 * Deliberately NOT a "confidence score". Confidence is not measurable from
 * word rate, fillers, pauses and volume; a composite would be a fabricated
 * number quoted to a student as fact — the same failure as crediting posture
 * nobody measured. Emit the components; let the evaluator describe the
 * CONTRAST between turns without asserting an internal state.
 */
export interface VocalTurnMetrics {
  turn_index: number;
  /** Seconds elapsed from capture start, same clock as `VisualEpisode`. */
  start_s: number;
  duration_s: number;
  words_per_minute: number;
  filler_count: number;
  pause_count: number;
  volume_consistency: number;
}

/**
 * The measured vocal payload. Fields mirror the contract already declared at
 * `lib/interview/prompts.ts:213-215` (words_per_minute, filler_word_count,
 * filler_word_list, pause_count, volume_consistency), extended with the
 * `coverage` liveness block.
 */
export interface VocalMetrics {
  words_per_minute: number;
  filler_word_count: number;
  filler_word_list: string[];
  pause_count: number;
  /** 0-1. 1 = perfectly steady volume. */
  volume_consistency: number;
  /** Per-turn delivery breakdown — see `VocalTurnMetrics`. */
  turns: VocalTurnMetrics[];
  coverage: VocalCoverage;
}

/**
 * Frozen lexicon of lowercase filler tokens/bigrams. Matching is
 * case-insensitive and whole-token; multi-word entries (e.g. "you know") are
 * matched as consecutive word sequences, not substrings.
 */
export const FILLER_WORD_LEXICON = [
  "um",
  "uh",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
  "right",
  "so",
] as const;

/**
 * Why a Visual category came back unscored. `CAMERA_OFF_OPTOUT` is a
 * deliberate student choice (never a technical failure); `INSUFFICIENT_DATA`
 * means measurement was attempted but genuinely could not be performed.
 * `null` on a report row means either "scored" or the legacy pre-Phase-10
 * "no pipeline existed" case — disambiguated by whether `cameraMode` itself
 * is null (legacy) or set (Phase 10+).
 */
export type VisualUnscoredReason = "CAMERA_OFF_OPTOUT" | "INSUFFICIENT_DATA";

/**
 * Why a Vocal category came back unscored. `TYPED_ONLY` means the student
 * chose to type instead of speak — a modality choice, never a penalty
 * (REQ-44), deliberately NOT symmetric with the visual opt-out case, since
 * typing has no equivalent "opted out at session start" toggle.
 * `INSUFFICIENT_DATA` means speech was attempted but could not be analyzed.
 */
export type VocalUnscoredReason = "TYPED_ONLY" | "INSUFFICIENT_DATA";

/**
 * Exactly what the client POSTs to a finish route.
 *
 * This payload contains ONLY derived scalars. No frames, no audio, no data
 * URLs, no blob references. REQ-38 (no media retention) is enforced by this
 * type's shape being the only thing the client is allowed to send — there is
 * no field here capable of carrying a frame, an audio buffer, or a base64
 * blob, by construction.
 */
export interface SessionMetricsPayload {
  cameraMode: CameraMode;
  visual: VisualMetrics | null;
  vocal: VocalMetrics | null;
}

/**
 * Sampling rate for the visual pipeline, in Hz. 6 Hz is far below display
 * frame rate — plenty for a coverage aggregate — and chosen specifically to
 * protect the live HeyGen stream (REQ-49): this is a measurement pipeline,
 * not a coaching feature, and must never compete with the avatar for
 * rendering budget.
 */
export const METRICS_SAMPLE_HZ = 6;
