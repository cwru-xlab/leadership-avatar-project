/**
 * Puts a report's three clocks on one timeline and picks each answer's excerpt.
 *
 * A session has more zero points than its field names suggest:
 *
 *   - Transcript clock: `report.startedAt` (or `log.startedAt` for a scenario).
 *     The evaluator reads [m:ss] stamps from it, so growth-area timecodes are on
 *     this clock. It is what the report displays.
 *   - Episode clock: visual capture start. `capture_offset_s` only bridges it
 *     to the shell's own start (avatar connected), which on an engine session
 *     is NOT `report.startedAt`: that row is created before the avatar connects.
 *   - Vocal clock: when the recorder hook mounted, which is earlier again.
 *     Turn times are not on the episode clock, whatever their name implies.
 *
 * New sessions record each capture's epoch (`capture_started_at_ms`), which
 * makes the conversion exact. Older rows are recovered from the transcript:
 *   - A turn is stamped once its transcription lands, so every answer gives one
 *     reading of the vocal-to-transcript gap, high by the transcription latency.
 *   - The auto-sent opening line is stamped the moment the shell's clock starts.
 *
 * Pure and client-safe. `moments-loader.ts` does the storage reads.
 */
import { FILLER_WORD_LEXICON } from "@/lib/metrics/types";
import type { VisualMetrics, VocalMetrics, VocalTurnMetrics } from "@/lib/metrics/types";

/** Auto-sent by `PracticeSessionShell.startOpening`. Never a student's answer. */
export const OPENING_LINE = "I’m ready to begin the interview.";

/** Longest plausible gap between an answer ending and its transcript stamp. */
const MAX_TRANSCRIPT_LAG_S = 12;
/** A vocal turn and a transcript turn this far apart in length are not the same answer. */
const WORD_RATIO_LIMIT = 2;
const WORD_SLACK = 3;

const EXCERPT_MAX_CHARS = 90;
/** Shorter sentences tend to be pleasantries ("Sure, thanks for asking."). */
const SUBSTANTIVE_WORDS = 6;

/** A student turn with its time on the transcript clock. */
export interface StudentTurn {
  content: string;
  atSeconds: number;
}

export type VocalClockBasis = "recorded" | "aligned" | "unanchored";
export type VisualClockBasis = "recorded" | "opening-line" | "log-start" | "capture-offset";

/** Seconds to add to each stored time to place it on the transcript clock. */
export interface SessionClock {
  vocalShiftS: number;
  visualShiftS: number;
  vocalBasis: VocalClockBasis;
  visualBasis: VisualClockBasis;
}

/** What the report needs from the transcript. Student-owned text only. */
export interface ReportMoments {
  clock: SessionClock;
  /** Excerpt per `VocalTurnMetrics.turn_index`; absent when no turn matched. */
  excerpts: Record<number, string>;
}

/** No transcript to read: the stored offset is the best available. */
export function fallbackClock(visual: VisualMetrics | null): SessionClock {
  return {
    vocalShiftS: 0,
    visualShiftS: visual?.coverage?.capture_offset_s ?? 0,
    vocalBasis: "unanchored",
    visualBasis: "capture-offset",
  };
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function plausiblySameAnswer(turn: VocalTurnMetrics, student: StudentTurn): boolean {
  if (!(turn.words_per_minute > 0)) return true;
  const measured = (turn.words_per_minute * turn.duration_s) / 60;
  const written = wordCount(student.content);
  return (
    written <= measured * WORD_RATIO_LIMIT + WORD_SLACK &&
    written >= measured / WORD_RATIO_LIMIT - WORD_SLACK
  );
}

function matchAtShift(
  turns: VocalTurnMetrics[],
  students: StudentTurn[],
  shift: number,
): { matches: Map<number, number>; residual: number } {
  const matches = new Map<number, number>();
  let residual = 0;
  let cursor = 0;
  for (const turn of turns) {
    const expected = turn.start_s + turn.duration_s + shift;
    for (let k = cursor; k < students.length; k += 1) {
      const lag = students[k].atSeconds - expected;
      if (lag > MAX_TRANSCRIPT_LAG_S) break;
      if (lag < -0.01 || !plausiblySameAnswer(turn, students[k])) continue;
      matches.set(turn.turn_index, k);
      residual += lag;
      cursor = k + 1;
      break;
    }
  }
  return { matches, residual };
}

/**
 * Turn order alone cannot pair these: typed answers have no vocal row, and a
 * spoken turn whose transcription failed has no transcript row. Each session
 * has one constant gap between the clocks, so try the gap every pairing implies
 * and keep the one that explains the most answers.
 */
export function alignVocalTurns(
  turns: VocalTurnMetrics[],
  students: StudentTurn[],
  recordedShift: number | null = null,
): { shift: number; matches: Map<number, number> } | null {
  if (turns.length === 0 || students.length === 0) return null;
  if (recordedShift !== null) {
    return { shift: recordedShift, matches: matchAtShift(turns, students, recordedShift).matches };
  }

  let best: { shift: number; matches: Map<number, number>; residual: number } | null = null;
  for (const turn of turns) {
    for (const student of students) {
      if (!plausiblySameAnswer(turn, student)) continue;
      const shift = student.atSeconds - (turn.start_s + turn.duration_s);
      const { matches, residual } = matchAtShift(turns, students, shift);
      if (matches.size === 0) continue;
      const better =
        !best ||
        matches.size > best.matches.size ||
        (matches.size === best.matches.size &&
          (residual < best.residual - 0.01 ||
            (Math.abs(residual - best.residual) <= 0.01 && Math.abs(shift) < Math.abs(best.shift))));
      if (better) best = { shift, matches, residual };
    }
  }
  return best && { shift: best.shift, matches: best.matches };
}

function isFillerOnly(sentence: string): boolean {
  const lexicon = new Set<string>(FILLER_WORD_LEXICON);
  return sentence
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean)
    .every((word) => lexicon.has(word));
}

function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().match(/.+?[.!?]+(?=\s|$)|.+$/g) ?? [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function trimToWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? room.slice(0, lastSpace) : room;
  return `${cut.replace(/[\s,;:.!?-]+$/, "")}…`;
}

/**
 * One short line of what the student said. The first sentence with some
 * substance, skipping any listed in `avoid` so two neighbouring answers that
 * open the same way can still be told apart. A short answer is kept whole.
 */
export function answerExcerpt(content: string, avoid: ReadonlySet<string> = new Set()): string | null {
  const sentences = splitSentences(content);
  if (sentences.length === 0) return null;
  const spoken = sentences.filter((sentence) => !isFillerOnly(sentence));
  const pool = spoken.length > 0 ? spoken : sentences;
  const ranked = [
    ...pool.filter((sentence) => wordCount(sentence) >= SUBSTANTIVE_WORDS),
    ...pool.filter((sentence) => wordCount(sentence) < SUBSTANTIVE_WORDS),
  ].map((sentence) => trimToWordBoundary(sentence, EXCERPT_MAX_CHARS));
  return ranked.find((line) => !avoid.has(line)) ?? ranked[0];
}

export interface BuildMomentsInput {
  vocal: VocalMetrics | null;
  visual: VisualMetrics | null;
  /** Transcript clock zero, epoch ms. */
  transcriptStartedAtMs: number;
  /** Every student turn in order, the opening line included. */
  studentTurns: { content: string; timestamp: number }[];
  /** A scenario's capture offset is already measured from the transcript's zero. */
  offsetIsFromTranscriptStart: boolean;
  /** Screens one student turn before it is quoted back. See `moments-loader.ts`. */
  sanitize?: (content: string) => { text: string; replaced: boolean };
}

export function buildReportMoments({
  vocal,
  visual,
  transcriptStartedAtMs,
  studentTurns,
  offsetIsFromTranscriptStart,
  sanitize,
}: BuildMomentsInput): ReportMoments {
  const toSeconds = (ms: number) => (ms - transcriptStartedAtMs) / 1000;
  const first = studentTurns[0];
  const hasOpeningLine = first?.content.trim() === OPENING_LINE;
  const answers: StudentTurn[] = studentTurns
    .slice(hasOpeningLine ? 1 : 0)
    .map((turn) => ({ content: turn.content, atSeconds: toSeconds(turn.timestamp) }));

  const offset = visual?.coverage?.capture_offset_s ?? 0;
  let visualShiftS = offset;
  let visualBasis: VisualClockBasis = offsetIsFromTranscriptStart ? "log-start" : "capture-offset";
  const visualEpoch = visual?.coverage?.capture_started_at_ms;
  if (typeof visualEpoch === "number") {
    visualShiftS = toSeconds(visualEpoch);
    visualBasis = "recorded";
  } else if (hasOpeningLine && !offsetIsFromTranscriptStart) {
    visualShiftS = toSeconds(first.timestamp) + offset;
    visualBasis = "opening-line";
  }

  const turns = Array.isArray(vocal?.turns) ? vocal.turns : [];
  const vocalEpoch = vocal?.coverage?.capture_started_at_ms;
  const recordedShift = typeof vocalEpoch === "number" ? toSeconds(vocalEpoch) : null;
  const aligned = alignVocalTurns(turns, answers, recordedShift);

  const excerpts: Record<number, string> = {};
  const used = new Set<string>();
  if (aligned) {
    for (const turn of turns) {
      const index = aligned.matches.get(turn.turn_index);
      if (index === undefined) continue;
      const screened = sanitize?.(answers[index].content);
      const line = screened?.replaced ? screened.text : answerExcerpt(answers[index].content, used);
      if (!line) continue;
      excerpts[turn.turn_index] = line;
      used.add(line);
    }
  }

  return {
    clock: {
      vocalShiftS: aligned?.shift ?? recordedShift ?? 0,
      visualShiftS,
      vocalBasis: recordedShift !== null ? "recorded" : aligned ? "aligned" : "unanchored",
      visualBasis,
    },
    excerpts,
  };
}

/**
 * The stored metrics with episode times moved onto the transcript clock, so the
 * offset is spent (zero) and `lib/metrics/bands.ts` renders them as they are. The
 * shift can be negative: an older row may be created after the avatar connected.
 *
 * Episodes are held inside the measured session first. Their ends are rounded up
 * when a run closes, so one can read a second past the moment capture stopped.
 */
export function reclockVisual(visual: VisualMetrics, clock: SessionClock): VisualMetrics {
  const session = visual.coverage?.session_seconds ?? 0;
  const limit = session > 0 ? session : Number.POSITIVE_INFINITY;
  const shift = clock.visualShiftS;
  function move<T extends { start_s: number; end_s: number }>(episodes: T[]): T[] {
    return episodes
      .filter((episode) => episode.start_s < limit)
      .map((episode) => ({
        ...episode,
        start_s: Math.max(0, episode.start_s + shift),
        end_s: Math.max(0, Math.min(episode.end_s, limit) + shift),
      }));
  }
  return {
    ...visual,
    episodes: move(visual.episodes ?? []),
    ...(visual.observations
      ? { observations: { ...visual.observations, episodes: move(visual.observations.episodes ?? []) } }
      : {}),
    coverage: { ...visual.coverage, capture_offset_s: 0 },
  };
}
