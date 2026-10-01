import type { VisualEpisode, VisualMetrics, VocalMetrics } from "./types";

/**
 * Qualitative band mapping for Phase 10 metrics — REQ-46: the report shows
 * bands ("Eye contact: Strong"), never a raw percentage or ratio. This file
 * is the ONLY place that translation happens; nothing downstream should ever
 * format a raw metric number for display.
 *
 * Cutoffs below are a Phase 10 planning decision (CONTEXT.md left the exact
 * boundaries to Claude's discretion), chosen to mirror the five-tier feel of
 * `SCORE_LABELS` in `components/interview/ReportScoreCards.tsx:15-21` so the
 * whole report reads as one consistent system:
 *
 *   eye_contact_pct     (Eye contact): <30 Limited, 30-50 Developing,
 *                        50-70 Solid, 70-85 Strong, >=85 Excellent.
 *                        Centred on the evaluator prompt's own stated
 *                        70-80% target (`lib/interview/prompts.ts:229`).
 *   camera_centered_pct (Framing):     <40 Often off-frame, 40-65 Inconsistent,
 *                        65-80 Mostly centred, 80-92 Well centred,
 *                        >=92 Consistently centred.
 *   eye_contact_pct     (Eye contact): whole-session forward gaze.
 *   attentiveness_pct   (Attention):   listening stretches only.
 *                        <40 Often looking away, 40-65 Intermittent,
 *                        65-85 Attentive, >=85 Consistently attentive.
 *   face_presence_pct   (On camera):   <50 Often absent, 50-75 Intermittent,
 *                        75-90 Mostly present, 90-97 Consistently present,
 *                        >=97 Present throughout.
 *   lighting_ok         (Lighting):    true Clear, false Dim or uneven.
 *   posture_flags       (Steadiness):  empty Steady, out-of-frame flag only
 *                        "Drifts out of frame", movement flag only
 *                        "Restless", both "Drifts out of frame and restless".
 *   posture_flags       (Others in frame): multiple_faces_detected present
 *                        "Another person detected", absent "Just you".
 *   words_per_minute    (Pace):        <100 Slow, 100-125 Measured,
 *                        125-160 Well paced, 160-185 Slightly fast,
 *                        >=185 Fast.
 *   filler density      (Filler words):<1 Minimal, 1-3 Occasional,
 *                        3-6 Frequent, >=6 Very frequent (per 100 words).
 *   pause rate          (Pauses):      <1 Few, 1-3 Natural, 3-6 Frequent,
 *                        >=6 Very frequent (per minute).
 *   volume_consistency  (Volume):      <0.5 Uneven, 0.5-0.7 Variable,
 *                        0.7-0.85 Steady, >=0.85 Very steady.
 */

export interface MetricBandRow {
  label: string;
  value: string;
}

/** Clamp a number to a finite value, treating NaN/-Infinity/Infinity as the
 * bound closest to "no signal" so every band function stays total. */
function clampFinite(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  if (n === Infinity) return max;
  if (n === -Infinity) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function bandEyeContact(pctRaw: number): string {
  const pct = clampFinite(pctRaw, 0, 100);
  if (pct < 30) return "Limited";
  if (pct < 50) return "Developing";
  if (pct < 70) return "Solid";
  if (pct < 85) return "Strong";
  return "Excellent";
}

function bandFraming(pctRaw: number): string {
  const pct = clampFinite(pctRaw, 0, 100);
  if (pct < 40) return "Often off-frame";
  if (pct < 65) return "Inconsistent";
  if (pct < 80) return "Mostly centred";
  if (pct < 92) return "Well centred";
  return "Consistently centred";
}

/** Minimum listening samples before an attentiveness figure is worth
 * reporting. 10 seconds at 6 Hz. Below this there was barely any stretch where
 * someone else was talking, and a percentage over a handful of samples would
 * be noise presented as a finding. `eye_contact_pct` needs no such guard — it
 * spans the whole session, so its denominator is never thin. */
const MIN_LISTENING_SAMPLES_FOR_BAND = 60;

function bandAttentiveness(pctRaw: number): string {
  const pct = clampFinite(pctRaw, 0, 100);
  if (pct < 40) return "Often looking away";
  if (pct < 65) return "Intermittent";
  if (pct < 85) return "Attentive";
  return "Consistently attentive";
}

function bandOnCamera(pctRaw: number): string {
  const pct = clampFinite(pctRaw, 0, 100);
  if (pct < 50) return "Often absent";
  if (pct < 75) return "Intermittent";
  if (pct < 90) return "Mostly present";
  if (pct < 97) return "Consistently present";
  return "Present throughout";
}

function bandLighting(ok: boolean): string {
  return ok ? "Clear" : "Dim or uneven";
}

/**
 * Steadiness covers ONLY the two flags derived from the primary face's
 * bounding box. `multiple_faces_detected` is deliberately NOT folded in here
 * — it describes the room, not the student's steadiness, and jamming it into
 * this string would make "Steady" mean two unrelated things at once. It gets
 * its own row via `bandOthersInFrame`.
 */
function bandSteadiness(flags: string[]): string {
  const outOfFrame = flags.includes("face_partially_out_of_frame");
  const restless = flags.includes("high_head_movement");
  if (outOfFrame && restless) return "Drifts out of frame and restless";
  if (outOfFrame) return "Drifts out of frame";
  if (restless) return "Restless";
  return "Steady";
}

/**
 * Rendered unconditionally, including the negative case. Whether more than one
 * person was in frame IS measured now, so "Just you" is a real finding rather
 * than the absence of one — and showing the row every time makes the check
 * visible instead of leaving the reader to guess whether it happened.
 */
function bandOthersInFrame(flags: string[]): string {
  return flags.includes("multiple_faces_detected")
    ? "Another person detected"
    : "Just you";
}

function bandPace(wpmRaw: number): string {
  const wpm = clampFinite(wpmRaw, 0, 400);
  if (wpm < 100) return "Slow";
  if (wpm < 125) return "Measured";
  if (wpm < 160) return "Well paced";
  if (wpm < 185) return "Slightly fast";
  return "Fast";
}

function bandFillerDensity(fillerWordCount: number, wordsPerMinute: number, spokenSeconds: number): string {
  if (!fillerWordCount || fillerWordCount <= 0) return "Minimal";
  // totalWords = words_per_minute * (spoken_seconds/60), rounded. Guard
  // against a zero/NaN denominator explicitly — never emit NaN.
  const wpm = clampFinite(wordsPerMinute, 0, 400);
  const seconds = clampFinite(spokenSeconds, 0, Number.MAX_SAFE_INTEGER);
  const totalWordsRaw = Math.round(wpm * (seconds / 60));
  const totalWords = totalWordsRaw > 0 ? totalWordsRaw : 0;
  if (totalWords <= 0) {
    // Denominator is degenerate but we already know filler_word_count > 0 —
    // fall back to the documented safe default rather than dividing by zero.
    return "Occasional";
  }
  const density = clampFinite((fillerWordCount / totalWords) * 100, 0, Number.MAX_SAFE_INTEGER);
  if (density < 1) return "Minimal";
  if (density < 3) return "Occasional";
  if (density < 6) return "Frequent";
  return "Very frequent";
}

function bandPauseRate(pauseCountRaw: number, spokenSecondsRaw: number): string {
  const pauseCount = clampFinite(pauseCountRaw, 0, Number.MAX_SAFE_INTEGER);
  const spokenSeconds = clampFinite(spokenSecondsRaw, 0, Number.MAX_SAFE_INTEGER);
  const minutes = Math.max(1, spokenSeconds / 60);
  const rate = pauseCount / minutes;
  if (rate < 1) return "Few";
  if (rate < 3) return "Natural";
  if (rate < 6) return "Frequent";
  return "Very frequent";
}

function bandVolume(consistencyRaw: number): string {
  const consistency = clampFinite(consistencyRaw, 0, 1);
  if (consistency < 0.5) return "Uneven";
  if (consistency < 0.7) return "Variable";
  if (consistency < 0.85) return "Steady";
  return "Very steady";
}

/**
 * Visual metric rows for the report. Pure and total: every numeric input,
 * including 0, negative, Infinity and NaN, produces a band string, never
 * `undefined` or a raw number.
 */
export function visualBands(m: VisualMetrics): MetricBandRow[] {
  const rows: MetricBandRow[] = [
    { label: "Eye contact", value: bandEyeContact(m.eye_contact_pct) },
  ];

  // Attention isolates the LISTENING stretches — whether the student stayed
  // oriented to the screen while someone else was talking. Reported alongside
  // the session-wide figure above, not instead of it: a student can hold
  // steady while delivering an answer and disengage completely while being
  // asked the next one, and one number cannot show both.
  const listeningSamples = m.coverage?.listening_samples;
  const attentionMeasurable =
    typeof listeningSamples !== "number" ||
    listeningSamples >= MIN_LISTENING_SAMPLES_FOR_BAND;
  if (typeof m.attentiveness_pct === "number" && attentionMeasurable) {
    rows.push({ label: "Attention", value: bandAttentiveness(m.attentiveness_pct) });
  }

  rows.push({ label: "Framing", value: bandFraming(m.camera_centered_pct) });

  // Rows below are omitted rather than defaulted when their field is absent.
  // Reports written before these metrics existed are stored as plain `Json?`
  // and re-narrowed by a cast (`asVisualMetrics`), so a legacy row genuinely
  // reaches here without them. `clampFinite` would happily turn `undefined`
  // into 0 and print "Often absent" for a session nobody ever measured —
  // inventing a finding, which is the failure this whole change exists to
  // stop. Saying nothing is the only honest option for a row with no data.
  if (typeof m.face_presence_pct === "number") {
    rows.push({ label: "On camera", value: bandOnCamera(m.face_presence_pct) });
  }

  rows.push({ label: "Lighting", value: bandLighting(m.lighting_ok) });

  const flags = Array.isArray(m.posture_flags) ? m.posture_flags : [];
  rows.push({ label: "Steadiness", value: bandSteadiness(flags) });

  // Legacy rows predate multi-face detection entirely: their empty
  // `posture_flags` means "never looked for", not "nobody else was there".
  // Keyed on `not_measured` because its presence is what marks a payload as
  // having come from the multi-face-aware engine.
  if (Array.isArray(m.not_measured)) {
    rows.push({ label: "Others in frame", value: bandOthersInFrame(flags) });
  }

  return rows;
}

const EPISODE_LABELS: Record<VisualEpisode["kind"], string> = {
  off_camera: "Off camera",
  gaze_away: "Looking away",
  off_center: "Off centre in frame",
  multiple_faces: "Another person in frame",
  high_movement: "Moving around a lot",
};

/** `m:ss` from a second offset. */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(clampFinite(seconds, 0, 86_400)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * One episode as a plain-language row. Kept here rather than in a component
 * for the same reason every other numeric-to-word translation lives in this
 * file: the report must not invent its own vocabulary for a measurement.
 *
 * Times are shifted by `capture_offset_s` so they line up with the session
 * clock the student experienced (and the transcript is stamped against)
 * rather than with capture start, which happened somewhere in the middle of
 * their setup and means nothing to them.
 */
export function episodeBand(
  episode: VisualEpisode,
  captureOffsetS: number = 0
): MetricBandRow {
  const offset = clampFinite(captureOffsetS, 0, 86_400);
  return {
    label: `${formatTimecode(episode.start_s + offset)}–${formatTimecode(episode.end_s + offset)}`,
    value: EPISODE_LABELS[episode.kind] ?? "Unusual activity",
  };
}

/**
 * Vocal metric rows for the report. Pure and total, same guarantees as
 * `visualBands`.
 */
export function vocalBands(m: VocalMetrics): MetricBandRow[] {
  return [
    { label: "Pace", value: bandPace(m.words_per_minute) },
    {
      label: "Filler words",
      value: bandFillerDensity(m.filler_word_count, m.words_per_minute, m.coverage.spoken_seconds),
    },
    { label: "Pauses", value: bandPauseRate(m.pause_count, m.coverage.spoken_seconds) },
    { label: "Volume", value: bandVolume(m.volume_consistency) },
  ];
}
