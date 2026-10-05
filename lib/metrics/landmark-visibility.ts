/**
 * Phase 12 plan 12-10 Task 3: the two predicates that decide whether a pose
 * landmark was OBSERVED, extracted into their own pure module.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE WORKER. These predicates are the
 * producer-side root cause of the item-7 sign-off failure that defeated both
 * 12-08 and 12-09, so 12-10 requires a replay assertion that exercises them
 * directly — specifically, one that must be shown to FAIL when the pre-fix
 * score-only predicate is restored. They cannot be asserted from inside
 * `visual-capture.worker.ts`: that module installs `self.onmessage` at module
 * scope, so importing it from `scripts/verify-visual-metrics.ts` (plain Node
 * via tsx, no `self`) throws before any export is reachable. 12-09's
 * equivalent check "failed" only because the symbols it needed were not
 * exported, which proved the test was new and nothing about the behaviour —
 * this module is what makes the behavioural check possible instead.
 *
 * Pure and dependency-free apart from the one threshold it applies, for the
 * same reason `computePostureSignalsMeasured`/`computeHandsUsable` are pure:
 * the worker's runtime path and the verification script must exercise the
 * IDENTICAL predicate, so a regression here is a test failure rather than
 * something only a human reading a live report would catch.
 */
import { LANDMARK_VISIBILITY_FLOOR } from "@/lib/metrics/body-thresholds";

/** The shape both pose and hand landmarks share (`NormalizedLandmark`),
 * narrowed to the fields these predicates read. */
export interface ObservableLandmark {
  x: number;
  y: number;
  visibility?: number;
}

/** `0 <= x <= 1 && 0 <= y <= 1` — whether a normalized landmark's
 * coordinates fall inside the captured frame at all. A landmark the model
 * extrapolated to a position outside the image lands outside `[0,1]` on one
 * or both axes, which is the whole signal this predicate carries.
 *
 * NO SLACK MARGIN, and that is deliberate (12-10 Task 3). The plan asked for
 * any margin to be set from the Session B reading — the genuine partial body,
 * sitting at the frame's edge with the torso cut off — because a student half
 * out of frame must still be scored on what IS visible (REQ-51). Session B
 * cleared this strict bound comfortably: its `forward_head` group was in
 * frame on 212 of 281 pose ticks (75%) under exactly this `[0,1]` test. A
 * tolerance band would therefore buy REQ-51 nothing it does not already
 * have, while re-admitting precisely the narrowly-extrapolated landmarks this
 * predicate exists to exclude.
 *
 * Fails CLOSED on `NaN`: every comparison against `NaN` is false, so a
 * degenerate coordinate reads as not in frame rather than as observed. */
export function isInFrame(point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/** `true` when a given pose landmark was OBSERVED IN FRAME this tick: its
 * normalized coordinates fall inside the captured frame (`isInFrame`) AND its
 * `visibility` clears `LANDMARK_VISIBILITY_FLOOR`. Both conditions are
 * required. A missing landmark, or a missing/undefined `visibility`, is
 * treated as not visible, never as visible-by-default.
 *
 * WHAT THIS FLAG MEANS, AND WHY THE IN-FRAME HALF EXISTS (12-10 Task 3).
 * Until this plan this predicate tested the `visibility` score ALONE, and its
 * doc comment — "a missing/undefined `visibility` is treated as not visible,
 * never as visible-by-default" — read as though that already guaranteed
 * honesty. It did not, and the next reader must not be misled the same way.
 * MediaPipe's `visibility` is the model's own PREDICTED probability that a
 * landmark is visible, not an observation that anything was seen: having
 * locked onto a partial body, the pose model emits a full 33-landmark
 * skeleton and assigns confident `visibility` to shoulders, nose and ears
 * that are outside the frame entirely. The 12-10 Task 2 readings measured
 * exactly how confident: in a session spent OFF CAMERA with one arm in shot,
 * this predicate said "visible" for the `forward_head` group on 140 of 143
 * pose ticks (98%) while the face was detected 0% of the session. The score
 * is therefore near-useless as a gate on its own — it asserts visible almost
 * always.
 *
 * So `visible.*` in `PoseDetectResult` now means OBSERVED IN FRAME, not "the
 * model is confident it could guess this". Downstream, every reading derived
 * from a landmark group is null exactly when that group is not visible, so an
 * extrapolated off-camera skeleton now produces no posture readings at all
 * rather than fabricated ones.
 *
 * This is the PER-TICK half of the fix only. A per-tick in-frame test alone
 * does NOT close the item-7 sign-off failure — under it, the off-camera
 * session's `forward_head` group is still in frame on 62/143 ticks (43%),
 * which clears 12-09's 25% coverage ratio and would have reported "Head
 * position" as measured for a third time. The decisive quantity is the
 * SESSION-WIDE share of pose ticks on which a group was observed in frame;
 * this predicate is its input, and `POSTURE_COVERAGE_MIN_RATIO`
 * (`body-thresholds.ts`) is the gate set from those readings. See that
 * constant's comment for the Session A/B numbers and the cutoff. */
export function isLandmarkObservedInFrame(
  landmarks: ArrayLike<ObservableLandmark>,
  index: number
): boolean {
  const landmark = landmarks[index];
  if (!landmark) return false;
  return (
    isInFrame(landmark) &&
    (landmark.visibility ?? 0) >= LANDMARK_VISIBILITY_FLOOR
  );
}
