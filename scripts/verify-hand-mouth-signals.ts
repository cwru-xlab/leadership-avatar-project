/**
 * Verifies the pure logic behind stable hand matching and the descriptive hand
 * and mouth signals, over SYNTHETIC landmarks.
 *
 * Run: npx tsx scripts/verify-hand-mouth-signals.ts
 *
 * WHAT THIS DOES NOT SHOW: real-camera accuracy. Every hand below is built by
 * forward kinematics from joint bends chosen by whoever wrote this file, so a
 * pass says the rule separates the shapes it was designed to separate. It says
 * nothing about what MediaPipe reports for a real hand.
 */
import {
  classifyFinger,
  createHeldPoseTracker,
  fingertipToLipRatio,
  groupHandAtMouthEvents,
  isMiddleFingerPose,
  matchedDisplacements,
  matchHands,
  scaledGestureAmplitudeMin,
  stepHandAtMouth,
  stepMouthMovement,
  toIsotropic,
  type HandObservation,
  type HandPoint,
} from "../lib/metrics/hand-mouth-signals";
import {
  GESTURE_AMPLITUDE_MIN,
  GESTURE_AMPLITUDE_SCALE_MAX,
  GESTURE_AMPLITUDE_SCALE_MIN,
  GESTURE_REFERENCE_SHOULDER_WIDTH,
} from "../lib/metrics/body-thresholds";
import { computeConductSignalsMeasured, extractDescriptiveEpisodes } from "../lib/metrics/visual-capture";
import { parseMetricsPayload } from "../lib/metrics/ingest";
import { timelineRows, visualBands, visualBodyLanguageBands, visualObservationCaveat, visualObservationRows } from "../lib/metrics/bands";
import { resolveNotMeasured, VISUAL_DESCRIPTIVE_EPISODE_KINDS, type VisualMetrics } from "../lib/metrics/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

// --- Synthetic hands. A finger is three joint flexions in degrees: at the
// knuckle, then the two finger joints. 0 is straight.
type Bend = [number, number, number];
const STRAIGHT: Bend = [0, 3, 3];
const RELAXED: Bend = [20, 40, 25];
const CURLED: Bend = [70, 95, 60];
const FOLDED_FLAT: Bend = [85, 8, 5];

interface Shape {
  thumb: "tucked" | "out" | "up";
  index: Bend;
  middle: Bend;
  ring: Bend;
  pinky: Bend;
}

const FINGER_ROOTS = {
  index: { x: 0.021, y: 0.09, lengths: [0.04, 0.025, 0.02] },
  middle: { x: 0.0, y: 0.095, lengths: [0.045, 0.03, 0.022] },
  ring: { x: -0.018, y: 0.088, lengths: [0.04, 0.027, 0.021] },
  pinky: { x: -0.034, y: 0.077, lengths: [0.032, 0.019, 0.018] },
};

/** Fingers flex in the palm's y-z plane; `+y` is up the hand in metres. */
function buildHand(shape: Shape): HandPoint[] {
  const out: HandPoint[] = new Array(21);
  out[0] = { x: 0, y: 0, z: 0 };
  const thumb: Record<Shape["thumb"], HandPoint[]> = {
    tucked: [
      { x: 0.03, y: 0.03, z: 0 },
      { x: 0.04, y: 0.055, z: -0.01 },
      { x: 0.025, y: 0.065, z: -0.025 },
      { x: 0.005, y: 0.065, z: -0.03 },
    ],
    out: [
      { x: 0.03, y: 0.03, z: 0 },
      { x: 0.055, y: 0.05, z: 0 },
      { x: 0.08, y: 0.06, z: 0 },
      { x: 0.1, y: 0.07, z: 0 },
    ],
    up: [
      { x: 0.03, y: 0.03, z: 0 },
      { x: 0.04, y: 0.07, z: 0 },
      { x: 0.045, y: 0.1, z: 0 },
      { x: 0.05, y: 0.13, z: 0 },
    ],
  };
  thumb[shape.thumb].forEach((p, i) => (out[1 + i] = p));
  const fingers = ["index", "middle", "ring", "pinky"] as const;
  fingers.forEach((name, f) => {
    const root = FINGER_ROOTS[name];
    let y = root.y;
    let z = 0;
    let angle = 0;
    const base = 5 + f * 4;
    out[base] = { x: root.x, y, z };
    shape[name].forEach((bend, j) => {
      angle += (bend * Math.PI) / 180;
      y += root.lengths[j] * Math.cos(angle);
      z -= root.lengths[j] * Math.sin(angle);
      out[base + 1 + j] = { x: root.x, y, z };
    });
  });
  return out;
}

function rotate(points: HandPoint[], rollDeg: number, yawDeg: number, pitchDeg: number): HandPoint[] {
  const [r, y, p] = [rollDeg, yawDeg, pitchDeg].map((d) => (d * Math.PI) / 180);
  return points.map(({ x, y: py, z = 0 }) => {
    const x1 = x * Math.cos(r) - py * Math.sin(r);
    const y1 = x * Math.sin(r) + py * Math.cos(r);
    const x2 = x1 * Math.cos(y) + z * Math.sin(y);
    const z2 = -x1 * Math.sin(y) + z * Math.cos(y);
    const y3 = y1 * Math.cos(p) - z2 * Math.sin(p);
    const z3 = y1 * Math.sin(p) + z2 * Math.cos(p);
    return { x: x2, y: y3, z: z3 };
  });
}

/** Deterministic noise, so a failure reproduces. */
function jitter(points: HandPoint[], amount: number, seed: number): HandPoint[] {
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5) * 2 * amount;
  };
  return points.map((p) => ({ x: p.x + next(), y: p.y + next(), z: (p.z ?? 0) + next() }));
}

const SHAPES: Record<string, { shape: Shape; expected: boolean }> = {
  "middle only, thumb tucked": { expected: true, shape: { thumb: "tucked", index: CURLED, middle: STRAIGHT, ring: CURLED, pinky: CURLED } },
  "middle only, thumb out": { expected: true, shape: { thumb: "out", index: CURLED, middle: STRAIGHT, ring: CURLED, pinky: CURLED } },
  // Straight fingers bent only at the knuckle are neither extended nor curled, so
  // the rule stays quiet on them. A deliberate miss: "ambiguous" never matches.
  "middle up, others straight but folded at the knuckle": { expected: false, shape: { thumb: "tucked", index: FOLDED_FLAT, middle: STRAIGHT, ring: FOLDED_FLAT, pinky: FOLDED_FLAT } },
  fist: { expected: false, shape: { thumb: "tucked", index: CURLED, middle: CURLED, ring: CURLED, pinky: CURLED } },
  "open palm": { expected: false, shape: { thumb: "out", index: STRAIGHT, middle: STRAIGHT, ring: STRAIGHT, pinky: STRAIGHT } },
  "relaxed hand": { expected: false, shape: { thumb: "out", index: RELAXED, middle: RELAXED, ring: RELAXED, pinky: RELAXED } },
  pointing: { expected: false, shape: { thumb: "tucked", index: STRAIGHT, middle: CURLED, ring: CURLED, pinky: CURLED } },
  peace: { expected: false, shape: { thumb: "tucked", index: STRAIGHT, middle: STRAIGHT, ring: CURLED, pinky: CURLED } },
  "thumb up": { expected: false, shape: { thumb: "up", index: CURLED, middle: CURLED, ring: CURLED, pinky: CURLED } },
  "ring only": { expected: false, shape: { thumb: "tucked", index: CURLED, middle: CURLED, ring: STRAIGHT, pinky: CURLED } },
  "middle and ring": { expected: false, shape: { thumb: "tucked", index: CURLED, middle: STRAIGHT, ring: STRAIGHT, pinky: CURLED } },
  "ring and pinky": { expected: false, shape: { thumb: "tucked", index: CURLED, middle: CURLED, ring: STRAIGHT, pinky: STRAIGHT } },
  "pinky only": { expected: false, shape: { thumb: "tucked", index: CURLED, middle: CURLED, ring: CURLED, pinky: STRAIGHT } },
  "three up, ring curled": { expected: false, shape: { thumb: "tucked", index: STRAIGHT, middle: STRAIGHT, ring: CURLED, pinky: STRAIGHT } },
  "horns (index and pinky)": { expected: false, shape: { thumb: "tucked", index: STRAIGHT, middle: CURLED, ring: CURLED, pinky: STRAIGHT } },
  "middle half bent, others curled": { expected: false, shape: { thumb: "tucked", index: CURLED, middle: RELAXED, ring: CURLED, pinky: CURLED } },
  "middle up, index only relaxed": { expected: false, shape: { thumb: "tucked", index: RELAXED, middle: STRAIGHT, ring: CURLED, pinky: CURLED } },
};

console.log("\n1. Finger rule: upright hands");
for (const [name, { shape, expected }] of Object.entries(SHAPES)) {
  check(name, isMiddleFingerPose(buildHand(shape)), expected);
}

console.log("\n2. Finger rule: every shape across rotations, scale and landmark noise");
{
  const rolls = [0, 45, 90, 135, 180, 225, 270, 315];
  const tilts: Array<[number, number]> = [[0, 0], [35, 0], [-35, 0], [0, 35], [0, -35], [50, 30], [-50, -30]];
  for (const [name, { shape, expected }] of Object.entries(SHAPES)) {
    let wrong = 0;
    let total = 0;
    for (const roll of rolls) {
      for (const [yaw, pitch] of tilts) {
        const scale = 0.5 + ((roll + yaw + 90) % 7) * 0.5;
        const pts = rotate(buildHand(shape), roll, yaw, pitch).map((p) => ({
          x: p.x * scale + 0.3,
          y: p.y * scale - 0.2,
          z: (p.z ?? 0) * scale,
        }));
        total += 1;
        if (isMiddleFingerPose(jitter(pts, 0.0015 * scale, 1 + roll + total)) !== expected) wrong += 1;
      }
    }
    check(`${name}: 0 of ${total} wrong`, wrong, 0);
  }
}

console.log("\n3. Image-landmark fallback, used if world landmarks are ever missing");
{
  const aspect = 4 / 3;
  const toImage = (points: HandPoint[], keepDepth: boolean) =>
    points.map((p) => ({
      x: 0.5 + (p.x * 2) / aspect,
      y: 0.5 + p.y * 2,
      z: keepDepth ? ((p.z ?? 0) * 2) / aspect : 0,
    }));
  for (const [name, { shape, expected }] of Object.entries(SHAPES)) {
    let wrong = 0;
    for (const roll of [0, 60, 120, 180, 240, 300]) {
      const image = toImage(rotate(buildHand(shape), roll, 0, 0), true);
      if (isMiddleFingerPose(toIsotropic(image, aspect)) !== expected) wrong += 1;
    }
    check(`${name}: 0 of 6 wrong on a 4:3 frame`, wrong, 0);
  }
  // Flexion runs toward the camera, so a flat 2D reading cannot see it. Recorded,
  // not asserted away: this is why the worker prefers world landmarks, and why
  // their depth estimate is on the human test list.
  const flat = isMiddleFingerPose(
    toIsotropic(toImage(buildHand(SHAPES["middle half bent, others curled"].shape), false), aspect)
  );
  console.log(`  info with depth discarded, a half-bent middle finger reads as a match: ${flat}`);
  check("isotropic correction keeps a rotated finger straight",
    classifyFinger(
      toIsotropic(toImage(rotate(buildHand(SHAPES["open palm"].shape), 45, 0, 0), true), aspect),
      "middle"
    ),
    "extended");
}

console.log("\n4. Malformed input");
check("a short landmark list never matches", isMiddleFingerPose(buildHand(SHAPES["middle only, thumb out"].shape).slice(0, 12)), false);
check("all-coincident landmarks never match", isMiddleFingerPose(new Array(21).fill({ x: 0.5, y: 0.5, z: 0 })), false);

console.log("\n5. Held across consecutive hands ticks");
{
  const run = (ticks: Array<[boolean, number]>) => {
    const tracker = createHeldPoseTracker();
    ticks.forEach(([hit, t]) => tracker.step(hit, t));
    return tracker.finish();
  };
  check("one tick is discarded", run([[false, 0], [true, 0.67], [false, 1.33]]), []);
  check("two consecutive ticks report", run([[true, 10], [true, 10.67], [false, 11.33]]), [{ start_s: 10, end_s: 11 }]);
  check("a run still open at session end reports", run([[true, 30], [true, 30.7], [true, 31.4]]), [{ start_s: 30, end_s: 31 }]);
  check("two hits split by a long stall are not a hold", run([[true, 10], [true, 14]]), []);
  check("near runs merge into one entry",
    run([[true, 10], [true, 10.7], [false, 11.4], [true, 13], [true, 13.7], [false, 14.4]]),
    [{ start_s: 10, end_s: 14 }]);
  check("far runs stay separate",
    run([[true, 10], [true, 10.7], [false, 11.4], [true, 60], [true, 60.7], [false, 61.4]]),
    [{ start_s: 10, end_s: 11 }, { start_s: 60, end_s: 61 }]);
}

console.log("\n6. Stable hand matching vs the old list-index comparison");
{
  const hand = (wristX: number, wristY: number, handedness: HandObservation["handedness"]): HandObservation => ({ wristX, wristY, handedness });
  const oldIndexLoop = (prev: HandObservation[], cur: HandObservation[]) =>
    cur.flatMap((c, i) => (prev[i] ? [Math.hypot(c.wristX - prev[i].wristX, c.wristY - prev[i].wristY)] : []));
  const a = hand(0.3, 0.6, "Left");
  const b = hand(0.7, 0.6, "Right");

  const swappedOld = oldIndexLoop([a, b], [b, a]);
  const swappedNew = matchedDisplacements([a, b], [b, a]);
  console.log(`  info still hands, order swapped: old displacements ${JSON.stringify(swappedOld.map((d) => +d.toFixed(2)))}, new ${JSON.stringify(swappedNew)}`);
  check("still hands whose list order swaps were two events in the old loop",
    swappedOld.filter((d) => d >= GESTURE_AMPLITUDE_MIN).length, 2);
  check("... and are zero events now", swappedNew.filter((d) => d >= GESTURE_AMPLITUDE_MIN).length, 0);

  check("each hand matched to itself after a swap", matchHands([a, b], [b, a]), [1, 0]);
  check("a real move on one hand is one displacement of the right size",
    matchedDisplacements([a, b], [hand(0.45, 0.6, "Left"), b]).map((d) => +d.toFixed(2)).sort(), [0, 0.15]);
  check("one hand leaving, the opposite one entering far away, is no sweep",
    matchedDisplacements([a], [b]), []);
  check("same label far away beyond the cap is a new hand",
    matchedDisplacements([hand(0.1, 0.5, "Left")], [hand(0.8, 0.5, "Left")]), []);
  check("a handedness flip on a stationary hand still matches",
    matchHands([hand(0.5, 0.5, "Left")], [hand(0.5, 0.5, "Right")]), [0]);
  check("a hand with no label still matches by distance",
    matchHands([hand(0.5, 0.5, null)], [hand(0.55, 0.5, "Right")]), [0]);
  check("crossing wrists: handedness holds identity when distance alone would not",
    matchHands([hand(0.48, 0.5, "Left"), hand(0.52, 0.5, "Right")], [hand(0.53, 0.5, "Left"), hand(0.47, 0.5, "Right")]),
    [0, 1]);
  check("a third new hand stays unmatched", matchHands([a], [a, b]), [0, null]);
}

console.log("\n7. Gesture floor scales with body size");
check("no shoulder reading: the original floor", scaledGestureAmplitudeMin(null), GESTURE_AMPLITUDE_MIN);
check("at the reference width: the original floor", scaledGestureAmplitudeMin(GESTURE_REFERENCE_SHOULDER_WIDTH), GESTURE_AMPLITUDE_MIN);
check("closer: higher floor, clamped", scaledGestureAmplitudeMin(0.95), GESTURE_AMPLITUDE_MIN * GESTURE_AMPLITUDE_SCALE_MAX);
check("further: lower floor, clamped", scaledGestureAmplitudeMin(0.05), GESTURE_AMPLITUDE_MIN * GESTURE_AMPLITUDE_SCALE_MIN);
{
  const closeWidth = 0.56;
  const farWidth = 0.28;
  const sameWave = 0.25; // shoulder widths
  check("the same physical wave clears both floors",
    [sameWave * closeWidth >= scaledGestureAmplitudeMin(closeWidth), sameWave * farWidth >= scaledGestureAmplitudeMin(farWidth)],
    [true, true]);
}

console.log("\n8. Fingertips to lips: normalised by face size, wrist can stay away");
{
  const open = buildHand(SHAPES["open palm"].shape);
  const place = (tipX: number, tipY: number, scale: number) => {
    const raw = rotate(open, 180, 0, 0).map((p) => ({ x: p.x * scale, y: p.y * scale, z: 0 }));
    const anchor = raw[12];
    return raw.map((p) => ({ x: p.x - anchor.x + tipX, y: p.y - anchor.y + tipY, z: 0 }));
  };
  const lip = { x: 0.5, y: 0.5 };
  const atLip = place(0.51, 0.5, 2);
  check("a fingertip on the lips reads under 0.2", fingertipToLipRatio(atLip, lip, 0.15, 1)! < 0.2, true);
  check("wrist is more than a whole face away while it does",
    Math.hypot(atLip[0].x - lip.x, atLip[0].y - lip.y) / 0.15 > 1, true);
  check("the same physical spacing reads the same from half the distance",
    +fingertipToLipRatio(place(0.53, 0.5, 2), lip, 0.15, 1)!.toFixed(2),
    +fingertipToLipRatio(place(0.515, 0.5, 1), lip, 0.075, 1)!.toFixed(2));
  check("no usable face size is null, never a number", fingertipToLipRatio(atLip, lip, 0, 1), null);
}

console.log("\n9. Hand-to-mouth arrivals");
{
  const replay = (ticks: Array<{ ratio: number | null; eligible?: boolean }>) => {
    let state = { atMouth: false };
    let arrivals = 0;
    for (const { ratio, eligible = true } of ticks) {
      const step = stepHandAtMouth(state, ratio, eligible);
      state = step.state;
      if (step.entered) arrivals += 1;
    }
    return arrivals;
  };
  check("three separate trips are three arrivals",
    replay([{ ratio: 2 }, { ratio: 0.3 }, { ratio: 2 }, { ratio: 0.3 }, { ratio: null }, { ratio: 0.3 }]), 3);
  check("a hand resting at the mouth for many ticks is one",
    replay([{ ratio: 0.3 }, { ratio: 0.4 }, { ratio: 0.3 }, { ratio: 0.42 }, { ratio: 0.3 }]), 1);
  check("hovering across the arrival line does not flap (hysteresis)",
    replay([{ ratio: 0.4 }, { ratio: 0.6 }, { ratio: 0.4 }, { ratio: 0.7 }, { ratio: 0.4 }]), 1);
  check("a tick with no mouth reading neither enters nor leaves",
    replay([{ ratio: 0.3 }, { ratio: null, eligible: false }, { ratio: 0.3 }]), 1);
  check("a hand never near the mouth is zero", replay([{ ratio: 2 }, { ratio: 1.2 }, { ratio: null }]), 0);

  check("three arrivals in a stretch form a run", groupHandAtMouthEvents([130, 150, 170, 210]), [{ start_s: 130, end_s: 210, events: 4 }]);
  check("two arrivals are not repeated", groupHandAtMouthEvents([130, 150]), []);
  check("a sip an hour apart does not chain", groupHandAtMouthEvents([100, 500, 900]), []);
  check("two distinct runs stay distinct",
    groupHandAtMouthEvents([10, 20, 30, 300, 310, 320]),
    [{ start_s: 10, end_s: 30, events: 3 }, { start_s: 300, end_s: 320, events: 3 }]);
}

console.log("\n10. Mouth movement is energy, gated on not speaking");
{
  const deltas = (ticks: Array<{ jaw: number | null; speaking?: boolean; t: number }>) => {
    let state = { lastJaw: null as number | null, lastSpeakingS: null as number | null };
    const out: Array<number | null> = [];
    for (const { jaw, speaking = false, t } of ticks) {
      const step = stepMouthMovement(state, jaw, speaking, t);
      state = step.state;
      out.push(step.delta === null ? null : +step.delta.toFixed(2));
    }
    return out;
  };
  check("silent movement yields absolute deltas",
    deltas([{ jaw: 0.1, t: 0 }, { jaw: 0.3, t: 0.33 }, { jaw: 0.1, t: 0.67 }]), [null, 0.2, 0.2]);
  check("speech contributes nothing",
    deltas([{ jaw: 0.1, t: 0, speaking: true }, { jaw: 0.5, t: 0.33, speaking: true }]), [null, null]);
  check("the tail of a turn is excluded, then counting restarts",
    deltas([{ jaw: 0.5, t: 0, speaking: true }, { jaw: 0.1, t: 0.33 }, { jaw: 0.1, t: 1.0 }, { jaw: 0.1, t: 1.6 }, { jaw: 0.3, t: 2 }]),
    [null, null, null, null, 0.2]);
  check("a missed face breaks the chain instead of spanning it",
    deltas([{ jaw: 0.1, t: 0 }, { jaw: null, t: 0.33 }, { jaw: 0.5, t: 0.67 }]), [null, null, null]);

  // Same mean movement whichever rhythm produced it. This is the property that
  // makes it energy: no assertion anywhere here reads a period off the samples.
  const series = (hz: number) => Array.from({ length: 30 }, (_, i) => 0.25 + 0.2 * Math.sin(2 * Math.PI * hz * (i / 3)));
  const energy = (values: number[]) => values.slice(1).reduce((s, v, i) => s + Math.abs(v - values[i]), 0) / (values.length - 1);
  for (const hz of [1.0, 1.3, 1.7, 2.0]) {
    console.log(`  info ${hz} Hz jaw motion sampled at 3 Hz: energy ${energy(series(hz)).toFixed(3)}`);
    check(`${hz} Hz motion clears the 0.04 trip at 3 Hz sampling`, energy(series(hz)) > 0.04, true);
  }
  check("a still jaw does not", energy(Array.from({ length: 30 }, () => 0.1)) > 0.04, false);

  const win = (sum: number, samples: number, startS: number) => ({
    startS, endS: startS + 5, processed: 15, detected: 15, forward: 15, centered: 15, multiFace: 0,
    movementMean: 0, poseProcessed: 0, driftMean: 0, gestureSum: 0, gestureSamples: 0, handsDetected: 0,
    nearFaceCount: 0, phoneCount: 0, phoneProcessed: 0, mouthMovementSum: sum, mouthMovementSamples: samples,
  });
  check("sustained windows form one episode",
    extractDescriptiveEpisodes([win(1.5, 14, 0), win(1.5, 14, 5), win(1.5, 14, 10), win(0, 14, 15)], VISUAL_DESCRIPTIVE_EPISODE_KINDS),
    [{ kind: "mouth_movement_silent", start_s: 0, end_s: 15, severity: 1 }]);
  check("one 5 s burst is below the 10 s episode minimum",
    extractDescriptiveEpisodes([win(1.5, 14, 0), win(0, 14, 5), win(0, 14, 10)], VISUAL_DESCRIPTIVE_EPISODE_KINDS), []);
  check("a window that is mostly speech cannot trip",
    extractDescriptiveEpisodes([win(1, 4, 0), win(1, 4, 5), win(1, 4, 10)], VISUAL_DESCRIPTIVE_EPISODE_KINDS), []);
}

console.log("\n11. not_measured declares these until they really ran");
{
  const measured = (over = {}) => computeConductSignalsMeasured({
    handSamples: 300, handsDetectedSamples: 40, expectedHandsSamples: 300,
    mouthEligibleHandSamples: 280, jawSamples: 590, faceDetectedSamples: 600, ...over,
  });
  check("both ran", measured(), { offensiveGestures: true, eating: true });
  check("hands seen only 13% of ticks still counts: raised to eat, the exact case",
    measured({ handsDetectedSamples: 40 }).eating, true);
  check("worker never ran", measured({ handSamples: 0, handsDetectedSamples: 0, mouthEligibleHandSamples: 0, jawSamples: 0 }),
    { offensiveGestures: false, eating: false });
  check("hands never in frame", measured({ handsDetectedSamples: 0 }), { offensiveGestures: false, eating: false });
  check("no blendshapes: hand shape measured, eating not", measured({ jawSamples: 0 }), { offensiveGestures: true, eating: false });
  check("face mostly gone: eating not", measured({ mouthEligibleHandSamples: 30 }), { offensiveGestures: true, eating: false });
  check("a declared session lists both",
    resolveNotMeasured({ handSignals: true, postureSignals: true, phone: true, offensiveGestures: false, eating: false }),
    ["offensive_gestures", "eating", "background_environment", "fidgeting"]);
}

console.log("\n12. Ingest round trip and rendering");
const coverage = {
  session_seconds: 600, track_live_seconds: 600, expected_samples: 1800, processed_samples: 1800,
  face_detected_samples: 1790, speaking_samples: 900, listening_samples: 900, capture_offset_s: 10,
  sample_hz: 6, analyzer_error: false,
};
const fixture: VisualMetrics = {
  eye_contact_pct: 88, attentiveness_pct: 90, camera_centered_pct: 95, face_presence_pct: 99,
  lighting_ok: true, posture_flags: [],
  not_measured: ["background_environment", "fidgeting"],
  episodes: [],
  coverage,
  observations: {
    phone_visible_seconds: 0,
    posture_shoulder_tilt_deg: 3,
    posture_forward_head_offset: 0.7,
    hand_at_mouth_events: 9,
    mouth_movement_silent_seconds: 90,
    food_or_drink_visible_seconds: 40,
    middle_finger_extended_seconds: 2,
    episodes: [
      { kind: "hand_at_mouth_repeated", start_s: 120, end_s: 210, severity: 1 },
      { kind: "mouth_movement_silent", start_s: 125, end_s: 215, severity: 0.9 },
      { kind: "middle_finger_extended", start_s: 300, end_s: 302, severity: 1 },
    ],
  },
};
{
  const parsed = parseMetricsPayload({ cameraMode: "ON", visual: fixture, vocal: null }).visual!;
  check("the observations block round-trips unchanged", parsed.observations, fixture.observations);
  check("a real not_measured entry survives the allowlist",
    parseMetricsPayload({ cameraMode: "ON", visual: { ...fixture, not_measured: ["eating", "offensive_gestures", "made_up"] }, vocal: null }).visual!.not_measured,
    ["eating", "offensive_gestures"]);
  check("an unknown descriptive kind is dropped",
    parseMetricsPayload({ cameraMode: "ON", visual: { ...fixture, observations: { ...fixture.observations, episodes: [{ kind: "you_were_eating", start_s: 1, end_s: 2, severity: 1 }] } }, vocal: null }).visual!.observations!.episodes,
    []);
  const legacy = { ...fixture.observations } as Record<string, unknown>;
  for (const key of ["hand_at_mouth_events", "mouth_movement_silent_seconds", "food_or_drink_visible_seconds", "middle_finger_extended_seconds"]) delete legacy[key];
  const legacyOut = parseMetricsPayload({ cameraMode: "ON", visual: { ...fixture, observations: { ...legacy, episodes: [] } }, vocal: null }).visual!.observations!;
  check("a block without the new fields is not given flattering zeros", "hand_at_mouth_events" in legacyOut, false);
  check("no field in the block can carry an array of landmarks",
    Object.values(parsed.observations!).filter(Array.isArray).length, 1);
  check("a landmark array smuggled in is not stored",
    "landmarks" in parseMetricsPayload({ cameraMode: "ON", visual: { ...fixture, observations: { ...fixture.observations, landmarks: [{ x: 0.1 }] } }, vocal: null }).visual!.observations!,
    false);

  const rows = visualObservationRows(parsed);
  const value = (label: string) => rows.find((r) => r.label === label)?.value;
  check("hand row: motion and time, offset into session time", value("Hand at mouth"), "Repeatedly, 2:10\u2060–\u20603:40 (9 times in all)");
  check("mouth row", value("Mouth movement"), "While not speaking, 2:15\u2060–\u20603:45");
  check("hand shape row", value("Hand shape"), "Middle finger extended, others curled, 5:10\u2060–\u20605:12");
  check("cup row only as support", value("Cup, bottle or food in frame"), "Visible for about 40 seconds");
  const text = rows.map((r) => r.value).join(" ").toLowerCase();
  check("no row names a cause", /eating|chewing|obscene|offensive|rude|snack/.test(text), false);

  const clean: VisualMetrics = { ...parsed, observations: { ...parsed.observations!, episodes: [], hand_at_mouth_events: 0, middle_finger_extended_seconds: 0 } };
  const cleanLabels = visualObservationRows(clean).map((r) => r.label);
  check("a session that tripped nothing reports no absence",
    cleanLabels.some((l) => ["Hand at mouth", "Mouth movement", "Hand shape", "Cup, bottle or food in frame"].includes(l)), false);
  check("a cup with nothing else is not shown",
    visualObservationRows({ ...clean, observations: { ...clean.observations!, food_or_drink_visible_seconds: 300 } }).some((r) => r.label.startsWith("Cup")), false);
  check("the caveat travels with the rows", visualObservationCaveat(parsed)?.includes("Sipping water"), true);
  check("and only with them", visualObservationCaveat(clean), null);
  check("timeline carries them as observation-group rows",
    timelineRows(parsed).map((r) => [r.group, r.value]),
    [["observation", "Hand at mouth repeatedly"], ["observation", "Mouth moving while not speaking"], ["observation", "Middle finger extended, others curled"]]);

  const stripped: VisualMetrics = { ...parsed, observations: undefined };
  check("NEVER SCORED: the Visual bands are identical with and without them",
    visualBands(parsed), visualBands(stripped));
  check("NEVER SCORED: the body-language bands are identical too",
    visualBodyLanguageBands(parsed), visualBodyLanguageBands(stripped));
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
