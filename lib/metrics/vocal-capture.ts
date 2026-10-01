/**
 * Phase 10 in-browser vocal capture engine.
 *
 * Browser-only module. Every browser API access sits inside a function body
 * (never at module scope), mirroring `lib/metrics/visual-capture.ts`'s
 * discipline so this file remains import-safe on the server.
 *
 * THE LATENCY DESIGN (this is the Task 3 budget resolution, measured — not
 * assumed — in `10-04-SUMMARY.md`). Word-timing analysis for a spoken turn is
 * fired the moment that turn's audio is available, WITHOUT being awaited by
 * the caller. Because that call overlaps the time the interviewer then takes
 * to respond (and the student takes to formulate their next answer), the
 * word-metrics analysis for turn N is normally already resolved well before
 * the session ends — by the time `drain()` is called at End, most or all
 * pending promises have already settled. `drain(timeoutMs)` bounds the worst
 * case for whatever has not. This is why NOTHING here adds to the 50s
 * evaluation budget (`lib/interview/evaluation.ts:213`), and why the existing
 * single-`status` polling model in both report pages needs no second axis —
 * the finished `VocalMetrics` object is ready client-side by the time the
 * finish request is built, and rides along in the SAME request/response that
 * already exists.
 *
 * MEASURED, NOT ESTIMATED (CONTEXT.md / `lib/interview/prompts.ts:218-222`):
 * words-per-minute, filler counts and pause counts are derived exclusively
 * from real word timings returned by `/api/audio/word-metrics`. Pause count
 * is derived from WORD GAPS, never from RMS silence — silence in the RMS
 * series may simply be the avatar talking, not the student pausing.
 *
 * TYPED TURNS ARE INERT (REQ-44): `recordTypedTurn()` increments only
 * `typedTurns`. It never touches `spokenTurns`, `spokenSeconds`, or any
 * metric numerator. This is deliberately NOT symmetric with the camera case
 * (an undetected face while the camera is ON scores DOWN) — typing is a
 * different modality, not weak vocal delivery.
 *
 * ZERO PERSISTENCE: this module writes to no browser storage API of any
 * kind — durable or ephemeral. The only Blob it ever touches is handed
 * straight to `fetch`'s body and is never retained past that call.
 */

import {
  FILLER_WORD_LEXICON,
  type VocalMetrics,
  type VocalTurnMetrics,
} from "@/lib/metrics/types";
import type { WordTiming } from "@/app/api/audio/word-metrics/route";

const RMS_POLL_MS = 100; // half the rate of the existing peak-RMS meter (REQ-49)
const RMS_FFT_SIZE = 2048;
const RMS_MAX_SAMPLES = 12_000; // ~20 minutes at 100ms polling, plain numbers only
const RMS_SPEECH_FLOOR = 0.01;
const RMS_MIN_ABOVE_FLOOR_SAMPLES = 20;
const PAUSE_GAP_SECONDS = 1.5;
/** How long `drain()` waits for outstanding word-metrics calls when the student
 * ends the session. Raised from 8s once the recording cap was removed: a long
 * FINAL turn is still transcribing when End is pressed, and abandoning it drops
 * that turn from `analyzed_turns` and from the per-turn breakdown. Bounded at
 * 15s rather than matched to the request timeout — this blocks the End button,
 * so waiting the full transcription budget would be a worse trade than losing
 * one turn's metrics. */
const DEFAULT_DRAIN_TIMEOUT_MS = 15_000;
const FILLER_LIST_CAP = 12;
/** Hard cap on retained per-turn rows. Over the cap the LONGEST turns
 * survive: a 90-second answer carries more signal about delivery than a
 * three-word acknowledgement. */
const TURN_METRICS_CAP = 60;

export interface VocalCaptureHandle {
  /** Begins/refreshes RMS metering against a live microphone stream. */
  attachStream(stream: MediaStream): void;
  /** Marks the start of a spoken turn. Stamps the turn's position on the
   * session clock and opens its RMS window, so delivery can be reported per
   * turn rather than only as a session average. */
  beginTurnRecording(): void;
  /** Fire-and-forget word-timing analysis for one spoken turn's audio. Never
   * awaited by the caller — see the file-level latency-design comment. */
  submitSpokenTurn(audio: Blob, elapsedMs: number): void;
  /** Records that this turn was typed, not spoken. Inert for every metric
   * numerator — REQ-44. */
  recordTypedTurn(): void;
  /** Tears down the RMS metering. Does not stop the MediaStream's tracks —
   * the caller owns the stream, matching `visual-capture.ts`'s convention. */
  detachStream(): void;
  /** Awaits all pending word-metrics calls (bounded by `timeoutMs`) and
   * returns the aggregated `VocalMetrics`, or `null` if nothing was ever
   * recorded. Never throws. */
  drain(timeoutMs?: number): Promise<VocalMetrics | null>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Lowercases and strips leading/trailing punctuation from one word token so
 * lexicon matching is case- and punctuation-insensitive without altering the
 * underlying timing data.
 */
function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");
}

/** Pure aggregation result for one analysed turn's word list, folded into the
 * running session totals by `mergeAnalysedTurn`. Exported so a throwaway
 * verification script can exercise it directly without a stubbed `fetch`. */
export interface TurnAggregate {
  wordCount: number;
  durationSec: number;
  pauseCount: number;
  fillerCount: number;
  fillerHits: string[];
}

/**
 * Computes pause count (from word gaps, within this turn only — a gap
 * BETWEEN turns is the interviewer speaking, never counted here) and filler
 * matches (single-token and multi-word lexicon entries, consuming matched
 * tokens so "you know" is never double-counted as two hits) for one turn's
 * word list. Pure and exported for direct testing.
 */
export function aggregateTurnWords(
  words: WordTiming[],
  durationSec: number
): TurnAggregate {
  let pauseCount = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap >= PAUSE_GAP_SECONDS) {
      pauseCount += 1;
    }
  }

  // Sort lexicon entries longest-first (by token count) so multi-word
  // entries are matched before any of their constituent single tokens.
  const lexiconByLength = [...FILLER_WORD_LEXICON].sort(
    (a, b) => b.split(" ").length - a.split(" ").length
  );

  const normalized = words.map((w) => normalizeToken(w.word));
  let fillerCount = 0;
  const fillerHits: string[] = [];
  let i = 0;
  while (i < normalized.length) {
    let matched = false;
    for (const entry of lexiconByLength) {
      const parts = entry.split(" ");
      if (parts.length === 1) continue; // handled below as single-token
      if (parts.every((p, offset) => normalized[i + offset] === p)) {
        fillerCount += 1;
        fillerHits.push(entry);
        i += parts.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if ((FILLER_WORD_LEXICON as readonly string[]).includes(normalized[i])) {
      fillerCount += 1;
      fillerHits.push(normalized[i]);
    }
    i += 1;
  }

  return {
    wordCount: words.length,
    durationSec,
    pauseCount,
    fillerCount,
    fillerHits,
  };
}

/**
 * Computes `volume_consistency` (1 = perfectly steady) from a rolling RMS
 * sample array: one minus the coefficient of variation over samples above
 * the speech floor, clamped to [0, 1]. Returns 0 when there are fewer than
 * `RMS_MIN_ABOVE_FLOOR_SAMPLES` above-floor samples — not enough signal to
 * defend a consistency claim. Pure and exported for direct testing.
 */
export function computeVolumeConsistency(rmsSamples: number[]): number {
  const aboveFloor = rmsSamples.filter((v) => v >= RMS_SPEECH_FLOOR);
  if (aboveFloor.length < RMS_MIN_ABOVE_FLOOR_SAMPLES) return 0;

  const mean = aboveFloor.reduce((sum, v) => sum + v, 0) / aboveFloor.length;
  const variance =
    aboveFloor.reduce((sum, v) => sum + (v - mean) ** 2, 0) / aboveFloor.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / Math.max(mean, 1e-6);
  return clamp01(1 - Math.min(1, coefficientOfVariation));
}

/**
 * Creates the vocal capture engine. See the file-level comment for the
 * latency design, the measured-not-estimated rule, and the typed-turn
 * inertness guarantee.
 */
export function createVocalCapture(): VocalCaptureHandle {
  // RMS metering state.
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let meterSource: MediaStreamAudioSourceNode | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let audioMeterError = false;
  const rmsSamples: number[] = [];

  // Turn/coverage state.
  let spokenTurns = 0;
  /** Capture-clock ms at which the engine was constructed; per-turn
   * `start_s` values are relative to this, matching `VisualEpisode`. */
  const captureStartMs = performance.now();
  /** Set by `beginTurnRecording`, consumed by the next `submitSpokenTurn`. */
  let pendingTurnStartS: number | null = null;
  let pendingTurnRmsIndex = 0;
  const turnMetrics: VocalTurnMetrics[] = [];
  let typedTurns = 0;
  let analysedTurns = 0;
  let spokenSecondsTotal = 0;
  let totalAnalysedWords = 0;
  let totalAnalysedSpokenSeconds = 0;
  let pauseCountTotal = 0;
  let fillerCountTotal = 0;
  const fillerListSeen = new Set<string>();
  let everAttached = false;
  let everRecordedTurn = false;

  const pending = new Set<Promise<void>>();

  function pushRmsSample(value: number) {
    rmsSamples.push(value);
    if (rmsSamples.length > RMS_MAX_SAMPLES) {
      rmsSamples.shift();
    }
  }

  function attachStream(stream: MediaStream): void {
    everAttached = true;
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!AudioContextConstructor) {
        audioMeterError = true;
        return;
      }
      const context = audioContext ?? new AudioContextConstructor();
      audioContext = context;
      if (context.state === "suspended") void context.resume();

      // Detach any previous source before attaching a new one (a "refresh").
      meterSource?.disconnect();
      if (meterTimer !== null) {
        clearInterval(meterTimer);
        meterTimer = null;
      }

      const node = context.createAnalyser();
      node.fftSize = RMS_FFT_SIZE;
      const source = context.createMediaStreamSource(stream);
      source.connect(node);
      analyser = node;
      meterSource = source;

      const samples = new Float32Array(node.fftSize);
      meterTimer = setInterval(() => {
        node.getFloatTimeDomainData(samples);
        let sumSquares = 0;
        for (let i = 0; i < samples.length; i++) {
          sumSquares += samples[i] * samples[i];
        }
        pushRmsSample(Math.sqrt(sumSquares / samples.length));
      }, RMS_POLL_MS);
    } catch {
      // Word-timing metrics can still succeed without the meter.
      audioMeterError = true;
    }
  }

  function beginTurnRecording(): void {
    // Two stamps, both consumed by the next `submitSpokenTurn`:
    //  - where this turn sits on the session clock, so an episode or a
    //    hesitant stretch can be tied back to what was being discussed;
    //  - where the RMS buffer stood, so `computeVolumeConsistency` can be run
    //    over THIS turn's slice instead of the whole session's.
    pendingTurnStartS = (performance.now() - captureStartMs) / 1000;
    pendingTurnRmsIndex = rmsSamples.length;
  }

  function submitSpokenTurn(audio: Blob, elapsedMs: number): void {
    everRecordedTurn = true;
    spokenTurns += 1;
    const elapsedSec = elapsedMs / 1000;
    spokenSecondsTotal += elapsedSec;

    // Snapshot the turn's identity NOW, into the closure. The response below
    // is fire-and-forget, so by the time it resolves `beginTurnRecording` may
    // already have stamped the NEXT turn — reading the pending fields inside
    // the callback would attribute this turn's delivery to the wrong moment.
    const turnIndex = spokenTurns - 1;
    const turnStartS =
      pendingTurnStartS ?? (performance.now() - captureStartMs) / 1000 - elapsedSec;
    const turnVolumeConsistency = computeVolumeConsistency(
      rmsSamples.slice(pendingTurnRmsIndex)
    );
    pendingTurnStartS = null;

    const formData = new FormData();
    formData.append("audio", audio, "turn.webm");

    // Fire-and-forget: intentionally NOT awaited here. See the file-level
    // latency-design comment.
    const task = fetch("/api/audio/word-metrics", {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        if (!res.ok) return; // leave analysedTurns unincremented
        const data = (await res.json()) as {
          words: WordTiming[];
          durationSec: number;
        };
        const agg = aggregateTurnWords(data.words, data.durationSec);

        // Retain the per-turn row BEFORE folding into session totals. Every
        // number here was already computed and then discarded; keeping it is
        // what lets the report contrast a fluent answer with a hesitant one
        // instead of averaging both into "Pace: Well paced".
        turnMetrics.push({
          turn_index: turnIndex,
          start_s: Math.round(turnStartS * 10) / 10,
          duration_s: Math.round(agg.durationSec * 10) / 10,
          words_per_minute:
            agg.durationSec > 0
              ? Math.round(agg.wordCount / (agg.durationSec / 60))
              : 0,
          filler_count: agg.fillerCount,
          pause_count: agg.pauseCount,
          volume_consistency: Math.round(turnVolumeConsistency * 100) / 100,
        });

        analysedTurns += 1;
        totalAnalysedWords += agg.wordCount;
        totalAnalysedSpokenSeconds += agg.durationSec;
        pauseCountTotal += agg.pauseCount;
        fillerCountTotal += agg.fillerCount;
        for (const hit of agg.fillerHits) {
          if (fillerListSeen.size < FILLER_LIST_CAP) {
            fillerListSeen.add(hit);
          }
        }
      })
      .catch(() => {
        // Rejection: leave analysedTurns unincremented — this is the vocal
        // liveness signal `resolveVocalOutcome` reads.
      });

    pending.add(task);
    void task.finally(() => pending.delete(task));
  }

  function recordTypedTurn(): void {
    everRecordedTurn = true;
    // Deliberately NOT symmetric with the camera case (REQ-44): typing is a
    // different modality, never a penalty. Touches nothing but this counter.
    typedTurns += 1;
  }

  function detachStream(): void {
    if (meterTimer !== null) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
    meterSource?.disconnect();
    meterSource = null;
    analyser = null;
  }

  async function drain(
    timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS
  ): Promise<VocalMetrics | null> {
    if (!everAttached && !everRecordedTurn) {
      return null;
    }

    const pendingList = Array.from(pending);
    if (pendingList.length > 0) {
      await Promise.race([
        Promise.allSettled(pendingList),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
    // Any promise that has not settled by now is simply not merged and not
    // counted as analysed — never a thrown error, never a blocked End button.

    const wordsPerMinute =
      totalAnalysedSpokenSeconds > 0
        ? totalAnalysedWords / (totalAnalysedSpokenSeconds / 60)
        : 0;

    const volumeConsistency = computeVolumeConsistency(rmsSamples);

    const analyzerErrorFlag = audioMeterError && analysedTurns === 0;

    return {
      words_per_minute: wordsPerMinute,
      filler_word_count: fillerCountTotal,
      filler_word_list: Array.from(fillerListSeen),
      pause_count: pauseCountTotal,
      volume_consistency: volumeConsistency,
      // Longest-first for the cap, then chronological so the report reads as
      // a progression through the conversation rather than a ranking.
      turns: [...turnMetrics]
        .sort((a, b) => b.duration_s - a.duration_s)
        .slice(0, TURN_METRICS_CAP)
        .sort((a, b) => a.turn_index - b.turn_index),
      coverage: {
        spoken_turns: spokenTurns,
        typed_turns: typedTurns,
        analyzed_turns: analysedTurns,
        spoken_seconds: spokenSecondsTotal,
        analyzer_error: analyzerErrorFlag,
      },
    };
  }

  return {
    attachStream,
    beginTurnRecording,
    submitSpokenTurn,
    recordTypedTurn,
    detachStream,
    drain,
  };
}
