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
  "hand_gestures",
  "body_posture",
  "fidgeting",
  "phone_checking",
  "background_environment",
] as const;

export type VisualNotMeasured = (typeof VISUAL_NOT_MEASURED)[number];

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
 * The measured visual payload. All fields are REQUIRED: the pipeline either
 * produces the full block or omits it entirely (`visual: null` on
 * `SessionMetricsPayload`) — it never produces a half-block.
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
