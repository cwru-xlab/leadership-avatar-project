/**
 * Phase 12 plan 12-03 (face) / 12-05 (pose, hands, object): worker-side
 * model host for the visual capture engine.
 *
 * REQ-58: no frame, ImageBitmap, or landmark array ever crosses back from
 * this worker, for ANY of the four runners below. The ImageBitmap received
 * on a `detect` message is closed on that SAME message, before any reply is
 * posted; no landmark array is ever retained past the `detectForVideo` call
 * that produced it. The only things ever posted back to the main thread are:
 * a `ready`/`init-error` status, a flat object of numbers/booleans for a
 * `detect` reply (per-model scalar shapes below), or a bare `closed`
 * acknowledgement.
 *
 * Primary-subject selection (largest bounding box among several tracked
 * faces/poses, or nearest-to-shoulder-midpoint for hands) lives HERE rather
 * than on the main thread, specifically so the landmark arrays and
 * transformation matrices backing them never have to leave this worker at
 * all. Raw angle/ratio readings ARE returned (not boolean verdicts) wherever
 * the corresponding threshold comparison is a main-thread constant — the
 * face runner's `yawDeg`/`pitchDeg` against `FORWARD_YAW_LIMIT_DEG`/
 * `FORWARD_PITCH_LIMIT_DEG` being the precedent this file follows throughout.
 * The three exceptions are `LANDMARK_VISIBILITY_FLOOR`, `PHONE_SCORE_THRESHOLD`
 * and `HANDS_NEAR_FACE_RADIUS`, all imported from the shared
 * `body-thresholds.ts` module rather than redefined here: these are
 * DETECTION-TIME filters this plan explicitly assigns to the worker (whether
 * a landmark/detection clears the floor needed to report a reading at all,
 * or whether a hand sits inside an expanded face box) — not scoring
 * verdicts. No threshold that decides a SCORE lives in this file.
 *
 * Loaded as an ES-module worker from `visual-capture.ts`:
 *   new Worker(new URL("./visual-capture.worker.ts", import.meta.url), { type: "module" })
 * Verified (12-03 Task 1 spike) to resolve `@mediapipe/tasks-vision`'s real
 * ES module build (`vision_bundle.mjs`, via the package's own "exports" map)
 * under both `next dev --turbopack` and `next build` (webpack) - no
 * `importScripts` needed, no bundler-specific workaround.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  ObjectDetector,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

/** `FilesetResolver.forVisionTasks`'s resolved type is not exported by the
 * package (`WasmFileset` is declared but not re-exported) - derived here
 * rather than redeclared by hand so it can never drift from the real
 * signature. */
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
import {
  HANDS_NEAR_FACE_RADIUS,
  LANDMARK_VISIBILITY_FLOOR,
  PHONE_SCORE_THRESHOLD,
} from "@/lib/metrics/body-thresholds";

/** The four models this worker can host. 12-05 extended this union from the
 * face-only set 12-03 shipped. */
type ModelId = "face" | "pose" | "hands" | "object";

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

/**
 * Scalar-only pose detection payload (12-05). Every numeric reading is
 * `null` exactly when `visible.<correspondingGroup>` is `false` — a session
 * never receives a substituted or extrapolated number for an out-of-frame
 * landmark group. See the landmark-group doc comment on
 * `VISUAL_POSTURE_SIGNALS` in `lib/metrics/types.ts` for which raw landmark
 * indices back each group.
 */
export interface PoseDetectResult {
  poseFound: boolean;
  visible: {
    shoulderLine: boolean;
    forwardHead: boolean;
    torsoLean: boolean;
    torsoOpenness: boolean;
  };
  /** Angle of the 11-12 shoulder line from horizontal, in degrees. */
  shoulderTiltDeg: number | null;
  /** Magnitude of the nose's displacement from the shoulder midpoint,
   * normalised by shoulder width so the reading does not change when the
   * student moves closer to or further from the camera - without this
   * normalisation, leaning in would read identically to a forward-head
   * posture change. */
  forwardHeadOffset: number | null;
  /** Angle of the shoulder-midpoint-to-hip-midpoint line from vertical, in
   * degrees. 0 is upright; sign follows the direction of lean. */
  torsoLeanDeg: number | null;
  /** Ratio of shoulder width to hip width - a proxy for torso rotation
   * toward/away from the camera. Near 1.0 reads as "facing the camera";
   * materially below 1.0 reads as the torso turned to one side, since a
   * rotated torso foreshortens the shoulder line but not the hip line by the
   * same amount at these camera distances. */
  torsoOpennessRatio: number | null;
  shoulderMidX: number | null;
  shoulderMidY: number | null;
  shoulderWidth: number | null;
  /** TEMPORARY (12-08 Task 1 checkpoint, Defect B investigation — removed in
   * Task 2). Raw landmark coordinates and the raw (non-acute, non-absolute)
   * dx/dy the shoulder-tilt angle is computed from. A still-session reading
   * of ~90° for an upright seated user cannot come from the acute-angle
   * convention fix alone unless dx is genuinely near zero at the source —
   * this field lets the next recorded session answer that definitively
   * rather than guessing from the degree figure alone. `null` exactly when
   * `shoulderLine` was not visible this tick. */
  shoulderDebugRaw: {
    lx: number;
    ly: number;
    rx: number;
    ry: number;
    dx: number;
    dy: number;
  } | null;
}

/**
 * Scalar-only hands detection payload (12-05). `primary` holds at most TWO
 * entries - see `selectPrimaryHands`'s comment for the selection rule and
 * its accepted-risk fallback.
 */
export interface HandsDetectResult {
  handCount: number;
  primary: Array<{
    wristX: number;
    wristY: number;
    /** Bounding-box span of the five fingertip landmarks (4/8/12/16/20) -
     * how spread/pointed the hand is, not an identity signal. */
    fingertipSpanX: number;
    fingertipSpanY: number;
    /** Null when no pose shoulder reading is currently available, never a
     * substituted false. */
    aboveShoulder: boolean | null;
    /** Null when no face box is currently available, never a substituted
     * false. */
    nearFace: boolean | null;
  }>;
}

/** Scalar-only object (phone) detection payload (12-05). Only the "cell
 * phone" category is ever retained from the 80-class COCO set this model
 * ships - `phoneScore` is the single highest-scoring "cell phone" detection
 * this tick, nothing else from the detector's output survives. */
export interface ObjectDetectResult {
  phonePresent: boolean;
  phoneScore: number;
}

type DetectResult =
  | FaceDetectResult
  | PoseDetectResult
  | HandsDetectResult
  | ObjectDetectResult;

/** Mirrors `visual-capture.ts`'s own constant and rationale: bounded
 * deliberately at 3 because the question answered is "more than one person?",
 * not "how many?" - see REQ-49/REQ-57, this pipeline must not compete with
 * the live avatar stream for the main thread. */
const MAX_TRACKED_FACES = 3;
/** Two people in frame means up to two poses worth tracking - the same
 * "more than one?" discipline as `MAX_TRACKED_FACES`, not an attempt to
 * track a crowd. */
const MAX_TRACKED_POSES = 2;
/** Two people in frame have four hands between them - see this file's
 * `HandsDetectResult` selection comment for why all four are requested even
 * though only two are ever returned per tick. */
const MAX_TRACKED_HANDS = 4;

/** Pose landmark indices used throughout this file (MediaPipe's fixed
 * 33-point topology). Named here once rather than left as magic numbers at
 * each call site. */
const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/** Hand landmark indices for the five fingertips (MediaPipe's fixed 21-point
 * hand topology); index 0 is always the wrist. */
const FINGERTIP_LANDMARKS = [4, 8, 12, 16, 20] as const;

let faceLandmarker: FaceLandmarker | null = null;
let poseLandmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;
let objectDetector: ObjectDetector | null = null;

/** The primary pose's shoulder midpoint from the MOST RECENT pose tick,
 * persisted as a bare scalar pair (never a landmark array) so the hands
 * runner's `aboveShoulder` reading and its pose-anchored selection rule can
 * use it on a LATER tick - the schedule staggers one model per tick, so pose
 * and hands never literally run on the same tick. Set to `null` whenever a
 * pose tick runs and finds no visible shoulder line, so a stale position is
 * never used once it goes stale. */
let lastPoseShoulderMid: { x: number; y: number } | null = null;

/** The primary face's bounding box from the most recent face tick, by the
 * same "persisted scalar, not a landmark array" discipline as
 * `lastPoseShoulderMid` above. Backs the hands runner's `nearFace` reading. */
let lastFaceBox: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

/** Ported verbatim from `visual-capture.ts`'s own `boundsOf` - the same
 * largest-bounding-box discriminator, now run here so the landmark array it
 * reads never has to leave this worker. Shared by the face and pose
 * primary-subject selection below. */
function boundsOf(landmarks: Array<{ x: number; y: number }>): Bounds {
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

/** `true` when a given pose landmark's `visibility` clears
 * `LANDMARK_VISIBILITY_FLOOR`. A missing/undefined `visibility` is treated
 * as not visible, never as visible-by-default. */
function isVisible(
  landmarks: Array<{ visibility: number }>,
  index: number
): boolean {
  return (landmarks[index]?.visibility ?? 0) >= LANDMARK_VISIBILITY_FLOOR;
}

async function createFaceLandmarker(
  resolver: WasmFileset,
  delegate: "GPU" | "CPU"
): Promise<FaceLandmarker> {
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

async function createPoseLandmarkerModel(
  resolver: WasmFileset,
  delegate: "GPU" | "CPU"
): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: MAX_TRACKED_POSES,
  });
}

async function createHandLandmarkerModel(
  resolver: WasmFileset,
  delegate: "GPU" | "CPU"
): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: "/mediapipe/hand_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numHands: MAX_TRACKED_HANDS,
  });
}

async function createObjectDetectorModel(
  resolver: WasmFileset,
  delegate: "GPU" | "CPU"
): Promise<ObjectDetector> {
  return ObjectDetector.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: "/mediapipe/efficientdet_lite0.tflite",
      delegate,
    },
    runningMode: "VIDEO",
    // Detection-time filter, not a scoring verdict - see this file's header
    // comment on the three accepted body-thresholds.ts imports.
    scoreThreshold: PHONE_SCORE_THRESHOLD,
  });
}

/** Creates every model named in `models` at the given delegate, sharing one
 * `FilesetResolver` resolution across all four - resolving it once per
 * attempt rather than once per model. Throws on the first failure, leaving
 * whichever models already succeeded assigned to their module-level
 * variables; the caller (`handleInit`) is responsible for tearing those
 * down via `closeAllModels` before a retry. */
async function createRequestedModels(
  models: ModelId[],
  delegate: "GPU" | "CPU"
): Promise<void> {
  const resolver = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  if (models.includes("face")) {
    faceLandmarker = await createFaceLandmarker(resolver, delegate);
  }
  if (models.includes("pose")) {
    poseLandmarker = await createPoseLandmarkerModel(resolver, delegate);
  }
  if (models.includes("hands")) {
    handLandmarker = await createHandLandmarkerModel(resolver, delegate);
  }
  if (models.includes("object")) {
    objectDetector = await createObjectDetectorModel(resolver, delegate);
  }
}

/** Best-effort teardown of all four runners, used both on `close` and ahead
 * of a GPU->CPU init retry (so a partially-succeeded GPU attempt cannot leak
 * a model instance once the CPU attempt replaces it). */
function closeAllModels() {
  try {
    faceLandmarker?.close();
  } catch {
    // Best-effort teardown.
  }
  try {
    poseLandmarker?.close();
  } catch {
    // Best-effort teardown.
  }
  try {
    handLandmarker?.close();
  } catch {
    // Best-effort teardown.
  }
  try {
    objectDetector?.close();
  } catch {
    // Best-effort teardown.
  }
  faceLandmarker = null;
  poseLandmarker = null;
  handLandmarker = null;
  objectDetector = null;
}

/** Attempts the requested delegate first, falls back GPU->CPU exactly like
 * the pre-12-05 single-model path did, and reports which one actually won so
 * the `[visual-capture] engine started` diagnostic keeps telling the truth.
 * Creates every model named in `msg.models` under ONE shared delegate
 * decision - there is no per-model delegate negotiation. */
async function handleInit(msg: InitMessage) {
  if (msg.models.length === 0) {
    self.postMessage({ type: "ready", delegate: msg.delegate });
    return;
  }
  try {
    await createRequestedModels(msg.models, msg.delegate);
    self.postMessage({ type: "ready", delegate: msg.delegate });
  } catch (firstError) {
    closeAllModels();
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
      await createRequestedModels(msg.models, "CPU");
      self.postMessage({ type: "ready", delegate: "CPU" });
    } catch (cpuError) {
      closeAllModels();
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
 * `result.facialTransformationMatrixes` past this call. Updates
 * `lastFaceBox` for the hands runner's `nearFace` reading. */
function detectFace(bitmap: ImageBitmap, timestamp: number): FaceDetectResult {
  if (!faceLandmarker) {
    lastFaceBox = null;
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
    lastFaceBox = null;
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
  lastFaceBox = { minX, maxX, minY, maxY };

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

/** Runs the pose model on one already-transferred bitmap and reduces the
 * result to scalars. Never retains `result.landmarks` past this call.
 * Updates `lastPoseShoulderMid` for the hands runner. */
function detectPose(bitmap: ImageBitmap, timestamp: number): PoseDetectResult {
  const empty: PoseDetectResult = {
    poseFound: false,
    visible: {
      shoulderLine: false,
      forwardHead: false,
      torsoLean: false,
      torsoOpenness: false,
    },
    shoulderTiltDeg: null,
    forwardHeadOffset: null,
    torsoLeanDeg: null,
    torsoOpennessRatio: null,
    shoulderMidX: null,
    shoulderMidY: null,
    shoulderWidth: null,
    shoulderDebugRaw: null,
  };

  if (!poseLandmarker) {
    lastPoseShoulderMid = null;
    return empty;
  }

  const result = poseLandmarker.detectForVideo(bitmap, timestamp);
  const poseCount = result.landmarks.length;
  if (poseCount === 0) {
    lastPoseShoulderMid = null;
    return empty;
  }

  // Same largest-bounding-box discipline as the face runner - index order is
  // not stable between frames with numPoses > 1.
  let primaryIndex = 0;
  let primaryBounds = boundsOf(result.landmarks[0]);
  for (let i = 1; i < poseCount; i++) {
    const candidate = boundsOf(result.landmarks[i]);
    if (candidate.area > primaryBounds.area) {
      primaryIndex = i;
      primaryBounds = candidate;
    }
  }
  const landmarks = result.landmarks[primaryIndex];

  const shoulderLineVisible =
    isVisible(landmarks, POSE_LANDMARK.LEFT_SHOULDER) &&
    isVisible(landmarks, POSE_LANDMARK.RIGHT_SHOULDER);
  const forwardHeadVisible =
    isVisible(landmarks, POSE_LANDMARK.NOSE) &&
    (isVisible(landmarks, POSE_LANDMARK.LEFT_EAR) ||
      isVisible(landmarks, POSE_LANDMARK.RIGHT_EAR));
  const hipVisible =
    isVisible(landmarks, POSE_LANDMARK.LEFT_HIP) &&
    isVisible(landmarks, POSE_LANDMARK.RIGHT_HIP);
  // Computing a torso reading inherently needs the shoulder midpoint too, not
  // just the hips the plan names as the gate - a head-and-shoulders framing
  // that fails the hip gate could never produce a shoulder-less torso angle
  // anyway. Gating on both is the honest statement of what this computation
  // actually requires.
  const torsoLeanVisible = hipVisible && shoulderLineVisible;
  const torsoOpennessVisible = hipVisible && shoulderLineVisible;

  let shoulderMidX: number | null = null;
  let shoulderMidY: number | null = null;
  let shoulderWidth: number | null = null;
  let shoulderTiltDeg: number | null = null;
  let shoulderDebugRaw: PoseDetectResult["shoulderDebugRaw"] = null;
  if (shoulderLineVisible) {
    const l = landmarks[POSE_LANDMARK.LEFT_SHOULDER];
    const r = landmarks[POSE_LANDMARK.RIGHT_SHOULDER];
    shoulderMidX = (l.x + r.x) / 2;
    shoulderMidY = (l.y + r.y) / 2;
    shoulderWidth = Math.hypot(r.x - l.x, r.y - l.y);
    const dx = r.x - l.x;
    const dy = r.y - l.y;
    // FIX (12-08 Task 1 checkpoint, Defect B, partial): the previous
    // `atan2(dy, dx)` is sign- and ordering-dependent — a level shoulder
    // line can land at 0 OR 180 depending on which landmark is "left" in
    // image space (mirroring), and averaging signed angles near +-180
    // across frames is meaningless. The acute-angle form below is 0 for
    // level shoulders and 90 for vertical, independent of landmark
    // ordering or mirroring, matching what the "tilt" label claims to
    // measure. NOT CONFIRMED SUFFICIENT: a real still-session recording
    // measured ~90 deg under the OLD formula, which requires dx to already
    // be near zero at the landmark level — this fix alone cannot explain
    // or guarantee correcting that if the true cause is e.g. a rotated
    // coordinate frame rather than sign/ordering. `shoulderDebugRaw` below
    // carries the raw values so the next recorded session can confirm
    // which it was.
    shoulderTiltDeg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    shoulderDebugRaw = { lx: l.x, ly: l.y, rx: r.x, ry: r.y, dx, dy };
  }

  let forwardHeadOffset: number | null = null;
  if (
    forwardHeadVisible &&
    shoulderLineVisible &&
    shoulderMidX !== null &&
    shoulderMidY !== null &&
    shoulderWidth
  ) {
    const nose = landmarks[POSE_LANDMARK.NOSE];
    const dx = nose.x - shoulderMidX;
    const dy = nose.y - shoulderMidY;
    // Normalised by shoulder width so the reading does not change as the
    // student moves closer to/further from the camera (see the field's doc
    // comment above).
    forwardHeadOffset = Math.hypot(dx, dy) / shoulderWidth;
  }

  let torsoLeanDeg: number | null = null;
  let torsoOpennessRatio: number | null = null;
  if (
    torsoLeanVisible &&
    shoulderMidX !== null &&
    shoulderMidY !== null
  ) {
    const left = landmarks[POSE_LANDMARK.LEFT_HIP];
    const right = landmarks[POSE_LANDMARK.RIGHT_HIP];
    const hipMidX = (left.x + right.x) / 2;
    const hipMidY = (left.y + right.y) / 2;
    const dx = shoulderMidX - hipMidX;
    const dy = shoulderMidY - hipMidY;
    // Angle from vertical: 0 degrees means shoulders sit directly above
    // hips. Image-space y grows downward, so the vertical reference is -dy.
    torsoLeanDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;

    if (torsoOpennessVisible && shoulderWidth) {
      const hipWidth = Math.hypot(right.x - left.x, right.y - left.y);
      torsoOpennessRatio = hipWidth > 0 ? shoulderWidth / hipWidth : null;
    }
  }

  lastPoseShoulderMid =
    shoulderLineVisible && shoulderMidX !== null && shoulderMidY !== null
      ? { x: shoulderMidX, y: shoulderMidY }
      : null;

  return {
    poseFound: true,
    visible: {
      shoulderLine: shoulderLineVisible,
      forwardHead: forwardHeadVisible,
      torsoLean: torsoLeanVisible,
      torsoOpenness: torsoOpennessVisible,
    },
    shoulderTiltDeg,
    forwardHeadOffset,
    torsoLeanDeg,
    torsoOpennessRatio,
    shoulderMidX,
    shoulderMidY,
    shoulderWidth,
    shoulderDebugRaw,
  };
}

/**
 * Runs the hand model on one already-transferred bitmap and reduces the
 * result to at most two scalar entries. Never retains any hand's landmark
 * array past this call.
 *
 * Selection rule - the hands analogue of the face/pose largest-bounding-box
 * discipline: pick the two hands whose wrists sit nearest
 * `lastPoseShoulderMid` (the primary pose's shoulder midpoint, from the most
 * recent pose tick - the schedule staggers models, so this is never the
 * literal same tick), falling back to the two largest hand bounding boxes
 * when no pose reading is currently available. The fallback is an accepted
 * risk (12-RESEARCH.md's open question 2: cross-model subject identity is
 * not guaranteed). Bounding-box area is a reasonable proxy for who is at the
 * machine, and building real spatial cross-referencing between independent
 * model runs would be new complexity for a sub-10% edge case.
 */
function detectHands(
  bitmap: ImageBitmap,
  timestamp: number
): HandsDetectResult {
  if (!handLandmarker) {
    return { handCount: 0, primary: [] };
  }

  const result = handLandmarker.detectForVideo(bitmap, timestamp);
  const handCount = result.landmarks.length;
  if (handCount === 0) {
    return { handCount: 0, primary: [] };
  }

  const candidates = result.landmarks.map((landmarks) => {
    const wrist = landmarks[0];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const index of FINGERTIP_LANDMARKS) {
      const point = landmarks[index];
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    return {
      wristX: wrist.x,
      wristY: wrist.y,
      fingertipSpanX: maxX - minX,
      fingertipSpanY: maxY - minY,
      area: boundsOf(landmarks).area,
    };
  });

  const shoulderMid = lastPoseShoulderMid;
  const selected = shoulderMid
    ? [...candidates]
        .sort((a, b) => {
          const da = Math.hypot(
            a.wristX - shoulderMid.x,
            a.wristY - shoulderMid.y
          );
          const db = Math.hypot(
            b.wristX - shoulderMid.x,
            b.wristY - shoulderMid.y
          );
          return da - db;
        })
        .slice(0, 2)
    : [...candidates].sort((a, b) => b.area - a.area).slice(0, 2);

  const faceBox = lastFaceBox;
  const primary = selected.map((candidate) => {
    const aboveShoulder = shoulderMid
      ? candidate.wristY < shoulderMid.y
      : null;

    let nearFace: boolean | null = null;
    if (faceBox) {
      // Expand the face box by HANDS_NEAR_FACE_RADIUS on every side - a
      // detection-time proximity test, not a scoring verdict (see this
      // file's header comment).
      const expandedMinX = faceBox.minX - HANDS_NEAR_FACE_RADIUS;
      const expandedMaxX = faceBox.maxX + HANDS_NEAR_FACE_RADIUS;
      const expandedMinY = faceBox.minY - HANDS_NEAR_FACE_RADIUS;
      const expandedMaxY = faceBox.maxY + HANDS_NEAR_FACE_RADIUS;
      nearFace =
        candidate.wristX >= expandedMinX &&
        candidate.wristX <= expandedMaxX &&
        candidate.wristY >= expandedMinY &&
        candidate.wristY <= expandedMaxY;
    }

    return {
      wristX: candidate.wristX,
      wristY: candidate.wristY,
      fingertipSpanX: candidate.fingertipSpanX,
      fingertipSpanY: candidate.fingertipSpanY,
      aboveShoulder,
      nearFace,
    };
  });

  return { handCount, primary };
}

/** Runs the object detector on one already-transferred bitmap and reduces
 * the result to a single "cell phone" scalar reading. Every other one of the
 * 80 COCO categories the model can return is discarded here and never
 * crosses back - `scoreThreshold` on the model itself (see
 * `createObjectDetectorModel`) already filters low-confidence detections of
 * ANY category before this function ever sees them. */
function detectObject(
  bitmap: ImageBitmap,
  timestamp: number
): ObjectDetectResult {
  if (!objectDetector) {
    return { phonePresent: false, phoneScore: 0 };
  }

  const result = objectDetector.detectForVideo(bitmap, timestamp);
  let bestScore = 0;
  for (const detection of result.detections) {
    for (const category of detection.categories) {
      if (category.categoryName === "cell phone" && category.score > bestScore) {
        bestScore = category.score;
      }
    }
  }
  return { phonePresent: bestScore > 0, phoneScore: bestScore };
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
      let result: DetectResult;
      switch (model) {
        case "face":
          result = detectFace(bitmap, timestamp);
          break;
        case "pose":
          result = detectPose(bitmap, timestamp);
          break;
        case "hands":
          result = detectHands(bitmap, timestamp);
          break;
        case "object":
          result = detectObject(bitmap, timestamp);
          break;
      }
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
    closeAllModels();
    self.postMessage({ type: "closed" });
  }
};
