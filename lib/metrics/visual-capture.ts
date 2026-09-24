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
  /** Invoked ONLY on a transition (detected <-> undetected), and only after
   * the new state has persisted for 3 consecutive samples (~0.5s at 6 Hz),
   * so a single blink or momentary miss never flickers the banner. */
  onFaceStateChange?: (faceDetected: boolean) => void;
}

export interface VisualCaptureHandle {
  start(): Promise<void>;
  /** Tears down the engine and returns the final scalar metrics. Returns
   * `null` only if `start()` was never called. Does NOT stop the
   * MediaStream's tracks - the caller owns the stream (the self-view
   * thumbnail may still be attached to it). */
  stop(): VisualMetrics | null;
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
const FACE_STATE_TRANSITION_STREAK = 3;
const MAX_CONSECUTIVE_DETECT_ERRORS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const { stream, onFaceStateChange } = options;

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
  let forwardFacingSamples = 0;
  let poseUnavailableSamples = 0;
  let centeredSamples = 0;
  let outOfFrameSamples = 0;
  let movementSum = 0;
  let movementSamples = 0;
  let lastCenter: { x: number; y: number } | null = null;
  let lumaSum = 0;
  let lumaSamples = 0;

  // Face-state debounce for the banner callback.
  let reportedFaceDetected = true; // assume detected until proven otherwise
  let candidateFaceDetected = true;
  let candidateStreak = 0;

  function tickIntervalMs(): number {
    return 1000 / METRICS_SAMPLE_HZ;
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
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });
  }

  function runTick() {
    if (!videoEl || !landmarker) return;
    tickCount += 1;

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
    consecutiveDetectErrors = 0;
    processedSamples += 1;

    const hasFace = result.faceLandmarks.length > 0;
    reportFaceState(hasFace);

    if (!hasFace) {
      lastCenter = null;
      if (tickCount % LUMA_SAMPLE_EVERY_N_TICKS === 0) {
        sampleLuma(videoEl, null);
      }
      return;
    }

    faceDetectedSamples += 1;

    // Forward-gaze proxy from the facial transformation matrix (column-major
    // 4x4, flattened). See CONTEXT.md: this is a HEAD-POSE PROXY for eye
    // contact, not pupil tracking.
    const matrix = result.facialTransformationMatrixes[0];
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
      }
    } else {
      poseUnavailableSamples += 1;
    }

    // Framing from the face landmark bounding box.
    const landmarks = result.faceLandmarks[0];
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

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    if (
      centerX >= CENTER_X_MIN &&
      centerX <= CENTER_X_MAX &&
      centerY >= CENTER_Y_MIN &&
      centerY <= CENTER_Y_MAX
    ) {
      centeredSamples += 1;
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
      movementSum += Math.sqrt(dx * dx + dy * dy);
      movementSamples += 1;
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

  function stop(): VisualMetrics | null {
    if (!started) return null;
    if (stopped) return null;
    stopped = true;

    stopInterval();

    try {
      landmarker?.close();
    } catch {
      // Best-effort teardown.
    }
    landmarker = null;

    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.remove();
      videoEl = null;
    }
    lumaCanvas = null;
    lumaCtx = null;

    const sessionSeconds = (sessionStartMs() - startedAtMs) / 1000;
    const expectedSamples = Math.floor(trackLiveSeconds * METRICS_SAMPLE_HZ);

    if (
      poseUnavailableSamples > 0 &&
      faceDetectedSamples > 0 &&
      poseUnavailableSamples / faceDetectedSamples > POSE_UNAVAILABLE_RATIO_THRESHOLD
    ) {
      analyzerError = true;
    }

    const eyeContactPct = Math.round(
      (forwardFacingSamples / Math.max(1, processedSamples)) * 100
    );
    const cameraCenteredPct = Math.round(
      (centeredSamples / Math.max(1, faceDetectedSamples)) * 100
    );
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

    return {
      eye_contact_pct: eyeContactPct,
      camera_centered_pct: cameraCenteredPct,
      lighting_ok: lightingOk,
      posture_flags: postureFlags,
      coverage: {
        session_seconds: sessionSeconds,
        track_live_seconds: trackLiveSeconds,
        expected_samples: expectedSamples,
        processed_samples: processedSamples,
        face_detected_samples: faceDetectedSamples,
        sample_hz: METRICS_SAMPLE_HZ,
        analyzer_error: analyzerError,
      },
    };
  }

  return { start, stop };
}
