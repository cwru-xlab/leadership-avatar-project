/**
 * Pure checks for the report check-in (`lib/report/check-in.ts`): which
 * flags are asked, the exact wording, strict input validation, the stored
 * shape round trip, display hiding, and that answers are stripped from every
 * `VisualMetrics` read so they cannot reach the evaluator.
 *
 * Run: npx tsx scripts/verify-check-in.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

check("every flag is asked, in catalog order, on the report's clock", () => {
  const questions = eligibleCheckIns("ON", base);
  // `mouth_movement` stands down whenever `hand_at_mouth` speaks: one question
  // per hypothesis. The fixture trips both, so four of the five ids appear.
  assert.deepEqual(questions.map((q) => q.id), ["hand_at_mouth", "hand_shape", "another_person", "phone"]);
  for (const q of questions) console.log(`      ${q.id}: ${q.question}`);
  assert.equal(
    questions[0].question,
    "We noticed your hand at your mouth repeatedly from 2:08 to 3:38, and a cup, bottle or food in frame. Was there food or a drink on camera?",
  );
  assert.match(questions[1].question, / at 5:08\. Was that intentional\?$/);
  assert.match(questions[3].question, /^We noticed a phone visible in frame from 1:20 to 2:00\./);
});

check("no report ever asks about eating twice", () => {
  // The fixture trips BOTH eating signals with food in frame — the case that
  // used to produce two questions about one hypothesis.
  const eating = eligibleCheckIns("ON", base).filter(
    (q) => q.id === "hand_at_mouth" || q.id === "mouth_movement",
  );
  assert.equal(eating.length, 1);
  assert.equal(eating[0].id, "hand_at_mouth");
  // With only the mouth signal tripped, that flag asks in its own right.
  const mouthOnly: VisualMetrics = {
    ...base,
    observations: {
      ...base.observations!,
      episodes: base.observations!.episodes.filter((e) => e.kind !== "hand_at_mouth_repeated"),
    },
  };
  const ids = eligibleCheckIns("ON", mouthOnly).map((q) => q.id);
  assert.ok(ids.includes("mouth_movement"));
  assert.ok(!ids.includes("hand_at_mouth"));
});

check("eating is never asked without a cup, bottle or food also seen", () => {
  // The measured false positive: both signals fire, no food or drink in frame.
  for (const seconds of [0, undefined]) {
    const observations = { ...base.observations!, food_or_drink_visible_seconds: seconds };
    if (seconds === undefined) delete observations.food_or_drink_visible_seconds;
    const ids = eligibleCheckIns("ON", { ...base, observations }).map((q) => q.id);
    assert.ok(!ids.includes("hand_at_mouth"), `food=${seconds}`);
    assert.ok(!ids.includes("mouth_movement"), `food=${seconds}`);
    // The unrelated flags are untouched by the eating gate.
    assert.ok(ids.includes("phone") && ids.includes("hand_shape"));
  }
});

check("a few arrivals at the mouth are not asked about", () => {
  const few = { ...base, observations: { ...base.observations!, hand_at_mouth_events: 3 } };
  const ids = eligibleCheckIns("ON", few).map((q) => q.id);
  // Below the check-in's own minimum the hand question stands down — and the
  // mouth question then speaks, since the hypothesis is no longer covered.
  assert.ok(!ids.includes("hand_at_mouth"));
  assert.ok(ids.includes("mouth_movement"));
  // The report row itself is unaffected: the detector still reported it.
  assert.ok(visualObservationRows(few).some((r) => r.label === "Hand at mouth"));
});

check("one answer settles both eating rows", () => {
  // `hand_at_mouth` is the only eating question asked, so answering it "no"
  // must hide the mouth-movement row too or that row would outlive its answer.
  const { visual } = applyCheckInHiding(base, {
    hand_at_mouth: { answer: "no", at: new Date().toISOString() },
  });
  const kinds = (visual.observations?.episodes ?? []).map((e) => e.kind);
  assert.ok(!kinds.includes("hand_at_mouth_repeated"));
  assert.ok(!kinds.includes("mouth_movement_silent"));
});

check("a retired question is withdrawn, never reported as a failed save", () => {
  // THE REGRESSION. A report page rendered before a tuning threshold moved
  // asks a question eligibility no longer returns; the save is refused. The
  // student did nothing wrong and cannot retry, so the question must be
  // dropped rather than shown in red. Verified at each of the three seams.
  const handlers = source("lib/report/handlers.ts");
  // 1. The handler separates withdrawal from rejection.
  assert.match(handlers, /retired: true/);
  assert.match(handlers, /no longer applies to this report/);
  // The old developer-voiced copy blamed the question while still showing it.
  assert.ok(!/doesn't apply to this report/.test(handlers));

  // 2. The route forwards the distinction; a bare error would look like any
  //    other save failure to the client.
  assert.match(source("app/api/practice/report/[reportId]/check-in/route.ts"), /retired/);

  // 3. The banner drops the question and does NOT set the error line.
  const banner = source("components/report/CheckInBanner.tsx");
  const branch = banner.slice(banner.indexOf("if (data.retired)"));
  assert.ok(branch.startsWith("if (data.retired)"), "the banner must handle a retired save");
  const body = branch.slice(0, branch.indexOf("setError"));
  assert.match(body, /setRetired/);
  // An empty list must render nothing rather than thank the student for
  // answering questions that no longer exist.
  assert.match(banner, /if \(questions\.length === 0\) return null;/);
});

check("input validation still guards the endpoint, so retired means retired", () => {
  // The retired path is only safe to treat as benign because a flag id that
  // isn't ours never reaches it: `parseCheckInInput` rejects it first. If that
  // stopped holding, garbage would be silently swallowed as "withdrawn".
  for (const bad of [{ flag: "yawning", answer: "yes" }, { flag: "__proto__", answer: "yes" }]) {
    assert.equal(parseCheckInInput(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseCheckInInput({ flag: "hand_at_mouth", answer: "no" }), {
    flag: "hand_at_mouth",
    answer: "no",
  });
});

check("the eating gate is what retires a question mid-session", () => {
  // The concrete case seen in the wild: the page asked `hand_at_mouth`, the
  // report has no food or drink in frame, so eligibility now withholds it.
  const observations = { ...base.observations! };
  delete observations.food_or_drink_visible_seconds;
  const ids = eligibleCheckIns("ON", { ...base, observations }).map((q) => q.id);
  assert.ok(!ids.includes("hand_at_mouth"));
  // Still a real flag id, which is precisely why it must not 400.
  assert.ok(CHECK_IN_FLAG_IDS.includes("hand_at_mouth"));
});

check("no question asserts what the student was doing", () => {
  // The module's WORDING RULES: describe what the camera saw, then ask about
  // the observation. "Were you eating" names a cause as fact.
  for (const q of eligibleCheckIns("ON", base)) {
    assert.ok(!/were you eating/i.test(q.question), q.question);
    assert.ok(q.question.startsWith("We noticed "), q.question);
    assert.ok(q.question.trimEnd().endsWith("?"), q.question);
  }
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
