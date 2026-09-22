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
 */
export const VISUAL_POSTURE_FLAGS = [
  "face_partially_out_of_frame",
  "high_head_movement",
] as const;

export type VisualPostureFlag = (typeof VISUAL_POSTURE_FLAGS)[number];

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
   * 0-100. Percentage of PROCESSED samples where a face was detected AND
   * head yaw/pitch fell inside a forward cone. This is a measured
   * forward-gaze proxy derived from head pose — NOT literal pupil tracking —
   * but it IS a measurement, not a transcript estimate, which is exactly
   * what `lib/interview/prompts.ts`'s missing-data rule cares about.
   */
  eye_contact_pct: number;
  /**
   * 0-100. Percentage of face-detected samples whose face bounding-box
   * centre sat inside the central region of the frame.
   */
  camera_centered_pct: number;
  /** True if the mean luma of the face region across samples fell inside an
   * acceptable range. */
  lighting_ok: boolean;
  /** Closed vocabulary only — see `VISUAL_POSTURE_FLAGS`. */
  posture_flags: VisualPostureFlag[];
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
