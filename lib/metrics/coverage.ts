import type {
  CameraMode,
  VisualMetrics,
  VisualUnscoredReason,
  VocalMetrics,
  VocalUnscoredReason,
} from "./types";

/**
 * The liveness-vs-performance discriminator — REQ-42, and the hardest
 * correctness concern of Phase 10.
 *
 * Governing principle (`.planning/phases/10-video-audio-metrics/10-CONTEXT.md`,
 * the user's own words): "if your face cannot be picked up clearly, you
 * would be docked for that." An undetected face while the camera is ON is
 * POOR PERFORMANCE, not missing data. Therefore `resolveVisualOutcome` reads
 * ONLY liveness signals (processed-sample counts, track-live time, explicit
 * analyzer error) — it must NEVER read `face_detected_samples`. The
 * detection ratio is a SCORING input (via `visualBands`) and a DISCLOSURE
 * input (via `isPoorVisualCoverage`), never a gating input.
 *
 * A single processed-vs-expected ratio is NOT sufficient on its own: a
 * camera track that seizes 20 seconds into a 10-minute session produces a
 * perfectly healthy ratio against its own short live time. This file
 * therefore checks THREE independent failure signatures before ever
 * reaching the scoring path.
 */

/** Ten seconds' worth of samples at the configured sample rate — see
 * `METRICS_SAMPLE_HZ` in `./types`. Duplicated here as a literal rather than
 * imported to keep the "absolute floor" check self-explanatory at the call
 * site; kept in sync manually (6 Hz * 10s = 60). */
const ABSOLUTE_FLOOR_PROCESSED_SAMPLES = 60;

/** Below this fraction of session time, the track is considered to have died
 * partway through rather than merely produced a low detection ratio. */
const TRACK_LIVE_RATIO_FLOOR = 0.5;

/** Below this fraction of expected-vs-processed samples, the detection loop
 * is considered starved (backgrounded tab, wedged worker) rather than
 * merely reporting a low face-detection ratio. */
const PROCESSED_RATIO_FLOOR = 0.5;

/** Below this many spoken seconds, a mostly-typed session's speech is too
 * thin to score and is treated as a modality outcome, not a technical
 * failure and not weak delivery. */
const MIN_SPOKEN_SECONDS_TO_SCORE = 30;

/**
 * Below this detection ratio, poor visual coverage is DISCLOSED to the
 * student on the report (REQ-46) — this governs only whether coverage TEXT
 * is shown, never the score itself. Keeping disclosure and scoring as two
 * separate functions is deliberate: collapsing them back into one path is
 * exactly the anti-pattern CONTEXT.md flags.
 */
const POOR_COVERAGE_DETECTION_RATIO = 0.6;

export interface VisualOutcome {
  scored: boolean;
  reason: VisualUnscoredReason | null;
}

export interface VocalOutcome {
  scored: boolean;
  reason: VocalUnscoredReason | null;
}

/**
 * Decides whether a Visual category can be scored, and if not, why.
 *
 * Order matters: each check below catches a distinct real-world failure and
 * must not be reordered relative to the others without re-reasoning through
 * which failure it would then misclassify.
 */
export function resolveVisualOutcome(
  cameraMode: CameraMode,
  visual: VisualMetrics | null,
): VisualOutcome {
  // 1. A deliberate opt-out. Must be checked FIRST so a camera-off session
  //    can never be misreported as a technical failure, no matter what (if
  //    anything) happens to be sitting in `visual`.
  if (cameraMode === "OFF") {
    return { scored: false, reason: "CAMERA_OFF_OPTOUT" };
  }

  // 2. Camera was ON but the client delivered nothing at all — the client
  //    promised metrics and failed to produce them.
  if (visual === null) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  const { coverage } = visual;

  // 3. An explicit thrown error is the strongest signal available. It must
  //    not be outvoted by healthy-looking counters elsewhere in the block.
  if (coverage.analyzer_error) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 4. Track-death check: catches a camera unplugged, revoked, or seized by
  //    another app partway through the session. A dead track also stops
  //    generating expected samples, so a processed/expected ratio alone
  //    cannot see this — comparing live time against session time can.
  const trackLiveRatio =
    coverage.track_live_seconds / Math.max(1, coverage.session_seconds);
  if (trackLiveRatio < TRACK_LIVE_RATIO_FLOOR) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 5. Starvation check: catches an inference loop that initialised but was
  //    starved of frames (tab backgrounded, worker wedged) even though the
  //    track itself stayed alive the whole session.
  const processedRatio =
    coverage.processed_samples / Math.max(1, coverage.expected_samples);
  if (processedRatio < PROCESSED_RATIO_FLOOR) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 6. Absolute floor: guards the degenerate tiny-session case where every
  //    ratio above is trivially satisfiable (e.g. a two-second session).
  if (coverage.processed_samples < ABSOLUTE_FLOOR_PROCESSED_SAMPLES) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 7. Every liveness signal is healthy — score it. `face_detected_samples`
  //    is deliberately NOT consulted anywhere above: a live pipeline that
  //    saw a face zero percent of the time is a scoreable LOW Visual score
  //    (REQ-41), not an unscorable one. Introducing a detection threshold
  //    here would reintroduce exactly the coverage gate CONTEXT.md forbids.
  //    (Regression-tested in this plan's verification script.)
  return { scored: true, reason: null };
}

/**
 * Decides whether a Vocal category can be scored, and if not, why.
 *
 * Deliberately NOT symmetric with `resolveVisualOutcome`: typing instead of
 * speaking is a different modality (REQ-44), never a penalty, so a
 * fully-typed session resolves to `TYPED_ONLY` rather than
 * `INSUFFICIENT_DATA` even though structurally it also means "no usable
 * signal."
 */
export function resolveVocalOutcome(vocal: VocalMetrics | null): VocalOutcome {
  // 1. No block at all — measurement was attempted but nothing came back.
  if (vocal === null) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  const { coverage } = vocal;

  // 2. Zero spoken turns means the whole session was typed. This is a
  //    modality choice, never a technical failure and never a penalty.
  if (coverage.spoken_turns === 0) {
    return { scored: false, reason: "TYPED_ONLY" };
  }

  // 3. An explicit thrown error outranks every other signal.
  if (coverage.analyzer_error) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 4. The student spoke, but nothing could be analysed (e.g. every STT call
  //    for those turns failed) — a genuine technical failure, not a
  //    modality outcome and not weak delivery.
  if (coverage.spoken_turns > 0 && coverage.analyzed_turns === 0) {
    return { scored: false, reason: "INSUFFICIENT_DATA" };
  }

  // 5. Under half a minute of speech in a mostly-typed session is too thin
  //    to score reliably. This is a modality outcome, not a technical
  //    failure and not weak delivery, so it resolves to TYPED_ONLY.
  if (coverage.spoken_seconds < MIN_SPOKEN_SECONDS_TO_SCORE) {
    return { scored: false, reason: "TYPED_ONLY" };
  }

  // 6. Otherwise scored. A mixed typed/spoken session is scored on its
  //    SPOKEN portion only — typed turns contribute nothing and subtract
  //    nothing from the vocal score.
  return { scored: true, reason: null };
}

/**
 * REQ-46 disclosure predicate — entirely separate from scoring. Governs only
 * whether coverage TEXT is shown to the student on the report (a clean
 * full-session run says nothing about coverage; it surfaces only when it
 * would change how the student reads the score). Never feeds back into
 * `resolveVisualOutcome`; keeping the two functions apart is the anti-
 * pattern guard the phase research flagged.
 */
export function isPoorVisualCoverage(visual: VisualMetrics): boolean {
  const { coverage } = visual;
  const detectionRatio =
    coverage.face_detected_samples / Math.max(1, coverage.processed_samples);
  return detectionRatio < POOR_COVERAGE_DETECTION_RATIO;
}
