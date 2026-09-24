import type { VisualMetrics, VocalMetrics } from "./types";

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
 *   lighting_ok         (Lighting):    true Clear, false Dim or uneven.
 *   posture_flags       (Presence):    empty Steady, out-of-frame flag only
 *                        "Drifts out of frame", movement flag only
 *                        "Restless", both "Drifts out of frame and restless".
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

function bandLighting(ok: boolean): string {
  return ok ? "Clear" : "Dim or uneven";
}

function bandPresence(flags: string[]): string {
  const outOfFrame = flags.includes("face_partially_out_of_frame");
  const restless = flags.includes("high_head_movement");
  if (outOfFrame && restless) return "Drifts out of frame and restless";
  if (outOfFrame) return "Drifts out of frame";
  if (restless) return "Restless";
  return "Steady";
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
  return [
    { label: "Eye contact", value: bandEyeContact(m.eye_contact_pct) },
    { label: "Framing", value: bandFraming(m.camera_centered_pct) },
    { label: "Lighting", value: bandLighting(m.lighting_ok) },
    { label: "Presence", value: bandPresence(m.posture_flags) },
  ];
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
