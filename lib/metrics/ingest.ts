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
  VISUAL_POSTURE_FLAGS,
  type VisualCoverage,
  type VisualMetrics,
  type VisualPostureFlag,
  type VocalCoverage,
  type VocalMetrics,
} from "./types";

/** Hard cap on the serialized payload size. The only strings that
 * legitimately appear in this payload are short posture flags and short
 * filler words — nothing close to this size. A payload approaching it is
 * either a client bug or an attempt to smuggle something media-shaped
 * through this door. */
const MAX_PAYLOAD_BYTES = 8 * 1024;

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
  return {
    eye_contact_pct: clampNumber(v.eye_contact_pct, 0, 100),
    camera_centered_pct: clampNumber(v.camera_centered_pct, 0, 100),
    lighting_ok: clampBoolean(v.lighting_ok),
    posture_flags: sanitizePostureFlags(v.posture_flags),
    coverage,
  };
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
