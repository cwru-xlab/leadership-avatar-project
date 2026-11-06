/**
 * Pure geometry and tick logic behind the hand-matching fix and the two
 * DESCRIPTIVE conduct-adjacent signals (a held middle-finger hand shape, and
 * repeated hand-to-mouth plus mouth movement while not speaking).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE WORKER: the same reason
 * `landmark-visibility.ts` does. `visual-capture.worker.ts` installs
 * `self.onmessage` at module scope, so nothing inside it can be imported from
 * Node, and `scripts/verify-hand-mouth-signals.ts` must exercise the IDENTICAL
 * predicates the worker runs rather than a copy of them.
 *
 * REQ-58: functions here READ landmark arrays but never return one. Everything
 * they produce is a number, a boolean or a small object of those.
 *
 * WHAT THESE SIGNALS ARE NOT. They describe motion and hand shape. They do not
 * establish what anyone was doing or why: a sip of water, a medical eating
 * need, a tic, a sign language handshape, a limb difference and a mask can each
 * produce the same reading. Every threshold they use is UNTUNED (see
 * `body-thresholds.ts`), which is why nothing here may ever reach a score — see
 * `VisualDescriptiveObservations` in `types.ts`.
 */
import {
  FINGER_CURLED_PIP_MAX_DEG,
  FINGER_CURLED_REACH_MAX,
  FINGER_EXTENDED_DIP_MIN_DEG,
  FINGER_EXTENDED_PIP_MIN_DEG,
  FINGER_EXTENDED_REACH_MIN,
  GESTURE_AMPLITUDE_MIN,
  GESTURE_AMPLITUDE_SCALE_MAX,
  GESTURE_AMPLITUDE_SCALE_MIN,
  GESTURE_REFERENCE_SHOULDER_WIDTH,
  HAND_AT_MOUTH_ENTER_RATIO,
  HAND_AT_MOUTH_EXIT_RATIO,
  HAND_AT_MOUTH_REPEAT_MAX_GAP_S,
  HAND_AT_MOUTH_REPEAT_MIN_EVENTS,
  HAND_MATCH_HANDEDNESS_PENALTY,
  HAND_MATCH_MAX_COST,
  MIDDLE_FINGER_HOLD_TICKS,
  MIDDLE_FINGER_MAX_TICK_GAP_S,
  MIDDLE_FINGER_MERGE_GAP_S,
  MOUTH_MOVEMENT_SPEECH_GRACE_S,
} from "@/lib/metrics/body-thresholds";

/** The shape shared by MediaPipe's image and world landmarks, narrowed to what
 * these functions read. `z` is optional so the 2D fallback and fixtures can
 * omit it. */
export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe's fixed 21-point hand topology: wrist is 0, then
 * [MCP, PIP, DIP, TIP] for each of the four non-thumb fingers. The thumb
 * (1-4) is deliberately absent — see `isMiddleFingerPose`. */
const FINGER_JOINTS = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

type FingerName = keyof typeof FINGER_JOINTS;

export type FingerState = "extended" | "curled" | "ambiguous";

function distance3(a: HandPoint, b: HandPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Interior angle at `b`, in degrees. 180 is a straight joint. Invariant to
 * rotation, translation and uniform scale by construction, which is the whole
 * reason this rule is built from joint angles rather than "tip above knuckle"
 * comparisons that only hold for an upright hand. */
function jointAngleDeg(a: HandPoint, b: HandPoint, c: HandPoint): number {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = (a.z ?? 0) - (b.z ?? 0);
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = (c.z ?? 0) - (b.z ?? 0);
  const magnitude = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  if (magnitude === 0) return 0;
  const cos = (ux * vx + uy * vy + uz * vz) / magnitude;
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Extended, curled, or neither. `ambiguous` is a real outcome rather than a
 * rounding of one into the other: a half-bent finger is exactly where this rule
 * has no evidence either way, and it must not count toward a match. */
export function classifyFinger(
  landmarks: readonly HandPoint[],
  finger: FingerName
): FingerState {
  const [mcp, pip, dip, tip] = FINGER_JOINTS[finger].map((i) => landmarks[i]);
  const wrist = landmarks[0];
  const palm = distance3(wrist, mcp);
  if (palm === 0) return "ambiguous";

  const pipAngle = jointAngleDeg(mcp, pip, dip);
  const dipAngle = jointAngleDeg(pip, dip, tip);
  // Reach: how far the fingertip sits from the wrist, in palm lengths. Unlike
  // the two joint angles this also sees a bend at the knuckle.
  const reach = distance3(wrist, tip) / palm;

  if (
    pipAngle >= FINGER_EXTENDED_PIP_MIN_DEG &&
    dipAngle >= FINGER_EXTENDED_DIP_MIN_DEG &&
    reach >= FINGER_EXTENDED_REACH_MIN
  ) {
    return "extended";
  }
  if (pipAngle <= FINGER_CURLED_PIP_MAX_DEG || reach <= FINGER_CURLED_REACH_MAX) {
    return "curled";
  }
  return "ambiguous";
}

/**
 * Middle finger extended; index, ring and pinky curled. Never on a partial
 * landmark list.
 *
 * THE THUMB IS IGNORED, deliberately. The handshape is made with the thumb
 * tucked, across the fingers or sticking out, and the thumb's joint angles are
 * the noisiest on the hand. The three named fingers already separate this pose
 * from every common handshape that shares a curled thumb or a raised one: a
 * thumb-up has a curled middle finger, so it fails here on that alone.
 */
export function isMiddleFingerPose(landmarks: readonly HandPoint[]): boolean {
  if (landmarks.length < 21) return false;
  return (
    classifyFinger(landmarks, "middle") === "extended" &&
    classifyFinger(landmarks, "index") === "curled" &&
    classifyFinger(landmarks, "ring") === "curled" &&
    classifyFinger(landmarks, "pinky") === "curled"
  );
}

/** Image landmarks are normalized per axis, so a rotated hand is sheared on any
 * non-square frame and joint angles stop meaning what they should. Multiplying
 * x (and z, which MediaPipe scales like x) by width/height undoes that. Only
 * needed for image landmarks; world landmarks are already in metres. */
export function toIsotropic(
  landmarks: readonly HandPoint[],
  aspect: number
): HandPoint[] {
  return landmarks.map((point) => ({
    x: point.x * aspect,
    y: point.y,
    z: (point.z ?? 0) * aspect,
  }));
}

/** MediaPipe's fingertip indices (thumb, index, middle, ring, pinky). */
const FINGERTIPS = [4, 8, 12, 16, 20] as const;

/**
 * Closest fingertip to the lip center, in units of the face's own size, or null
 * when the face size is unusable. Measures FINGERTIPS, not the wrist: fingers
 * at the lips can leave the wrist well outside the expanded face box that
 * `nearFace` tests, so that scored signal is blind to this by construction.
 * Normalising by face size keeps the reading the same when the student moves
 * closer to or further from the camera.
 *
 * 2D only. The hand may be well in front of the face and project onto the
 * mouth; nothing here can tell.
 */
export function fingertipToLipRatio(
  handLandmarks: readonly HandPoint[],
  lipCenter: { x: number; y: number },
  faceSize: number,
  aspect: number
): number | null {
  if (!(faceSize > 0) || handLandmarks.length < 21) return null;
  let best = Infinity;
  for (const index of FINGERTIPS) {
    const tip = handLandmarks[index];
    const d = Math.hypot((tip.x - lipCenter.x) * aspect, tip.y - lipCenter.y);
    if (d < best) best = d;
  }
  return best / faceSize;
}

// --- Stable hand matching for the gesture displacement loop.

export interface HandObservation {
  wristX: number;
  wristY: number;
  handedness: "Left" | "Right" | null;
}

/**
 * Pairs each current hand with the previous tick's hand it most plausibly is,
 * returning that previous index or null when it matches none.
 *
 * Replaces comparing by list position. `primary` is sorted by distance to the
 * shoulder midpoint, so its order swaps whenever one hand passes the other, and
 * the old loop then read a still pair of hands as two large movements.
 *
 * Greedy lowest-cost first, which with at most two hands on each side is the
 * optimal assignment in every case that matters. Cost is wrist distance, plus a
 * penalty for a handedness mismatch. A penalty rather than a veto, because
 * MediaPipe's handedness label does flip on a stationary hand and that must not
 * read as a new hand; `HAND_MATCH_MAX_COST` then stops one hand leaving while
 * the opposite hand enters from reading as one huge sweep across the frame.
 */
export function matchHands(
  previous: readonly HandObservation[],
  current: readonly HandObservation[]
): Array<number | null> {
  const pairs: Array<{ prev: number; cur: number; cost: number }> = [];
  previous.forEach((p, prev) => {
    current.forEach((c, cur) => {
      const mismatch =
        p.handedness !== null &&
        c.handedness !== null &&
        p.handedness !== c.handedness;
      const cost =
        Math.hypot(c.wristX - p.wristX, c.wristY - p.wristY) +
        (mismatch ? HAND_MATCH_HANDEDNESS_PENALTY : 0);
      if (cost <= HAND_MATCH_MAX_COST) pairs.push({ prev, cur, cost });
    });
  });
  pairs.sort((a, b) => a.cost - b.cost);

  const out: Array<number | null> = current.map(() => null);
  const takenPrev = new Set<number>();
  for (const { prev, cur, cost } of pairs) {
    void cost;
    if (out[cur] !== null || takenPrev.has(prev)) continue;
    out[cur] = prev;
    takenPrev.add(prev);
  }
  return out;
}

/** `GESTURE_AMPLITUDE_MIN` scaled by how large the student's body is in frame,
 * since the same physical gesture covers twice the image from half the
 * distance. Unscaled when no shoulder reading exists, and clamped so an odd
 * shoulder reading (a turned torso foreshortens the line) cannot move the floor
 * far from the value the rate bands were tuned downstream of. */
export function scaledGestureAmplitudeMin(shoulderWidth: number | null): number {
  if (shoulderWidth === null || !(shoulderWidth > 0)) return GESTURE_AMPLITUDE_MIN;
  const scale = Math.min(
    GESTURE_AMPLITUDE_SCALE_MAX,
    Math.max(
      GESTURE_AMPLITUDE_SCALE_MIN,
      shoulderWidth / GESTURE_REFERENCE_SHOULDER_WIDTH
    )
  );
  return GESTURE_AMPLITUDE_MIN * scale;
}

/** Displacements of hands matched to their own previous position this tick,
 * unfiltered. A hand with no match contributes nothing: it has no prior
 * position of its own to have moved from. */
export function matchedDisplacements(
  previous: readonly HandObservation[],
  current: readonly HandObservation[]
): number[] {
  const out: number[] = [];
  matchHands(previous, current).forEach((prevIndex, curIndex) => {
    if (prevIndex === null) return;
    const p = previous[prevIndex];
    const c = current[curIndex];
    out.push(Math.hypot(c.wristX - p.wristX, c.wristY - p.wristY));
  });
  return out;
}

// --- Hand-to-mouth events.

export interface HandAtMouthState {
  atMouth: boolean;
}

/**
 * One hands tick. `ratio` is null when no hand was in frame, which is genuinely
 * "not at the mouth" — a hand that drops below the frame between trips has left.
 * `eligible` is false when no recent mouth reading existed; state then holds,
 * because this tick says nothing either way.
 *
 * Hysteresis, so a resting hand hovering at the boundary (a chin on a hand) stays
 * ONE long event instead of flapping into the "repeated" signal. That is what
 * separates a hand resting at the face from a hand travelling to it repeatedly.
 */
export function stepHandAtMouth(
  state: HandAtMouthState,
  ratio: number | null,
  eligible: boolean
): { state: HandAtMouthState; entered: boolean } {
  if (!eligible) return { state, entered: false };
  if (state.atMouth) {
    const stillThere = ratio !== null && ratio <= HAND_AT_MOUTH_EXIT_RATIO;
    return { state: { atMouth: stillThere }, entered: false };
  }
  const arrived = ratio !== null && ratio <= HAND_AT_MOUTH_ENTER_RATIO;
  return { state: { atMouth: arrived }, entered: arrived };
}

export interface HandAtMouthRun {
  start_s: number;
  end_s: number;
  events: number;
}

/** Groups arrival times into runs of repeated arrivals, dropping any group too
 * small to be "repeated". A single arrival, however long the hand then stayed,
 * is not reportable here. */
export function groupHandAtMouthEvents(timesS: readonly number[]): HandAtMouthRun[] {
  const runs: HandAtMouthRun[] = [];
  let start = 0;
  for (let i = 1; i <= timesS.length; i++) {
    if (
      i === timesS.length ||
      timesS[i] - timesS[i - 1] > HAND_AT_MOUTH_REPEAT_MAX_GAP_S
    ) {
      const events = i - start;
      if (events >= HAND_AT_MOUTH_REPEAT_MIN_EVENTS) {
        runs.push({
          start_s: Math.round(timesS[start]),
          end_s: Math.round(timesS[i - 1]),
          events,
        });
      }
      start = i;
    }
  }
  return runs;
}

// --- Held hand-shape runs.

export interface HeldPoseRun {
  start_s: number;
  end_s: number;
}

/**
 * Streaming consecutive-tick gate for one per-tick boolean. Only hands ticks may
 * call `step`, so a run counts in hands ticks: a one-tick hit is discarded, since
 * one tick can be any hand mid-transition between two ordinary shapes.
 *
 * Merges runs separated by a short gap, so one gesture that loses a tick to
 * landmark noise reads as one entry. A stall longer than
 * `MIDDLE_FINGER_MAX_TICK_GAP_S` breaks a streak: two ticks that far apart are
 * not evidence of anything being held between them.
 */
export function createHeldPoseTracker() {
  const runs: HeldPoseRun[] = [];
  let streak = 0;
  let streakStartS = 0;
  let lastHitS = 0;

  function closeStreak() {
    if (streak >= MIDDLE_FINGER_HOLD_TICKS) {
      const previous = runs[runs.length - 1];
      if (previous && streakStartS - previous.end_s <= MIDDLE_FINGER_MERGE_GAP_S) {
        previous.end_s = lastHitS;
      } else {
        runs.push({ start_s: streakStartS, end_s: lastHitS });
      }
    }
    streak = 0;
  }

  return {
    step(hit: boolean, tS: number) {
      if (streak > 0 && tS - lastHitS > MIDDLE_FINGER_MAX_TICK_GAP_S) closeStreak();
      if (!hit) {
        closeStreak();
        return;
      }
      if (streak === 0) streakStartS = tS;
      streak += 1;
      lastHitS = tS;
    },
    finish(): HeldPoseRun[] {
      closeStreak();
      return runs.map((run) => ({
        start_s: Math.round(run.start_s),
        end_s: Math.round(run.end_s),
      }));
    },
  };
}

// --- Mouth movement while not speaking.

export interface MouthMovementState {
  lastJaw: number | null;
  lastSpeakingS: number | null;
}

/**
 * One face tick. Returns the absolute jaw change since the previous eligible
 * tick, or null when this tick cannot contribute.
 *
 * ENERGY ONLY, NEVER A RHYTHM. Face runs at 3 Hz, so nothing above 1.5 Hz can be
 * resolved, and chewing sits right at that limit. Reading a chewing rate off this
 * would be the same Nyquist trap that retired fidgeting (see `VISUAL_NOT_MEASURED`
 * in `types.ts`). The sum of absolute changes does not depend on resolving the
 * period: it only says the jaw kept changing position while the student was not
 * speaking, whatever the reason.
 *
 * The grace period drops the tail of a spoken turn, since the mouth is still
 * closing after push-to-talk releases. Speech begun before the button is pressed
 * cannot be excluded this way and will read as movement.
 */
export function stepMouthMovement(
  state: MouthMovementState,
  jaw: number | null,
  speakingNow: boolean,
  tS: number
): { state: MouthMovementState; delta: number | null } {
  if (speakingNow) {
    return { state: { lastJaw: null, lastSpeakingS: tS }, delta: null };
  }
  if (
    jaw === null ||
    (state.lastSpeakingS !== null &&
      tS - state.lastSpeakingS < MOUTH_MOVEMENT_SPEECH_GRACE_S)
  ) {
    return { state: { ...state, lastJaw: null }, delta: null };
  }
  return {
    state: { ...state, lastJaw: jaw },
    delta: state.lastJaw === null ? null : Math.abs(jaw - state.lastJaw),
  };
}
