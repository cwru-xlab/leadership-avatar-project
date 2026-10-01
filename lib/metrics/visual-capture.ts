/**
 * Phase 10 in-browser visual capture engine.
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
 */

import {
  METRICS_SAMPLE_HZ,
  VISUAL_EPISODE_KINDS,
  VISUAL_NOT_MEASURED,
  type VisualEpisode,
  type VisualEpisodeKind,
  type VisualMetrics,
  type VisualPostureFlag,
} from "@/lib/metrics/types";

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

/** Fixed-capacity ring buffer size for per-tick inference cost samples.
 * 100s of ticks at the 6 Hz `METRICS_SAMPLE_HZ` cadence — diagnostics only,
 * never grows, never included in `VisualMetrics` (REQ-58). */
const TICK_COST_SAMPLES = 600;

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

/** One closed sampling window's totals. Scalars only — no landmarks, no
 * frames; nothing here outlives the tick that produced it in any richer form
 * than these counts. */
export interface CaptureWindow {
  startS: number;
  endS: number;
  processed: number;
  detected: number;
  forward: number;
  centered: number;
  multiFace: number;
  movementMean: number;
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
    // The four body-language kinds below were added to the episode vocabulary
    // by plan 12-02 (the type contract) but their producers do not exist yet:
    // `CaptureWindow` carries no gesture, hands-near-face or posture-drift
    // counts until plan 12-05 accumulates them, and the thresholds that decide
    // these cases are implemented in plan 12-06.
    //
    // They return false rather than being omitted so this switch stays
    // exhaustive over `VisualEpisodeKind`. Omitting them makes the function
    // implicitly return `undefined`, which TypeScript rejects outright — and a
    // `default: return false` would have silently swallowed every future kind
    // added to the vocabulary, which is exactly the failure this file's closed
    // vocabulary exists to prevent. Returning false here is honest: no window
    // can currently trip these conditions, so no episode of these kinds is
    // emitted, so nothing is reported that was not measured.
    case "excessive_gesturing":
    case "minimal_gesturing":
    case "hands_near_face":
    case "posture_drift":
      return false;
  }
}

/**
 * Collapses a session's windows into timestamped excursions. Pure and
 * exported for direct testing.
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
export function extractEpisodes(
  windows: CaptureWindow[],
  kinds: readonly VisualEpisodeKind[]
): VisualEpisode[] {
  const episodes: VisualEpisode[] = [];

  for (const kind of kinds) {
    const tripped = windows.map((w) => windowTrips(w, kind));
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
  let lumaCanvas: HTMLCanvasElement | null = null;
  let lumaCtx: CanvasRenderingContext2D | null = null;

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
  let captureOffsetS = 0;
  let poseUnavailableSamples = 0;
  let centeredSamples = 0;
  let outOfFrameSamples = 0;
  let movementSum = 0;
  let movementSamples = 0;
  let lastCenter: { x: number; y: number } | null = null;
  let lumaSum = 0;
  let lumaSamples = 0;

  // Per-tick inference cost instrumentation (REQ-57 diagnostics only — never
  // included in `VisualMetrics`, never leaves the browser as a metric field).
  // Fixed-capacity ring buffer: overwrite oldest, never grow.
  const tickCostMsRing: number[] = [];
  let tickCostRingIndex = 0;
  let tickCostSamplesSeen = 0;
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
    });
    windowStartS = nowS;
    winProcessed = 0;
    winDetected = 0;
    winForward = 0;
    winCentered = 0;
    winMultiFace = 0;
    winMovementSum = 0;
    winMovementSamples = 0;
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

  function runTick() {
    if (!videoEl || !landmarker) return;
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
    // decoding, or during a stream renegotiation. `detectForVideo` THROWS on a
    // zero-dimension or not-yet-decoded frame.
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

    let result: {
      faceLandmarks: Array<Array<{ x: number; y: number }>>;
      facialTransformationMatrixes: Array<{ data: number[] }>;
    };
    const detectStartMs = performance.now();
    try {
      result = landmarker.detectForVideo(videoEl, performance.now());
    } catch {
      consecutiveDetectErrors += 1;
      if (consecutiveDetectErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
        analyzerError = true;
        stopInterval();
      }
      return;
    }
    // Per-tick inference cost (REQ-57 diagnostics): fixed-capacity ring
    // buffer, overwrite oldest, never grow.
    const detectCostMs = performance.now() - detectStartMs;
    tickCostMsRing[tickCostRingIndex] = detectCostMs;
    tickCostRingIndex = (tickCostRingIndex + 1) % TICK_COST_SAMPLES;
    tickCostSamplesSeen += 1;
    consecutiveDetectErrors = 0;
    processedSamples += 1;
    winProcessed += 1;

    // Window boundary. Checked AFTER the sample is counted so a window always
    // contains the samples its time range covers.
    const nowS = elapsedS();
    if (nowS - windowStartS >= EPISODE_WINDOW_SECONDS) {
      closeWindow(nowS);
    }

    // Route into the conversational bucket. Done for every processed sample,
    // detected or not: being off camera while you are the one speaking is
    // itself a gaze failure, so the denominator must include it.
    const speakingNow = isSpeaking;
    if (speakingNow) {
      speakingSamples += 1;
    } else {
      listeningSamples += 1;
    }

    const faceCount = result.faceLandmarks.length;
    const hasFace = faceCount > 0;
    reportFaceState(hasFace);

    if (!hasFace) {
      lastCenter = null;
      if (tickCount % LUMA_SAMPLE_EVERY_N_TICKS === 0) {
        sampleLuma(videoEl, null);
      }
      return;
    }

    faceDetectedSamples += 1;
    winDetected += 1;
    if (faceCount > 1) {
      multipleFacesSamples += 1;
      winMultiFace += 1;
    }

    // With `numFaces > 1` the detector's array order is NOT stable between
    // frames: index 0 is whichever face the tracker emitted first this tick,
    // not "the student". Every measurement below — gaze, framing, movement,
    // lighting — must therefore agree on ONE face, chosen by a property that
    // stays stable frame to frame. Largest bounding-box area is that
    // property: whoever is sitting at the machine is nearer the camera than
    // anyone behind them. Picking per-metric, or trusting index 0, would
    // silently interleave two people's measurements inside one student's
    // score, and would do it without ever looking wrong.
    let primaryIndex = 0;
    let primaryBounds = boundsOf(result.faceLandmarks[0]);
    for (let i = 1; i < faceCount; i++) {
      const candidate = boundsOf(result.faceLandmarks[i]);
      if (candidate.area > primaryBounds.area) {
        primaryIndex = i;
        primaryBounds = candidate;
      }
    }

    // Forward-gaze proxy from the facial transformation matrix (column-major
    // 4x4, flattened). See CONTEXT.md: this is a HEAD-POSE PROXY for eye
    // contact, not pupil tracking. Indexed by `primaryIndex` so it describes
    // the same face the framing numbers below describe.
    const matrix = result.facialTransformationMatrixes[primaryIndex];
    if (matrix?.data && matrix.data.length >= 16) {
      const m = matrix.data;
      const yawRad = Math.atan2(-m[8], m[0]);
      const pitchRad = Math.asin(clamp(m[9], -1, 1));
      const yawDeg = (yawRad * 180) / Math.PI;
      const pitchDeg = (pitchRad * 180) / Math.PI;
      if (
        Math.abs(yawDeg) <= FORWARD_YAW_LIMIT_DEG &&
        Math.abs(pitchDeg) <= FORWARD_PITCH_LIMIT_DEG
      ) {
        forwardFacingSamples += 1;
        winForward += 1;
        // Only the listening half is split out: `eye_contact_pct` is a
        // whole-session figure, so the speaking half needs no counter of its
        // own. `speakingSamples` is still tracked, as the audit trail for how
        // the session divided.
        if (!speakingNow) {
          listeningForwardSamples += 1;
        }
      }
    } else {
      poseUnavailableSamples += 1;
    }

    // Framing from the primary face's landmark bounding box.
    const { minX, maxX, minY, maxY } = primaryBounds;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
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

    if (tickCount % LUMA_SAMPLE_EVERY_N_TICKS === 0) {
      sampleLuma(videoEl, { minX, minY, maxX, maxY });
    }
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
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

    // One line, once per session, so a walkthrough can confirm at a glance
    // which delegate is actually doing the work.
    console.info("[visual-capture] engine started", {
      delegate: delegateInUse,
      tickIntervalMs: tickIntervalMs(),
    });

    intervalId = setInterval(runTick, tickIntervalMs());
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
    const expectedSamples = Math.floor(trackLiveSeconds * METRICS_SAMPLE_HZ);

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
    // of `VisualMetrics` and never persisted - `models` is a literal that
    // later plans increment as more MediaPipe runners are added to the tick
    // loop; everything else here is measured straight off this session's own
    // ring buffer. Runs once per session, so sorting a copy for p95 is cheap.
    const filledTickCostSamples = Math.min(
      tickCostSamplesSeen,
      TICK_COST_SAMPLES
    );
    const tickCostSamplesSorted = tickCostMsRing
      .slice(0, filledTickCostSamples)
      .sort((a, b) => a - b);
    const meanTickMs =
      filledTickCostSamples > 0
        ? tickCostSamplesSorted.reduce((sum, ms) => sum + ms, 0) /
          filledTickCostSamples
        : 0;
    const p95Index = Math.max(
      0,
      Math.min(
        filledTickCostSamples - 1,
        Math.ceil(filledTickCostSamples * 0.95) - 1
      )
    );
    const p95TickMs =
      filledTickCostSamples > 0 ? tickCostSamplesSorted[p95Index] : 0;
    console.info("[visual-capture] frame budget", {
      delegate: delegateInUse,
      models: 1,
      meanTickMs: Math.round(meanTickMs * 10) / 10,
      p95TickMs: Math.round(p95TickMs * 10) / 10,
      droppedTicks,
      processedSamples,
      expectedSamples,
    });

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
      not_measured: [...VISUAL_NOT_MEASURED],
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
    };
  }

  return { start, setSpeaking, stop };
}
