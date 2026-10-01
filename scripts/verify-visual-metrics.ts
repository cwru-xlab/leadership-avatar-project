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
  extractEpisodes,
  type CaptureWindow,
  type VisualSampleCounts,
} from "../lib/metrics/visual-capture";
import { resolveVisualOutcome, isPoorVisualCoverage } from "../lib/metrics/coverage";
import { visualBands, episodeBand } from "../lib/metrics/bands";
import { parseMetricsPayload } from "../lib/metrics/ingest";
import {
  VISUAL_EPISODE_KINDS,
  VISUAL_NOT_MEASURED,
  type VisualCoverage,
  type VisualMetrics,
} from "../lib/metrics/types";

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

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
