/**
 * Server-side ingestion validator for the Phase 10 metrics payload.
 *
 * This is the ONE place a client-submitted `SessionMetricsPayload` is
 * accepted. Both finish routes (`app/api/interview/session/finish/route.ts`,
 * `app/api/scenario/session/finish/route.ts`) call `parseMetricsPayload` so
 * the two report types cannot drift on what counts as a valid payload.
 *
 * Also re-exports the `Json?`-column narrowing helpers (`asVisualMetrics`/
 * `asVocalMetrics`) so `lib/interview/evaluation-runner.ts` and
 * `lib/scenario/evaluation-runner.ts` read a report row's stored metrics
 * through the SAME discriminator that validated them on the way in, rather
 * than a third private copy.
 *
 * This module never throws and never causes a 400: a client that fails to
 * send metrics, or sends a malformed block, must still be able to finish its
 * session. An invalid or absent payload degrades to `{visual: null, vocal:
 * null}`, which becomes `INSUFFICIENT_DATA` downstream via
 * `lib/metrics/coverage.ts` — the honest outcome for "measurement was
 * attempted but nothing usable arrived."
 */

import { Prisma } from "@prisma/client";

import {
  VISUAL_DESCRIPTIVE_EPISODE_KINDS,
  VISUAL_EPISODE_KINDS,
  VISUAL_NOT_MEASURED_VOCABULARY,
  VISUAL_POSTURE_FLAGS,
  VISUAL_POSTURE_SIGNALS,
  type VisualCoverage,
  type VisualDescriptiveEpisode,
  type VisualDescriptiveEpisodeKind,
  type VisualDescriptiveObservations,
  type VisualMetrics,
  type VisualEpisode,
  type VisualEpisodeKind,
  type VisualNotMeasured,
  type VisualPostureFlag,
  type VisualPostureSignal,
  type VocalTurnMetrics,
  type VocalCoverage,
  type VocalMetrics,
} from "./types";

/** Hard cap on the serialized payload size.
 *
 * Raised from 8KB once the payload began carrying per-episode and per-turn
 * rows: 40 episodes plus 60 turn records is ~8-10KB of legitimate content on
 * its own. This is the ONLY REQ-38 guard that moves — `MEDIA_SHAPED_PATTERN`
 * and `MAX_STRING_LENGTH` below are the real defence and stay exactly as they
 * were, because every field added since is numeric or drawn from a closed
 * string vocabulary. The size cap was always belt-and-braces; the shape
 * checks are the belt. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

/** Structural caps on the two variable-length arrays, enforced in addition to
 * the byte budget above. The byte cap alone would let one array crowd out
 * everything else; these bound each independently. Mirrors the client-side
 * caps in `visual-capture.ts` and `vocal-capture.ts`. */
const MAX_EPISODES = 40;
const MAX_TURN_METRICS = 60;

/** Structural cap on the descriptive episode array (Phase 12), mirroring
 * `MAX_EPISODES`. Kept as its own named constant (not a reuse of
 * `MAX_EPISODES`) so the two can diverge later without one cap silently
 * governing both arrays. `MAX_PAYLOAD_BYTES` is NOT raised for this: 40 rows
 * of 4 numbers is well under 1KB, comfortably inside the existing 64KB
 * budget alongside the scored episode/turn arrays. */
const MAX_DESCRIPTIVE_EPISODES = 40;

/** No legitimate scalar field in this payload should ever produce a string
 * longer than this. Comfortably above the longest real filler-word-list
 * entry or posture flag, far below anything that could hold a meaningful
 * fragment of a data URL or a token. */
const MAX_STRING_LENGTH = 64;

/** Structural media-shape rejection (REQ-38, enforced server-side). A
 * compromised or buggy client must not be able to smuggle a frame, a blob
 * reference, or a URL through this door — the whole payload is rejected
 * (never partially accepted) the moment any string anywhere matches this or
 * exceeds `MAX_STRING_LENGTH`. */
const MEDIA_SHAPED_PATTERN = /^data:|^blob:|^https?:/i;

const MAX_FILLER_WORD_LIST_LENGTH = 12;

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clampNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function clampBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Walks the parsed object looking for any string that is media-shaped or
 * simply too long. Returns true the moment one is found — the caller then
 * rejects the WHOLE block, never a partial one.
 */
function containsMediaShapedString(value: unknown, depth = 0): boolean {
  if (depth > 6) return false; // pathological nesting; nothing legitimate goes this deep
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH || MEDIA_SHAPED_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsMediaShapedString(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      containsMediaShapedString(entry, depth + 1)
    );
  }
  return false;
}

function sanitizePostureFlags(value: unknown): VisualPostureFlag[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISUAL_POSTURE_FLAGS);
  return value.filter((entry): entry is VisualPostureFlag =>
    typeof entry === "string" && allowed.has(entry)
  );
}

/** Mirrors `sanitizePostureFlags`: filters to the full
 * `VISUAL_NOT_MEASURED_VOCABULARY` — NOT the narrower `VISUAL_NOT_MEASURED` —
 * so a tampered client cannot inject arbitrary strings into a list the
 * evaluator prompt treats as authoritative about what was never observed.
 * Allowlisting against the narrower constant would silently drop a genuine
 * `body_posture`/`hand_gestures` entry that `resolveNotMeasured` legitimately
 * emitted, which is exactly the "absence reads as clean" failure this list
 * exists to prevent — just relocated to this boundary instead of the capture
 * engine. See `VISUAL_NOT_MEASURED_VOCABULARY`'s own doc comment. */
function sanitizeNotMeasured(value: unknown): VisualNotMeasured[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISUAL_NOT_MEASURED_VOCABULARY);
  return value.filter((entry): entry is VisualNotMeasured =>
    typeof entry === "string" && allowed.has(entry)
  );
}

function sanitizeEpisodes(value: unknown): VisualEpisode[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISUAL_EPISODE_KINDS);
  const out: VisualEpisode[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.kind !== "string" || !allowed.has(e.kind)) continue;
    const start = clampNumber(e.start_s, 0, Number.MAX_SAFE_INTEGER);
    const end = clampNumber(e.end_s, 0, Number.MAX_SAFE_INTEGER);
    // A backwards interval would render as a nonsense time range on the
    // report; drop it rather than silently swapping the bounds.
    if (end < start) continue;
    out.push({
      kind: e.kind as VisualEpisodeKind,
      start_s: start,
      end_s: end,
      severity: clampNumber(e.severity, 0, 1),
    });
    if (out.length >= MAX_EPISODES) break;
  }
  return out;
}

/** Mirrors `sanitizePostureFlags`: filters to the closed `VISUAL_POSTURE_SIGNALS`
 * vocabulary so a tampered client cannot claim a landmark group was
 * measured when the server has no way to know that's true. */
function sanitizePostureSignals(value: unknown): VisualPostureSignal[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISUAL_POSTURE_SIGNALS);
  return value.filter((entry): entry is VisualPostureSignal =>
    typeof entry === "string" && allowed.has(entry)
  );
}

/**
 * A near-copy of `sanitizeEpisodes`, allowlisting
 * `VISUAL_DESCRIPTIVE_EPISODE_KINDS` instead of `VISUAL_EPISODE_KINDS`.
 * Deliberately NOT generalised into one shared function taking a kind list
 * as a parameter: keeping these as two separate functions is what makes the
 * scored/descriptive separation visible at the one place a tampered payload
 * is actually examined, rather than hidden behind a shared helper that
 * could later be called with the wrong list by mistake.
 */
function sanitizeDescriptiveEpisodes(value: unknown): VisualDescriptiveEpisode[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISUAL_DESCRIPTIVE_EPISODE_KINDS);
  const out: VisualDescriptiveEpisode[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.kind !== "string" || !allowed.has(e.kind)) continue;
    const start = clampNumber(e.start_s, 0, Number.MAX_SAFE_INTEGER);
    const end = clampNumber(e.end_s, 0, Number.MAX_SAFE_INTEGER);
    if (end < start) continue;
    out.push({
      kind: e.kind as VisualDescriptiveEpisodeKind,
      start_s: start,
      end_s: end,
      severity: clampNumber(e.severity, 0, 1),
    });
    if (out.length >= MAX_DESCRIPTIVE_EPISODES) break;
  }
  return out;
}

/** A non-number posture reading narrows to `null`, never `0` — a fabricated
 * zero-degree tilt would be an invented finding about a session where the
 * landmark was never actually measurable. */
function sanitizeNullableNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Returns `null` for a missing/garbage observations block, rather than a
 * half-populated object — mirrors `sanitizeVisualCoverage`'s all-or-nothing
 * discipline for the same reason: a partially-trusted descriptive block is
 * worse than none.
 */
function sanitizeObservations(value: unknown): VisualDescriptiveObservations | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    // BUG FIX (12-08 Task 1 checkpoint): `fidget_pct` removed — fidgeting
    // was retired to permanently not-measured, see
    // `VisualDescriptiveObservations`'s own comment in `types.ts`.
    phone_visible_seconds: clampNumber(v.phone_visible_seconds, 0, Number.MAX_SAFE_INTEGER),
    posture_shoulder_tilt_deg: sanitizeNullableNumber(
      v.posture_shoulder_tilt_deg,
      -180,
      180
    ),
    posture_forward_head_offset: sanitizeNullableNumber(
      v.posture_forward_head_offset,
      -1,
      1
    ),
    episodes: sanitizeDescriptiveEpisodes(v.episodes),
  };
}

function sanitizeTurnMetrics(value: unknown): VocalTurnMetrics[] {
  if (!Array.isArray(value)) return [];
  const out: VocalTurnMetrics[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const t = entry as Record<string, unknown>;
    out.push({
      turn_index: clampNonNegativeInt(t.turn_index),
      start_s: clampNumber(t.start_s, 0, Number.MAX_SAFE_INTEGER),
      duration_s: clampNumber(t.duration_s, 0, Number.MAX_SAFE_INTEGER),
      words_per_minute: clampNumber(t.words_per_minute, 0, 1000),
      filler_count: clampNonNegativeInt(t.filler_count),
      pause_count: clampNonNegativeInt(t.pause_count),
      volume_consistency: clampNumber(t.volume_consistency, 0, 1),
    });
    if (out.length >= MAX_TURN_METRICS) break;
  }
  return out;
}

function sanitizeFillerWordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, MAX_FILLER_WORD_LIST_LENGTH);
}

function sanitizeVisualCoverage(value: unknown): VisualCoverage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    session_seconds: clampNumber(v.session_seconds, 0, Number.MAX_SAFE_INTEGER),
    track_live_seconds: clampNumber(v.track_live_seconds, 0, Number.MAX_SAFE_INTEGER),
    expected_samples: clampNonNegativeInt(v.expected_samples),
    processed_samples: clampNonNegativeInt(v.processed_samples),
    face_detected_samples: clampNonNegativeInt(v.face_detected_samples),
    speaking_samples: clampNonNegativeInt(v.speaking_samples),
    listening_samples: clampNonNegativeInt(v.listening_samples),
    capture_offset_s: clampNumber(v.capture_offset_s, 0, Number.MAX_SAFE_INTEGER),
    sample_hz: clampNumber(v.sample_hz, 0, 1000),
    analyzer_error: clampBoolean(v.analyzer_error),
  };
}

function sanitizeVocalCoverage(value: unknown): VocalCoverage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    spoken_turns: clampNonNegativeInt(v.spoken_turns),
    typed_turns: clampNonNegativeInt(v.typed_turns),
    analyzed_turns: clampNonNegativeInt(v.analyzed_turns),
    spoken_seconds: clampNumber(v.spoken_seconds, 0, Number.MAX_SAFE_INTEGER),
    analyzer_error: clampBoolean(v.analyzer_error),
  };
}

function sanitizeVisualMetrics(value: unknown): VisualMetrics | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const coverage = sanitizeVisualCoverage(v.coverage);
  if (!coverage) return null;
  const result: VisualMetrics = {
    eye_contact_pct: clampNumber(v.eye_contact_pct, 0, 100),
    attentiveness_pct: clampNumber(v.attentiveness_pct, 0, 100),
    camera_centered_pct: clampNumber(v.camera_centered_pct, 0, 100),
    face_presence_pct: clampNumber(v.face_presence_pct, 0, 100),
    lighting_ok: clampBoolean(v.lighting_ok),
    posture_flags: sanitizePostureFlags(v.posture_flags),
    not_measured: sanitizeNotMeasured(v.not_measured),
    episodes: sanitizeEpisodes(v.episodes),
    coverage,
  };

  // Phase 12 scored body fields and the descriptive observations block are
  // emitted ONLY when present on the incoming payload, so a Phase 10-shaped
  // payload (no producer for any of these yet) still produces the identical
  // object it did before this plan — matching `visualBands`'s established
  // omit-don't-default discipline on the way out.
  if (typeof v.gesture_rate_per_min === "number") {
    result.gesture_rate_per_min = clampNumber(v.gesture_rate_per_min, 0, 600);
  }
  if (typeof v.gesture_amplitude_mean === "number") {
    result.gesture_amplitude_mean = clampNumber(v.gesture_amplitude_mean, 0, 1);
  }
  if (typeof v.hands_above_shoulder_pct === "number") {
    result.hands_above_shoulder_pct = clampNumber(v.hands_above_shoulder_pct, 0, 100);
  }
  if (typeof v.hands_near_face_pct === "number") {
    result.hands_near_face_pct = clampNumber(v.hands_near_face_pct, 0, 100);
  }
  if (typeof v.posture_drift_mean === "number") {
    result.posture_drift_mean = clampNumber(v.posture_drift_mean, 0, 1);
  }
  if (typeof v.posture_drift_max_s === "number") {
    result.posture_drift_max_s = clampNumber(v.posture_drift_max_s, 0, Number.MAX_SAFE_INTEGER);
  }
  if (Array.isArray(v.posture_signals_measured)) {
    result.posture_signals_measured = sanitizePostureSignals(v.posture_signals_measured);
  }
  const observations = sanitizeObservations(v.observations);
  if (observations) {
    result.observations = observations;
  }

  return result;
}

function sanitizeVocalMetrics(value: unknown): VocalMetrics | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const coverage = sanitizeVocalCoverage(v.coverage);
  if (!coverage) return null;
  return {
    words_per_minute: clampNumber(v.words_per_minute, 0, 1000),
    filler_word_count: clampNonNegativeInt(v.filler_word_count),
    filler_word_list: sanitizeFillerWordList(v.filler_word_list),
    pause_count: clampNonNegativeInt(v.pause_count),
    volume_consistency: clampNumber(v.volume_consistency, 0, 1),
    turns: sanitizeTurnMetrics(v.turns),
    coverage,
  };
}

/**
 * Converts a nullable metrics value into a Prisma `Json?`-write-safe value.
 * Prisma requires the sentinel `Prisma.JsonNull` (never a bare `null`) when
 * writing SQL `NULL` into a `Json?` column — a bare `null` there means "leave
 * the column untouched," not "clear it." Both finish routes use this at
 * their `prisma....Report.update` call sites so an absent metrics block is
 * actually stored as null rather than silently skipped.
 */
export function toMetricsJsonInput(
  value: VisualMetrics | VocalMetrics | null
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as unknown as Prisma.InputJsonValue);
}

/**
 * Parses and strictly validates a client-submitted metrics payload.
 *
 * Deliberately does NOT read or return `cameraMode`: the camera mode is
 * already locked on the report row at session start (plan 10-05) and never
 * mutated afterward. Accepting it again here would create a second,
 * client-controlled write path for a value REQ-35 requires to be immutable —
 * so this function has no way to even see it.
 *
 * Never throws. A missing, malformed, or media-shaped payload yields
 * `{visual: null, vocal: null}` — the caller must still be able to finish
 * its session.
 */
export function parseMetricsPayload(value: unknown): {
  visual: VisualMetrics | null;
  vocal: VocalMetrics | null;
} {
  const EMPTY = { visual: null, vocal: null } as const;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return EMPTY;
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    return EMPTY;
  }

  if (containsMediaShapedString(value)) {
    return EMPTY;
  }

  const v = value as Record<string, unknown>;
  const visual = sanitizeVisualMetrics(v.visual);
  const vocal = sanitizeVocalMetrics(v.vocal);

  return { visual, vocal };
}

/**
 * Re-parses a report row's stored `visualMetrics` `Json?` column back into
 * the shared type. Keyed on `coverage` plus one required numeric field so a
 * garbage or hand-edited row degrades to null instead of crashing a
 * background evaluation job.
 */
export function asVisualMetrics(value: unknown): VisualMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<VisualMetrics>;
  return typeof v.eye_contact_pct === "number" && v.coverage ? (value as VisualMetrics) : null;
}

/**
 * Re-parses a report row's stored `vocalMetrics` `Json?` column back into
 * the shared type. See `asVisualMetrics` for the narrowing rationale.
 */
export function asVocalMetrics(value: unknown): VocalMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<VocalMetrics>;
  return typeof v.words_per_minute === "number" && v.coverage ? (value as VocalMetrics) : null;
}
