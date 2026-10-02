/**
 * Phase 10 in-browser visual capture engine, moved off the main thread by
 * plan 12-03.
 *
 * Browser-only module. Every browser API access sits inside a function body
 * (never at module scope) so this file remains import-safe on the server —
 * no `"use client"` directive is needed for a non-component module, but the
 * same discipline applies.
 *
 * GOVERNING PRINCIPLE (see `.planning/phases/10-video-audio-metrics/10-CONTEXT.md`):
 * an undetected face while the camera is ON is POOR PERFORMANCE, not missing
 * data. This engine therefore tracks LIVENESS counters (did the pipeline
 * actually run: processed samples, track-live seconds, analyzer errors)
 * entirely separately from DETECTION counters (what did it see:
 * face_detected_samples and everything derived from a detected face). The
 * two families are never merged — `lib/metrics/coverage.ts`'s
 * `resolveVisualOutcome` depends on this separation to decide scorability
 * from liveness alone.
 *
 * NO PERSISTENCE, NO NETWORK: this module never calls `fetch`, never touches
 * `localStorage`/`sessionStorage`/`indexedDB`, never uses `MediaRecorder` or
 * `captureStream`, and never serializes a frame via `toDataURL`/`toBlob`.
 * Every per-frame value is reduced to a scalar accumulator on the same tick
 * it is read; no frame, landmark array, or ImageBitmap is retained past the
 * tick that produced it. Only the final `VisualMetrics` scalar object -
 * returned once, at `stop()` - ever leaves this module.
 *
 * WORKER MIGRATION (REQ-57/REQ-58, plan 12-03): inference now prefers running
 * inside `visual-capture.worker.ts`, reached by transferring a per-tick
 * `ImageBitmap` and getting back a scalar-only `FaceDetectResult` - see that
 * file's own header for the full REQ-58 discipline. If the worker cannot be
 * constructed, or does not reply `ready` within `WORKER_INIT_TIMEOUT_MS`, this
 * engine falls back to the original synchronous main-thread landmarker path
 * unchanged (`runMainThreadTick`/`initLandmarker`) - a technical failure to
 * start the worker must degrade to Phase 10 behaviour, never to
 * `analyzer_error` (REQ-42's discipline: a technical fallback is not the
 * student's poor performance). Both paths funnel their result into the same
 * `applyFaceResult`, so the two paths cannot silently diverge in what they
 * measure.
 */

import {
  METRICS_SAMPLE_HZ,
  VISUAL_DESCRIPTIVE_EPISODE_KINDS,
  VISUAL_EPISODE_KINDS,
  VISUAL_POSTURE_SIGNALS,
  resolveNotMeasured,
  type VisualDescriptiveEpisode,
  type VisualDescriptiveEpisodeKind,
  type VisualDescriptiveObservations,
  type VisualEpisode,
  type VisualEpisodeKind,
  type VisualMetrics,
  type VisualPostureFlag,
  type VisualPostureSignal,
} from "@/lib/metrics/types";
import {
  GESTURE_AMPLITUDE_MIN,
  GESTURE_WINDOW_EXCESSIVE_PCT,
  GESTURE_WINDOW_MIN_HAND_SAMPLES,
  GESTURE_WINDOW_STILL_PCT,
  HANDS_NEAR_FACE_TRIP_PCT,
  PHONE_EPISODE_TRIP_PCT,
  PHONE_MIN_VISIBLE_S,
  POSTURE_BASELINE_MIN_SAMPLES,
  POSTURE_BASELINE_WINDOW_S,
  POSTURE_DRIFT_TRIP,
  POSTURE_FORWARD_HEAD_DRIFT_SCALE,
  POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG,
  POSTURE_TORSO_LEAN_DRIFT_SCALE_DEG,
  POSTURE_TORSO_OPENNESS_DRIFT_SCALE,
} from "@/lib/metrics/body-thresholds";
import type {
  FaceDetectResult,
  HandsDetectResult,
  ObjectDetectResult,
  PoseDetectResult,
} from "@/lib/metrics/visual-capture.worker";

/** Reasons `requestCameraStream` can fail to acquire a camera. Plans
 * 10-09/10-10 map these to the REQ-37 block screen; this function itself
 * never renders UI and never throws. */
export type CameraRequestFailureReason = "DENIED" | "NOT_FOUND" | "UNAVAILABLE";

export type CameraRequestResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: CameraRequestFailureReason };

/**
 * Requests a VIDEO-ONLY camera stream at a modest resolution. Deliberately
 * requests only video: the existing push-to-talk audio path
 * (`components/interview/InterviewSessionShell.tsx`'s `getUserMedia({ audio: true })`
 * call) already owns the audio stream's lifecycle and must not be touched or
 * merged with this constraint object.
 *
 * 640x480 at `METRICS_SAMPLE_HZ` (6 Hz) is ample for presence/framing
 * measurement and materially cheaper than 1080p — protecting the live
 * HeyGen avatar stream's rendering budget (REQ-49).
 */
export async function requestCameraStream(): Promise<CameraRequestResult> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
    });
    return { ok: true, stream };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return { ok: false, reason: "DENIED" };
    }
    if (
      name === "NotFoundError" ||
      name === "DevicesNotFoundError" ||
      name === "OverconstrainedError"
    ) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    // Includes NotReadableError (camera seized by another app) and any
    // other unexpected failure.
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export interface CreateVisualCaptureOptions {
  stream: MediaStream;
  /**
   * Epoch ms of SESSION start (the clock transcript turn timestamps use).
   * Capture starts later — deferred until the avatar stream connects — so the
   * two clocks have different zero points. Supplying this lets the engine
   * emit `coverage.capture_offset_s`, which is what allows an episode to be
   * matched to the sentence it actually happened during. Omitted, the offset
   * is reported as 0 and episode times are capture-relative only.
   */
  sessionStartedAtMs?: number;
  /** Invoked ONLY on a transition (detected <-> undetected), and only after
   * the new state has persisted for 3 consecutive samples (~0.5s at 6 Hz),
   * so a single blink or momentary miss never flickers the banner. */
  onFaceStateChange?: (faceDetected: boolean) => void;
}

export interface VisualCaptureHandle {
  start(): Promise<void>;
  /**
   * Marks whether the student is currently speaking. Routes each subsequent
   * sample into the speaking or listening bucket; it does NOT pause, resume,
   * or otherwise change what the engine measures, and costs no extra
   * inference.
   *
   * Call it from the same transitions that drive the push-to-talk recorder,
   * so the visual windows cannot drift away from the vocal pipeline's own
   * turn accounting.
   */
  setSpeaking(speaking: boolean): void;
  /** Tears down the engine and returns the final scalar metrics. Returns
   * `null` only if `start()` was never called. Does NOT stop the
   * MediaStream's tracks - the caller owns the stream (the self-view
   * thumbnail may still be attached to it).
   *
   * Returns a bounded promise: it never rejects, and resolves no later than
   * `timeoutMs` (default `DEFAULT_STOP_TIMEOUT_MS`) even if teardown hangs -
   * mirrors `lib/metrics/vocal-capture.ts`'s `drain(timeoutMs)`. Interval
   * teardown and video-element teardown still happen synchronously, before
   * any await, so no tick can run concurrently with metric assembly. */
  stop(timeoutMs?: number): Promise<VisualMetrics | null>;
}

const FORWARD_YAW_LIMIT_DEG = 25;
const FORWARD_PITCH_LIMIT_DEG = 20;
const CENTER_X_MIN = 0.25;
const CENTER_X_MAX = 0.75;
const CENTER_Y_MIN = 0.15;
const CENTER_Y_MAX = 0.75;
const OUT_OF_FRAME_MARGIN = 0.02;
const LUMA_SAMPLE_EVERY_N_TICKS = 12;
const LUMA_CANVAS_SIZE = 64;
const LUMA_MIN_OK = 40;
const LUMA_MAX_OK = 225;
const OUT_OF_FRAME_RATIO_THRESHOLD = 0.15;
const HIGH_MOVEMENT_THRESHOLD = 0.04;
const POSE_UNAVAILABLE_RATIO_THRESHOLD = 0.5;
/** Share of processed samples that must contain more than one face before the
 * session is flagged. A brief pass-through (someone crossing the doorway
 * behind the student) should not flag; a second person seated in frame for a
 * meaningful stretch should. */
const MULTIPLE_FACES_RATIO_THRESHOLD = 0.1;
/** How many faces the landmarker is allowed to return. This is NOT a
 * measurement of "how many people" — it is the smallest number that lets the
 * engine answer "was more than one person present" while keeping the per-tick
 * landmark cost bounded. See `initLandmarker`. */
const MAX_TRACKED_FACES = 3;

/** Bound on how long `stop()` will wait for engine teardown before resolving
 * anyway. Mirrors `lib/metrics/vocal-capture.ts`'s `DEFAULT_DRAIN_TIMEOUT_MS`
 * bounded-race pattern: the End button must never hang on a stuck teardown. */
const DEFAULT_STOP_TIMEOUT_MS = 1500;

/** Four models share the worker as of 12-05: face, pose, hands, and object
 * (phone) detection. */
type ModelId = "face" | "pose" | "hands" | "object";

/** All four tenants, deduplicated from `SCHEDULE` rather than hand-kept in
 * sync with it — this is what gets sent to the worker's `init` message and
 * what every per-model accumulator record below is keyed by. */
const ALL_MODELS: ModelId[] = ["face", "pose", "hands", "object"];

/**
 * The staggered round-robin schedule, consulted by tick index
 * (`SCHEDULE[tickCount % SCHEDULE.length]`). At `METRICS_SAMPLE_HZ` (6 Hz)
 * this gives:
 *   - face:  2 ticks of 4  -> 3 Hz   (every existing Phase 10 metric
 *            depends on face and must not degrade — see 12-03-SUMMARY.md's
 *            "Headroom for 12-05" note; 50% share, same absolute 3 Hz as the
 *            very first 12-05 cut, just expressed over a shorter cycle)
 *   - pose:  1 tick of 4   -> 1.5 Hz (posture drift is a multi-second signal;
 *            the extra headroom freed up below is spent here and on hands)
 *   - hands: 1 tick of 4   -> 1.5 Hz (gesture rate is a per-minute signal)
 *
 * Object (phone) detection is DELIBERATELY NOT in this rotation — see
 * `OBJECT_TICK_INTERVAL_MS` below for why and where it runs instead. The
 * first live Task 4 checkpoint measured `efficientdet_lite0` at a 126.5ms
 * mean round-trip, 76% of a single 166.67ms tick budget, the single most
 * expensive model by a wide margin. Because the worker is ONE JS thread, a
 * detect call that long blocks that thread from handling ANY other model's
 * reply while it runs — this is why that run's drops were spread across
 * every model (27 face / 8 pose / 8 hands / 9 object out of 52), not
 * confined to object's own slot. Pulling it out of the 6 Hz interleave and
 * giving it its own slow, independent cadence removes that blocking source
 * entirely, and frees the remaining four-of-four ticks for face/pose/hands —
 * raising pose and hands from 1 Hz to 1.5 Hz as a bonus, with face held at
 * its original 3 Hz exactly (never reduced below its pre-fix share — Phase
 * 10's existing metrics depend on it, and it was already the single largest
 * drop contributor even before this fix).
 *
 * This remains a TUNABLE this plan deliberately does not fully optimise —
 * see 12-05-PLAN.md Task 3 and the Task 4 budget checkpoint, which the
 * second live run re-verifies. If the re-run still shows an elevated drop
 * rate, the NEXT lever to try (before touching object further) is reverting
 * pose/hands to their original 1 Hz by reintroducing idle ticks rather than
 * running them back-to-back — e.g. `["face","pose","face","hands","face","face"]`
 * — since 1.5 Hz for both was this fix's one speculative addition on top of
 * the proven removal of object from the hot path.
 */
const SCHEDULE: ModelId[] = ["face", "pose", "face", "hands"];

/**
 * Object (phone) detection's OWN independent cadence, decoupled from the
 * main `SCHEDULE` round-robin above (see that constant's doc comment for
 * why). 2000ms (0.5 Hz) comfortably exceeds the resolution this signal
 * actually needs: `PHONE_MIN_VISIBLE_S` (`body-thresholds.ts`) already
 * requires 2 continuous seconds of visibility before a phone episode is
 * reported at all, so sampling once every 2 seconds cannot miss a
 * reportable episode, and "was a phone visible" was never a frame-exact
 * question. Uses the SAME one-outstanding-request back-pressure discipline
 * as every other model (`requestState.object`), just on its own timer
 * instead of a `SCHEDULE` slot.
 */
const OBJECT_TICK_INTERVAL_MS = 2000;

/**
 * `SCHEDULE`'s face share, computed rather than hand-kept in sync, so a
 * future edit to `SCHEDULE` cannot silently re-break the schedule-aware
 * `expectedSamples` calculation in `stop()` below. See that calculation's
 * own comment for why this denominator must be schedule-aware at all.
 */
const FACE_SCHEDULE_SHARE =
  SCHEDULE.filter((model) => model === "face").length / SCHEDULE.length;

/** How long `start()` will wait for the worker's `ready`/`init-error` reply
 * before giving up and falling back to the main-thread landmarker path. A
 * worker that never answers must not block session start indefinitely. */
const WORKER_INIT_TIMEOUT_MS = 2000;

// DEFECT 2 FIX (12-05 live checkpoint, re-run 1): inference-cost tracking
// used to be a FIXED-CAPACITY ring buffer (600 samples, ~100s at 6 Hz) that
// silently overwrote its oldest entries once a session ran longer than that
// window. That was invisible with one stationary tenant (12-03), but once
// the first GPU call for pose/hands/object paid a one-time shader-compile
// warm-up cost, the ring's "last ~600 ticks" window evicted those expensive
// early ticks while the (unbounded) per-model sums still included them -
// producing a session-wide meanTickMs LOWER than every single per-model
// mean, which is numerically impossible for a true session average. The
// fix: the overall and per-model accumulators are now the same shape
// (unbounded running arrays), so a session-wide figure can never silently
// sample a different, more recent window than the per-model breakdown next
// to it. A real interview session produces at most a few thousand samples -
// keeping them all is not a meaningful memory concern, and it removes this
// whole class of bug outright rather than just enlarging the window.

/** A tick's gap from the previous tick beyond this multiple of the expected
 * interval counts as a dropped tick — the event loop did not get back to us
 * on time. Diagnostics only. */
const DROPPED_TICK_GAP_MULTIPLIER = 1.8;

/** Seconds of samples folded into one window before it is closed and pushed.
 * Short enough to localise an excursion usefully, long enough that a blink or
 * a single dropped frame cannot create one. */
const EPISODE_WINDOW_SECONDS = 5;
/** An excursion must persist at least this long to be reported. Below it,
 * we are describing noise rather than behaviour. */
const MIN_EPISODE_SECONDS = 10;
/** How many consecutive non-tripping windows an episode may absorb without
 * ending. Without this, a student who glances back at the camera once mid-way
 * through a two-minute absence produces three episodes instead of one. */
const EPISODE_GAP_TOLERANCE_WINDOWS = 1;
/** Hard cap on reported episodes. Over the cap the LONGEST survive: a single
 * 90-second absence matters more than six 10-second ones. */
const MAX_EPISODES = 40;

// Per-window trip thresholds. Each is a RATIO within the window, so a window
// with few processed samples cannot trip on one bad frame.
const EPISODE_OFF_CAMERA_MAX_DETECTED_RATIO = 0.25;
const EPISODE_GAZE_AWAY_MAX_FORWARD_RATIO = 0.35;
const EPISODE_OFF_CENTER_MAX_CENTERED_RATIO = 0.4;
const EPISODE_MULTI_FACE_MIN_RATIO = 0.5;
const FACE_STATE_TRANSITION_STREAK = 3;
const MAX_CONSECUTIVE_DETECT_ERRORS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Raw per-session sample counts, before any ratio is taken. */
export interface VisualSampleCounts {
  processedSamples: number;
  faceDetectedSamples: number;
  centeredSamples: number;
  multipleFacesSamples: number;
  /** Forward-facing samples across the WHOLE session. */
  forwardFacingSamples: number;
  /** Samples taken while the student was NOT speaking, and how many of those
   * were oriented toward the screen. The attentiveness denominator. */
  listeningSamples: number;
  listeningForwardSamples: number;
}

export interface VisualRates {
  eyeContactPct: number;
  attentivenessPct: number;
  cameraCenteredPct: number;
  facePresencePct: number;
  multipleFacesRatio: number;
}

/**
 * Turns raw sample counts into the reported percentages. Pure, and exported
 * so a throwaway verification script can exercise the arithmetic directly —
 * the same reason `vocal-capture.ts` exports `aggregateTurnWords` and
 * `computeVolumeConsistency`. Without this the denominators would only be
 * reachable through a live camera, which is exactly how the
 * divide-by-face-detected bug survived to production.
 *
 * Every rate here divides by ALL processed samples, with one exception: a
 * sample with nobody in it is a badly framed sample, not a missing one, and
 * dividing by `faceDetectedSamples` makes a metric structurally unable to fall
 * for absence.
 *
 * `eye_contact_pct` covers the whole session deliberately — engagement is
 * expected throughout, not only while the student holds the floor.
 * `attentiveness_pct` is the one window-scoped rate: it isolates the stretches
 * where someone ELSE was talking, so listening behaviour is visible as its own
 * number rather than only as part of the session average.
 */
export function computeVisualRates(counts: VisualSampleCounts): VisualRates {
  const processed = Math.max(1, counts.processedSamples);
  return {
    eyeContactPct: Math.round(
      (counts.forwardFacingSamples / processed) * 100
    ),
    attentivenessPct: Math.round(
      (counts.listeningForwardSamples / Math.max(1, counts.listeningSamples)) * 100
    ),
    cameraCenteredPct: Math.round((counts.centeredSamples / processed) * 100),
    facePresencePct: Math.round((counts.faceDetectedSamples / processed) * 100),
    multipleFacesRatio: counts.multipleFacesSamples / processed,
  };
}

/** One posture reading, at one tick, in capture-relative seconds. Every
 * numeric field is `null` exactly when that landmark group was not visible on
 * this tick — never a substituted or extrapolated value (mirrors
 * `PoseDetectResult`'s own discipline in `visual-capture.worker.ts`). */
export interface PostureReading {
  tS: number;
  shoulderTiltDeg: number | null;
  forwardHeadOffset: number | null;
  torsoLeanDeg: number | null;
  torsoOpennessRatio: number | null;
}

/**
 * A session's self-calibrated posture baseline — one mean per signal that
 * cleared both the per-signal visibility floor AND `POSTURE_BASELINE_MIN_SAMPLES`
 * inside the first `POSTURE_BASELINE_WINDOW_S` of capture. A signal absent
 * from `signals` has NO baseline and contributes nothing to drift; it is
 * never defaulted to an upright/neutral value, which would smuggle a fixed
 * ideal back into a design built specifically to avoid one (12-CONTEXT.md).
 */
export interface PostureBaseline {
  shoulderTiltDeg: number | null;
  forwardHeadOffset: number | null;
  torsoLeanDeg: number | null;
  torsoOpennessRatio: number | null;
  /** Which signals actually cleared the floor to get a baseline. */
  signals: VisualPostureSignal[];
  /** Total readings considered within the calibration window, regardless of
   * per-signal visibility — diagnostic only. */
  sampleCount: number;
}

/** One signal's reading alongside its drift-scale normaliser and the
 * `PostureBaseline` field it corresponds to — small table driving both
 * `computePostureBaseline` and `computePostureDrift` so the two can never
 * silently enumerate the four signals differently. */
const POSTURE_SIGNAL_TABLE: Array<{
  signal: VisualPostureSignal;
  read: (r: PostureReading) => number | null;
  scale: number;
}> = [
  {
    signal: "shoulder_line",
    read: (r) => r.shoulderTiltDeg,
    scale: POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG,
  },
  {
    signal: "forward_head",
    read: (r) => r.forwardHeadOffset,
    scale: POSTURE_FORWARD_HEAD_DRIFT_SCALE,
  },
  {
    signal: "torso_lean",
    read: (r) => r.torsoLeanDeg,
    scale: POSTURE_TORSO_LEAN_DRIFT_SCALE_DEG,
  },
  {
    signal: "torso_openness",
    read: (r) => r.torsoOpennessRatio,
    scale: POSTURE_TORSO_OPENNESS_DRIFT_SCALE,
  },
];

function baselineFieldFor(
  signal: VisualPostureSignal
): keyof Omit<PostureBaseline, "signals" | "sampleCount"> {
  switch (signal) {
    case "shoulder_line":
      return "shoulderTiltDeg";
    case "forward_head":
      return "forwardHeadOffset";
    case "torso_lean":
      return "torsoLeanDeg";
    case "torso_openness":
      return "torsoOpennessRatio";
  }
}

/**
 * Pure. Establishes a self-calibrated posture baseline from readings taken
 * during the opening `POSTURE_BASELINE_WINDOW_S` of capture — never a fixed
 * upright ideal (12-CONTEXT.md's fairness resolution for wheelchair users,
 * chronic pain, and standing desks). Readings outside the window are ignored
 * entirely, matching the per-signal visibility discipline `PoseDetectResult`
 * already enforces: a signal with fewer than `POSTURE_BASELINE_MIN_SAMPLES`
 * usable readings inside the window gets no baseline at all, rather than one
 * built from too little evidence to be fair.
 *
 * `anchorTS` (12-08 Task 1 checkpoint, Defect E fix) is the session clock
 * value the window opens AT — defaults to 0 (capture start) so every
 * existing caller/test that never anchors explicitly is unaffected. The
 * caller (`applyPoseResult`) now passes the tS of the FIRST usable pose
 * reading, not capture start: `start()` sets `startedAtMs` before the video
 * element loads, the worker initializes, and all four MediaPipe models
 * (~23.8MB combined) warm up on the GPU — real dead time on the SAME clock
 * `tS` is measured against. Anchoring to capture start meant that dead time
 * ate directly into the 20s calibration window before a single pose tick
 * could land; anchoring to the first usable reading instead gives the
 * window the full 20 REAL seconds of data the pipeline could actually see.
 *
 * Per-signal baselines are independent — the shoulder line can calibrate
 * while hips never clear the floor (the common head-and-shoulders webcam
 * framing), and vice versa.
 */
export function computePostureBaseline(
  readings: PostureReading[],
  anchorTS: number = 0
): PostureBaseline {
  const windowed = readings.filter(
    (r) => r.tS - anchorTS <= POSTURE_BASELINE_WINDOW_S
  );

  const baseline: PostureBaseline = {
    shoulderTiltDeg: null,
    forwardHeadOffset: null,
    torsoLeanDeg: null,
    torsoOpennessRatio: null,
    signals: [],
    sampleCount: windowed.length,
  };

  for (const { signal, read } of POSTURE_SIGNAL_TABLE) {
    const values = windowed
      .map(read)
      .filter((v): v is number => v !== null);
    if (values.length < POSTURE_BASELINE_MIN_SAMPLES) continue;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    baseline[baselineFieldFor(signal)] = mean;
    baseline.signals.push(signal);
  }

  return baseline;
}

/**
 * Pure. Drift is `abs(current - baseline)` per signal, normalised to 0-1 by
 * that signal's scale constant in `body-thresholds.ts`, clamped, then
 * averaged across only the signals that HAVE a baseline. A signal absent from
 * `baseline.signals` contributes nothing — not a 0 — and when no signal is
 * shared between the reading and the baseline, `driftMagnitude` is `null`,
 * never a defaulted 0: a clean `clampFinite`-style fallback here would print
 * a flattering posture reading for a student nobody ever actually measured.
 *
 * **The fairness property this exists to prove:** two readings with wildly
 * different ABSOLUTE values but identical deltas from their OWN baselines
 * produce the SAME drift — see `scripts/verify-visual-metrics.ts`.
 */
export function computePostureDrift(
  reading: PostureReading,
  baseline: PostureBaseline
): {
  driftMagnitude: number | null;
  perSignal: Partial<Record<VisualPostureSignal, number>>;
} {
  const perSignal: Partial<Record<VisualPostureSignal, number>> = {};

  for (const { signal, read, scale } of POSTURE_SIGNAL_TABLE) {
    if (!baseline.signals.includes(signal)) continue;
    const current = read(reading);
    if (current === null) continue;
    const baselineValue = baseline[baselineFieldFor(signal)];
    if (baselineValue === null) continue;
    perSignal[signal] = clamp(Math.abs(current - baselineValue) / scale, 0, 1);
  }

  const values = Object.values(perSignal) as number[];
  if (values.length === 0) {
    return { driftMagnitude: null, perSignal };
  }
  return {
    driftMagnitude: values.reduce((sum, v) => sum + v, 0) / values.length,
    perSignal,
  };
}

/** Raw gesture/hand material one session accumulates, handed to
 * `computeGestureRates`. */
export interface GestureCounts {
  /** Every tick the hands model ran this session, hand detected or not —
   * the denominator for `handsAboveShoulderPct`, deliberately NOT
   * `handsDetectedSamples`, for the same "must not divide by detected"
   * reason `camera_centered_pct` already documents. */
  handSamples: number;
  /** Sum of normalised wrist displacement across ticks whose delta cleared
   * `GESTURE_AMPLITUDE_MIN` — the gesture band only. (The low-amplitude
   * band below this threshold used to feed a separate fidget counter,
   * removed in 12-08 when fidgeting was retired to permanently
   * not-measured — see `VISUAL_NOT_MEASURED`'s own comment in types.ts.) */
  gestureDisplacementSum: number;
  /** Count of ticks whose displacement cleared `GESTURE_AMPLITUDE_MIN`. */
  gestureEventCount: number;
  handsAboveShoulderSamples: number;
  handsNearFaceSamples: number;
  /** Hand-detected samples where a face box was ALSO available this tick —
   * the signal is undefined without both halves, so this (not `handSamples`)
   * is `handsNearFacePct`'s denominator. Documented here explicitly so the
   * different-denominator choice reads as deliberate, not an inconsistency. */
  handsNearFaceEligibleSamples: number;
  sessionSeconds: number;
}

/**
 * Pure. Turns raw gesture/hand counts into the reported rates.
 *
 * `gestureRatePerMin` divides by SESSION MINUTES, never by hand-detected
 * samples — dividing by a detection count would make the rate structurally
 * unable to fall for absence, the identical defect `camera_centered_pct`'s own
 * doc comment warns about and that already shipped once in this pipeline.
 */
export function computeGestureRates(counts: GestureCounts): {
  gestureRatePerMin: number;
  gestureAmplitudeMean: number;
  handsAboveShoulderPct: number;
  handsNearFacePct: number;
} {
  const minutes = Math.max(1 / 60, counts.sessionSeconds / 60);
  const handSamples = Math.max(1, counts.handSamples);
  return {
    gestureRatePerMin:
      Math.round((counts.gestureEventCount / minutes) * 10) / 10,
    gestureAmplitudeMean:
      counts.gestureEventCount > 0
        ? Math.round(
            (counts.gestureDisplacementSum / counts.gestureEventCount) * 1000
          ) / 1000
        : 0,
    handsAboveShoulderPct: Math.round(
      (counts.handsAboveShoulderSamples / handSamples) * 100
    ),
    handsNearFacePct: Math.round(
      (counts.handsNearFaceSamples /
        Math.max(1, counts.handsNearFaceEligibleSamples)) *
        100
    ),
  };
}

/**
 * Raw material for `computeObservations` (12-07's measured-but-never-scored
 * half). `phoneSampleHz` arrives PRE-COMPUTED by the caller (`stop()`), not
 * derived inside this function — see that field's own doc comment for why.
 *
 * BUG FIX (12-08 Task 1 checkpoint): `handSamples`/`fidgetSamples` were
 * removed when fidgeting was retired to permanently not-measured — see
 * `VisualDescriptiveObservations`'s own comment in `types.ts`. Neither
 * field had any other reader.
 */
export interface ObservationCounts {
  /** Total object-model ticks this session (phone present or not) — the
   * `phoneSampleHz` numerator's own source, kept here for parity with
   * `phoneVisibleSamples`, not read directly by `computeObservations`. */
  phoneSamples: number;
  phoneVisibleSamples: number;
  /** The object runner's EFFECTIVE rate this session (ticks per second it
   * ACTUALLY achieved — `phoneSamples / sessionSeconds` — never the nominal
   * configured interval). A session with dropped object ticks has a real
   * effective rate below the nominal one; converting visible-sample counts
   * to seconds with the wrong (higher) rate would UNDERSTATE how long a
   * phone was actually visible. */
  phoneSampleHz: number;
  /** Session-mean ABSOLUTE shoulder-line tilt, or `null` when the signal was
   * never measurable — the SAME raw angles 12-06 collects for drift, just
   * never baseline-relative. This is the absolute reading REQ-51 requires to
   * be produced and shown, but never graded. */
  absoluteShoulderTiltDegMean: number | null;
  /** Session-mean ABSOLUTE forward-head offset, or `null` when never
   * measurable. Same absolute-vs-drift distinction as the shoulder field. */
  absoluteForwardHeadOffsetMean: number | null;
}

/**
 * Pure. Turns raw observation counts into the reported descriptive values —
 * the measured-but-NEVER-SCORED half of this phase (REQ-54/REQ-55).
 * Exported for direct testing, same discipline as `computeVisualRates`/
 * `computeGestureRates`.
 *
 * `phoneVisibleSeconds` is genuinely DERIVED here (a unit conversion);
 * `postureShoulderTiltDeg`/`postureForwardHeadOffset` are PASSED THROUGH
 * unchanged — the caller already computed the session means, and this
 * function's job is only to bundle the three descriptive values behind one
 * pure, testable seam so `stop()`'s assembly code and
 * `scripts/verify-visual-metrics.ts` exercise the identical arithmetic.
 */
export function computeObservations(counts: ObservationCounts): {
  phoneVisibleSeconds: number;
  postureShoulderTiltDeg: number | null;
  postureForwardHeadOffset: number | null;
} {
  // A single false-positive object-detection frame must not become "a phone
  // was visible" — below PHONE_MIN_VISIBLE_S, report 0 rather than a
  // fractional-second reading nobody could act on.
  let phoneVisibleSeconds = 0;
  if (counts.phoneSampleHz > 0) {
    const rawSeconds = counts.phoneVisibleSamples / counts.phoneSampleHz;
    phoneVisibleSeconds =
      rawSeconds >= PHONE_MIN_VISIBLE_S ? Math.round(rawSeconds) : 0;
  }

  return {
    phoneVisibleSeconds,
    postureShoulderTiltDeg: counts.absoluteShoulderTiltDegMean,
    postureForwardHeadOffset: counts.absoluteForwardHeadOffsetMean,
  };
}

/** One closed sampling window's totals. Scalars only — no landmarks, no
 * frames; nothing here outlives the tick that produced it in any richer form
 * than these counts.
 *
 * `driftMean` holds this window's mean posture-drift magnitude (0-1), fed by
 * `computePostureDrift` — see that function's own doc comment. `gestureSum`/
 * `gestureSamples` are the gesture band only (amplitude above
 * `GESTURE_AMPLITUDE_MIN`); `handsDetected` is the raw hand-detected sample
 * count this window, independent of amplitude, needed so `minimal_gesturing`
 * can tell "hands visible and still" apart from "nobody there to judge". */
export interface CaptureWindow {
  startS: number;
  endS: number;
  processed: number;
  detected: number;
  forward: number;
  centered: number;
  multiFace: number;
  movementMean: number;
  poseProcessed: number;
  driftMean: number;
  gestureSum: number;
  gestureSamples: number;
  handsDetected: number;
  nearFaceCount: number;
  phoneCount: number;
  /** Total object-model ticks (phone present or not) that landed in this
   * window — 12-07's denominator for `phone_visible`'s window-trip ratio.
   * Distinct from `phoneCount` (the VISIBLE subset) for the same reason
   * `handsDetected` is distinct from `gestureSamples`: a window with few
   * processed object ticks must not trip on one frame. */
  phoneProcessed: number;
}

/** Whether a single window trips each episode condition. Ratios, never raw
 * counts, so a window that processed few samples cannot trip on one frame. */
function windowTrips(w: CaptureWindow, kind: VisualEpisodeKind): boolean {
  if (w.processed <= 0) return false;
  switch (kind) {
    case "off_camera":
      return w.detected / w.processed < EPISODE_OFF_CAMERA_MAX_DETECTED_RATIO;
    case "gaze_away":
      return (
        w.detected > 0 &&
        w.forward / w.detected < EPISODE_GAZE_AWAY_MAX_FORWARD_RATIO
      );
    case "off_center":
      return (
        w.detected > 0 &&
        w.centered / w.detected < EPISODE_OFF_CENTER_MAX_CENTERED_RATIO
      );
    case "multiple_faces":
      return w.multiFace / w.processed > EPISODE_MULTI_FACE_MIN_RATIO;
    case "high_movement":
      return w.movementMean > HIGH_MOVEMENT_THRESHOLD;
    // The four body-language kinds below ride on the SAME window boundaries
    // as the face-driven kinds above (windows close on the face tick's
    // timing — see `closeWindow`), but trip on their OWN sample counts, never
    // `w.processed` (a face-tick count unrelated to hand/pose availability).
    //
    // BUG FIX (12-08 Task 2, the window-vs-band inconsistency): excessive_gesturing
    // and minimal_gesturing used to extrapolate a WALL-CLOCK rate
    // (`gestureSamples / ((endS - startS) / 60)`) and compare it directly
    // against the SESSION-LEVEL per-minute cutoffs (`GESTURE_RATE_EXCESSIVE_MIN`/
    // `GESTURE_RATE_STILL_MAX`) — the one place in this function that did NOT
    // follow the "RATIOS of same-model counts, never raw counts against an
    // assumed ideal" discipline every sibling case here already follows
    // (hands_near_face/posture_drift divide by the window's own observed
    // sample count, never by wall-clock time). At the hands model's real
    // ~1.5 Hz achievable rate, a 5s window holds only ~7-8 real ticks; just 2-3
    // of them registering as gesture events (a single emphatic gesture
    // spanning a couple of ticks — ordinary, not excessive, behaviour) was
    // enough to extrapolate past 25/min, which is exactly why real sessions
    // whose SESSION-WIDE rate measured 4, 9, and 12.2/min still tripped
    // `excessive_gesturing` episodes that read to a student as "told off for
    // a sensor misread" (12-CONTEXT.md's governing rule). Both cases now
    // compare a ratio of THIS WINDOW's own `gestureSamples` to its own
    // `handsDetected` — the window's REAL observed tick count, not an
    // assumed-ideal wall-clock-derived one — against `GESTURE_WINDOW_EXCESSIVE_PCT`/
    // `GESTURE_WINDOW_STILL_PCT`, which `body-thresholds.ts` derives from the
    // SAME tuned per-minute cutoffs via the confirmed real hands achievable
    // rate (see those constants' own comments), so the window-level trip and
    // the session-level band represent the identical underlying intensity,
    // not two independently-guessed numbers. `excessive_gesturing` also
    // gains the SAME minimum-sample floor `minimal_gesturing` already had —
    // a window with too few real hand ticks cannot trip on EITHER extreme,
    // closing the asymmetry where only the "still" side had this guard.
    case "excessive_gesturing": {
      if (w.handsDetected < GESTURE_WINDOW_MIN_HAND_SAMPLES) return false;
      return (
        (w.gestureSamples / w.handsDetected) * 100 > GESTURE_WINDOW_EXCESSIVE_PCT
      );
    }
    case "minimal_gesturing": {
      // The hand-sample guard matters: "no hands detected" (handsDetected
      // below the floor) is NOT the same finding as "hands visible and
      // still" — conflating them would report stillness for someone sitting
      // outside the frame entirely.
      if (w.handsDetected < GESTURE_WINDOW_MIN_HAND_SAMPLES) return false;
      return (
        (w.gestureSamples / w.handsDetected) * 100 < GESTURE_WINDOW_STILL_PCT
      );
    }
    case "hands_near_face":
      return (
        w.handsDetected > 0 &&
        (w.nearFaceCount / w.handsDetected) * 100 > HANDS_NEAR_FACE_TRIP_PCT
      );
    case "posture_drift":
      return w.poseProcessed > 0 && w.driftMean > POSTURE_DRIFT_TRIP;
  }
}

/**
 * Collapses a session's windows into timestamped excursions for ONE kind
 * vocabulary, given that vocabulary's own trip predicate. Pure, generic, and
 * the shared inner engine behind both `extractEpisodes` (scored) and
 * `extractDescriptiveEpisodes` (12-07, never scored) — the two PUBLIC
 * functions stay structurally distinct (different kind types, different trip
 * predicates) so a descriptive episode cannot silently enter the scored
 * array; only this run-collapsing arithmetic is shared.
 *
 * A run absorbs up to `EPISODE_GAP_TOLERANCE_WINDOWS` non-tripping windows
 * without ending, so one glance back at the camera during a long absence does
 * not shatter one episode into three. Trailing non-tripping windows are
 * trimmed back off before the run is measured, so the reported end time is
 * when the behaviour actually stopped rather than when tolerance ran out.
 *
 * `severity` is the fraction of windows inside the run that genuinely tripped
 * — which is why the gap tolerance matters twice: it keeps the episode whole
 * AND records how solid it was.
 */
function collapseRuns<K extends string>(
  windows: CaptureWindow[],
  kinds: readonly K[],
  trips: (w: CaptureWindow, kind: K) => boolean
): Array<{ kind: K; start_s: number; end_s: number; severity: number }> {
  const episodes: Array<{ kind: K; start_s: number; end_s: number; severity: number }> = [];

  for (const kind of kinds) {
    const tripped = windows.map((w) => trips(w, kind));
    let runStart = -1;
    let gap = 0;

    const closeRun = (endExclusive: number) => {
      if (runStart < 0) return;
      // Trim trailing untripped windows absorbed by the gap tolerance.
      let last = endExclusive - 1;
      while (last > runStart && !tripped[last]) last -= 1;

      const span = windows.slice(runStart, last + 1);
      const durationS = span[span.length - 1].endS - span[0].startS;
      if (durationS >= MIN_EPISODE_SECONDS) {
        const hits = span.reduce(
          (n, _w, i) => n + (tripped[runStart + i] ? 1 : 0),
          0
        );
        episodes.push({
          kind,
          start_s: Math.round(span[0].startS),
          end_s: Math.round(span[span.length - 1].endS),
          severity: Math.round((hits / span.length) * 100) / 100,
        });
      }
      runStart = -1;
      gap = 0;
    };

    for (let i = 0; i < windows.length; i++) {
      if (tripped[i]) {
        if (runStart < 0) runStart = i;
        gap = 0;
      } else if (runStart >= 0) {
        gap += 1;
        if (gap > EPISODE_GAP_TOLERANCE_WINDOWS) closeRun(i);
      }
    }
    closeRun(windows.length);
  }

  // Keep the most significant by DURATION, then restore chronological order so
  // the report reads as a timeline rather than a ranking.
  return episodes
    .sort((a, b) => b.end_s - b.start_s - (a.end_s - a.start_s))
    .slice(0, MAX_EPISODES)
    .sort((a, b) => a.start_s - b.start_s);
}

/** Pure and exported for direct testing — see `collapseRuns`'s own doc
 * comment for the shared engine both this and `extractDescriptiveEpisodes`
 * ride on. */
export function extractEpisodes(
  windows: CaptureWindow[],
  kinds: readonly VisualEpisodeKind[]
): VisualEpisode[] {
  return collapseRuns(windows, kinds, windowTrips);
}

/** Whether a single window trips each DESCRIPTIVE episode condition — never
 * scored, never read by `windowTrips`/`extractEpisodes`. Ratios, never raw
 * counts, matching every scored trip condition's own discipline.
 *
 * BUG FIX (12-08 Task 1 checkpoint): `fidgeting` (and the Defect H fix that
 * unified its window-level trip with the session-level `fidget_pct` gate)
 * was removed entirely when fidgeting was retired to permanently
 * not-measured — see `VisualDescriptiveObservations`'s own comment in
 * `types.ts`. `phone_visible` is the only remaining descriptive episode
 * kind, so this function no longer needs an options parameter at all. */
function descriptiveWindowTrips(
  w: CaptureWindow,
  kind: VisualDescriptiveEpisodeKind
): boolean {
  switch (kind) {
    case "phone_visible":
      return (
        w.phoneProcessed > 0 &&
        (w.phoneCount / w.phoneProcessed) * 100 > PHONE_EPISODE_TRIP_PCT
      );
  }
}

/**
 * Pure and exported for direct testing. The DESCRIPTIVE sibling of
 * `extractEpisodes` — same `collapseRuns` engine, a completely separate kind
 * vocabulary and trip predicate, and a different TypeScript return type
 * (`VisualDescriptiveEpisode[]`, not `VisualEpisode[]`). That type distinction
 * is what makes "a descriptive episode entered the scored array" a compile
 * error rather than a runtime discipline to remember (see
 * `VisualDescriptiveEpisode`'s own header comment in `types.ts`).
 */
export function extractDescriptiveEpisodes(
  windows: CaptureWindow[],
  kinds: readonly VisualDescriptiveEpisodeKind[]
): VisualDescriptiveEpisode[] {
  return collapseRuns(windows, kinds, descriptiveWindowTrips);
}

interface FaceBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

/** Normalized bounding box of one face's landmark set, plus its area — the
 * discriminator `runTick` uses to pick the primary face out of several. */
function boundsOf(landmarks: Array<{ x: number; y: number }>): FaceBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY),
  };
}

/**
 * Creates a headless visual capture engine bound to an already-acquired
 * camera stream. The engine owns its own detached `<video>` element (never
 * reuses the self-view thumbnail's DOM node) so it cannot be broken by a UI
 * remount, and dynamically imports the MediaPipe runtime inside `start()` so
 * the multi-megabyte WASM/model payload is never part of the initial bundle
 * and never loads for a camera-off session.
 */
export function createVisualCapture(
  options: CreateVisualCaptureOptions
): VisualCaptureHandle {
  const { stream, onFaceStateChange, sessionStartedAtMs } = options;

  let started = false;
  let stopped = false;

  let videoEl: HTMLVideoElement | null = null;
  // Which TFLite delegate actually initialised. Surfaced for diagnostics only;
  // it never affects scoring.
  let delegateInUse: "GPU" | "CPU" | null = null;
  // Using `unknown` for the landmarker instance to avoid importing MediaPipe
  // types at module scope, keeping the dynamic import truly lazy.
  let landmarker: {
    detectForVideo: (
      videoFrame: HTMLVideoElement,
      timestamp: number
    ) => {
      faceLandmarks: Array<Array<{ x: number; y: number }>>;
      facialTransformationMatrixes: Array<{ data: number[] }>;
    };
    close: () => void;
  } | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  // Object (phone) detection's own independent timer — see
  // `OBJECT_TICK_INTERVAL_MS`'s doc comment.
  let objectIntervalId: ReturnType<typeof setInterval> | null = null;
  let lumaCanvas: HTMLCanvasElement | null = null;
  let lumaCtx: CanvasRenderingContext2D | null = null;

  // Worker lifecycle (REQ-57). `usingWorker` is decided once, in `start()`,
  // and never flips mid-session — a worker that fails to init falls back to
  // the main-thread path for the WHOLE session, never a partial/dynamic
  // switch. A worker failure degrades the WHOLE session to the original
  // Phase 10 face-only main-thread path; pose/hands/object have no
  // main-thread equivalent (12-05 introduced them worker-only), so a
  // fallback session simply does not collect those three signals — never
  // `analyzer_error` (REQ-42's discipline: a technical fallback is not a
  // measurement failure).
  let worker: Worker | null = null;
  let usingWorker = false;
  /** Per-model one-outstanding-request back-pressure state: a tick that
   * fires while that model's previous `detect` is still in flight is a
   * dropped tick for THAT model, never a queued one and never an error. */
  interface ModelRequestState {
    outstanding: boolean;
    speakingNow: boolean;
    startMs: number;
  }
  const requestState: Record<ModelId, ModelRequestState> = {
    face: { outstanding: false, speakingNow: false, startMs: 0 },
    pose: { outstanding: false, speakingNow: false, startMs: 0 },
    hands: { outstanding: false, speakingNow: false, startMs: 0 },
    object: { outstanding: false, speakingNow: false, startMs: 0 },
  };
  // Resolves the `closed`-reply half of `closeEngine`'s bounded race; null
  // whenever no close request is currently in flight.
  let workerClosedResolve: (() => void) | null = null;

  // Liveness accumulators.
  const sessionStartMs = () => performance.now();
  let startedAtMs = 0;
  let trackLiveSeconds = 0;
  let processedSamples = 0;
  let analyzerError = false;
  let consecutiveDetectErrors = 0;
  let tickCount = 0;

  // Detection accumulators.
  let faceDetectedSamples = 0;
  let multipleFacesSamples = 0;
  let forwardFacingSamples = 0;

  // Conversational window. Defaults to NOT speaking: the session opens with
  // the avatar greeting the student, so assuming "speaking" would credit the
  // opening seconds to the wrong bucket.
  let isSpeaking = false;
  let speakingSamples = 0;
  let listeningSamples = 0;
  let listeningForwardSamples = 0;

  // Rolling window used for episode extraction. Only the closed windows are
  // retained — a 20-minute session is ~240 rows of 8 numbers.
  const windows: CaptureWindow[] = [];
  let windowStartS = 0;
  let winProcessed = 0;
  let winDetected = 0;
  let winForward = 0;
  let winCentered = 0;
  let winMultiFace = 0;
  let winMovementSum = 0;
  let winMovementSamples = 0;
  let winPoseProcessed = 0;
  let winPostureDriftSum = 0;
  let winPostureDriftSamples = 0;
  let winGestureSum = 0;
  let winGestureSamples = 0;
  let winHandsDetected = 0;
  let winNearFaceCount = 0;
  let winPhoneCount = 0;
  let winPhoneProcessed = 0;
  let captureOffsetS = 0;
  let poseUnavailableSamples = 0;
  let centeredSamples = 0;
  let outOfFrameSamples = 0;
  let movementSum = 0;
  let movementSamples = 0;
  let lastCenter: { x: number; y: number } | null = null;
  let lumaSum = 0;
  let lumaSamples = 0;

  // --- 12-05 pose accumulators (raw material only; derivation is 12-06's
  // job). `poseVisibleSamples` mirrors `VISUAL_POSTURE_SIGNALS`'s four
  // landmark groups; the sum fields below are accumulated ONLY on ticks
  // where the corresponding group cleared the visibility floor, so a mean
  // computed from them (sum / visibleSamples) is never diluted by a null
  // reading pretending to be a zero.
  let poseSamples = 0;
  const poseVisibleSamples: Record<VisualPostureSignal, number> = {
    shoulder_line: 0,
    forward_head: 0,
    torso_lean: 0,
    torso_openness: 0,
  };
  let poseShoulderTiltSum = 0;
  let poseForwardHeadOffsetSum = 0;
  let poseTorsoLeanSum = 0;
  let poseTorsoOpennessSum = 0;

  // --- 12-06 posture baseline/drift. `postureBaselineReadings` only ever
  // holds readings from inside the (anchored) `POSTURE_BASELINE_WINDOW_S` —
  // see `applyPoseResult` for where it stops growing and `postureBaseline`
  // gets computed. Drift after that point is computed STREAMING, one
  // reading at a time, and folded straight into the running sums below;
  // individual post-baseline readings are never retained (see
  // `computePostureBaseline`/`computePostureDrift`'s own doc comments for why
  // only the baseline window may ever be kept as a raw array). `let`, not
  // `const`, because Defect E's retry (below) can reset it and re-collect
  // from a fresh anchor if the first window comes back empty.
  let postureBaselineReadings: PostureReading[] = [];
  let postureBaseline: PostureBaseline | null = null;
  // BUG FIX (12-08 Task 1 checkpoint, Defect E): the calibration window used
  // to be anchored to capture start (`tS <= POSTURE_BASELINE_WINDOW_S`,
  // i.e. implicitly anchored at 0) — see `computePostureBaseline`'s own
  // doc comment for why that ate real calibration time with model-loading
  // dead time. `null` until the first pose reading with ANY non-null
  // signal arrives; THAT reading's `tS` becomes the anchor the window opens
  // relative to.
  let postureBaselineAnchorTS: number | null = null;
  let postureDriftSum = 0;
  let postureDriftSamples = 0;
  let postureDriftStreakStartS: number | null = null;
  let postureDriftMaxS = 0;

  // --- 12-05 hands accumulators.
  let handSamples = 0;
  let handsDetectedSamples = 0;
  let handsAboveShoulderSamples = 0;
  let handsNearFaceSamples = 0;
  // 12-06: hand-detected samples where a face box was ALSO available this
  // tick — the denominator `handsNearFacePct` needs (see `GestureCounts`'s
  // own doc comment for why this must differ from `handSamples`).
  let handsNearFaceEligibleSamples = 0;
  // Gesture-amplitude raw material — tracked the same way `lastCenter`/
  // `movementSum` already track face motion, one slot per selected hand
  // index (at most two). Hand identity is NOT guaranteed stable across ticks
  // (see the worker's own selection-rule comment); this is the same accepted
  // risk, applied to displacement rather than detection.
  let lastGestureWristPositions: Array<{ x: number; y: number }> = [];
  let gestureDisplacementSum = 0;
  let gestureEventCount = 0;

  // BUG FIX (12-08 Task 1 checkpoint): the fidget raw-material accumulator
  // pair (a separate displacement/direction-change counter, its own
  // independent position history) was removed entirely when fidgeting was
  // retired to permanently not-measured — see `VisualDescriptiveObservations`'s
  // own comment in `types.ts` for the Nyquist-style reason (the hands model's
  // ~1.5 Hz achievable rate cannot observe a reversal rate fast enough to
  // mean "fidgeting" at all; two real recordings measured 0.35/s and 0.15/s
  // against a gate already lowered once to 0.5/s). Nothing else read these
  // accumulators.

  // --- 12-05 object (phone) accumulators.
  let phoneSamples = 0;
  let phoneVisibleSamples = 0;

  // --- 12-05 per-model diagnostics (frame-budget log only — never part of
  // `VisualMetrics`). Additional breakdown alongside the overall
  // `tickCostSamplesMs` (fed by every model) so the budget line can show
  // WHICH model is expensive, not just the total — see the DEFECT 2 FIX
  // comment above `recordTickCost` for why both are now the same
  // unbounded shape.
  const modelTickCostSum: Record<ModelId, number> = {
    face: 0,
    pose: 0,
    hands: 0,
    object: 0,
  };
  const modelTickCostCount: Record<ModelId, number> = {
    face: 0,
    pose: 0,
    hands: 0,
    object: 0,
  };
  const modelDroppedTicks: Record<ModelId, number> = {
    face: 0,
    pose: 0,
    hands: 0,
    object: 0,
  };

  function recordModelTickCost(model: ModelId, ms: number) {
    modelTickCostSum[model] += ms;
    modelTickCostCount[model] += 1;
  }

  // Per-tick inference cost instrumentation (REQ-57 diagnostics only — never
  // included in `VisualMetrics`, never leaves the browser as a metric
  // field). Plain growable array, session-scoped — see the DEFECT 2 FIX
  // comment above `recordTickCost` for why this is no longer a fixed-size
  // ring.
  const tickCostSamplesMs: number[] = [];
  // Main-thread dispatch cost, worker path only: the `createImageBitmap` +
  // `postMessage` segment that genuinely occupies THIS thread. REQ-57 is a
  // claim about main-thread contention with the HeyGen stream, so on the
  // worker path this - not the round-trip - is the number that bears on it.
  const dispatchSamplesMs: number[] = [];
  let droppedTicks = 0;
  let lastTickEntryMs: number | null = null;

  // Face-state debounce for the banner callback.
  let reportedFaceDetected = true; // assume detected until proven otherwise
  let candidateFaceDetected = true;
  let candidateStreak = 0;

  function tickIntervalMs(): number {
    return 1000 / METRICS_SAMPLE_HZ;
  }

  /** Folds the open window into `windows` and resets the per-window counters.
   * Called on the window boundary and once more at `stop()` so a partial
   * final window is not silently dropped. */
  function closeWindow(nowS: number) {
    if (winProcessed === 0) {
      windowStartS = nowS;
      return;
    }
    windows.push({
      startS: windowStartS,
      endS: nowS,
      processed: winProcessed,
      detected: winDetected,
      forward: winForward,
      centered: winCentered,
      multiFace: winMultiFace,
      movementMean:
        winMovementSamples > 0 ? winMovementSum / winMovementSamples : 0,
      poseProcessed: winPoseProcessed,
      driftMean:
        winPostureDriftSamples > 0
          ? winPostureDriftSum / winPostureDriftSamples
          : 0,
      gestureSum: winGestureSum,
      gestureSamples: winGestureSamples,
      handsDetected: winHandsDetected,
      nearFaceCount: winNearFaceCount,
      phoneCount: winPhoneCount,
      phoneProcessed: winPhoneProcessed,
    });
    windowStartS = nowS;
    winProcessed = 0;
    winDetected = 0;
    winForward = 0;
    winCentered = 0;
    winMultiFace = 0;
    winMovementSum = 0;
    winMovementSamples = 0;
    winPoseProcessed = 0;
    winPostureDriftSum = 0;
    winPostureDriftSamples = 0;
    winGestureSum = 0;
    winGestureSamples = 0;
    winHandsDetected = 0;
    winNearFaceCount = 0;
    winPhoneCount = 0;
    winPhoneProcessed = 0;
  }

  function elapsedS(): number {
    return (sessionStartMs() - startedAtMs) / 1000;
  }

  function reportFaceState(detected: boolean) {
    if (detected === candidateFaceDetected) {
      candidateStreak += 1;
    } else {
      candidateFaceDetected = detected;
      candidateStreak = 1;
    }
    if (
      candidateStreak >= FACE_STATE_TRANSITION_STREAK &&
      reportedFaceDetected !== candidateFaceDetected
    ) {
      reportedFaceDetected = candidateFaceDetected;
      onFaceStateChange?.(reportedFaceDetected);
    }
  }

  function ensureLumaCanvas(): CanvasRenderingContext2D | null {
    if (lumaCtx) return lumaCtx;
    if (typeof document === "undefined") return null;
    lumaCanvas = document.createElement("canvas");
    lumaCanvas.width = LUMA_CANVAS_SIZE;
    lumaCanvas.height = LUMA_CANVAS_SIZE;
    lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });
    return lumaCtx;
  }

  function sampleLuma(
    video: HTMLVideoElement,
    box: { minX: number; minY: number; maxX: number; maxY: number } | null
  ) {
    const ctx = ensureLumaCanvas();
    if (!ctx || !lumaCanvas) return;
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (box) {
      sx = clamp(box.minX, 0, 1) * vw;
      sy = clamp(box.minY, 0, 1) * vh;
      sw = Math.max(1, (clamp(box.maxX, 0, 1) - clamp(box.minX, 0, 1)) * vw);
      sh = Math.max(1, (clamp(box.maxY, 0, 1) - clamp(box.minY, 0, 1)) * vh);
    }

    try {
      ctx.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        LUMA_CANVAS_SIZE,
        LUMA_CANVAS_SIZE
      );
      const { data } = ctx.getImageData(
        0,
        0,
        LUMA_CANVAS_SIZE,
        LUMA_CANVAS_SIZE
      );
      let total = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Standard luma coefficients.
        const luma =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        total += luma;
        count += 1;
      }
      if (count > 0) {
        lumaSum += total / count;
        lumaSamples += 1;
      }
    } catch {
      // A transient draw failure (e.g. video not yet ready) is not a fatal
      // analyzer error - lighting is a best-effort secondary signal.
    }
  }

  /** Per-tick inference cost (REQ-57 diagnostics): fixed-capacity ring
   * buffer, overwrite oldest, never grow.
   *
   * CAUTION: this does NOT mean the same thing on both paths, and the
   * frame-budget report says which via `tickCostKind`. On the worker path it
   * is round-trip wall-clock, most of which is NOT main-thread time; on the
   * main-thread fallback it is synchronous blocking of this thread. Reading a
   * worker round-trip as if it were blocking overstates the cost by roughly
   * the whole inference; reading a fallback blocking cost as if it were a
   * round-trip understates main-thread contention to zero. Compare
   * `dispatchMeanMs` for the worker path's real main-thread share. */
  function recordTickCost(ms: number) {
    tickCostSamplesMs.push(ms);
  }

  /** Main-thread dispatch cost for one worker tick (REQ-57). */
  function recordDispatchCost(ms: number) {
    dispatchSamplesMs.push(ms);
  }

  /**
   * Folds one tick's scalar face-detection result into every accumulator -
   * the single place both the worker path and the main-thread fallback path
   * converge, so the two can never silently measure something different.
   * Called exactly once per successfully-processed tick (never on a dropped
   * tick, never on a detect error) - this is where `processedSamples`/
   * `winProcessed` actually increment.
   */
  function applyFaceResult(result: FaceDetectResult, speakingNow: boolean) {
    processedSamples += 1;
    winProcessed += 1;

    const nowS = elapsedS();
    if (nowS - windowStartS >= EPISODE_WINDOW_SECONDS) {
      closeWindow(nowS);
    }

    // Route into the conversational bucket. Done for every processed sample,
    // detected or not: being off camera while you are the one speaking is
    // itself a gaze failure, so the denominator must include it.
    if (speakingNow) {
      speakingSamples += 1;
    } else {
      listeningSamples += 1;
    }

    const hasFace = result.faceCount > 0;
    reportFaceState(hasFace);

    if (!hasFace) {
      lastCenter = null;
      if (videoEl && tickCount % LUMA_SAMPLE_EVERY_N_TICKS === 0) {
        sampleLuma(videoEl, null);
      }
      return;
    }

    faceDetectedSamples += 1;
    winDetected += 1;
    if (result.faceCount > 1) {
      multipleFacesSamples += 1;
      winMultiFace += 1;
    }

    // Forward-gaze proxy from the primary face's raw yaw/pitch degrees - a
    // HEAD-POSE PROXY for eye contact, not pupil tracking (see CONTEXT.md).
    // The threshold comparison stays here, as a main-thread constant, even
    // though the matrix decode producing these degrees now happens inside
    // the worker.
    if (result.poseAvailable && result.yawDeg !== null && result.pitchDeg !== null) {
      if (
        Math.abs(result.yawDeg) <= FORWARD_YAW_LIMIT_DEG &&
        Math.abs(result.pitchDeg) <= FORWARD_PITCH_LIMIT_DEG
      ) {
        forwardFacingSamples += 1;
        winForward += 1;
        if (!speakingNow) {
          listeningForwardSamples += 1;
        }
      }
    } else {
      poseUnavailableSamples += 1;
    }

    const primary = result.primary;
    if (!primary) return;
    const { minX, maxX, minY, maxY, centerX, centerY } = primary;

    if (
      centerX >= CENTER_X_MIN &&
      centerX <= CENTER_X_MAX &&
      centerY >= CENTER_Y_MIN &&
      centerY <= CENTER_Y_MAX
    ) {
      centeredSamples += 1;
      winCentered += 1;
    }
    if (
      minX < OUT_OF_FRAME_MARGIN ||
      maxX > 1 - OUT_OF_FRAME_MARGIN ||
      minY < OUT_OF_FRAME_MARGIN ||
      maxY > 1 - OUT_OF_FRAME_MARGIN
    ) {
      outOfFrameSamples += 1;
    }

    if (lastCenter) {
      const dx = centerX - lastCenter.x;
      const dy = centerY - lastCenter.y;
      const delta = Math.sqrt(dx * dx + dy * dy);
      movementSum += delta;
      movementSamples += 1;
      winMovementSum += delta;
      winMovementSamples += 1;
    }
    lastCenter = { x: centerX, y: centerY };

    if (videoEl && tickCount % LUMA_SAMPLE_EVERY_N_TICKS === 0) {
      sampleLuma(videoEl, { minX, minY, maxX, maxY });
    }
  }

  /**
   * Folds one tick's scalar pose-detection result into the accumulators,
   * then — 12-06 — feeds the SAME reading into baseline calibration (while
   * the opening window is still open) or streaming drift (once it is
   * closed). Per-signal absolute sums are accumulated ONLY on visible ticks
   * (see `poseVisibleSamples`'s doc comment above), so a later mean is never
   * diluted by a null reading.
   */
  function applyPoseResult(result: PoseDetectResult) {
    poseSamples += 1;
    winPoseProcessed += 1;

    if (result.visible.shoulderLine) {
      poseVisibleSamples.shoulder_line += 1;
      if (result.shoulderTiltDeg !== null) {
        poseShoulderTiltSum += result.shoulderTiltDeg;
      }
    }
    if (result.visible.forwardHead) {
      poseVisibleSamples.forward_head += 1;
      if (result.forwardHeadOffset !== null) {
        poseForwardHeadOffsetSum += result.forwardHeadOffset;
      }
    }
    if (result.visible.torsoLean) {
      poseVisibleSamples.torso_lean += 1;
      if (result.torsoLeanDeg !== null) {
        poseTorsoLeanSum += result.torsoLeanDeg;
      }
    }
    if (result.visible.torsoOpenness) {
      poseVisibleSamples.torso_openness += 1;
      if (result.torsoOpennessRatio !== null) {
        poseTorsoOpennessSum += result.torsoOpennessRatio;
      }
    }

    // 12-06 posture baseline/drift. `PoseDetectResult`'s own discipline
    // (null exactly when not visible) carries straight through to
    // `PostureReading` with no further gating needed here.
    const tS = elapsedS();
    const reading: PostureReading = {
      tS,
      shoulderTiltDeg: result.shoulderTiltDeg,
      forwardHeadOffset: result.forwardHeadOffset,
      torsoLeanDeg: result.torsoLeanDeg,
      torsoOpennessRatio: result.torsoOpennessRatio,
    };

    if (postureBaseline === null) {
      const hasAnySignal = POSTURE_SIGNAL_TABLE.some(
        ({ read }) => read(reading) !== null
      );

      if (postureBaselineAnchorTS === null) {
        // BUG FIX (12-08 Task 1 checkpoint, Defect E): the window does not
        // open until the FIRST usable reading, never at capture start - see
        // `computePostureBaseline`'s own doc comment for why. Still waiting.
        if (hasAnySignal) {
          postureBaselineAnchorTS = tS;
          postureBaselineReadings.push(reading);
        }
        return;
      }

      if (tS - postureBaselineAnchorTS <= POSTURE_BASELINE_WINDOW_S) {
        postureBaselineReadings.push(reading);
        // No drift yet to compute against - the baseline itself isn't
        // established until the window closes, below.
        return;
      }

      const candidate = computePostureBaseline(
        postureBaselineReadings,
        postureBaselineAnchorTS
      );
      if (candidate.signals.length === 0) {
        // RETRY (12-08 Task 1 checkpoint, Defect E): a window that
        // calibrated NOTHING must not latch empty for the rest of the
        // session (the original bug - `postureBaseline` would be set to
        // this exact empty object and never recomputed). Re-open a fresh
        // window at the next usable reading instead of giving up for good.
        postureBaselineReadings = [];
        postureBaselineAnchorTS = null;
        return;
      }
      postureBaseline = candidate;
      // Falls through below to score THIS reading (the one whose tS closed
      // the window) against the baseline just established - it is a real
      // post-baseline reading, not part of the window itself.
    }

    const { driftMagnitude } = computePostureDrift(reading, postureBaseline);
    if (driftMagnitude === null) return;

    postureDriftSum += driftMagnitude;
    postureDriftSamples += 1;
    winPostureDriftSum += driftMagnitude;
    winPostureDriftSamples += 1;

    if (driftMagnitude > POSTURE_DRIFT_TRIP) {
      if (postureDriftStreakStartS === null) postureDriftStreakStartS = tS;
      const streakLenS = tS - postureDriftStreakStartS;
      if (streakLenS > postureDriftMaxS) postureDriftMaxS = streakLenS;
    } else {
      postureDriftStreakStartS = null;
    }
  }

  /**
   * Folds one tick's scalar hands-detection result into the 12-05
   * accumulators. Maintains TWO independent position histories over the same
   * wrist readings — `lastGestureWristPositions` (unfiltered displacement,
   * the gesture-amplitude raw material) and `lastFidgetWristPositions`
   * (displacement PLUS direction-reversal counting, the fidget raw
   * material) — deliberately kept as separate variables so neither can be
   * derived from the other (see the fidget accumulator's doc comment above).
   */
  function applyHandsResult(result: HandsDetectResult) {
    handSamples += 1;

    if (result.handCount > 0) {
      handsDetectedSamples += 1;
      winHandsDetected += 1;

      // `hand.nearFace` is null exactly when no face box was available this
      // tick (see `HandsDetectResult`'s own doc comment) — checking any
      // entry tells us whether THIS tick is eligible for the
      // `handsNearFacePct` denominator at all, independent of whether a hand
      // actually sat near the face.
      const faceAvailable = result.primary.some(
        (hand) => hand.nearFace !== null
      );
      if (faceAvailable) {
        handsNearFaceEligibleSamples += 1;
        const anyNearFace = result.primary.some(
          (hand) => hand.nearFace === true
        );
        if (anyNearFace) {
          handsNearFaceSamples += 1;
          winNearFaceCount += 1;
        }
      }
    }

    const anyAboveShoulder = result.primary.some(
      (hand) => hand.aboveShoulder === true
    );
    if (anyAboveShoulder) {
      handsAboveShoulderSamples += 1;
    }

    // BUG FIX (12-08 Task 1 checkpoint): the fidget displacement/direction-
    // change tracking that used to run alongside the gesture-amplitude loop
    // below was removed entirely when fidgeting was retired to permanently
    // not-measured — see `VisualDescriptiveObservations`'s own comment in
    // `types.ts`.
    result.primary.forEach((hand, index) => {
      const prevGesture = lastGestureWristPositions[index];
      if (prevGesture) {
        const dx = hand.wristX - prevGesture.x;
        const dy = hand.wristY - prevGesture.y;
        const delta = Math.hypot(dx, dy);
        // Only displacements clearing GESTURE_AMPLITUDE_MIN count as a
        // gesture event.
        if (delta >= GESTURE_AMPLITUDE_MIN) {
          gestureDisplacementSum += delta;
          gestureEventCount += 1;
          winGestureSum += delta;
          winGestureSamples += 1;
        }
      }
      lastGestureWristPositions[index] = { x: hand.wristX, y: hand.wristY };
    });
    // Trim stale slots so a hand that left frame does not leave a fossil
    // position behind to be compared against a future, unrelated hand.
    lastGestureWristPositions = lastGestureWristPositions.slice(
      0,
      result.primary.length
    );
  }

  /** Folds one tick's scalar phone-detection result into the 12-05
   * accumulators (plus 12-07's per-window processed tally, needed as the
   * `phone_visible` descriptive episode's own denominator). */
  function applyObjectResult(result: ObjectDetectResult) {
    phoneSamples += 1;
    winPhoneProcessed += 1;
    if (result.phonePresent) {
      phoneVisibleSamples += 1;
      winPhoneCount += 1;
    }
  }

  /** Constructs the worker and waits (bounded by `WORKER_INIT_TIMEOUT_MS`)
   * for its `ready`/`init-error` reply. Returns `false` on ANY failure -
   * construction throwing, an `init-error` reply, or a timeout - so `start()`
   * can fall back to the main-thread path uniformly. Never throws. */
  async function initWorker(): Promise<boolean> {
    let candidate: Worker;
    try {
      candidate = new Worker(
        new URL("./visual-capture.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (error) {
      console.info(
        "[visual-capture] worker construction failed, falling back to main thread",
        { reason: error instanceof Error ? error.message : String(error) }
      );
      return false;
    }

    const readyResult = await new Promise<
      { ok: true; delegate: "GPU" | "CPU" } | { ok: false; reason: string }
    >((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ ok: false, reason: "timeout" });
      }, WORKER_INIT_TIMEOUT_MS);

      candidate.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (msg?.type === "ready") {
          clearTimeout(timeoutId);
          resolve({ ok: true, delegate: msg.delegate === "CPU" ? "CPU" : "GPU" });
        } else if (msg?.type === "init-error") {
          clearTimeout(timeoutId);
          resolve({ ok: false, reason: String(msg.reason ?? "init-error") });
        }
      };
      candidate.onerror = (event: ErrorEvent) => {
        clearTimeout(timeoutId);
        resolve({ ok: false, reason: event.message || "worker error" });
      };
      candidate.postMessage({ type: "init", models: ALL_MODELS, delegate: "GPU" });
    });

    if (!readyResult.ok) {
      console.info(
        "[visual-capture] worker init failed, falling back to main thread",
        { reason: readyResult.reason }
      );
      try {
        candidate.terminate();
      } catch {
        // Best-effort.
      }
      return false;
    }

    worker = candidate;
    delegateInUse = readyResult.delegate;
    // Swap to the steady-state handler now that init has resolved - detect
    // replies and the eventual `closed` ack flow through this one handler.
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === "detect-result") {
        const model = msg.model as ModelId;
        const state = requestState[model];
        state.outstanding = false;
        const cost = performance.now() - state.startMs;
        // Overall ring buffer (fed by every model) backs the existing
        // session-wide meanTickMs/p95TickMs fields; the per-model sum/count
        // below backs the NEW per-model breakdown in the frame-budget log.
        recordTickCost(cost);
        recordModelTickCost(model, cost);
        if (model === "face") {
          consecutiveDetectErrors = 0;
          applyFaceResult(msg.result as FaceDetectResult, state.speakingNow);
        } else if (model === "pose") {
          applyPoseResult(msg.result as PoseDetectResult);
        } else if (model === "hands") {
          applyHandsResult(msg.result as HandsDetectResult);
        } else if (model === "object") {
          applyObjectResult(msg.result as ObjectDetectResult);
        }
      } else if (msg?.type === "detect-error") {
        const model = msg.model as ModelId;
        requestState[model].outstanding = false;
        // A technical hiccup on a brand-new 12-05 signal must not escalate
        // to `analyzerError`, which exists to gate FACE-based scorability
        // (REQ-42) - only the face model's own error streak can trip it.
        if (model === "face") {
          consecutiveDetectErrors += 1;
          if (consecutiveDetectErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
            analyzerError = true;
            stopInterval();
          }
        }
      } else if (msg?.type === "closed") {
        workerClosedResolve?.();
        workerClosedResolve = null;
      }
    };
    return true;
  }

  /** Posts one `detect` request for the given model, bounded by that
   * model's own one-outstanding-request back-pressure gate. Fire-and-forget
   * from `runTick`'s perspective - the reply is handled by the steady-state
   * `worker.onmessage` handler installed in `initWorker`. */
  function runWorkerTick(model: ModelId) {
    if (!worker || !videoEl) return;
    const state = requestState[model];
    if (state.outstanding) {
      // The previous detect for THIS model has not replied yet. A dropped
      // tick, never a queued one - queuing would turn a slow frame into
      // unbounded latency and stamp stale measurements onto a later window.
      droppedTicks += 1;
      modelDroppedTicks[model] += 1;
      return;
    }
    state.outstanding = true;
    state.speakingNow = isSpeaking;
    state.startMs = performance.now();
    const timestamp = state.startMs;
    const activeWorker = worker;
    const activeVideoEl = videoEl;

    void (async () => {
      const dispatchStartMs = performance.now();
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(activeVideoEl);
      } catch {
        state.outstanding = false;
        if (model === "face") {
          consecutiveDetectErrors += 1;
          if (consecutiveDetectErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
            analyzerError = true;
            stopInterval();
          }
        }
        return;
      }
      if (!worker || worker !== activeWorker) {
        // Torn down mid-flight (e.g. stop() raced this request).
        bitmap.close();
        state.outstanding = false;
        return;
      }
      activeWorker.postMessage(
        { type: "detect", bitmap, model, timestamp },
        [bitmap]
      );
      recordDispatchCost(performance.now() - dispatchStartMs);
    })();
  }

  /** The original Phase 10 synchronous detection path, kept verbatim as the
   * fallback for a session whose worker never came up. Builds the same
   * `FaceDetectResult` shape the worker would have returned and folds it
   * through the identical `applyFaceResult`, so a worker session and a
   * fallback session cannot silently diverge in what they measure. */
  function runMainThreadTick() {
    if (!videoEl || !landmarker) return;

    let detectResult: {
      faceLandmarks: Array<Array<{ x: number; y: number }>>;
      facialTransformationMatrixes: Array<{ data: number[] }>;
    };
    const detectStartMs = performance.now();
    try {
      detectResult = landmarker.detectForVideo(videoEl, performance.now());
    } catch {
      consecutiveDetectErrors += 1;
      if (consecutiveDetectErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
        analyzerError = true;
        stopInterval();
      }
      return;
    }
    recordTickCost(performance.now() - detectStartMs);
    consecutiveDetectErrors = 0;

    const speakingNow = isSpeaking;
    const faceCount = detectResult.faceLandmarks.length;
    if (faceCount === 0) {
      applyFaceResult(
        { faceCount: 0, primary: null, yawDeg: null, pitchDeg: null, poseAvailable: false },
        speakingNow
      );
      return;
    }

    // With `numFaces > 1` the detector's array order is NOT stable between
    // frames - see the worker's identical comment. Largest bounding-box area
    // is the stable stand-in for "whoever is at the machine".
    let primaryIndex = 0;
    let primaryBounds = boundsOf(detectResult.faceLandmarks[0]);
    for (let i = 1; i < faceCount; i++) {
      const candidate = boundsOf(detectResult.faceLandmarks[i]);
      if (candidate.area > primaryBounds.area) {
        primaryIndex = i;
        primaryBounds = candidate;
      }
    }
    const { minX, maxX, minY, maxY } = primaryBounds;
    const primary = {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };

    const matrix = detectResult.facialTransformationMatrixes[primaryIndex];
    let yawDeg: number | null = null;
    let pitchDeg: number | null = null;
    let poseAvailable = false;
    if (matrix?.data && matrix.data.length >= 16) {
      const m = matrix.data;
      yawDeg = (Math.atan2(-m[8], m[0]) * 180) / Math.PI;
      pitchDeg = (Math.asin(clamp(m[9], -1, 1)) * 180) / Math.PI;
      poseAvailable = true;
    }

    applyFaceResult({ faceCount, primary, yawDeg, pitchDeg, poseAvailable }, speakingNow);
  }

  async function initLandmarker(delegate: "GPU" | "CPU") {
    const { FaceLandmarker, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );
    const resolver = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceLandmarker.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath: "/mediapipe/face_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      // More than one, so "another person is in frame" is observable at all.
      // At `numFaces: 1` the detector returns only the most confident face,
      // which made a room full of people indistinguishable from an empty one.
      // The landmark model runs once per tracked face, so this is the main
      // per-tick cost increase in the engine — bounded deliberately at 3
      // because the question being answered is "more than one?", not "how
      // many?". See REQ-49: this pipeline must not compete with the live
      // avatar stream for the main thread.
      numFaces: MAX_TRACKED_FACES,
      outputFacialTransformationMatrixes: true,
    });
  }

  /**
   * One scheduler beat. Shared guards (dropped-tick detection, track
   * liveness, video-element readiness) run unconditionally before either
   * path is dispatched, exactly as they did pre-worker — none of this
   * plan's changes touch WHEN a tick is allowed to run, only HOW the actual
   * detect happens once it is.
   */
  function runTick() {
    if (!videoEl) return;
    tickCount += 1;

    // Dropped-tick detection (REQ-57 diagnostics): if the gap since the last
    // tick's entry is well beyond the expected interval, the event loop did
    // not get back to us on time. Measured unconditionally, ahead of every
    // early return below, so a track going dead or a decode stall is also
    // visible in the frame-budget report.
    const tickEntryMs = performance.now();
    if (
      lastTickEntryMs !== null &&
      tickEntryMs - lastTickEntryMs > DROPPED_TICK_GAP_MULTIPLIER * tickIntervalMs()
    ) {
      droppedTicks += 1;
    }
    lastTickEntryMs = tickEntryMs;

    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      // Track is dead - do NOT increment processedSamples and do NOT add to
      // trackLiveSeconds. This is a liveness signal, not a detection miss.
      return;
    }
    trackLiveSeconds += tickIntervalMs() / 1000;

    // The video element can be transiently unusable even while the track is
    // live: before the first frame decodes, while a backgrounded tab throttles
    // decoding, or during a stream renegotiation. `detectForVideo`
    // (main-thread path) THROWS on a zero-dimension or not-yet-decoded frame,
    // and `createImageBitmap` (worker path) would fail identically.
    //
    // This is NOT a detect error. Counting it as one would let three transient
    // startup ticks trip `analyzerError` and mark the whole session
    // INSUFFICIENT_DATA — excusing it from scoring entirely, which is the exact
    // misclassification REQ-42 exists to prevent. Skip the tick instead: no
    // processed sample, no error, no face-state change.
    if (
      videoEl.readyState < 2 ||
      videoEl.videoWidth === 0 ||
      videoEl.videoHeight === 0
    ) {
      return;
    }

    // Staggered round-robin scheduler (REQ-57): consult which model this
    // tick belongs to. `SCHEDULE` holds THREE tenants as of this checkpoint's
    // fix — face at 3 Hz, pose/hands at 1.5 Hz each; object runs on its own
    // separate, slower `OBJECT_TICK_INTERVAL_MS` timer (see `runObjectTick`
    // and `SCHEDULE`'s own doc comment for why it was pulled out).
    const modelForTick = SCHEDULE[tickCount % SCHEDULE.length];

    if (usingWorker) {
      runWorkerTick(modelForTick);
      return;
    }

    // No main-thread fallback exists for pose/hands/object — they are
    // worker-only signals introduced by 12-05. A worker that failed to
    // start degrades this session to the original Phase 10 face-only path;
    // the other three signals simply are not collected this session, never
    // `analyzer_error` (REQ-42: a technical fallback is not a measurement
    // failure).
    if (modelForTick === "face") {
      runMainThreadTick();
    }
  }

  /**
   * Object (phone) detection's own slow, independent beat — see
   * `OBJECT_TICK_INTERVAL_MS`'s doc comment for why this is a separate timer
   * rather than a `SCHEDULE` slot. Deliberately does NOT touch
   * `trackLiveSeconds`, `droppedTicks`' gap-detection, or `tickCount` — those
   * belong to the main `SCHEDULE` beat and must not be double-counted by a
   * second timer running at a different rate. No main-thread fallback exists
   * for object (12-05 introduced it worker-only), so a non-worker session
   * simply never calls `runWorkerTick` here.
   */
  function runObjectTick() {
    if (!videoEl || !usingWorker) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;
    if (
      videoEl.readyState < 2 ||
      videoEl.videoWidth === 0 ||
      videoEl.videoHeight === 0
    ) {
      return;
    }
    runWorkerTick("object");
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (objectIntervalId !== null) {
      clearInterval(objectIntervalId);
      objectIntervalId = null;
    }
  }

  async function start(): Promise<void> {
    if (started || stopped) return;
    started = true;
    startedAtMs = sessionStartMs();
    // Distance between the session clock (which transcript turns are stamped
    // against) and this engine's clock. Captured once, here, rather than
    // re-derived later — see `VisualCoverage.capture_offset_s`.
    captureOffsetS =
      typeof sessionStartedAtMs === "number"
        ? Math.max(0, (Date.now() - sessionStartedAtMs) / 1000)
        : 0;

    videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    videoEl.srcObject = stream;

    await new Promise<void>((resolve) => {
      if (!videoEl) return resolve();
      const onLoaded = () => {
        videoEl?.removeEventListener("loadeddata", onLoaded);
        resolve();
      };
      videoEl.addEventListener("loadeddata", onLoaded);
      // In case the element already has data (fast camera warm-up).
      if (videoEl.readyState >= 2) {
        videoEl.removeEventListener("loadeddata", onLoaded);
        resolve();
      }
    });
    try {
      await videoEl.play();
    } catch {
      // Autoplay rejection is not fatal - detectForVideo can still run
      // against a paused-but-loaded element on most browsers; if the track
      // is genuinely dead the per-tick readyState check below will catch it.
    }

    // Prefer the worker (REQ-57). `initWorker` never throws - any failure
    // (construction, init-error, or a 2s timeout with no reply) resolves
    // `false` and this session degrades to the original main-thread path,
    // never to `analyzer_error` (REQ-42's discipline: a technical fallback
    // must never read as the student's poor performance).
    usingWorker = await initWorker();

    if (!usingWorker) {
      try {
        landmarker = (await initLandmarker("GPU")) as typeof landmarker;
        delegateInUse = "GPU";
      } catch (gpuError) {
        // Record WHY we fell back. CPU inference competes with the live WebRTC
        // avatar stream for the main thread, which is the contention REQ-49
        // guards against — so a silent downgrade is exactly the kind of thing
        // that shows up later as an unexplained stutter. console.info, not
        // console.error: this is diagnostics, not a failure, and Next's dev
        // overlay escalates console.error into a visible "Console Error".
        console.info("[visual-capture] GPU delegate unavailable, using CPU", {
          reason: gpuError instanceof Error ? gpuError.message : String(gpuError),
        });
        try {
          landmarker = (await initLandmarker("CPU")) as typeof landmarker;
          delegateInUse = "CPU";
        } catch {
          analyzerError = true;
          // A failed engine must never look like a student facing away - that
          // would misattribute a technical failure as poor performance
          // (REQ-42). Report "detected" so no banner is left stuck on screen.
          onFaceStateChange?.(true);
          return;
        }
      }
    }

    // One line, once per session, so a walkthrough can confirm at a glance
    // which delegate AND which thread is actually doing the work.
    console.info("[visual-capture] engine started", {
      delegate: delegateInUse,
      thread: usingWorker ? "worker" : "main",
      tickIntervalMs: tickIntervalMs(),
    });

    intervalId = setInterval(runTick, tickIntervalMs());
    objectIntervalId = setInterval(runObjectTick, OBJECT_TICK_INTERVAL_MS);
  }

  function setSpeaking(speaking: boolean): void {
    isSpeaking = speaking;
  }

  /** Closes the landmarker, bounded by `timeoutMs`. Today this has nothing
   * async to await inside - `landmarker.close()` is synchronous - but the
   * seam is introduced deliberately now so plan 12-03's Web Worker migration
   * (where closing becomes a message round-trip) can drop its await in here
   * without touching any call site a second time. Never throws. */
  async function closeEngine(timeoutMs: number): Promise<void> {
    await Promise.race([
      (async () => {
        try {
          landmarker?.close();
        } catch {
          // Best-effort teardown.
        }
        landmarker = null;
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async function stop(
    timeoutMs: number = DEFAULT_STOP_TIMEOUT_MS
  ): Promise<VisualMetrics | null> {
    if (!started) return null;
    if (stopped) return null;
    stopped = true;

    // These two teardown steps stay synchronous and happen before any await,
    // so no tick can run concurrently with the metric assembly below.
    stopInterval();

    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.remove();
      videoEl = null;
    }
    lumaCanvas = null;
    lumaCtx = null;

    await closeEngine(timeoutMs);

    const sessionSeconds = (sessionStartMs() - startedAtMs) / 1000;
    // DEFECT 1 FIX (12-05 live checkpoint, re-run 1): `processedSamples`
    // increments ONLY inside `applyFaceResult` — it has only ever counted
    // FACE ticks, on both the pre-12-05 single-tenant schedule and today's
    // four-tenant one. Before this fix, `expectedSamples` assumed EVERY
    // tick belonged to that same count (`trackLiveSeconds * METRICS_SAMPLE_HZ`),
    // which was correct when face owned 100% of the schedule and silently
    // wrong the moment it did not: with face holding `FACE_SCHEDULE_SHARE`
    // of `SCHEDULE`, the processed/expected ratio was structurally pinned at
    // ~`FACE_SCHEDULE_SHARE` before a single frame was ever dropped, tripped
    // `coverage.ts`'s `PROCESSED_RATIO_FLOOR` (0.5) on every real camera-on
    // session, and reported the whole Visual block as `INSUFFICIENT_DATA`.
    // The fix is schedule-aware accounting, not the floor — `coverage.ts`'s
    // starvation guard is real (REQ-42) and must keep catching a genuinely
    // wedged worker; it simply needs to be told what a healthy denominator
    // looks like for face's OWN share of the tick stream. `FACE_SCHEDULE_SHARE`
    // is derived from `SCHEDULE` itself (see that constant's definition), so
    // a future change to the schedule cannot silently re-break this again.
    const expectedSamples = Math.floor(
      trackLiveSeconds * METRICS_SAMPLE_HZ * FACE_SCHEDULE_SHARE
    );

    if (
      poseUnavailableSamples > 0 &&
      faceDetectedSamples > 0 &&
      poseUnavailableSamples / faceDetectedSamples > POSE_UNAVAILABLE_RATIO_THRESHOLD
    ) {
      analyzerError = true;
    }

    // All four ratios come from one pure function so the runtime path and the
    // verification script cannot drift apart. See `computeVisualRates` for why
    // every denominator is `processedSamples`.
    const rates = computeVisualRates({
      processedSamples,
      faceDetectedSamples,
      centeredSamples,
      multipleFacesSamples,
      forwardFacingSamples,
      listeningSamples,
      listeningForwardSamples,
    });

    // Fold the partial final window in before extracting, so an excursion
    // that was still running when the student hit End is not dropped.
    closeWindow(sessionSeconds);
    const episodes = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
    const lightingOk =
      lumaSamples > 0 &&
      lumaSum / lumaSamples >= LUMA_MIN_OK &&
      lumaSum / lumaSamples <= LUMA_MAX_OK;

    const postureFlags: VisualPostureFlag[] = [];
    if (
      outOfFrameSamples / Math.max(1, faceDetectedSamples) >
      OUT_OF_FRAME_RATIO_THRESHOLD
    ) {
      postureFlags.push("face_partially_out_of_frame");
    }
    if (
      movementSum / Math.max(1, movementSamples) >
      HIGH_MOVEMENT_THRESHOLD
    ) {
      postureFlags.push("high_head_movement");
    }
    if (rates.multipleFacesRatio > MULTIPLE_FACES_RATIO_THRESHOLD) {
      postureFlags.push("multiple_faces_detected");
    }

    // Frame-budget report (REQ-57 diagnostics only). Fields are never part
    // of `VisualMetrics` and never persisted - `models` reflects however
    // many tenants `ALL_MODELS` actually holds; everything else here is
    // measured straight off this session's own ring buffers. Runs once per
    // session, so sorting a copy for p95 is cheap.
    // DEFECT 2 FIX: both figures below are now computed over the FULL,
    // unbounded session array (see `tickCostSamplesMs`'s doc comment) —
    // the same shape as `modelTickCostSum`/`modelTickCostCount` just below,
    // so the overall and per-model breakdowns can never silently disagree
    // because they sampled two different windows of the same session.
    const tickCostSamplesSorted = [...tickCostSamplesMs].sort((a, b) => a - b);
    const meanTickMs =
      tickCostSamplesSorted.length > 0
        ? tickCostSamplesSorted.reduce((sum, ms) => sum + ms, 0) /
          tickCostSamplesSorted.length
        : 0;
    const p95Index = Math.max(
      0,
      Math.min(
        tickCostSamplesSorted.length - 1,
        Math.ceil(tickCostSamplesSorted.length * 0.95) - 1
      )
    );
    const p95TickMs =
      tickCostSamplesSorted.length > 0 ? tickCostSamplesSorted[p95Index] : 0;
    // Main-thread dispatch stats (worker path only). Same unbounded-array
    // treatment as the tick-cost figures above.
    const dispatchSorted = [...dispatchSamplesMs].sort((a, b) => a - b);
    const dispatchMeanMs =
      dispatchSorted.length > 0
        ? dispatchSorted.reduce((sum, ms) => sum + ms, 0) / dispatchSorted.length
        : 0;
    const dispatchP95Index = Math.max(
      0,
      Math.min(dispatchSorted.length - 1, Math.ceil(dispatchSorted.length * 0.95) - 1)
    );
    const dispatchP95Ms =
      dispatchSorted.length > 0 ? dispatchSorted[dispatchP95Index] : 0;

    // Per-model mean tick cost and dropped-tick count (12-05) - so the
    // checkpoint can see WHICH model is expensive, not only the session
    // total. `face` only ever reflects main-thread-blocking cost when
    // `!usingWorker` (pose/hands/object stay at 0/0 on that path, since they
    // never ran this session at all).
    const modelTickCostMeanMs: Record<ModelId, number> = {
      face: 0,
      pose: 0,
      hands: 0,
      object: 0,
    };
    for (const model of ALL_MODELS) {
      modelTickCostMeanMs[model] =
        modelTickCostCount[model] > 0
          ? Math.round((modelTickCostSum[model] / modelTickCostCount[model]) * 10) / 10
          : 0;
    }

    console.info("[visual-capture] frame budget", {
      delegate: delegateInUse,
      thread: usingWorker ? "worker" : "main",
      // Disambiguates `meanTickMs`/`p95TickMs`, which measure different
      // quantities on the two paths. Without this a healthy-looking number
      // read off the wrong path would approve a worker that never ran.
      tickCostKind: usingWorker ? "worker-roundtrip" : "main-thread-blocking",
      models: ALL_MODELS.length,
      meanTickMs: Math.round(meanTickMs * 10) / 10,
      p95TickMs: Math.round(p95TickMs * 10) / 10,
      // Worker path only: the share of the above that is actually on this
      // thread, and so the figure REQ-57 turns on.
      dispatchMeanMs: usingWorker ? Math.round(dispatchMeanMs * 10) / 10 : null,
      dispatchP95Ms: usingWorker ? Math.round(dispatchP95Ms * 10) / 10 : null,
      tickIntervalMs: tickIntervalMs(),
      droppedTicks,
      // 12-05: per-model breakdown of the above two figures.
      modelTickCostMeanMs,
      modelDroppedTicks: { ...modelDroppedTicks },
      processedSamples,
      expectedSamples,
    });

    // 12-06: gesture/hands derivation — one pure function so the runtime
    // path and the verification script cannot drift apart, same discipline
    // as `computeVisualRates` above. `handsUsable` gates whether ANY of the
    // four fields below are emitted at all: `handSamples` only increments
    // inside `applyHandsResult`, which only ever runs on the worker path
    // (hands has no main-thread fallback — 12-05), so `handSamples === 0`
    // means the hands pipeline never ran this session, not merely that no
    // hand was ever seen.
    const handsUsable = handSamples > 0;
    const gestureRates = computeGestureRates({
      handSamples,
      gestureDisplacementSum,
      gestureEventCount,
      handsAboveShoulderSamples,
      handsNearFaceSamples,
      handsNearFaceEligibleSamples,
      sessionSeconds,
    });

    // 12-06: posture-signal usability — which landmark groups cleared the
    // visibility floor OFTEN ENOUGH, across the WHOLE session, to be worth
    // reporting at all. Deliberately a session-wide count
    // (`poseVisibleSamples`), not the baseline-window-only count inside
    // `postureBaseline.signals` — a signal can fail to calibrate in the
    // opening 20s (POSTURE_BASELINE_WINDOW_S) yet still be reportable in the
    // "Measured from" row if the student came into frame shortly after.
    const postureSignalsMeasured = VISUAL_POSTURE_SIGNALS.filter(
      (signal) => poseVisibleSamples[signal] >= POSTURE_BASELINE_MIN_SAMPLES
    );

    // 12-07: measured-but-NEVER-SCORED observations — a phone in frame,
    // and the absolute (never baseline-relative) posture reading.
    // Assembled entirely separately from every field above: NO field in
    // `observations` below may be derived from, or feed back into, any
    // scored field in this return object, and nothing above this point reads
    // `observations` either. See `VisualDescriptiveObservations`'s header
    // comment in `types.ts` for why that separation is enforced at the type
    // level, not just by this comment.
    //
    // BUG FIX (12-08 Task 1 checkpoint): `fidgetUsable`/the direction-change
    // rate gate/`fidgetSamples` were removed entirely when fidgeting was
    // retired to permanently not-measured (see `VISUAL_NOT_MEASURED`'s own
    // comment in `types.ts`) — it is no longer a per-session usability
    // question, so there is nothing to compute here.
    //
    // Object (phone) detection has no main-thread fallback (12-05) either —
    // `phoneSamples === 0` means the worker never ran this model this
    // session (never that a phone was genuinely absent the whole time), and
    // must declare `phone_checking` unmeasured rather than report a clean 0.
    const phoneUsable = phoneSamples > 0;

    // The object runner's EFFECTIVE rate this session — see
    // `ObservationCounts.phoneSampleHz`'s own doc comment for why this must
    // be the ACHIEVED rate, not the nominal `OBJECT_TICK_INTERVAL_MS`.
    const phoneSampleHz = sessionSeconds > 0 ? phoneSamples / sessionSeconds : 0;

    const absoluteShoulderTiltDegMean =
      poseVisibleSamples.shoulder_line > 0
        ? poseShoulderTiltSum / poseVisibleSamples.shoulder_line
        : null;
    const absoluteForwardHeadOffsetMean =
      poseVisibleSamples.forward_head > 0
        ? poseForwardHeadOffsetSum / poseVisibleSamples.forward_head
        : null;

    // Omit the whole `observations` key when NOTHING descriptive was
    // measurable this session — an object with every field at a flattering
    // default would read as "we looked and found nothing," exactly the
    // failure `VISUAL_NOT_MEASURED`'s own header comment warns about.
    let observations: VisualDescriptiveObservations | undefined;
    if (
      phoneUsable ||
      absoluteShoulderTiltDegMean !== null ||
      absoluteForwardHeadOffsetMean !== null
    ) {
      const derivedObservations = computeObservations({
        phoneSamples,
        phoneVisibleSamples,
        phoneSampleHz,
        absoluteShoulderTiltDegMean,
        absoluteForwardHeadOffsetMean,
      });
      observations = {
        phone_visible_seconds: derivedObservations.phoneVisibleSeconds,
        posture_shoulder_tilt_deg: derivedObservations.postureShoulderTiltDeg,
        posture_forward_head_offset:
          derivedObservations.postureForwardHeadOffset,
        episodes: extractDescriptiveEpisodes(
          windows,
          VISUAL_DESCRIPTIVE_EPISODE_KINDS
        ),
      };
    }


    return {
      eye_contact_pct: rates.eyeContactPct,
      attentiveness_pct: rates.attentivenessPct,
      camera_centered_pct: rates.cameraCenteredPct,
      face_presence_pct: rates.facePresencePct,
      lighting_ok: lightingOk,
      posture_flags: postureFlags,
      // Emitted unconditionally, not as an afterthought: the evaluator needs
      // to be TOLD what was never looked at. An empty `posture_flags` alone
      // reads as "we checked and it was clean", which is exactly how a session
      // with several people gesturing obscenely earned a commendation for
      // having no distracting behaviours.
      //
      // 12-07: both remaining booleans are real per-session usability, not
      // a standing placeholder. A session is allowed to declare either of
      // hand_gestures/body_posture unmeasured even though this pipeline
      // generally supports measuring both — that is the honest outcome when
      // a signal was never genuinely usable this particular session (body
      // never in frame), not a standing claim that the capability does not
      // exist. `fidgeting` is NOT decided here (12-08 Task 1 checkpoint) —
      // it is unconditional inside `resolveNotMeasured` itself, a standing
      // statement that this pipeline cannot resolve it at all, see
      // `VISUAL_NOT_MEASURED`'s own comment in `types.ts`.
      not_measured: resolveNotMeasured({
        handSignals: handsUsable,
        postureSignals: postureSignalsMeasured.length > 0,
        phone: phoneUsable,
      }),
      episodes,
      coverage: {
        session_seconds: sessionSeconds,
        track_live_seconds: trackLiveSeconds,
        expected_samples: expectedSamples,
        processed_samples: processedSamples,
        face_detected_samples: faceDetectedSamples,
        speaking_samples: speakingSamples,
        listening_samples: listeningSamples,
        capture_offset_s: captureOffsetS,
        sample_hz: METRICS_SAMPLE_HZ,
        analyzer_error: analyzerError,
      },
      ...(handsUsable
        ? {
            gesture_rate_per_min: gestureRates.gestureRatePerMin,
            gesture_amplitude_mean: gestureRates.gestureAmplitudeMean,
            hands_above_shoulder_pct: gestureRates.handsAboveShoulderPct,
            hands_near_face_pct: gestureRates.handsNearFacePct,
          }
        : {}),
      // Always present, including the empty-array case — REQ-51's "every
      // posture comment states which signals were available."
      posture_signals_measured: postureSignalsMeasured,
      // Omitted entirely (rather than emitted as 0) when no signal ever
      // calibrated against a baseline — a never-visible body must not read
      // as a flattering zero drift.
      ...(postureDriftSamples > 0
        ? {
            posture_drift_mean:
              Math.round((postureDriftSum / postureDriftSamples) * 1000) /
              1000,
            posture_drift_max_s: Math.round(postureDriftMaxS * 10) / 10,
          }
        : {}),
      // 12-07: measured-but-never-scored observations, omitted entirely
      // (never emitted half-populated) when nothing descriptive was
      // measurable at all this session — see the assembly above.
      ...(observations ? { observations } : {}),
    };
  }

  return { start, setSpeaking, stop };
}
