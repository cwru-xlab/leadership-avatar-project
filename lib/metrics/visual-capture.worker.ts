/**
 * Phase 12 plan 12-03: worker-side model host for the visual capture engine.
 *
 * REQ-58: no frame, ImageBitmap, or landmark array ever crosses back from
 * this worker. The ImageBitmap received on a `detect` message is closed on
 * that SAME message, before any reply is posted; no landmark array is ever
 * retained past the `detectForVideo` call that produced it. The only things
 * ever posted back to the main thread are: a `ready`/`init-error` status, a
 * flat object of numbers/booleans for a `detect` reply (a bounding box's four
 * corners + center, raw yaw/pitch degrees, a face count, a pose-availability
 * flag), or a bare `closed` acknowledgement.
 *
 * Primary-face selection (largest bounding box among up to `MAX_TRACKED_FACES`
 * tracked faces) and the head-pose matrix decode both live HERE rather than on
 * the main thread, specifically so the landmark arrays and transformation
 * matrices backing them never have to leave this worker at all. The raw
 * yaw/pitch degrees ARE returned (not a boolean verdict) because the
 * forward-facing threshold comparison (`FORWARD_YAW_LIMIT_DEG`/
 * `FORWARD_PITCH_LIMIT_DEG`) is a main-thread constant and must stay there -
 * this file never re-derives it.
 *
 * Loaded as an ES-module worker from `visual-capture.ts`:
 *   new Worker(new URL("./visual-capture.worker.ts", import.meta.url), { type: "module" })
 * Verified (12-03 Task 1 spike) to resolve `@mediapipe/tasks-vision`'s real
 * ES module build (`vision_bundle.mjs`, via the package's own "exports" map)
 * under both `next dev --turbopack` and `next build` (webpack) - no
 * `importScripts` needed, no bundler-specific workaround.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** This plan adds exactly ONE model to the worker. 12-05 extends this union
 * (and the `models`/`detect` handling below) to add pose/hands/object. */
type ModelId = "face";

interface InitMessage {
  type: "init";
  models: ModelId[];
  delegate: "GPU" | "CPU";
}
interface DetectMessage {
  type: "detect";
  bitmap: ImageBitmap;
  model: ModelId;
  timestamp: number;
}
interface CloseMessage {
  type: "close";
}
type InboundMessage = InitMessage | DetectMessage | CloseMessage;

/** Scalar-only face detection payload - the entire contract REQ-58 depends
 * on. `primary` is null exactly when `faceCount === 0`. `yawDeg`/`pitchDeg`
 * are null exactly when the facial transformation matrix was unavailable for
 * the primary face (`poseAvailable: false`), mirroring the main-thread
 * fallback's own `poseUnavailableSamples` signal. */
export interface FaceDetectResult {
  faceCount: number;
  primary: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
  } | null;
  yawDeg: number | null;
  pitchDeg: number | null;
  poseAvailable: boolean;
}

/** Mirrors `visual-capture.ts`'s own constant and rationale: bounded
 * deliberately at 3 because the question answered is "more than one person?",
 * not "how many?" - see REQ-49/REQ-57, this pipeline must not compete with
 * the live avatar stream for the main thread. */
const MAX_TRACKED_FACES = 3;

let faceLandmarker: FaceLandmarker | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface FaceBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

/** Ported verbatim from `visual-capture.ts`'s own `boundsOf` - the same
 * largest-bounding-box discriminator, now run here so the landmark array it
 * reads never has to leave this worker. */
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

async function createFaceLandmarker(
  delegate: "GPU" | "CPU"
): Promise<FaceLandmarker> {
  const resolver = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return FaceLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: "/mediapipe/face_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: MAX_TRACKED_FACES,
    outputFacialTransformationMatrixes: true,
  });
}

/** Attempts the requested delegate first, falls back GPU->CPU exactly like
 * the pre-worker main-thread path did, and reports which one actually won so
 * the `[visual-capture] engine started` diagnostic keeps telling the truth. */
async function handleInit(msg: InitMessage) {
  if (!msg.models.includes("face")) {
    self.postMessage({ type: "ready", delegate: msg.delegate });
    return;
  }
  try {
    faceLandmarker = await createFaceLandmarker(msg.delegate);
    self.postMessage({ type: "ready", delegate: msg.delegate });
  } catch (firstError) {
    if (msg.delegate !== "GPU") {
      self.postMessage({
        type: "init-error",
        reason:
          firstError instanceof Error
            ? firstError.message
            : String(firstError),
      });
      return;
    }
    try {
      faceLandmarker = await createFaceLandmarker("CPU");
      self.postMessage({ type: "ready", delegate: "CPU" });
    } catch (cpuError) {
      self.postMessage({
        type: "init-error",
        reason:
          cpuError instanceof Error ? cpuError.message : String(cpuError),
      });
    }
  }
}

/** Runs the face model on one already-transferred bitmap and reduces the
 * result to scalars. Never retains `result.faceLandmarks` or
 * `result.facialTransformationMatrixes` past this call. */
function detectFace(bitmap: ImageBitmap, timestamp: number): FaceDetectResult {
  if (!faceLandmarker) {
    return {
      faceCount: 0,
      primary: null,
      yawDeg: null,
      pitchDeg: null,
      poseAvailable: false,
    };
  }

  const result = faceLandmarker.detectForVideo(bitmap, timestamp);
  const faceCount = result.faceLandmarks.length;
  if (faceCount === 0) {
    return {
      faceCount: 0,
      primary: null,
      yawDeg: null,
      pitchDeg: null,
      poseAvailable: false,
    };
  }

  // Index order is NOT stable frame-to-frame with numFaces > 1 - see
  // visual-capture.ts's own comment on this same discipline. Largest
  // bounding-box area is the stable stand-in for "whoever is at the machine".
  let primaryIndex = 0;
  let primaryBounds = boundsOf(result.faceLandmarks[0]);
  for (let i = 1; i < faceCount; i++) {
    const candidate = boundsOf(result.faceLandmarks[i]);
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

  const matrix = result.facialTransformationMatrixes[primaryIndex];
  let yawDeg: number | null = null;
  let pitchDeg: number | null = null;
  let poseAvailable = false;
  if (matrix?.data && matrix.data.length >= 16) {
    const m = matrix.data;
    yawDeg = (Math.atan2(-m[8], m[0]) * 180) / Math.PI;
    pitchDeg = (Math.asin(clamp(m[9], -1, 1)) * 180) / Math.PI;
    poseAvailable = true;
  }

  return { faceCount, primary, yawDeg, pitchDeg, poseAvailable };
}

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    void handleInit(msg);
    return;
  }

  if (msg.type === "detect") {
    const { bitmap, model, timestamp } = msg;
    try {
      if (model !== "face") {
        // No other model is ever requested by this plan - 12-05 extends this
        // branch. Close the bitmap regardless so REQ-58 holds even for an
        // unexpected message.
        bitmap.close();
        self.postMessage({
          type: "detect-error",
          model,
          reason: `unsupported model: ${model}`,
        });
        return;
      }
      const result = detectFace(bitmap, timestamp);
      // REQ-58: closed on this same message, before the reply is posted.
      bitmap.close();
      self.postMessage({ type: "detect-result", model, result });
    } catch (error) {
      bitmap.close();
      self.postMessage({
        type: "detect-error",
        model,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (msg.type === "close") {
    try {
      faceLandmarker?.close();
    } catch {
      // Best-effort teardown, mirrors the main-thread fallback's own
      // closeEngine discipline.
    }
    faceLandmarker = null;
    self.postMessage({ type: "closed" });
  }
};
