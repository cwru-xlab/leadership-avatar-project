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
  computeObservations,
  computePostureBaseline,
  computePostureDrift,
  extractDescriptiveEpisodes,
  extractEpisodes,
  type CaptureWindow,
  type GestureCounts,
  type ObservationCounts,
  type PostureBaseline,
  type PostureReading,
  type VisualSampleCounts,
} from "../lib/metrics/visual-capture";
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
import { PHONE_MIN_VISIBLE_S, POSTURE_BASELINE_WINDOW_S } from "../lib/metrics/body-thresholds";

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
  // excessive_gesturing.
  const windows = [
    win(0, { gestureSamples: 10 }),
    win(5, { gestureSamples: 10 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "excessive_gesturing");
  check("exactly one excessive_gesturing episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
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
  const windows = [
    win(0, { handsDetected: 10, nearFaceCount: 5 }),
    win(5, { handsDetected: 10, nearFaceCount: 5 }),
  ];
  const eps = extractEpisodes(windows, VISUAL_EPISODE_KINDS);
  const hit = eps.filter((e) => e.kind === "hands_near_face");
  check("exactly one hands_near_face episode", hit.length, 1);
  check("at the expected timecodes", [hit[0].start_s, hit[0].end_s], [0, 10]);
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
