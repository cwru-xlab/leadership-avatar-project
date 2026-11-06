/**
 * Pure checks for the report check-in (`lib/report/check-in.ts`): which
 * flags are asked, the exact wording, strict input validation, the stored
 * shape round trip, display hiding, and that answers are stripped from every
 * `VisualMetrics` read so they cannot reach the evaluator.
 *
 * Run: npx tsx scripts/verify-check-in.ts
 */
import assert from "node:assert/strict";

import { getReportChrome } from "../components/practice/ReportChrome";
import { asVisualMetrics } from "../lib/metrics/ingest";
import { visualObservationRows } from "../lib/metrics/bands";
import type { VisualMetrics } from "../lib/metrics/types";
import {
  applyCheckInHiding,
  asStoredCheckIn,
  CHECK_IN_FLAG_IDS,
  CHECK_IN_FLAGS,
  checkInCoaching,
  eligibleCheckIns,
  parseCheckInInput,
} from "../lib/report/check-in";

const base: VisualMetrics = {
  eye_contact_pct: 88,
  attentiveness_pct: 90,
  camera_centered_pct: 95,
  face_presence_pct: 99,
  lighting_ok: true,
  posture_flags: ["multiple_faces_detected"],
  not_measured: ["background_environment", "fidgeting"],
  episodes: [{ kind: "multiple_faces", start_s: 30, end_s: 50, severity: 1 }],
  coverage: { sample_hz: 6, analyzer_error: false, capture_offset_s: 8 } as VisualMetrics["coverage"],
  observations: {
    phone_visible_seconds: 40,
    posture_shoulder_tilt_deg: null,
    posture_forward_head_offset: null,
    hand_at_mouth_events: 9,
    mouth_movement_silent_seconds: 90,
    food_or_drink_visible_seconds: 40,
    middle_finger_extended_seconds: 2,
    episodes: [
      { kind: "phone_visible", start_s: 72, end_s: 112, severity: 1 },
      { kind: "hand_at_mouth_repeated", start_s: 120, end_s: 210, severity: 1 },
      { kind: "mouth_movement_silent", start_s: 125, end_s: 215, severity: 0.9 },
      { kind: "mouth_movement_silent", start_s: 300, end_s: 320, severity: 0.9 },
      { kind: "middle_finger_extended", start_s: 300, end_s: 300, severity: 1 },
    ],
  },
};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

check("every flag is asked, in catalog order, on the report's clock", () => {
  const questions = eligibleCheckIns("ON", base);
  assert.deepEqual(questions.map((q) => q.id), [...CHECK_IN_FLAG_IDS]);
  for (const q of questions) console.log(`      ${q.id}: ${q.question}`);
  assert.equal(
    questions[0].question,
    "We noticed your hand at your mouth repeatedly from 2:08 to 3:38. Were you eating or drinking?",
  );
  assert.match(questions[1].question, /speaking from 2:13 to 3:43 and from 5:08 to 5:28\./);
  assert.match(questions[2].question, / at 5:08\. Was that intentional\?$/);
  assert.match(questions[4].question, /^We noticed a phone visible in frame from 1:20 to 2:00\./);
});

check("camera off, legacy (no visual) and nothing flagged ask nothing", () => {
  assert.equal(eligibleCheckIns("OFF", base).length, 0);
  assert.equal(eligibleCheckIns(null, base).length, 0);
  assert.equal(eligibleCheckIns("ON", null).length, 0);
  const clean: VisualMetrics = {
    ...base,
    posture_flags: [],
    episodes: [],
    observations: { ...base.observations!, phone_visible_seconds: 0, episodes: [] },
  };
  assert.equal(eligibleCheckIns("ON", clean).length, 0);
  const { observations, ...noObservations } = clean;
  void observations;
  assert.equal(eligibleCheckIns("ON", noObservations).length, 0);
});

check("a phone seen briefly is not asked about", () => {
  const brief = { ...base, observations: { ...base.observations!, phone_visible_seconds: 6 } };
  assert.ok(!eligibleCheckIns("ON", brief).some((q) => q.id === "phone"));
  const noEpisode = {
    ...base,
    observations: { ...base.observations!, episodes: base.observations!.episodes.filter((e) => e.kind !== "phone_visible") },
  };
  const phone = eligibleCheckIns("ON", noEpisode).find((q) => q.id === "phone");
  assert.equal(phone?.question, "We noticed a phone visible in frame for about 40 seconds. Was there a phone in view?");
});

check("another person without episodes still says when, vaguely", () => {
  const q = eligibleCheckIns("ON", { ...base, episodes: [] }).find((x) => x.id === "another_person");
  assert.match(q!.question, /in frame during the session\./);
});

check("input validation is a closed vocabulary", () => {
  assert.deepEqual(parseCheckInInput({ flag: "phone", answer: "yes" }), { flag: "phone", answer: "yes" });
  assert.deepEqual(parseCheckInInput({ flag: "hand_at_mouth", answer: "other", reason: "water" }), {
    flag: "hand_at_mouth",
    answer: "other",
    reason: "water",
  });
  for (const bad of [
    null,
    [],
    "yes",
    { flag: "phone" },
    { flag: "phone", answer: "maybe" },
    { flag: "yawning", answer: "yes" },
    { flag: "phone", answer: "other" },
    { flag: "phone", answer: "other", reason: "water" },
    { flag: "phone", answer: "yes", reason: "object" },
    { flag: "phone", answer: "no", note: "free text" },
    { flag: "__proto__", answer: "yes" },
  ]) {
    assert.equal(parseCheckInInput(bad), null, JSON.stringify(bad));
  }
});

check("stored answers round trip and bad entries drop one by one", () => {
  const at = "2026-11-05T12:00:00.000Z";
  const stored = asStoredCheckIn({
    version: 1,
    answers: {
      phone: { answer: "yes", at },
      hand_shape: { answer: "other", reason: "glasses", at },
      mouth_movement: { answer: "other", reason: "not-an-option", at },
      another_person: { answer: "no" },
      yawning: { answer: "yes", at },
    },
  });
  assert.deepEqual(stored, { phone: { answer: "yes", at }, hand_shape: { answer: "other", reason: "glasses", at } });
  assert.deepEqual(asStoredCheckIn("junk"), {});
});

check("coaching lines appear only for Yes", () => {
  const at = "2026-11-05T12:00:00.000Z";
  assert.deepEqual(
    checkInCoaching({ phone: { answer: "yes", at }, hand_at_mouth: { answer: "no", at } }, "In a real interview"),
    ["In a real interview, put your phone away and out of frame before you join."],
  );
});

check("coaching names the practice type's own situation, never a hard-coded interview", () => {
  const at = "2026-11-05T12:00:00.000Z";
  const yes = { answer: "yes", at } as const;
  const all = { hand_at_mouth: yes, mouth_movement: yes, hand_shape: yes, another_person: yes, phone: yes };
  // The leads each type declares on its report chrome.
  for (const lead of [
    "In a real interview",
    "When you pitch for real",
    "In a real courageous conversation",
    "In a real networking conversation",
    "In a real meeting",
    "In a real presentation",
  ]) {
    const lines = checkInCoaching(all, lead);
    assert.equal(lines.length, CHECK_IN_FLAG_IDS.length);
    for (const line of lines) assert.ok(line.startsWith(`${lead}, `), line);
    if (lead !== "In a real interview") assert.ok(!lines.some((line) => /interview/i.test(line)), lead);
    // The water allowance stays on the eating tip whatever the type.
    assert.ok(lines[0].endsWith("A quick sip of water is fine."), lines[0]);
    // The same lead reaches the questions' own coaching.
    assert.ok(eligibleCheckIns("ON", base, lead).every((q) => q.yesCoaching.startsWith(`${lead}, `)));
  }
  // A caller with no type gets a neutral opener, not "interview".
  assert.ok(!checkInCoaching(all).some((line) => /interview/i.test(line)));
});

check("every practice type declares its own coaching lead", () => {
  const expected: Record<string, string> = {
    general: "In a real interview",
    technical: "In a real interview",
    "case-study": "In a real meeting",
    "difficult-conversation": "In a real courageous conversation",
    networking: "In a real networking conversation",
    "pitch-elevator": "When you pitch for real",
    "pitch-deck": "In a real presentation",
    "pitch-talk": "In a real presentation",
  };
  for (const [slug, lead] of Object.entries(expected)) {
    assert.equal(getReportChrome(slug)?.checkInLead, lead, slug);
  }
});

check("No and Something else hide only that flag's rows; Yes hides nothing", () => {
  const at = "2026-11-05T12:00:00.000Z";
  const labels = (v: VisualMetrics) => visualObservationRows(v).map((r) => r.label);
  assert.deepEqual(labels(base), ["Phone in frame", "Hand at mouth", "Mouth movement", "Cup, bottle or food in frame", "Hand shape"]);

  const yes = applyCheckInHiding(base, { hand_at_mouth: { answer: "yes", at } });
  assert.equal(yes.visual, base);

  const hidden = applyCheckInHiding(base, {
    hand_at_mouth: { answer: "no", at },
    mouth_movement: { answer: "other", reason: "thinking", at },
    phone: { answer: "no", at },
    another_person: { answer: "no", at },
  });
  const shown = labels(hidden.visual).filter((label) => !hidden.hiddenRowLabels.has(label));
  // The cup row goes with both mouth rows: on its own it describes nothing.
  assert.deepEqual(shown, ["Hand shape"]);
  assert.ok(hidden.hiddenRowLabels.has("Others in frame"));
  assert.equal(hidden.visual.episodes.length, 0);
  // The stored reading itself is untouched.
  assert.equal(base.observations!.episodes.length, 5);
  assert.equal(base.episodes.length, 1);
});

check("answers are stripped from every VisualMetrics read", () => {
  const row = { ...base, check_in: { version: 1, answers: { phone: { answer: "yes", at: "x" } } } };
  const read = asVisualMetrics(row)!;
  assert.ok(!("check_in" in read));
  assert.ok(!JSON.stringify(read).includes("check_in"));
  assert.ok("check_in" in row, "the stored object is not mutated");
});

console.log(`\n${passed} checks passed`);
