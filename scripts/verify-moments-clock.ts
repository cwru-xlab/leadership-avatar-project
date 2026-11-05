/**
 * Proves Moments places answers and camera moments at the right time, and that
 * each answer's excerpt is the right one. Pure: no database, storage or browser.
 *
 * Run: npx tsx scripts/verify-moments-clock.ts
 */
import { readFileSync } from "node:fs";

import { buildTimelineAnswers } from "../components/report/MomentsTimeline";
import { parseMetricsPayload } from "../lib/metrics/ingest";
import { timelineRows } from "../lib/metrics/bands";
import type { VisualEpisode, VisualMetrics, VocalMetrics, VocalTurnMetrics } from "../lib/metrics/types";
import {
  alignVocalTurns,
  answerExcerpt,
  buildReportMoments,
  fallbackClock,
  OPENING_LINE,
  reclockVisual,
} from "../lib/report/moments";
import { sanitizeQuote } from "../lib/report/quote-sanitizer";

let failures = 0;
function check(condition: unknown, description: string) {
  if (condition) console.log(`PASS ${description}`);
  else {
    failures += 1;
    console.error(`FAIL ${description}`);
  }
}
const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

function visual(episodes: VisualEpisode[], offset: number | undefined, sessionSeconds = 300, extra = {}): VisualMetrics {
  return {
    eye_contact_pct: 80,
    episodes,
    coverage: { session_seconds: sessionSeconds, capture_offset_s: offset, ...extra },
  } as unknown as VisualMetrics;
}
function vocal(turns: VocalTurnMetrics[], extra = {}): VocalMetrics {
  return {
    words_per_minute: 140,
    turns,
    coverage: { spoken_turns: turns.length, ...extra },
  } as unknown as VocalMetrics;
}
function turn(turn_index: number, start_s: number, duration_s: number, words: number): VocalTurnMetrics {
  return {
    turn_index,
    start_s,
    duration_s,
    words_per_minute: (words / duration_s) * 60,
    filler_count: 0,
    pause_count: 0,
    volume_consistency: 0.9,
  };
}
const say = (words: number, topic: string) => `${topic} ${"word ".repeat(Math.max(1, words - 8)).trim()}.`;
const AT = 1_000_000_000_000;

// ---- The known case ----------------------------------------------------------
//
// Transcript zero is 0. The avatar connects 10s later (the opening line's stamp),
// the camera 2s after that (capture_offset_s). The recorder hook mounted 3s after
// the row was created. Answers end at known times and land in the transcript 1.5s
// later, once transcribed.
//
//   Answer 1 "budget": transcript 30-50     vocal clock 27-47
//   Answer 2 "launch": transcript 100-140   vocal clock 97-137
//   Answer 3 "team":   transcript 200-220   vocal clock 197-217
//
// The camera sees the student look away for what is 110-120 on the transcript
// clock, mid-way through the launch answer. On the episode clock that is 98-108.
const turns = [turn(0, 27, 20, 40), turn(1, 97, 40, 80), turn(2, 197, 20, 40)];
const known = visual([{ kind: "gaze_away", start_s: 98, end_s: 108, severity: 1 }], 2);
const studentTurns = [
  { content: OPENING_LINE, timestamp: AT + 10_000 },
  { content: say(40, "The budget overran by a third."), timestamp: AT + 51_500 },
  { content: say(80, "We shipped the launch on time."), timestamp: AT + 141_500 },
  { content: say(40, "My team stayed through the merger."), timestamp: AT + 221_500 },
];
const moments = buildReportMoments({
  vocal: vocal(turns),
  visual: known,
  transcriptStartedAtMs: AT,
  studentTurns,
  offsetIsFromTranscriptStart: false,
});

console.log("\nKnown episode: looked away 110-120, during the launch answer (100-140)");
console.log(`  before: episode shown at ${98 + 2}s, answers at ${turns.map((t) => t.start_s + 2).join(", ")}s`);
const reclocked = reclockVisual(known, moments.clock);
const after = buildTimelineAnswers(vocal(turns), reclocked, [], moments);
console.log(`  after:  episode shown at ${reclocked.episodes[0].start_s}s, answers at ${after.map((a) => a.start).join(", ")}s`);

check(moments.clock.visualBasis === "opening-line", "episode clock is anchored on the opening line");
check(near(moments.clock.visualShiftS, 12), "episode shift is the avatar delay plus the capture offset (10 + 2)");
check(moments.clock.vocalBasis === "aligned", "vocal clock is recovered from the transcript");
check(near(after[1].start, 101.5), "answer 2 starts within the 1.5s transcription lag of its true 100s");
check(after[1].camera.length === 1 && after[1].camera[0] === "Looking away (1:50–2:00)", "the known episode lands on answer 2 at 1:50-2:00");
check(after[0].camera.length === 0 && after[2].camera.length === 0, "and on no other answer");
check(after[1].excerpt === "We shipped the launch on time.", "answer 2's excerpt is about the launch");
check(after[0].excerpt === "The budget overran by a third.", "answer 1's excerpt is about the budget");
check(timelineRows(reclocked)[0].label === "1:50–2:00", "the list agrees with the answer's note");

// ---- Every path --------------------------------------------------------------
console.log("\nPaths");

// Push-to-talk gap: the student is listening, not answering.
const gap = reclockVisual(visual([{ kind: "off_center", start_s: 60, end_s: 70, severity: 1 }], 2), moments.clock);
const gapAnswers = buildTimelineAnswers(vocal(turns), gap, [], moments);
check(gapAnswers.every((a) => a.camera.length === 0), "an episode in a push-to-talk gap (72-82) attaches to no answer");
check(timelineRows(gap)[0].label === "1:12–1:22", "but still reads the right time in the list");

// Capture started late: 45s after the avatar connected.
const late = buildReportMoments({
  vocal: vocal(turns),
  visual: visual([{ kind: "off_camera", start_s: 53, end_s: 63, severity: 1 }], 45),
  transcriptStartedAtMs: AT,
  studentTurns,
  offsetIsFromTranscriptStart: false,
});
check(near(late.clock.visualShiftS, 55), "late capture adds its whole 45s offset to the avatar delay");
check(near(53 + late.clock.visualShiftS, 108), "so a late episode lands at 108s, inside answer 2");

// Legacy row with no offset field at all.
const legacy = buildReportMoments({
  vocal: vocal(turns),
  visual: visual([{ kind: "gaze_away", start_s: 100, end_s: 110, severity: 1 }], undefined),
  transcriptStartedAtMs: AT,
  studentTurns,
  offsetIsFromTranscriptStart: false,
});
check(near(legacy.clock.visualShiftS, 10), "a report with no offset field still gets the avatar delay");

// Legacy row, no transcript either.
const noTranscript = fallbackClock(visual([], 2));
check(noTranscript.visualShiftS === 2 && noTranscript.vocalShiftS === 0, "no transcript falls back to the stored offset, and leaves turns alone");
const noTranscriptAnswers = buildTimelineAnswers(vocal(turns), visual([], 2), []);
check(noTranscriptAnswers[0].start === 27, "turns no longer borrow the camera's offset");
check(noTranscriptAnswers.every((a) => a.excerpt === null), "and carry no excerpt");
check(fallbackClock(visual([], undefined)).visualShiftS === 0, "no offset and no transcript reads as zero rather than NaN");

// Past the end of the session.
const pastEnd = reclockVisual(
  visual(
    [
      { kind: "off_camera", start_s: 0, end_s: 23, severity: 1 },
      { kind: "gaze_away", start_s: 25, end_s: 30, severity: 1 },
    ],
    0,
    22.76,
  ),
  fallbackClock(visual([], 0)),
);
const negative = reclockVisual(visual([{ kind: "off_center", start_s: 1, end_s: 9, severity: 1 }], 0), { ...fallbackClock(null), visualShiftS: -2 });
check(negative.episodes[0].start_s === 0 && negative.episodes[0].end_s === 7, "a row created after the avatar connected shifts earlier, and stops at 0:00");
check(pastEnd.episodes.length === 1 && near(pastEnd.episodes[0].end_s, 22.76), "an episode rounded past the session end is held to it; one wholly past it is dropped");

// Scenario: capture offset is already from the transcript's zero.
const scenario = buildReportMoments({
  vocal: null,
  visual: visual([], 7),
  transcriptStartedAtMs: AT,
  studentTurns: [{ content: "Hello there.", timestamp: AT + 9_000 }],
  offsetIsFromTranscriptStart: true,
});
check(scenario.clock.visualBasis === "log-start" && scenario.clock.visualShiftS === 7, "a scenario uses its stored offset as is");

// Pitch type: no opening line, so nothing observes when the avatar connected.
const pitch = buildReportMoments({
  vocal: vocal(turns),
  visual: visual([], 2),
  transcriptStartedAtMs: AT,
  studentTurns: studentTurns.slice(1),
  offsetIsFromTranscriptStart: false,
});
check(pitch.clock.visualBasis === "capture-offset" && pitch.clock.visualShiftS === 2, "an older pitch report falls back to the stored offset");
check(near(pitch.clock.vocalShiftS, 4.5), "while its answers still align");

// New reports record both epochs, which is exact.
const recorded = buildReportMoments({
  vocal: vocal(turns, { capture_started_at_ms: AT + 3_000 }),
  visual: visual([], 2, 300, { capture_started_at_ms: AT + 12_000 }),
  transcriptStartedAtMs: AT,
  studentTurns,
  offsetIsFromTranscriptStart: false,
});
check(recorded.clock.vocalBasis === "recorded" && near(recorded.clock.vocalShiftS, 3), "a new report's vocal shift is exact: answer 2 at exactly 100s");
check(recorded.clock.visualBasis === "recorded" && near(recorded.clock.visualShiftS, 12), "a new report's episode shift is exact");
check(recorded.excerpts[2] === "My team stayed through the merger.", "and answers still match their transcript lines");

const parsed = parseMetricsPayload({
  vocal: { words_per_minute: 1, filler_word_count: 0, filler_word_list: [], pause_count: 0, volume_consistency: 1, turns: [], coverage: { capture_started_at_ms: AT } },
  visual: { eye_contact_pct: 1, coverage: { capture_started_at_ms: AT } },
});
check(parsed.vocal?.coverage.capture_started_at_ms === AT && parsed.visual?.coverage.capture_started_at_ms === AT, "ingest keeps the recorded epochs");
const parsedOld = parseMetricsPayload({ vocal: { coverage: {} }, visual: { coverage: { capture_started_at_ms: "soon" } } });
check(parsedOld.vocal?.coverage.capture_started_at_ms === undefined && parsedOld.visual?.coverage.capture_started_at_ms === undefined, "and omits a missing or malformed one");

// Typed answers and failed transcriptions mean turn order alone would mismatch.
const typedFirst = alignVocalTurns(
  [turn(0, 10, 10, 20), turn(1, 50, 10, 20)],
  [
    { content: say(5, "Typed first."), atSeconds: 3 },
    { content: say(20, "Spoken one."), atSeconds: 21 },
    { content: say(5, "Typed middle."), atSeconds: 40 },
    { content: say(20, "Spoken two."), atSeconds: 61 },
  ],
);
check(typedFirst?.matches.get(0) === 1 && typedFirst?.matches.get(1) === 3, "typed answers between spoken ones don't shift the match");
const failedTranscription = alignVocalTurns(
  [turn(0, 10, 10, 20), turn(1, 40, 10, 20), turn(2, 70, 10, 20)],
  [
    { content: say(20, "One."), atSeconds: 21 },
    { content: say(20, "Three."), atSeconds: 81 },
  ],
);
check(failedTranscription?.matches.get(0) === 0 && !failedTranscription?.matches.has(1) && failedTranscription?.matches.get(2) === 1, "a failed transcription leaves that answer unmatched, not the next one wrong");

// ---- Excerpts ----------------------------------------------------------------
console.log("\nExcerpts");
const long = "I led the migration of our entire billing platform across three regions while the finance team kept closing the books every month.";
const trimmed = answerExcerpt(long) ?? "";
console.log(`  ${trimmed}`);
check(trimmed.length <= 90 && trimmed.endsWith("…"), "a long sentence is cut to 90 characters");
check(long.startsWith(trimmed.slice(0, -1)) && long[trimmed.length - 1] === " ", "at a word boundary");
check(answerExcerpt("Sure, thanks for asking. We cut churn by a third last year.") === "We cut churn by a third last year.", "prefers a sentence with substance over a pleasantry");
check(answerExcerpt("Yes.") === "Yes.", "a very short answer is kept whole");
check(answerExcerpt("Um, so. Right.") === "Um, so.", "a filler-only answer is still quoted, not dropped");
check(answerExcerpt("   ") === null, "an empty answer has no excerpt");
check(answerExcerpt("It rose 3.5 percent in the first full quarter after launch. Then it fell.") === "It rose 3.5 percent in the first full quarter after launch.", "a decimal doesn't end a sentence");
const same = "We talked about the budget in detail. Then the launch slipped by a whole quarter.";
const firstLine = answerExcerpt(same);
check(answerExcerpt(same, new Set([firstLine ?? ""])) === "Then the launch slipped by a whole quarter.", "an adjacent answer opening the same way gets its next sentence");

const severe = "__SEVERE_TEST_TOKEN__ you are useless and I will find you.";
const screenedMoments = buildReportMoments({
  vocal: vocal([turn(0, 1, 10, 11)]),
  visual: null,
  transcriptStartedAtMs: AT,
  studentTurns: [{ content: severe, timestamp: AT + 12_000 }],
  offsetIsFromTranscriptStart: false,
  sanitize: () => ({ text: "[characterized]", replaced: true }),
});
check(screenedMoments.excerpts[0] === "[characterized]", "a screened turn is characterized, never quoted");
check(!sanitizeQuote("We cut churn.").sanitized, "ordinary text passes the real sanitizer");

// ---- The opening line is the shell's real string ------------------------------
const shell = readFileSync(new URL("../components/practice/PracticeSessionShell.tsx", import.meta.url), "utf8");
check(shell.includes(`sendMessage("${OPENING_LINE}")`), "OPENING_LINE matches what the shell actually sends");

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
