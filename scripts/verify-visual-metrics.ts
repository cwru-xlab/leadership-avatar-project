/**
 * Throwaway verification for the Stage 1 visual-metrics correctness pass.
 *
 * Run: npx tsx scripts/verify-visual-metrics.ts
 *
 * Covers only the pure surface — rate arithmetic, scorability, band
 * rendering, and server-side sanitising. The parts that need a real camera
 * (GPU delegate, primary-face selection under two people, frame budget) are
 * covered by the live walkthroughs in the plan, not here.
 */
import {
  computeVisualRates,
  computeGestureRates,
  computeHandsUsable,
  computeObservations,
  computePostureBaseline,
  computePostureDrift,
  computePostureSignalsMeasured,
  extractDescriptiveEpisodes,
  extractEpisodes,
  filterUnreadableBodyLanguageEpisodes,
  type CaptureWindow,
  type GestureCounts,
  type ObservationCounts,
  type PostureBaseline,
  type PostureReading,
  type VisualSampleCounts,
} from "../lib/metrics/visual-capture";
import { isLandmarkObservedInFrame } from "../lib/metrics/landmark-visibility";
import { resolveVisualOutcome, isPoorVisualCoverage } from "../lib/metrics/coverage";
import {
  visualBands,
  visualBodyLanguageBands,
  visualObservationRows,
  timelineRows,
  episodeBand,
} from "../lib/metrics/bands";
import { parseMetricsPayload } from "../lib/metrics/ingest";
import {
  VISUAL_DESCRIPTIVE_EPISODE_KINDS,
  VISUAL_EPISODE_KINDS,
  VISUAL_NOT_MEASURED,
  resolveNotMeasured,
  type VisualCoverage,
  type VisualDescriptiveObservations,
  type VisualMetrics,
} from "../lib/metrics/types";
import {
  PHONE_MIN_VISIBLE_S,
  POSTURE_BASELINE_MIN_SAMPLES,
  POSTURE_BASELINE_WINDOW_S,
  POSTURE_DRIFT_SUSTAINED_S,
  POSTURE_DRIFT_TRIP,
  POSTURE_FORWARD_HEAD_DRIFT_SCALE,
  POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG,
} from "../lib/metrics/body-thresholds";

let failures = 0;

function bandFor(rows: { label: string; value: string }[], label: string) {
  return rows.find((r) => r.label === label)?.value ?? "<missing>";
}

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

function counts(over: Partial<VisualSampleCounts> = {}): VisualSampleCounts {
  return {
    processedSamples: 0,
    faceDetectedSamples: 0,
    centeredSamples: 0,
    multipleFacesSamples: 0,
    forwardFacingSamples: 0,
    listeningSamples: 0,
    listeningForwardSamples: 0,
    ...over,
  };
}

function coverage(over: Partial<VisualCoverage> = {}): VisualCoverage {
  return {
    session_seconds: 600,
    track_live_seconds: 600,
    expected_samples: 3600,
    processed_samples: 3600,
    face_detected_samples: 3600,
    speaking_samples: 1800,
    listening_samples: 1800,
    capture_offset_s: 12,
    sample_hz: 6,
    analyzer_error: false,
    ...over,
  };
}

function visual(over: Partial<VisualMetrics> = {}): VisualMetrics {
  return {
    eye_contact_pct: 70,
    attentiveness_pct: 80,
    camera_centered_pct: 90,
    face_presence_pct: 95,
    lighting_ok: true,
    posture_flags: [],
    not_measured: [...VISUAL_NOT_MEASURED],
    episodes: [],
    coverage: coverage(),
    ...over,
  };
}

console.log("\n1. Rate arithmetic — the reported production failure");
// 10-minute session, face visible only a fifth of the time, but centred
// whenever it WAS visible. The old denominator (face_detected_samples)
// reported 100% and the report told the student "Consistently centred".
{
  const c = counts({
    processedSamples: 3600,
    faceDetectedSamples: 720,
    centeredSamples: 720,
    forwardFacingSamples: 720,
    listeningSamples: 1800,
    listeningForwardSamples: 360,
  });
  const r = computeVisualRates(c);
  check("camera_centered_pct is 20, not 100", r.cameraCenteredPct, 20);
  check("face_presence_pct is 20", r.facePresencePct, 20);
  check("framing bands as Often off-frame",
    bandFor(visualBands(visual({ camera_centered_pct: r.cameraCenteredPct })), "Framing"),
    "Often off-frame");
  check("on-camera bands as Often absent",
    bandFor(visualBands(visual({ face_presence_pct: r.facePresencePct })), "On camera"),
    "Often absent");
}

// A genuinely well-framed student must NOT be punished by the new denominator.
{
  const r = computeVisualRates(counts({
    processedSamples: 3600,
    faceDetectedSamples: 3550,
    centeredSamples: 3500,
    forwardFacingSamples: 2700,
    listeningSamples: 1800,
    listeningForwardSamples: 1600,
  }));
  // 75% forward gaze, 97% centred, 99% present.
  const goodRows = visualBands(visual({
    eye_contact_pct: r.eyeContactPct,
    camera_centered_pct: r.cameraCenteredPct,
    face_presence_pct: r.facePresencePct,
  }));
  check("good session still bands well",
    ["Eye contact", "Framing", "On camera"].map((l) => bandFor(goodRows, l)),
    ["Strong", "Consistently centred", "Present throughout"]);
}

check("zero processed samples never divides by zero",
  computeVisualRates(counts()), {
    eyeContactPct: 0, attentivenessPct: 0, cameraCenteredPct: 0,
    facePresencePct: 0, multipleFacesRatio: 0,
  });

console.log("\n2. Scorability invariants (REQ-41/42)");
check("live pipeline that saw NO face is still scored",
  resolveVisualOutcome("ON", visual({
    face_presence_pct: 0,
    coverage: coverage({ face_detected_samples: 0 }),
  })),
  { scored: true, reason: null });
check("camera off is an opt-out, not a failure",
  resolveVisualOutcome("OFF", null), { scored: false, reason: "CAMERA_OFF_OPTOUT" });
check("dead track is insufficient data",
  resolveVisualOutcome("ON", visual({ coverage: coverage({ track_live_seconds: 60 }) })),
  { scored: false, reason: "INSUFFICIENT_DATA" });
check("poor-coverage disclosure still independent of scoring",
  isPoorVisualCoverage(visual({ coverage: coverage({ face_detected_samples: 720 }) })), true);

console.log("\n2b. Four-model schedule-aware coverage (12-05 starvation regression)");
// A live checkpoint caught a real, deterministic production bug here:
// `processedSamples` only ever counts FACE ticks, but once pose/hands/object
// share the tick stream, `expected_samples` must be scaled to face's OWN
// schedule share, not the raw (all-model) tick count — otherwise a
// perfectly healthy face capture rate is structurally pinned below
// PROCESSED_RATIO_FLOOR (0.5) and every camera-on session reports an empty
// Visual block. This was only reachable through a live camera before this
// test existed; see `lib/metrics/visual-capture.ts`'s `expectedSamples`
// comment for the fix itself.
check("a healthy four-model session (expected scaled to face's own schedule share) is still scored",
  resolveVisualOutcome("ON", visual({
    coverage: coverage({
      track_live_seconds: 600,
      expected_samples: 1800,
      processed_samples: 1790,
      face_detected_samples: 1790,
    }),
  })),
  { scored: true, reason: null });
check("the UNSCALED pre-fix accounting would have wrongly starved this same healthy session",
  resolveVisualOutcome("ON", visual({
    coverage: coverage({
      track_live_seconds: 600,
      // Pre-fix: expected_samples came from the WHOLE tick stream
      // (trackLiveSeconds * METRICS_SAMPLE_HZ) with no schedule-share
      // scaling. Reproduced here literally as a historical marker of the
      // bug's shape, NOT current production behaviour.
      expected_samples: 3600,
      processed_samples: 1790,
      face_detected_samples: 1790,
    }),
  })),
  { scored: false, reason: "INSUFFICIENT_DATA" });

console.log("\n3. Band rendering");
check("multi-face flag surfaces on its own row",
  visualBands(visual({ posture_flags: ["multiple_faces_detected"] }))
    .find((b) => b.label === "Others in frame"),
  { label: "Others in frame", value: "Another person detected" });
check("multi-face does NOT leak into Steadiness",
  visualBands(visual({ posture_flags: ["multiple_faces_detected"] }))
    .find((b) => b.label === "Steadiness"),
  { label: "Steadiness", value: "Steady" });
check("clean session says Just you",
  visualBands(visual()).find((b) => b.label === "Others in frame"),
  { label: "Others in frame", value: "Just you" });

// A pre-Phase-10.1 row reaches bands through a cast and genuinely lacks the
// new fields. It must render nothing for them rather than invent "Often
// absent" for a metric that was never captured.
{
  const legacy = {
    eye_contact_pct: 70, camera_centered_pct: 90, lighting_ok: true,
    posture_flags: [], coverage: coverage(),
  } as unknown as VisualMetrics;
  const rows = visualBands(legacy);
  check("legacy row omits On camera", rows.some((b) => b.label === "On camera"), false);
  check("legacy row omits Others in frame", rows.some((b) => b.label === "Others in frame"), false);
  check("legacy row emits no undefined", rows.every((b) => typeof b.value === "string" && b.value.length > 0), true);
}

console.log("\n4. Server-side sanitising (REQ-38)");
{
  const parsed = parseMetricsPayload({
    cameraMode: "ON",
    visual: { ...visual(), not_measured: ["fidgeting", "mind_reading"], posture_flags: ["high_head_movement", "slouching"] },
    vocal: null,
  });
  check("unknown not_measured entry dropped", parsed.visual?.not_measured, ["fidgeting"]);
  check("unknown posture flag dropped", parsed.visual?.posture_flags, ["high_head_movement"]);
}
check("media-shaped string still rejects the WHOLE payload",
  parseMetricsPayload({
    cameraMode: "ON",
    visual: { ...visual(), not_measured: ["data:image/png;base64,AAAA"] },
    vocal: null,
  }).visual, null);
check("face_presence_pct clamped to 0-100",
  parseMetricsPayload({ cameraMode: "ON", visual: { ...visual(), face_presence_pct: 999 }, vocal: null })
    .visual?.face_presence_pct, 100);

console.log("\n5. Whole-session eye contact + listening breakdown");
{
  // Steady while speaking, looking away while the avatar talks. Eye contact is
  // the SESSION figure, so it reflects both halves; Attention isolates the
  // listening half, which is the only place the problem is visible.
  const r = computeVisualRates(counts({
    processedSamples: 3600, faceDetectedSamples: 3600, centeredSamples: 3600,
    forwardFacingSamples: 1380,
    listeningSamples: 2400, listeningForwardSamples: 240,
  }));
  check("eye contact covers the whole session", r.eyeContactPct, 38);
  check("attention isolates the listening stretches", r.attentivenessPct, 10);
}
{
  // Fully typed session: nothing but listening. Eye contact must still be a
  // real whole-session figure rather than collapsing to zero.
  const r = computeVisualRates(counts({
    processedSamples: 1200, faceDetectedSamples: 1200, centeredSamples: 1200,
    forwardFacingSamples: 900,
    listeningSamples: 1200, listeningForwardSamples: 900,
  }));
  check("typed-only session still reports eye contact", r.eyeContactPct, 75);
  check("and matches attention, since it was all listening", r.attentivenessPct, 75);
  check("and remains scorable overall",
    resolveVisualOutcome("ON", visual({ coverage: coverage({ speaking_samples: 0 }) })),
    { scored: true, reason: null });
}
{
  // The thin-denominator guard moved with the denominator: a thin LISTENING
  // window is now the unreportable case. Eye contact is never omitted, since
  // its denominator is the whole session.
  const rows = visualBands(visual({ coverage: coverage({ listening_samples: 12 }) }));
  check("thin listening window omits Attention",
    rows.some((b) => b.label === "Attention"), false);
  check("but keeps Eye contact", bandFor(rows, "Eye contact"), "Strong");
  check("and keeps Framing", bandFor(rows, "Framing"), "Well centred");
}

console.log("\n6. Episode extraction");
function win(startS: number, over: Partial<CaptureWindow> = {}): CaptureWindow {
  return {
    startS, endS: startS + 5,
    processed: 30, detected: 30, forward: 30, centered: 30,
    multiFace: 0, movementMean: 0,
    // 12-06 body-language fields: zeroed by default so a fixture written for
    // the camera/environment kinds above cannot accidentally trip one of the
    // new body kinds too.
    poseProcessed: 0, driftMean: 0, gestureSum: 0, gestureSamples: 0,
    handsDetected: 0, nearFaceCount: 0, phoneCount: 0,
    phoneProcessed: 0,
    ...over,
  };
}
{
  // 90 seconds off camera in the middle of a clean session.
  const windows: CaptureWindow[] = [];
  for (let i = 0; i < 40; i++) {
    const absent = i >= 10 && i < 28; // 18 windows x 5s = 90s
    windows.push(win(i * 5, absent ? { detected: 0, forward: 0, centered: 0 } : {}));
  }
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const offCamera = eps.filter((e) => e.kind === "off_camera");
  check("one episode, not eighteen", offCamera.length, 1);
  check("spanning the right range", [offCamera[0].start_s, offCamera[0].end_s], [50, 140]);
  check("at full severity", offCamera[0].severity, 1);
}
{
  // A single glance back mid-absence must not shatter one episode into two.
  const windows: CaptureWindow[] = [];
  for (let i = 0; i < 20; i++) {
    const absent = i >= 4 && i < 14 && i !== 9;
    windows.push(win(i * 5, absent ? { detected: 0, forward: 0, centered: 0 } : {}));
  }
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS).filter((e) => e.kind === "off_camera");
  check("gap tolerance keeps the episode whole", eps.length, 1);
  check("and records it as less than fully solid", eps[0].severity < 1, true);
}
{
  // Below the minimum duration — noise, not behaviour.
  const windows = [win(0), win(5, { detected: 0, forward: 0, centered: 0 }), win(10), win(15)];
  check("short excursion is dropped",
    extractEpisodes(windows, VISUAL_EPISODE_KINDS).length, 0);
}
{
  const windows: CaptureWindow[] = [];
  for (let i = 0; i < 10; i++) windows.push(win(i * 5, { multiFace: 30 }));
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  check("a second person in frame is its own episode kind",
    eps.filter((e) => e.kind === "multiple_faces").length, 1);
}
check("no windows yields no episodes", extractEpisodes([], VISUAL_EPISODE_KINDS), []);

console.log("\n7. Episode + turn sanitising");
{
  const parsed = parseMetricsPayload({
    cameraMode: "ON",
    visual: { ...visual(), episodes: [
      { kind: "off_camera", start_s: 50, end_s: 140, severity: 1 },
      { kind: "telepathy", start_s: 0, end_s: 10, severity: 1 },
      { kind: "gaze_away", start_s: 90, end_s: 40, severity: 1 },
    ] },
    vocal: null,
  });
  check("unknown episode kind dropped", parsed.visual?.episodes.length, 1);
  check("backwards interval dropped, not swapped", parsed.visual?.episodes[0].kind, "off_camera");
}
{
  const many = Array.from({ length: 80 }, (_, i) => ({
    kind: "off_camera", start_s: i * 20, end_s: i * 20 + 15, severity: 1,
  }));
  check("episode array truncated at the cap",
    parseMetricsPayload({ cameraMode: "ON", visual: { ...visual(), episodes: many }, vocal: null })
      .visual?.episodes.length, 40);
}

console.log("\n8. Episode rendering");
check("episode times are shifted onto the session clock",
  episodeBand({ kind: "off_camera", start_s: 50, end_s: 140, severity: 1 }, 12),
  { label: "1:02\u20132:32", value: "Off camera" });
check("zero offset renders capture time unchanged",
  episodeBand({ kind: "multiple_faces", start_s: 0, end_s: 65, severity: 1 }),
  { label: "0:00\u20131:05", value: "Another person in frame" });

console.log("\n9. resolveNotMeasured");
// 12-08 Task 1 checkpoint: `fidgeting` is now PERMANENTLY in
// `VISUAL_NOT_MEASURED` (retired, not per-session conditional — see that
// constant's own comment in types.ts) and `resolveNotMeasured` no longer
// takes a `fidget` input at all; it appends "fidgeting" unconditionally,
// the same way it already does for "background_environment".
// hand_gestures/body_posture (12-06) and phone_checking (12-07) are the two
// remaining per-session conditional entries.
check("all-false input returns the full not-measured vocabulary",
  resolveNotMeasured({ handSignals: false, postureSignals: false, phone: false }),
  ["hand_gestures", "body_posture", "phone_checking", ...VISUAL_NOT_MEASURED]);
check("all-true input returns exactly the two permanent entries",
  resolveNotMeasured({ handSignals: true, postureSignals: true, phone: true }),
  ["background_environment", "fidgeting"]);
check("hand-only input keeps body_posture",
  resolveNotMeasured({ handSignals: true, postureSignals: false, phone: true })
    .includes("body_posture"),
  true);

console.log("\n10. visualBodyLanguageBands (scored)");
check("still session bands as Very still",
  bandFor(visualBodyLanguageBands(visual({ gesture_rate_per_min: 0.5 })), "Gesturing"),
  "Very still");
check("high-rate session bands as A lot of movement",
  bandFor(visualBodyLanguageBands(visual({ gesture_rate_per_min: 40 })), "Gesturing"),
  "A lot of movement");
check("mid session bands as Well judged",
  bandFor(visualBodyLanguageBands(visual({ gesture_rate_per_min: 10 })), "Gesturing"),
  "Well judged");
check("Measured from row present even with an empty signal array",
  bandFor(visualBodyLanguageBands(visual({ posture_signals_measured: [] })), "Measured from"),
  "Nothing — body not visible in frame");
// 12-08 Task 1 checkpoint, Defect A: a true 0% hands-near-face reading must
// get its own band, never fall into "Occasional" — a positive claim
// manufactured from an absence of occurrences (a real still session with
// hands detected but never near the face reported exactly this).
check("a genuine 0% hands-near-face reading bands as Not noticeably, not Occasional",
  bandFor(visualBodyLanguageBands(visual({ hands_near_face_pct: 0 })), "Hands near face"),
  "Not noticeably");
check("a nonzero below-trip reading still bands as Occasional",
  bandFor(visualBodyLanguageBands(visual({ hands_near_face_pct: 5 })), "Hands near face"),
  "Occasional");
check("at/above the trip threshold bands as Frequent",
  bandFor(visualBodyLanguageBands(visual({ hands_near_face_pct: 50 })), "Hands near face"),
  "Frequent");
// 12-08 Task 1 checkpoint, Defect A: posture_drift_mean genuinely ABSENT
// (the baseline never established — see POSTURE_BASELINE_MIN_SAMPLES's own
// fix) must never produce a "Posture drift" row at all, let alone a "Held
// steady" verdict manufactured from the absence. The real still session
// this caught had posture_signals_measured non-empty (two signals had
// enough SESSION-WIDE visible samples) while posture_drift_mean was
// genuinely absent (the baseline window itself never reached
// POSTURE_BASELINE_MIN_SAMPLES) — reproduced here exactly as that
// combination, not just an all-absent payload.
check("posture_drift_mean absent (even with posture_signals_measured present) yields no Posture drift row anywhere",
  visualBodyLanguageBands(
    visual({ posture_signals_measured: ["shoulder_line", "forward_head"] })
  ).some((r) => r.label === "Posture drift" || r.value.includes("steady") || r.value.includes("Shifted")),
  false);
{
  // A Phase 10-shaped payload genuinely lacks every Phase 12 field. Rows for
  // absent fields must be omitted, never defaulted to 0.
  const phase10Shaped = visual();
  const rows = visualBodyLanguageBands(phase10Shaped);
  check("Phase 10-shaped payload yields no body-language rows at all", rows, []);
}

console.log("\n10b. 12-09 — item-7 sign-off failure: coverage gate + episode silence");
{
  // THE EXACT FAILING SESSION (12-09-PLAN.md's <observed_failure>, Session
  // B): Moments timeline read a single `0:01-2:45 [Camera] Off camera` row —
  // ~165s session, body essentially never usably visible — yet reported
  // "Posture drift: Held steady", "Measured from: Shoulder line and Head
  // position", "Gesturing: Very still", "Hands near face: Frequent". Root
  // cause: a brief in-frame glimpse cleared the OLD absolute floor
  // (`POSTURE_BASELINE_MIN_SAMPLES`/`handSamples > 0`) alone. Reproduced
  // here as a glimpse that STILL clears that absolute floor (15 samples —
  // exactly the number that defeated the old gate) but falls far short of
  // the new proportional one.
  const sessionSeconds = 165;
  // Schedule-aware expected count for a quarter-share model over 165s at
  // 6 Hz: floor(165 * 6 * 0.25) = 247 — same arithmetic `stop()` performs
  // for `expectedPoseSamples`/`expectedHandsSamples`.
  const expectedPoseSamples = Math.floor(sessionSeconds * 6 * 0.25);
  const expectedHandsSamples = expectedPoseSamples;
  const glimpseSamples = POSTURE_BASELINE_MIN_SAMPLES; // 15 — clears the OLD absolute floor alone.

  const poseVisibleSamples = {
    shoulder_line: glimpseSamples,
    forward_head: glimpseSamples,
    torso_lean: 0,
    torso_openness: 0,
  };
  const postureSignalsMeasured = computePostureSignalsMeasured(
    poseVisibleSamples,
    expectedPoseSamples
  );
  check(
    "item-7 replay: a brief glimpse clearing the OLD absolute floor alone no longer measures posture",
    postureSignalsMeasured,
    []
  );

  const handsUsable = computeHandsUsable(glimpseSamples, expectedHandsSamples);
  check(
    "item-7 replay: the same brief glimpse no longer makes hands usable either",
    handsUsable,
    false
  );

  // The rendered report for this producer output: no "Posture drift" row,
  // "Measured from" names nothing, and no Gesturing/Hands-near-face rows
  // (the producer omits those fields entirely when `handsUsable` is false —
  // reproduced here by simply not setting them, matching `stop()`'s
  // `...(handsUsable ? {...} : {})` spread).
  const rendered = visualBodyLanguageBands(
    visual({
      posture_signals_measured: postureSignalsMeasured,
      // The baseline/drift machinery can still calibrate from the SAME
      // glimpse, entirely independently of the session-wide coverage gate
      // above (Task 1's Defect 2) — reproduced here with a real number,
      // not left absent, so this assertion exercises the renderer's own
      // independent refusal, not merely an absent-field omission.
      posture_drift_mean: 0.1,
    })
  );
  check(
    "item-7 replay: NO Posture drift verdict row is rendered",
    rendered.some((r) => r.label === "Posture drift"),
    false
  );
  check(
    'item-7 replay: "Measured from" says the body was not visible',
    bandFor(rendered, "Measured from"),
    "Nothing — body not visible in frame"
  );
  check(
    "item-7 replay: no Gesturing row is rendered (producer omits it when hands are unreadable)",
    rendered.some((r) => r.label === "Gesturing"),
    false
  );
  check(
    "item-7 replay: no Hands near face row is rendered either",
    rendered.some((r) => r.label === "Hands near face"),
    false
  );

  // No posture episode (Moments row / Growth Area) survives either — Task 1
  // item 5's audit, exercised through its own pure seam.
  const rawEpisodes = [
    { kind: "posture_drift" as const, start_s: 0, end_s: 15, severity: 1 },
    { kind: "excessive_gesturing" as const, start_s: 20, end_s: 35, severity: 1 },
    { kind: "off_camera" as const, start_s: 0, end_s: 165, severity: 1 },
  ];
  const filtered = filterUnreadableBodyLanguageEpisodes(rawEpisodes, {
    postureReadable: postureSignalsMeasured.length > 0,
    handsReadable: handsUsable,
  });
  check(
    "item-7 replay: no posture episode survives the unreadable-signal filter",
    filtered.some((e) => e.kind === "posture_drift"),
    false
  );
  check(
    "item-7 replay: no gesturing episode survives it either",
    filtered.some((e) => e.kind === "excessive_gesturing"),
    false
  );
  check(
    "item-7 replay: an UNRELATED episode kind (off_camera) is left alone",
    filtered.some((e) => e.kind === "off_camera"),
    true
  );
}
{
  // THE REQ-51 COUNTER-ASSERTION — the overcorrection guard. A PARTIALLY
  // visible body: shoulder_line comfortably clears the new ratio,
  // forward_head does not. The session must still score what WAS visible,
  // name exactly that signal in "Measured from", and must NOT be skipped
  // just because one sibling signal fell short.
  const sessionSeconds = 165;
  const expectedPoseSamples = Math.floor(sessionSeconds * 6 * 0.25); // 247
  const poseVisibleSamples = {
    // Comfortably above 25% of 247 (~62) — a genuinely half-visible body,
    // shoulders readable for a solid majority of the session.
    shoulder_line: 200,
    // Clears the absolute floor (15) but well under the 25% ratio (~62) —
    // visible occasionally, not usably, e.g. the student turned enough that
    // the ears/nose were rarely both in frame.
    forward_head: 20,
    torso_lean: 0,
    torso_openness: 0,
  };
  const postureSignalsMeasured = computePostureSignalsMeasured(
    poseVisibleSamples,
    expectedPoseSamples
  );
  check(
    "REQ-51 counter-assertion: the clearly-visible signal is still measured",
    postureSignalsMeasured,
    ["shoulder_line"]
  );
  check(
    "REQ-51 counter-assertion: measured from names exactly that signal, not none and not both",
    bandFor(
      visualBodyLanguageBands(visual({ posture_signals_measured: postureSignalsMeasured })),
      "Measured from"
    ),
    "Shoulder line"
  );
  // The handsy sibling: well above the ratio, hands genuinely usable.
  const handsUsable = computeHandsUsable(200, expectedPoseSamples);
  check(
    "REQ-51 counter-assertion: a genuinely well-visible hands signal is NOT skipped",
    handsUsable,
    true
  );
}

console.log(
  "\n10c. 12-10 — the extrapolated out-of-frame skeleton, from the real Task 2 readings"
);
{
  // PROVENANCE OF EVERY NUMBER BELOW. These are the session aggregates the
  // user dumped on 2026-10-03 with `NEXT_PUBLIC_VISUAL_LANDMARK_DEV_DUMP=1`
  // (12-10 Task 2; the dump was removed in Task 3, the readings are recorded
  // in `12-TUNING.md`). The COUNTS are transcribed, not invented.
  //
  // What was captured was the per-signal aggregate split — in-frame vs
  // out-of-frame counts over total pose ticks — NOT the raw per-landmark x/y
  // coordinates. So the coordinates used in the per-tick predicate assertion
  // further down are ILLUSTRATIVE of the out-of-frame condition those
  // aggregates establish, and are labelled as such; they are not transcribed
  // readings. Every session-level assertion uses the transcribed counts
  // directly.
  //
  //   Session A — OFF CAMERA, one arm in shot. Face presence, eye contact and
  //   centering all recorded at 0%. 143 pose ticks. This is the session that
  //   defeated 12-08 ("Held steady") and 12-09 ("Shifted from the opening
  //   posture"), and it is item 1 of the sign-off.
  //     signal          visible+inFrame   visible+OUT of frame
  //     forward_head          62                  78
  //     shoulder_line         21                  74
  //     torso_lean             5                  15
  //     torso_openness         5                  15
  //     hands: 234 ticks, 39 detected in frame, 41 detected OUT of frame
  //
  //   Session B — HALF IN FRAME, shoulders at the frame edge, torso cut off.
  //   Face visible 79%, eye contact 75%. 281 pose ticks. The REQ-51 side.
  //     forward_head         212                  69
  //     shoulder_line         16                 262
  //     torso_lean             1                   2
  //     torso_openness         1                   2
  //     hands: 282 ticks, 1 detected in frame, 0 out of frame
  const sessionA = {
    totalPoseTicks: 143,
    inFrame: { forward_head: 62, shoulder_line: 21, torso_lean: 5, torso_openness: 5 },
    // What the PRE-FIX `isVisible` counted: in-frame + out-of-frame, i.e.
    // every tick the model asserted a confident `visibility` for.
    visibleByScore: { forward_head: 140, shoulder_line: 95, torso_lean: 20, torso_openness: 20 },
    handsTicks: 234,
    handsDetectedInFrame: 39,
  };
  const sessionB = {
    totalPoseTicks: 281,
    inFrame: { forward_head: 212, shoulder_line: 16, torso_lean: 1, torso_openness: 1 },
    visibleByScore: { forward_head: 281, shoulder_line: 278, torso_lean: 3, torso_openness: 3 },
    handsTicks: 282,
    handsDetectedInFrame: 1,
  };

  // --- The per-tick predicate itself. A landmark the model extrapolated
  // OUTSIDE the frame is never observed, however confident the model is: this
  // is the half of the fix that lives in `isLandmarkObservedInFrame`. The
  // visibility scores here are high on purpose — that is the whole point, and
  // it is what the Session A aggregate proves happens (the pre-fix predicate
  // said "visible" for forward_head on 140 of 143 ticks while the face was
  // detected 0% of the session).
  const extrapolated = [
    { x: -0.21, y: 0.42, visibility: 0.94 }, // off the left edge
    { x: 1.18, y: 0.51, visibility: 0.88 }, // off the right edge
    { x: 0.47, y: -0.09, visibility: 0.97 }, // above the top edge
    { x: 0.52, y: 1.33, visibility: 0.91 }, // below the bottom edge
  ];
  extrapolated.forEach((landmark, i) => {
    check(
      `extrapolated landmark ${i} (x=${landmark.x}, y=${landmark.y}, visibility=${landmark.visibility}) is NOT observed`,
      isLandmarkObservedInFrame(extrapolated, i),
      false
    );
  });
  // REQ-51's direction, same predicate: a landmark genuinely in frame still
  // counts exactly as it did before, including hard on the frame's edge where
  // Session B's shoulders sat.
  const observed = [
    { x: 0.5, y: 0.5, visibility: 0.9 },
    { x: 0.0, y: 1.0, visibility: 0.6 }, // exactly on the edge — still in frame
  ];
  check(
    "a landmark genuinely in frame is still observed (REQ-51 direction)",
    [isLandmarkObservedInFrame(observed, 0), isLandmarkObservedInFrame(observed, 1)],
    [true, true]
  );
  check(
    "in frame but BELOW the visibility floor is still not observed (the floor is ANDed, not replaced)",
    isLandmarkObservedInFrame([{ x: 0.5, y: 0.5, visibility: 0.1 }], 0),
    false
  );
  check(
    "a degenerate NaN coordinate fails CLOSED, never counting as observed",
    isLandmarkObservedInFrame([{ x: NaN, y: 0.5, visibility: 0.99 }], 0),
    false
  );
  check(
    "a missing landmark is not observed",
    isLandmarkObservedInFrame([], 3),
    false
  );

  // --- SESSION A, the item-1 blocker: measures NOTHING. The numerator is the
  // in-frame count (what `poseVisibleSamples` holds now that `isVisible`
  // requires in-frame coordinates); the denominator is the session's own
  // expected pose-sample count, which equals its observed tick count to
  // within dropped ticks.
  const sessionAMeasured = computePostureSignalsMeasured(
    sessionA.inFrame,
    sessionA.totalPoseTicks
  );
  check(
    "Session A (off camera, one arm): NO posture signal is measured at all",
    sessionAMeasured,
    []
  );

  // BOTH HALVES OF THE FIX ARE LOAD-BEARING, and these two assertions are why
  // neither may be relaxed on its own.
  //
  // (a) The per-tick in-frame fix is load-bearing EVEN AT the new 0.60 ratio:
  // feed the PRE-FIX numerator (every tick the model called visible) and
  // Session A measures two signals again.
  check(
    "Session A: the PRE-FIX score-only numerator still measures two signals even at the 0.60 ratio",
    computePostureSignalsMeasured(sessionA.visibleByScore, sessionA.totalPoseTicks),
    ["shoulder_line", "forward_head"]
  );
  // (b) The ratio change is load-bearing even WITH the in-frame fix. 12-09's
  // ratio was 0.25 and Session A's forward_head is in frame on 62/143 = 43.4%
  // of ticks, so the per-tick fix alone would have reported "Head position"
  // as measured a third time. Arithmetic inlined deliberately — this asserts
  // what the SUPERSEDED 0.25 bound would do, which no current code path
  // should be able to produce.
  const PRE_FIX_RATIO_12_09 = 0.25;
  check(
    "Session A: 12-09's 0.25 ratio would STILL have measured forward_head from in-frame ticks alone",
    (Object.keys(sessionA.inFrame) as Array<keyof typeof sessionA.inFrame>).filter(
      (signal) =>
        sessionA.inFrame[signal] >= POSTURE_BASELINE_MIN_SAMPLES &&
        sessionA.inFrame[signal] >= sessionA.totalPoseTicks * PRE_FIX_RATIO_12_09
    ),
    ["forward_head"]
  );

  // Session A's hands: refused. 39 in-frame detections of 234 ticks = 16.7%.
  check(
    "Session A: hands are NOT usable (39 in-frame detections of 234 ticks)",
    computeHandsUsable(sessionA.handsDetectedInFrame, sessionA.handsTicks),
    false
  );
  // The numerator defect 12-10 found: 12-09 passed `handSamples`, the count of
  // ticks the MODEL RAN, which is ~100% of expected on any live session — so
  // its hands gate was inert and Session A kept "Gesturing: Well judged" and
  // "Hands near face: Frequent". This asserts the inertness directly, so a
  // future refactor cannot quietly reintroduce the wrong numerator.
  check(
    "Session A: 12-09's numerator (ticks the model RAN) left the hands gate wide open",
    computeHandsUsable(sessionA.handsTicks, sessionA.handsTicks),
    true
  );

  // Session A's rendered report: no verdict row of EITHER kind. 12-08 produced
  // a false "Held steady" here and 12-09 a false "Shifted from the opening
  // posture"; BOTH drift fields are set to real numbers below so this
  // exercises the renderer's own refusal rather than an absent field.
  //
  // 12-11 Task 3: `posture_drift_max_s` is now the field the row is gated on
  // and the verdict derived from, so it MUST be present in this fixture —
  // and present at a value that WOULD have tripped (20s, well above
  // POSTURE_DRIFT_SUSTAINED_S). Without it this check would still pass, but
  // for the wrong reason: an absent field rather than the coverage refusal it
  // exists to pin. A check that passes for the wrong reason is what 12-09's
  // own sign-off failure was made of.
  const sessionARendered = visualBodyLanguageBands(
    visual({
      posture_signals_measured: sessionAMeasured,
      posture_drift_mean: 0.42,
      posture_drift_max_s: 20,
    })
  );
  check(
    "Session A: no Posture drift verdict row — neither the 12-08 nor the 12-09 wording",
    sessionARendered.some((r) => r.label === "Posture drift"),
    false
  );
  check(
    'Session A: "Measured from" says the body was not visible',
    bandFor(sessionARendered, "Measured from"),
    "Nothing — body not visible in frame"
  );
  check(
    "Session A: no Gesturing row (the arm the pipeline could not properly see)",
    sessionARendered.some((r) => r.label === "Gesturing"),
    false
  );
  check(
    "Session A: no Hands near face row either",
    sessionARendered.some((r) => r.label === "Hands near face"),
    false
  );
  // And no Moments row / Growth Area survives: the eight body-language rows
  // 12-09's run printed for this session were posture-drift and gesturing
  // episodes, every one of them from a signal now declared unreadable.
  const sessionAEpisodes = filterUnreadableBodyLanguageEpisodes(
    [
      { kind: "posture_drift" as const, start_s: 27, end_s: 176, severity: 1 },
      { kind: "posture_drift" as const, start_s: 187, end_s: 229, severity: 1 },
      { kind: "excessive_gesturing" as const, start_s: 30, end_s: 50, severity: 1 },
      { kind: "minimal_gesturing" as const, start_s: 60, end_s: 80, severity: 1 },
      { kind: "hands_near_face" as const, start_s: 90, end_s: 110, severity: 1 },
      { kind: "off_camera" as const, start_s: 1, end_s: 260, severity: 1 },
    ],
    {
      postureReadable: sessionAMeasured.length > 0,
      handsReadable: computeHandsUsable(
        sessionA.handsDetectedInFrame,
        sessionA.handsTicks
      ),
    }
  );
  check(
    "Session A: the only surviving episode is the Off camera row itself",
    sessionAEpisodes.map((e) => e.kind),
    ["off_camera"]
  );

  // --- SESSION B, the REQ-51 counter-assertion: a genuinely half-visible
  // body is still scored on the ONE landmark group that was really in frame,
  // and is NOT skipped just because its siblings fell short.
  const sessionBMeasured = computePostureSignalsMeasured(
    sessionB.inFrame,
    sessionB.totalPoseTicks
  );
  check(
    "Session B (half in frame): forward_head IS still measured — 212/281 = 75.4% in frame",
    sessionBMeasured,
    ["forward_head"]
  );
  check(
    'Session B: "Measured from" names exactly that one signal',
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: sessionBMeasured,
          posture_drift_mean: 0.2,
          posture_drift_max_s: 0,
        })
      ),
      "Measured from"
    ),
    "Head position"
  );
  check(
    "Session B: a Posture drift verdict IS rendered — a partial body is scored, not skipped",
    visualBodyLanguageBands(
      visual({
          posture_signals_measured: sessionBMeasured,
          posture_drift_mean: 0.2,
          posture_drift_max_s: 0,
        })
    ).some((r) => r.label === "Posture drift"),
    true
  );
  // Session B's own live report printed "Measured from: Shoulder line and Head
  // position" while the shoulders were out of frame on 262 of the 278 ticks
  // the model called visible (94%). Dropping shoulder_line is the CORRECTION,
  // not a regression — asserted explicitly so nobody reads it as one.
  check(
    "Session B: shoulder_line is correctly NOT measured (16/281 = 5.7% in frame)",
    sessionBMeasured.includes("shoulder_line"),
    false
  );
  check(
    "Session B: the PRE-FIX numerator is what printed its over-claiming 'Shoulder line and Head position'",
    computePostureSignalsMeasured(sessionB.visibleByScore, sessionB.totalPoseTicks),
    ["shoulder_line", "forward_head"]
  );
  check(
    "Session B: hands are NOT usable either — 1 in-frame detection all session",
    computeHandsUsable(sessionB.handsDetectedInFrame, sessionB.handsTicks),
    false
  );
}

console.log(
  "\n10d. 12-11 — the posture-drift false negative, from the real Session A readings"
);
{
  // THE READING THIS SECTION REPLAYS. Session A, run by the user on
  // 2026-10-03 as 12-11 Task 2: fully in frame, well centred, upright for
  // ~20s, then a hard and unmistakable HELD slump. 108.0s, 162 pose ticks,
  // 131 of them post-baseline and all 131 scored. Signals measured:
  // shoulder_line + forward_head. Baseline (31 samples): tilt = 4.307 deg,
  // fwdHead = 0.7681.
  //
  // WHAT THE PIPELINE SAID: "Posture drift: Held steady from the opening
  // posture." That is the fourth consecutive wrong posture verdict in this
  // phase and the first one measured rather than guessed at.
  //
  // WHAT THE DUMP SHOWED — the signals could see the slump perfectly well:
  //   max per-signal delta  = 1.000 (forward_head, CLAMP-SATURATED) at t=55.9
  //   max shoulder_line     = 0.508 at t=53.9  (alone above the 0.5 trip)
  //   max per-tick drift    = 0.643 at t=107.1 (above the trip)
  //   sustained streak      = 12.0s above the trip
  //   posture_drift_mean    = 0.373  <-- the ONLY one of these the band read
  //
  // Two independent dilutions turned a saturated signal into "Held steady",
  // and this section pins both repairs against regression. Every raw number
  // below is from that console paste; none is constructed.
  const sessionABaseline = baselineFixture({
    shoulderTiltDeg: 4.307,
    forwardHeadOffset: 0.7681,
    signals: ["shoulder_line", "forward_head"],
    sampleCount: 31,
  });
  const round3 = (n: number | null) =>
    n === null ? null : Math.round(n * 1000) / 1000;
  // The aggregation as it stood before 12-11 Task 3, kept here so the
  // assertions can state the burial as an arithmetic FACT rather than assert
  // only the fixed behaviour. A test that shows only the new value cannot
  // demonstrate that the old one was wrong.
  const preFixMean = (perSignal: Partial<Record<string, number>>) => {
    const values = Object.values(perSignal).filter(
      (v): v is number => typeof v === "number"
    );
    return values.length === 0
      ? null
      : round3(values.reduce((sum, v) => sum + v, 0) / values.length);
  };

  // --- CAUSE 1: the cross-signal mean. t=33.4 of the real series, the tick
  // where the slump first bites: raw tilt=2.22, fwdHead=0.5999.
  const t334 = computePostureDrift(
    reading({ tS: 33.4, shoulderTiltDeg: 2.22, forwardHeadOffset: 0.5999 }),
    sessionABaseline
  );
  check(
    "Session A t=33.4: per-signal deltas reproduce the dump exactly",
    [round3(t334.perSignal.shoulder_line ?? null), round3(t334.perSignal.forward_head ?? null)],
    [0.139, 0.561]
  );
  check(
    "Session A t=33.4: the PRE-FIX cross-signal mean was 0.350 — the dump's own printed drift",
    preFixMean(t334.perSignal),
    0.35
  );
  check(
    "Session A t=33.4: that mean was BELOW the trip — a slumping tick scored as steady",
    (preFixMean(t334.perSignal) ?? 0) > POSTURE_DRIFT_TRIP,
    false
  );
  check(
    "Session A t=33.4: the worst axis is 0.561 and IS above the trip",
    round3(t334.driftMagnitude),
    0.561
  );
  check(
    "Session A t=33.4: the repaired aggregation trips on this tick",
    (t334.driftMagnitude ?? 0) > POSTURE_DRIFT_TRIP,
    true
  );

  // THE DECISIVE STRUCTURAL CASE, and the reason the mean was wrong IN KIND
  // rather than merely too lenient. A PURE slump — forward_head saturated at
  // the clamp ceiling, shoulder line perfectly still at its baseline —
  // averages to EXACTLY 0.500, which is not `> 0.5`. Under the mean, a
  // maximal single-axis slump was undetectable at ANY trip at or above 0.5,
  // so no amount of lowering POSTURE_DRIFT_TRIP could have fixed this.
  // Session A only reached a 0.643 peak because its shoulders happened to
  // move 0.286 as well; a student who slumps without tilting got nothing.
  const pureSlump = computePostureDrift(
    reading({ tS: 56, shoulderTiltDeg: 4.307, forwardHeadOffset: 0.4 }),
    sessionABaseline
  );
  check(
    "a PURE slump saturates forward_head at the clamp ceiling",
    round3(pureSlump.perSignal.forward_head ?? null),
    1
  );
  check(
    "...with the shoulder line exactly at baseline, contributing 0",
    round3(pureSlump.perSignal.shoulder_line ?? null),
    0
  );
  check(
    "...which the PRE-FIX mean collapsed to exactly 0.500 — NOT above a 0.5 trip",
    [preFixMean(pureSlump.perSignal), (preFixMean(pureSlump.perSignal) ?? 0) > POSTURE_DRIFT_TRIP],
    [0.5, false]
  );
  check(
    "...while the worst axis reports the full 1.0 the signal actually measured",
    round3(pureSlump.driftMagnitude),
    1
  );

  // THE SATURATION, recorded as an assertion so the limit is not forgotten:
  // 1.000 is the CLAMP, not a measurement. It says only that the offset moved
  // at least POSTURE_FORWARD_HEAD_DRIFT_SCALE (0.3) from baseline. A moderate
  // slump and an extreme one are indistinguishable above that point, so this
  // channel cannot support severity wording. See the scale's own comment.
  const moderate = computePostureDrift(
    reading({ forwardHeadOffset: 0.7681 - 0.31 }),
    sessionABaseline
  );
  const extreme = computePostureDrift(
    reading({ forwardHeadOffset: 0.7681 - 0.60 }),
    sessionABaseline
  );
  check(
    "forward_head SATURATES: a 0.31 and a 0.60 offset change are indistinguishable at 1.000",
    [round3(moderate.perSignal.forward_head ?? null), round3(extreme.perSignal.forward_head ?? null)],
    [1, 1]
  );

  // THE SIGN-INVERSION CORRECTION (12-10 overstated this; see
  // PoseDetectResult.forwardHeadOffset's comment). fwdHead DOES decrease
  // during a slump — the metric is a head-to-shoulder DISTANCE, not anterior
  // displacement — but drift scores the ABSOLUTE delta, so a decrease
  // registers exactly as strongly as an increase. The channel was never
  // blind; the defect is purely one of labelling.
  const dropped = computePostureDrift(
    reading({ forwardHeadOffset: 0.7681 - 0.15 }),
    sessionABaseline
  );
  const raised = computePostureDrift(
    reading({ forwardHeadOffset: 0.7681 + 0.15 }),
    sessionABaseline
  );
  check(
    "a DECREASING forward-head offset scores identically to an increase of the same size",
    [round3(dropped.perSignal.forward_head ?? null), round3(raised.perSignal.forward_head ?? null)],
    [0.5, 0.5]
  );

  // --- THE FALSE-POSITIVE SIDE. These four rows are from Session A's own
  // upright stretch and the slump's leading edge, and they are the ONLY clean
  // post-12-10 ordinary readings that exist: 12-TUNING.md's S1-S4 ordinary
  // sessions predate the frame-bounds gating and are contaminated by
  // extrapolated skeletons, so they cannot calibrate this side. The worst
  // axis must stay BELOW the trip for every one of them — a repair that
  // trips on sitting still is no better than one that never trips.
  const ordinaryRows: Array<[number, number, number, number]> = [
    // tS, raw tilt, raw fwdHead, expected worst-axis drift
    [21.4, 5.48, 0.7887, 0.078],
    [26.1, 5.3, 0.6975, 0.235],
    [32.7, 3.26, 0.6924, 0.252],
  ];
  for (const [tS, tilt, fwdHead, expected] of ordinaryRows) {
    const d = computePostureDrift(
      reading({ tS, shoulderTiltDeg: tilt, forwardHeadOffset: fwdHead }),
      sessionABaseline
    );
    check(
      `Session A t=${tS} (upright): worst axis is ${expected}, reproducing the dump`,
      round3(d.driftMagnitude),
      expected
    );
    check(
      `Session A t=${tS} (upright): stays below the trip — no false positive`,
      (d.driftMagnitude ?? 1) > POSTURE_DRIFT_TRIP,
      false
    );
  }

  // The scale constants are load-bearing in every number above. Pinned so a
  // change to either one surfaces here rather than silently re-deriving every
  // assertion in this section.
  check(
    "the scales these replays are computed against are the ones in the file",
    [POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG, POSTURE_FORWARD_HEAD_DRIFT_SCALE],
    [15, 0.3]
  );

  // --- CAUSE 2: the session-wide mean, and THE TRAP IN THE OBVIOUS FIX.
  // Session A's streak above the trip measured 12.0s under the OLD
  // cross-signal mean. POSTURE_DRIFT_SUSTAINED_S was 15. Had the band simply
  // been switched from posture_drift_mean onto posture_drift_max_s without
  // re-deriving that constant, this genuine held slump would STILL have
  // reported "Held steady" — a second silent false negative one layer down,
  // with the aggregation repair appearing to have done nothing.
  check(
    "THE TRAP: the sustained floor sits BELOW Session A's measured 12.0s streak",
    POSTURE_DRIFT_SUSTAINED_S <= 12,
    true
  );
  const sessionAMeasuredSignals = ["shoulder_line", "forward_head"] as const;
  check(
    "Session A: the slump is finally reported — the verdict this whole plan exists for",
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: [...sessionAMeasuredSignals],
          posture_drift_mean: 0.373,
          posture_drift_max_s: 12,
        })
      ),
      "Posture drift"
    ),
    "Shifted from the opening posture"
  );
  check(
    'Session A: "Measured from" still names both signals — REQ-51 has not regressed',
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: [...sessionAMeasuredSignals],
          posture_drift_mean: 0.373,
          posture_drift_max_s: 12,
        })
      ),
      "Measured from"
    ),
    "Shoulder line and Head position"
  );

  // THE REGRESSION PIN FOR THE STATISTIC SWAP. These two assertions are a
  // matched pair and only mean something together: the verdict must follow
  // the SUSTAINED STREAK and must be indifferent to the session MEAN. Reading
  // the mean is the specific defect that produced the item-3 false negative,
  // and posture_drift_mean is still on the payload, so nothing but an
  // assertion stops a future change from quietly reaching for it again.
  check(
    "a damning session MEAN with no sustained streak says Held steady — the mean is NOT read",
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: [...sessionAMeasuredSignals],
          posture_drift_mean: 0.95,
          posture_drift_max_s: 0,
        })
      ),
      "Posture drift"
    ),
    "Held steady from the opening posture"
  );
  check(
    "a low session MEAN with a long sustained streak says Shifted — the streak IS read",
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: [...sessionAMeasuredSignals],
          posture_drift_mean: 0.05,
          posture_drift_max_s: 30,
        })
      ),
      "Posture drift"
    ),
    "Shifted from the opening posture"
  );

  // The duration requirement is the other half of the worst-axis change and
  // the reason taking a max is safe: a momentary excursion on one axis
  // (reaching for water, glancing at a note) must not become a verdict. At
  // pose's confirmed ~1.5 Hz, the 8s floor demands ~12 consecutive ticks
  // above the trip, and noise does not hold for 8 seconds.
  check(
    "a brief single excursion below the sustained floor is NOT reported as a shift",
    bandFor(
      visualBodyLanguageBands(
        visual({
          posture_signals_measured: [...sessionAMeasuredSignals],
          posture_drift_mean: 0.4,
          posture_drift_max_s: POSTURE_DRIFT_SUSTAINED_S - 1,
        })
      ),
      "Posture drift"
    ),
    "Held steady from the opening posture"
  );

  // The row is gated on the field its verdict is DERIVED from. A row gated on
  // one field while worded from another is how 12-09's Defect 2 happened.
  check(
    "posture_drift_max_s absent (mean present, signals present) yields no Posture drift row",
    visualBodyLanguageBands(
      visual({
        posture_signals_measured: [...sessionAMeasuredSignals],
        posture_drift_mean: 0.9,
      })
    ).some((r) => r.label === "Posture drift"),
    false
  );

  // And 12-09's unreadable-branch guarantee survives the rewiring: the
  // measured-signals check runs FIRST, before the duration is looked at at
  // all, so an off-camera session that somehow accumulated a long streak from
  // a brief glimpse still gets no verdict.
  check(
    "12-09 guarantee intact: empty measured signals refuse a verdict even with a 30s streak",
    visualBodyLanguageBands(
      visual({ posture_signals_measured: [], posture_drift_max_s: 30 })
    ).some((r) => r.label === "Posture drift"),
    false
  );
}

console.log("\n11. visualObservationRows (descriptive, never scored)");
check("returns [] when observations absent", visualObservationRows(visual()), []);
{
  // 12-08 Task 1 checkpoint: `fidget_pct`/"Hand motion" removed — fidgeting
  // was retired to permanently not-measured, see
  // `VisualDescriptiveObservations`'s own comment in types.ts.
  const observations: VisualDescriptiveObservations = {
    phone_visible_seconds: 40,
    posture_shoulder_tilt_deg: null,
    posture_forward_head_offset: null,
    episodes: [],
  };
  const rows = visualObservationRows(visual({ observations }));
  check("phone seconds row present",
    bandFor(rows, "Phone in frame"),
    "A phone was visible for about 40 seconds");
  check("no Hand motion row exists anymore",
    rows.some((r) => r.label === "Hand motion"),
    false);
  check("never a row for a null absolute posture reading",
    rows.some((r) => r.label === "Shoulder line (absolute)" || r.label === "Head position (absolute)"),
    false);
}

console.log("\n12. Structural non-scoring assertions — the point of this plan");
{
  const withoutObservations = visual();
  const withObservations = visual({
    observations: {
      phone_visible_seconds: 120,
      posture_shoulder_tilt_deg: 12,
      posture_forward_head_offset: 0.3,
      episodes: [{ kind: "phone_visible", start_s: 0, end_s: 120, severity: 1 }],
    },
  });
  check("visualBands is byte-identical regardless of observations",
    visualBands(withObservations), visualBands(withoutObservations));
  check("visualBodyLanguageBands is byte-identical regardless of observations",
    visualBodyLanguageBands(withObservations), visualBodyLanguageBands(withoutObservations));
}
{
  // 12-07: the same proof, but with a 300-second-phone payload — the
  // literal scenario this plan's objective names as the thing that must
  // never move a band or a scorability decision. (12-08 Task 1 checkpoint:
  // the fidget half of this scenario was removed — fidgeting was retired
  // to permanently not-measured.)
  const withoutObservations = visual();
  const withExtremeObservations = visual({
    observations: {
      phone_visible_seconds: 300,
      posture_shoulder_tilt_deg: 20,
      posture_forward_head_offset: 0.4,
      episodes: [
        { kind: "phone_visible", start_s: 0, end_s: 300, severity: 1 },
      ],
    },
  });
  check("a 300s-phone payload does not change visualBands",
    visualBands(withExtremeObservations), visualBands(withoutObservations));
  check("a 300s-phone payload does not change visualBodyLanguageBands",
    visualBodyLanguageBands(withExtremeObservations), visualBodyLanguageBands(withoutObservations));
  check("...nor the scorability decision",
    resolveVisualOutcome("ON", withExtremeObservations),
    resolveVisualOutcome("ON", withoutObservations));
}

console.log("\n13. timelineRows");
{
  const m = visual({
    episodes: [{ kind: "posture_drift", start_s: 60, end_s: 90, severity: 1 }],
    observations: {
      phone_visible_seconds: 0,
      posture_shoulder_tilt_deg: null,
      posture_forward_head_offset: null,
      episodes: [{ kind: "phone_visible", start_s: 10, end_s: 20, severity: 1 }],
    },
  });
  const rows = timelineRows(m);
  check("merged list is chronological (earlier-starting descriptive episode first)",
    rows.map((r) => r.value),
    ["Phone visible", "Posture shifted from the start of the session"]);
  check("every row carries a group", rows.every((r) => typeof r.group === "string"), true);
  check("descriptive episode's group is observation",
    rows.find((r) => r.value === "Phone visible")?.group, "observation");
  check("scored body episode's group is body",
    rows.find((r) => r.value === "Posture shifted from the start of the session")?.group, "body");
}

console.log("\n14. Ingest — Phase 12 allowlists");
{
  const parsed = parseMetricsPayload({
    cameraMode: "ON",
    visual: {
      ...visual(),
      observations: {
        phone_visible_seconds: 5,
        posture_shoulder_tilt_deg: 3,
        posture_forward_head_offset: 0.1,
        episodes: [
          { kind: "phone_visible", start_s: 0, end_s: 10, severity: 1 },
          { kind: "telekinesis", start_s: 0, end_s: 10, severity: 1 },
        ],
      },
      posture_signals_measured: ["shoulder_line", "x_ray_vision"],
    },
    vocal: null,
  });
  check("unknown descriptive episode kind dropped, valid one kept",
    parsed.visual?.observations?.episodes.length, 1);
  check("unknown posture_signals_measured entry dropped",
    parsed.visual?.posture_signals_measured, ["shoulder_line"]);
}
check("a media-shaped string inside observations rejects the WHOLE payload",
  parseMetricsPayload({
    cameraMode: "ON",
    visual: {
      ...visual(),
      observations: {
        phone_visible_seconds: 5,
        posture_shoulder_tilt_deg: null,
        posture_forward_head_offset: null,
        episodes: [],
        rogue: "https://evil.example/leak",
      },
    },
    vocal: null,
  }).visual,
  null);

console.log("\n15. computePostureBaseline — self-calibration");
function reading(over: Partial<PostureReading> = {}): PostureReading {
  return {
    tS: 1,
    shoulderTiltDeg: null,
    forwardHeadOffset: null,
    torsoLeanDeg: null,
    torsoOpennessRatio: null,
    ...over,
  };
}
{
  // Shoulders calibrate even though hips (torso_lean/torso_openness) are
  // never visible — the common head-and-shoulders webcam framing.
  const readings = Array.from({ length: 70 }, (_, i) =>
    reading({ tS: i * 0.25, shoulderTiltDeg: 5 })
  );
  const baseline = computePostureBaseline(readings);
  check("shoulder_line calibrates alone", baseline.signals, ["shoulder_line"]);
  check("shoulder_line baseline is the mean", baseline.shoulderTiltDeg, 5);
  check("torso_lean stays null — never defaulted to upright", baseline.torsoLeanDeg, null);
}
{
  // All-null input: nobody was ever visible during calibration.
  const readings = Array.from({ length: 70 }, (_, i) => reading({ tS: i * 0.25 }));
  const baseline = computePostureBaseline(readings);
  check("all-null input establishes no signals", baseline.signals, []);
  check("all-null input leaves every field null", [
    baseline.shoulderTiltDeg, baseline.forwardHeadOffset,
    baseline.torsoLeanDeg, baseline.torsoOpennessRatio,
  ], [null, null, null, null]);
}
{
  // Readings after the calibration window must not pollute the baseline.
  const inWindow = Array.from({ length: 70 }, (_, i) =>
    reading({ tS: i * 0.25, shoulderTiltDeg: 5 })
  );
  const afterWindow = Array.from({ length: 1000 }, () =>
    reading({ tS: POSTURE_BASELINE_WINDOW_S + 5, shoulderTiltDeg: 100 })
  );
  const baseline = computePostureBaseline([...inWindow, ...afterWindow]);
  check("post-window readings are ignored", baseline.shoulderTiltDeg, 5);
}
{
  // 12-08 Task 1 checkpoint, Defect E: the calibration window must anchor
  // to the tS PASSED IN, not to capture start (tS=0) — readings that would
  // have fallen outside an absolute 0-20s window must still calibrate when
  // the real anchor (the first usable pose reading) landed later, e.g.
  // because model loading ate real wall-clock time before ticking began.
  const delayedReadings = Array.from({ length: 70 }, (_, i) =>
    reading({ tS: 18 + i * 0.25, shoulderTiltDeg: 5 })
  );
  check("readings starting well after tS=0 still calibrate when anchored to their own start",
    computePostureBaseline(delayedReadings, 18).signals, ["shoulder_line"]);
  check("the SAME readings calibrate NOTHING under the old implicit tS=0 anchor — proving the anchor parameter is load-bearing",
    computePostureBaseline(delayedReadings).signals, []);
}
{
  // Minimum sample count: 14 usable readings is one short of the floor.
  // POSTURE_BASELINE_MIN_SAMPLES was lowered from 60 to 15 in this plan
  // (12-08 Task 1 checkpoint, Defect A root cause) — pose only receives 1/4
  // of SCHEDULE's ticks (~1.5 Hz effective), so 60 samples inside the 20s
  // POSTURE_BASELINE_WINDOW_S was structurally unreachable and the baseline
  // could never establish for ANY session, regardless of behaviour.
  const tooFew = Array.from({ length: 14 }, (_, i) =>
    reading({ tS: i * 0.25, shoulderTiltDeg: 5 })
  );
  check("below the minimum sample count, no baseline",
    computePostureBaseline(tooFew).signals, []);
  const justEnough = Array.from({ length: 15 }, (_, i) =>
    reading({ tS: i * 0.25, shoulderTiltDeg: 5 })
  );
  check("at the minimum sample count, baseline establishes",
    computePostureBaseline(justEnough).signals, ["shoulder_line"]);
}

console.log("\n16. computePostureDrift — baseline-relative, never absolute");
function baselineFixture(over: Partial<PostureBaseline> = {}): PostureBaseline {
  return {
    shoulderTiltDeg: null,
    forwardHeadOffset: null,
    torsoLeanDeg: null,
    torsoOpennessRatio: null,
    signals: [],
    sampleCount: 60,
    ...over,
  };
}
{
  const baseline = baselineFixture({ shoulderTiltDeg: 10, signals: ["shoulder_line"] });
  check("identical reading drifts 0",
    computePostureDrift(reading({ shoulderTiltDeg: 10 }), baseline).driftMagnitude, 0);
  check("a large shoulder-tilt change drifts near 1 (clamped)",
    computePostureDrift(reading({ shoulderTiltDeg: 10 + 1000 }), baseline).driftMagnitude, 1);
  const noBaselineSignal = computePostureDrift(
    reading({ shoulderTiltDeg: 10, forwardHeadOffset: 5 }),
    baseline
  );
  check("a signal with no baseline contributes nothing",
    noBaselineSignal.perSignal.forward_head, undefined);
  check("...and does not move the overall magnitude",
    noBaselineSignal.driftMagnitude, 0);
  const noSharedSignal = computePostureDrift(
    reading({ shoulderTiltDeg: null, forwardHeadOffset: 5 }),
    baseline
  );
  check("no shared signal yields null, never a defaulted 0",
    noSharedSignal.driftMagnitude, null);
}
{
  // THE FAIRNESS ASSERTION: two students with very different ABSOLUTE
  // postures but identical deltas from their OWN opening baseline must
  // produce the SAME drift. This is "the score comes from the student's own
  // opening posture" made into a test, not left as a comment.
  const studentA = computePostureDrift(
    reading({ shoulderTiltDeg: 5 }),
    baselineFixture({ shoulderTiltDeg: 0, signals: ["shoulder_line"] })
  );
  const studentB = computePostureDrift(
    reading({ shoulderTiltDeg: 45 }),
    baselineFixture({ shoulderTiltDeg: 40, signals: ["shoulder_line"] })
  );
  check("same delta from two very different baselines yields the same drift",
    studentA.driftMagnitude, studentB.driftMagnitude);
  check("...and it is a real, non-null, non-zero number",
    typeof studentA.driftMagnitude === "number" && studentA.driftMagnitude > 0, true);
}

console.log("\n17. computeGestureRates");
function gestureCounts(over: Partial<GestureCounts> = {}): GestureCounts {
  return {
    handSamples: 0,
    gestureDisplacementSum: 0,
    gestureEventCount: 0,
    handsAboveShoulderSamples: 0,
    handsNearFaceSamples: 0,
    handsNearFaceEligibleSamples: 0,
    sessionSeconds: 600,
    ...over,
  };
}
check("zero hand samples yields all zeroes",
  computeGestureRates(gestureCounts()),
  { gestureRatePerMin: 0, gestureAmplitudeMean: 0, handsAboveShoulderPct: 0, handsNearFacePct: 0 });
{
  // Rate divides by SESSION MINUTES, never hand-detected samples — doubling
  // handSamples at a fixed event count must not move the rate.
  const low = computeGestureRates(gestureCounts({
    handSamples: 100, gestureEventCount: 30, gestureDisplacementSum: 10,
  }));
  const high = computeGestureRates(gestureCounts({
    handSamples: 200, gestureEventCount: 30, gestureDisplacementSum: 10,
  }));
  check("rate is unaffected by hand-sample count", low.gestureRatePerMin, high.gestureRatePerMin);
  check("rate is events over session minutes (30 events / 10 min)", low.gestureRatePerMin, 3);
}
check("handsNearFacePct divides by face-AND-hand-eligible samples, not handSamples",
  computeGestureRates(gestureCounts({
    handSamples: 1000, handsNearFaceSamples: 25, handsNearFaceEligibleSamples: 50,
  })).handsNearFacePct,
  50);

console.log("\n18. New episode kinds extract through the existing machinery");
{
  // Two 5s windows (10s total, meeting MIN_EPISODE_SECONDS) tripping
  // excessive_gesturing. 12-08 made this trip a RATIO of gesture events to
  // hand-visible ticks (gated on GESTURE_WINDOW_MIN_HAND_SAMPLES), not an
  // absolute event count — so the fixture must supply `handsDetected`, the
  // way the minimal_gesturing fixtures below always have. 5/10 = 50%, well
  // clear of GESTURE_WINDOW_EXCESSIVE_PCT.
  const windows = [
    win(0, { handsDetected: 10, gestureSamples: 5 }),
    win(5, { handsDetected: 10, gestureSamples: 5 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "excessive_gesturing");
  check("exactly one excessive_gesturing episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
}
{
  // The regression this trip was retuned for: across every recorded session
  // the SESSION-wide gesture rate was 4-12/min, far under
  // GESTURE_RATE_EXCESSIVE_MIN, yet excessive_gesturing episodes still fired
  // and surfaced as a growth area. A student gesturing ordinarily must not be
  // told they gestured excessively (12-CONTEXT.md: "a false excessive is a
  // student being told off for a sensor misread"). 2/10 = 20%, just under the
  // cutoff, must stay silent.
  const windows = [
    win(0, { handsDetected: 10, gestureSamples: 2 }),
    win(5, { handsDetected: 10, gestureSamples: 2 }),
  ];
  check("ordinary gesturing produces NO excessive_gesturing episode",
    extractEpisodes(windows, VISUAL_EPISODE_KINDS)
      .filter((e) => e.kind === "excessive_gesturing").length,
    0);
}
{
  const windows = [
    win(0, { handsDetected: 10, gestureSamples: 0 }),
    win(5, { handsDetected: 10, gestureSamples: 0 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "minimal_gesturing");
  check("exactly one minimal_gesturing episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
}
{
  // Zero hand samples must NOT read as stillness — absence and stillness
  // are different findings.
  const windows = [
    win(0, { handsDetected: 0, gestureSamples: 0 }),
    win(5, { handsDetected: 0, gestureSamples: 0 }),
  ];
  check("zero hand samples produces NO minimal_gesturing episode",
    extractEpisodes(windows, VISUAL_EPISODE_KINDS)
      .filter((e) => e.kind === "minimal_gesturing").length,
    0);
}
{
  // 7/10 = 70%, clear of the 12-08-tuned HANDS_NEAR_FACE_TRIP_PCT. The old
  // fixture used 5/10 and sat exactly ON the retuned cutoff, which a strict
  // `>` comparison correctly does not trip.
  const windows = [
    win(0, { handsDetected: 10, nearFaceCount: 7 }),
    win(5, { handsDetected: 10, nearFaceCount: 7 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "hands_near_face");
  check("exactly one hands_near_face episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
}
{
  // Anchored on a real recording: session S4 measured handsNearFacePct 26 and
  // was ordinary behaviour, not deliberate face-touching. It must stay silent.
  const windows = [
    win(0, { handsDetected: 100, nearFaceCount: 26 }),
    win(5, { handsDetected: 100, nearFaceCount: 26 }),
  ];
  check("an ordinary hands-near-face rate produces NO episode",
    extractEpisodes(windows, VISUAL_EPISODE_KINDS)
      .filter((e) => e.kind === "hands_near_face").length,
    0);
}
{
  const windows = [
    win(0, { poseProcessed: 10, driftMean: 0.9 }),
    win(5, { poseProcessed: 10, driftMean: 0.9 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "posture_drift");
  check("exactly one posture_drift episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
}
{
  // Below MIN_EPISODE_SECONDS — a single 5s tripped window is noise, not
  // behaviour, for the new kinds too.
  const windows = [win(0, { gestureSamples: 10 }), win(5)];
  check("a single tripped window is dropped (below MIN_EPISODE_SECONDS)",
    extractEpisodes(windows, VISUAL_EPISODE_KINDS)
      .filter((e) => e.kind === "excessive_gesturing").length,
    0);
}

console.log("\n19. resolveNotMeasured wiring (12-06: hands/posture are now conditional)");
check("a session with no usable pose still lists body_posture",
  resolveNotMeasured({ handSignals: true, postureSignals: false, phone: true })
    .includes("body_posture"),
  true);
check("a session with usable pose AND hands lists neither",
  resolveNotMeasured({ handSignals: true, postureSignals: true, phone: true })
    .some((e) => e === "body_posture" || e === "hand_gestures"),
  false);
check("fidgeting is ALWAYS present regardless of input — permanently retired, not per-session (12-08)",
  resolveNotMeasured({ handSignals: true, postureSignals: true, phone: true })
    .includes("fidgeting"),
  true);

console.log("\n20. computeObservations — the measured-but-never-scored half (12-07)");
// 12-08 Task 1 checkpoint: `handSamples`/`fidgetSamples` removed from
// `ObservationCounts` — fidgeting was retired to permanently not-measured,
// see `VisualDescriptiveObservations`'s own comment in types.ts.
function obsCounts(over: Partial<ObservationCounts> = {}): ObservationCounts {
  return {
    phoneSamples: 0,
    phoneVisibleSamples: 0,
    phoneSampleHz: 0,
    absoluteShoulderTiltDegMean: null,
    absoluteForwardHeadOffsetMean: null,
    ...over,
  };
}
{
  // phone seconds convert via the RUNNER'S EFFECTIVE rate, never the nominal
  // 6 Hz — the same 60 visible samples means a very different duration
  // depending on how fast the object runner actually ticked this session.
  const atEffectiveHalfHz = computeObservations(
    obsCounts({ phoneSamples: 60, phoneVisibleSamples: 30, phoneSampleHz: 0.5 })
  );
  const atNominalSixHz = computeObservations(
    obsCounts({ phoneSamples: 60, phoneVisibleSamples: 30, phoneSampleHz: 6 })
  );
  check("30 visible samples at 0.5 Hz effective is 60 seconds", atEffectiveHalfHz.phoneVisibleSeconds, 60);
  check("the SAME 30 visible samples at a 6 Hz rate is only 5 seconds",
    atNominalSixHz.phoneVisibleSeconds, 5);
  check("...proving the nominal 6 Hz would have been wrong for the first session",
    atEffectiveHalfHz.phoneVisibleSeconds !== atNominalSixHz.phoneVisibleSeconds, true);
}
{
  // Below PHONE_MIN_VISIBLE_S — a single false-positive frame must not read
  // as "a phone was visible."
  const belowFloor = computeObservations(
    obsCounts({ phoneSamples: 10, phoneVisibleSamples: 1, phoneSampleHz: 5 })
  );
  check(`below ${PHONE_MIN_VISIBLE_S}s floor reports 0`, belowFloor.phoneVisibleSeconds, 0);
  check("zero effective rate (no object ticks at all) also reports 0",
    computeObservations(obsCounts({ phoneVisibleSamples: 5, phoneSampleHz: 0 })).phoneVisibleSeconds, 0);
}
{
  // A never-measurable posture angle stays null and is never defaulted to a
  // flattering 0 — a straight pass-through, not a computation.
  const r = computeObservations(obsCounts({
    absoluteShoulderTiltDegMean: null,
    absoluteForwardHeadOffsetMean: 0.12,
  }));
  check("null absolute shoulder tilt stays null, never 0", r.postureShoulderTiltDeg, null);
  check("a real absolute forward-head mean passes through unchanged", r.postureForwardHeadOffset, 0.12);
}

console.log("\n21. extractDescriptiveEpisodes — the DESCRIPTIVE sibling of extractEpisodes");
// 12-08 Task 1 checkpoint: the `fidgeting` kind (and Defect H's unified-gate
// fix, which only existed to reconcile it with the now-removed `fidget_pct`)
// was deleted entirely when fidgeting was retired to permanently
// not-measured. `phone_visible` is the only remaining descriptive kind.
{
  // Two 5s windows tripping `phone_visible`.
  const windows = [
    win(0, { phoneProcessed: 10, phoneCount: 8 }),
    win(5, { phoneProcessed: 10, phoneCount: 8 }),
  ];
  const descEps = extractDescriptiveEpisodes(windows, VISUAL_DESCRIPTIVE_EPISODE_KINDS);
  const phoneHits = descEps.filter((e) => e.kind === "phone_visible");
  check("exactly one phone_visible episode", phoneHits.length, 1);
  check("at the expected timecodes", [phoneHits[0].start_s, phoneHits[0].end_s], [0, 10]);

  // The SAME windows run through the SCORED extractor must produce NONE of
  // the descriptive kinds — they are not even in VISUAL_EPISODE_KINDS'
  // vocabulary, so this also proves the two kind unions stay genuinely
  // disjoint at the type level, not just by convention.
  const scoredEps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  check("the scored extractor over the SAME windows produces no phone_visible episode",
    scoredEps.some((e) => (e.kind as string) === "phone_visible"), false);
}
{
  // Zero phone-processed samples must not trip `phone_visible` — absence is
  // not evidence here either.
  const windows = [
    win(0, { phoneProcessed: 0, phoneCount: 0 }),
    win(5, { phoneProcessed: 0, phoneCount: 0 }),
  ];
  check("no phone_visible episode from an all-absent session",
    extractDescriptiveEpisodes(windows, VISUAL_DESCRIPTIVE_EPISODE_KINDS).length, 0);
}

console.log("\n22. Ingest round-trip — Phase 12 payload survives intact");
{
  const fullVisual = visual({
    not_measured: ["background_environment"],
    gesture_rate_per_min: 12,
    gesture_amplitude_mean: 0.2,
    hands_above_shoulder_pct: 30,
    hands_near_face_pct: 10,
    posture_drift_mean: 0.15,
    posture_drift_max_s: 8,
    posture_signals_measured: ["shoulder_line", "forward_head"],
    episodes: [{ kind: "posture_drift", start_s: 10, end_s: 40, severity: 0.8 }],
    observations: {
      phone_visible_seconds: 14,
      posture_shoulder_tilt_deg: 3.5,
      posture_forward_head_offset: 0.08,
      episodes: [{ kind: "phone_visible", start_s: 5, end_s: 19, severity: 0.6 }],
    },
  });
  const parsed = parseMetricsPayload({ cameraMode: "ON", visual: fullVisual, vocal: null });
  check("full Phase 12 payload's scored fields survive ingest intact",
    parsed.visual, fullVisual);
}
check("a media-shaped string inside observations still rejects the WHOLE payload (REQ-58)",
  parseMetricsPayload({
    cameraMode: "ON",
    visual: {
      ...visual(),
      observations: {
        phone_visible_seconds: 5,
        posture_shoulder_tilt_deg: null,
        posture_forward_head_offset: null,
        episodes: [],
        leak: "data:image/png;base64,AAAA",
      },
    },
    vocal: null,
  }).visual,
  null);

console.log("\n23. Legacy Phase 10 payload — byte-identical regression");
{
  // A genuinely Phase-10-shaped payload (no Phase 12 field present at all,
  // including no `observations`) must produce IDENTICAL output from every
  // consumer this plan touches — the regression that matters most to
  // existing stored reports.
  const legacyVisual: VisualMetrics = {
    eye_contact_pct: 82,
    attentiveness_pct: 77,
    camera_centered_pct: 91,
    face_presence_pct: 96,
    lighting_ok: true,
    posture_flags: ["high_head_movement"],
    not_measured: [...VISUAL_NOT_MEASURED],
    episodes: [{ kind: "gaze_away", start_s: 12, end_s: 30, severity: 0.5 }],
    coverage: coverage(),
  };
  const parsed = parseMetricsPayload({ cameraMode: "ON", visual: legacyVisual, vocal: null });
  check("legacy payload round-trips through ingest unchanged", parsed.visual, legacyVisual);
  check("legacy payload's visualBands is unaffected by this plan",
    visualBands(legacyVisual), visualBands(legacyVisual));
  check("legacy payload yields no body-language rows",
    visualBodyLanguageBands(legacyVisual), []);
  check("legacy payload yields no observation rows",
    visualObservationRows(legacyVisual), []);
  check("legacy payload's scorability is unaffected by this plan",
    resolveVisualOutcome("ON", legacyVisual), { scored: true, reason: null });
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
