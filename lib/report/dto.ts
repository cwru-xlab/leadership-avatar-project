import { asStructuredReport, type StructuredReport } from "@/lib/report/structured";
import { asInputSnapshot, asScoreMap, type InputSnapshot, type ScoreMap } from "@/lib/report/snapshot";
import type { InteractionReport } from "@prisma/client";
import type {
  CameraMode,
  VisualMetrics,
  VocalMetrics,
  VisualUnscoredReason,
  VocalUnscoredReason,
} from "@/lib/metrics/types";

/**
 * Client-facing shape of an `InteractionReport` row — the ONE report DTO
 * every report surface consumes going forward, replacing
 * `lib/interview/report-dto.ts`'s `InterviewReportDTO` and
 * `lib/scenario/report-dto.ts`'s `ScenarioReportDTO`.
 *
 * Built as the UNION of what both legacy DTOs expose, so neither surface
 * loses a field: `scores`/`metrics` follow the same shape both legacy DTOs
 * already used; `input` replaces both legacy DTOs' type-specific
 * `customization` / `scenario` blocks with one discriminated union (see
 * `lib/report/snapshot.ts`); `terminationReason`/`outcome` are new,
 * engine-level fields (REQ-62/REQ-64) neither legacy table carries.
 *
 * Deliberately excludes the same private columns the legacy DTOs already
 * excluded: the owning user id, the S3 transcript/log pointers
 * (`transcriptKey`/`interactionLogId`/`studentEmail`), `evalModel`,
 * `createdAt`, `updatedAt`. See `toReportDto` for the explicit,
 * field-by-field mapping that enforces this — never spread the Prisma row.
 */
export interface ReportDTO {
  id: string;
  typeSlug: string;
  /** Student-chosen or finish-time default display name. Null on pre-title rows. */
  title: string | null;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
  turnCount: number;
  /** Dimension-keyed score map (see `ScoreMap`). Replaces the four fixed
   * score columns both legacy DTOs exposed as a `{visual, vocal, content,
   * behavioral}` object — `null` when the row has no scores at all. */
  scores: ScoreMap | null;
  /**
   * Phase 10 derived metrics. `cameraMode === null` marks a pre-Phase-10
   * row — the "Not yet measured" legacy state (REQ-48). A non-null
   * `visualUnscored` or `vocalUnscored` carries the CAUSE of a null score,
   * so the report page never has to guess it back from the null (REQ-45).
   * Sourced from the one shared `lib/metrics/types.ts` contract — never a
   * private duplicate shape.
   */
  metrics: {
    cameraMode: CameraMode | null;
    visual: VisualMetrics | null;
    vocal: VocalMetrics | null;
    visualUnscored: VisualUnscoredReason | null;
    vocalUnscored: VocalUnscoredReason | null;
  };
  /** Per-type input snapshot (see `InputSnapshot`), discriminated on
   * `kind`. `null` on a legacy row or a row written before the snapshot
   * was recorded. Includes `kind: "difficult-conversation"` when present
   * (narrowed by `asInputSnapshot` — never cherry-picked here). */
  input: InputSnapshot | null;
  /** REQ-62: the recorded reason an avatar-initiated end produced. `null`
   * means the session ended normally. */
  terminationReason: string | null;
  /** Session-clock seconds where termination turned, when recorded.
   * `null` when the session ended without a stamped turn (or was rejected). */
  terminationAtSeconds: number | null;
  /**
   * REQ-64: the type-declared outcome record. `null` when the type has
   * none or the session never reached one. Narrowed to a plain object —
   * keyed by the type's own field names, not a type-specific DTO shape.
   *
   * The outcome record is data the report RENDERS. It is never applied
   * to a score here or anywhere else — CONTEXT.md rejects letting the
   * outcome cap or lift a dimension. If you are adding arithmetic that
   * reads `outcome` and writes a score, stop.
   */
  outcome: Record<string, unknown> | null;
  /**
   * Furthest 0-based slide index revealed during a deck session.
   * `null` means nothing was revealed (or the type has no slides).
   */
  slideHighWaterMark: number | null;
  /**
   * Ordered reveal trail for a deck session. Narrowed through
   * `asSlideReveals` — never raw JSON into a component. `null` when
   * absent or unparseable.
   */
  slideReveals: SlideRevealDto[] | null;
  /**
   * Scheduled soft envelope in seconds (deck adjustable budget).
   * `null` when the type has no session budget.
   */
  timeBudgetSeconds: number | null;
  /**
   * Wall-clock session duration in seconds, computed from
   * `startedAt`/`completedAt` so overrun panels do no date arithmetic.
   * `null` when `completedAt` is missing.
   */
  elapsedSeconds: number | null;
  /** Structured body (see `lib/report/structured.ts`). Null on pre-migration
   * rows, which fall back to rendering `reportMarkdown`. */
  reportStructured: StructuredReport | null;
  reportMarkdown: string | null;
  failureReason: string | null;
  evalModel: string | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
}

/** One slide-reveal event as the report page consumes it (14-05 trail). */
export interface SlideRevealDto {
  index: number;
  atTurnIndex: number;
  atElapsedSeconds: number;
}

/**
 * Statuses that mean the report page should stop polling. Matches
 * `lib/interview/report-dto.ts`'s `REPORT_TERMINAL_STATUSES` /
 * `lib/scenario/report-dto.ts`'s `SCENARIO_REPORT_TERMINAL_STATUSES`
 * polling contract.
 */
export const REPORT_TERMINAL_STATUSES = ["READY", "FAILED"] as const;

/**
 * The `visualMetrics`/`vocalMetrics` columns are Prisma `Json?`, so they
 * arrive typed as `Prisma.JsonValue` (effectively `unknown`). This
 * defensively narrows to the shared shape, keyed on one field that only a
 * real payload would have — copied verbatim from both legacy DTOs, which
 * had this identical function.
 */
function asVisualMetrics(value: unknown): VisualMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<VisualMetrics>;
  return typeof v.eye_contact_pct === "number" && v.coverage ? (value as VisualMetrics) : null;
}

function asVocalMetrics(value: unknown): VocalMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<VocalMetrics>;
  return typeof v.words_per_minute === "number" && v.coverage ? (value as VocalMetrics) : null;
}

const CAMERA_MODES: readonly CameraMode[] = ["ON", "OFF"];
const VISUAL_UNSCORED_REASONS: readonly VisualUnscoredReason[] = [
  "CAMERA_OFF_OPTOUT",
  "INSUFFICIENT_DATA",
];
// Same allowlist discipline as both legacy DTOs (12-08 Task 1 checkpoint,
// Defect F) — an unrecognized reason value is dropped to null on read.
const VOCAL_UNSCORED_REASONS: readonly VocalUnscoredReason[] = [
  "TYPED_ONLY",
  "SPEECH_TOO_SHORT",
  "INSUFFICIENT_DATA",
];

function asCameraMode(value: string | null): CameraMode | null {
  return value !== null && (CAMERA_MODES as readonly string[]).includes(value)
    ? (value as CameraMode)
    : null;
}

function asVisualUnscoredReason(value: string | null): VisualUnscoredReason | null {
  return value !== null && (VISUAL_UNSCORED_REASONS as readonly string[]).includes(value)
    ? (value as VisualUnscoredReason)
    : null;
}

function asVocalUnscoredReason(value: string | null): VocalUnscoredReason | null {
  return value !== null && (VOCAL_UNSCORED_REASONS as readonly string[]).includes(value)
    ? (value as VocalUnscoredReason)
    : null;
}

/** Declared objective-status values for conversation outcome panels. */
const OBJECTIVE_STATUSES = [
  "met",
  "partially_met",
  "not_met",
  "avatar_ended",
] as const;

export type ConversationObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

/** One causal turn cited by the character's private reaction. */
export interface ConversationReactionCause {
  timecodeSeconds: number;
  quote: string;
  effect: string;
}

/**
 * Narrowed view of a conversation outcome record for report panels.
 *
 * Not a DTO field type — `ReportDTO.outcome` stays generic (`unknown`).
 * Malformed fields degrade to absent; never throws. A partial outcome
 * must still let scores render.
 */
export interface ConversationOutcomeView {
  objectiveStatus: ConversationObjectiveStatus | null;
  objectiveNote: string | null;
  inRoleReaction: string | null;
  reactionCauses: ConversationReactionCause[] | null;
  endTurnReasons: string | null;
  endTurnTimecodeSeconds: number | null;
}

function asObjectiveStatus(value: unknown): ConversationObjectiveStatus | null {
  return typeof value === "string" &&
    (OBJECTIVE_STATUSES as readonly string[]).includes(value)
    ? (value as ConversationObjectiveStatus)
    : null;
}

function asReactionCauses(value: unknown): ConversationReactionCause[] | null {
  let raw: unknown = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const out: ConversationReactionCause[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.timecodeSeconds !== "number" ||
      !Number.isFinite(row.timecodeSeconds) ||
      typeof row.quote !== "string" ||
      typeof row.effect !== "string"
    ) {
      continue;
    }
    out.push({
      timecodeSeconds: row.timecodeSeconds,
      quote: row.quote,
      effect: row.effect,
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * Defensively narrows an unknown outcome JSON value into the conversation
 * panel view. Any malformed field degrades to absent — never throws — so a
 * report whose evaluator produced a partial outcome still renders its scores.
 */
export function asConversationOutcome(value: unknown): ConversationOutcomeView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const view: ConversationOutcomeView = {
    objectiveStatus: asObjectiveStatus(v.objectiveStatus),
    objectiveNote: typeof v.objectiveNote === "string" ? v.objectiveNote : null,
    inRoleReaction:
      typeof v.inRoleReaction === "string" && v.inRoleReaction.trim()
        ? v.inRoleReaction
        : null,
    reactionCauses: asReactionCauses(v.reactionCauses),
    endTurnReasons:
      typeof v.endTurnReasons === "string" && v.endTurnReasons.trim()
        ? v.endTurnReasons
        : null,
    endTurnTimecodeSeconds:
      typeof v.endTurnTimecodeSeconds === "number" &&
      Number.isFinite(v.endTurnTimecodeSeconds)
        ? v.endTurnTimecodeSeconds
        : null,
  };
  // If every field is absent, treat as no outcome rather than an empty shell.
  if (
    view.objectiveStatus === null &&
    view.objectiveNote === null &&
    view.inRoleReaction === null &&
    view.reactionCauses === null &&
    view.endTurnReasons === null &&
    view.endTurnTimecodeSeconds === null
  ) {
    return null;
  }
  return view;
}

/**
 * Narrow an unknown outcome JSON value to a plain object. Arrays and
 * primitives become null — components never receive raw Prisma Json.
 */
export function asOutcomeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Narrow the slide-reveal trail the same way `asInputSnapshot` narrows
 * snapshots — malformed entries are dropped, never thrown.
 */
export function asSlideReveals(value: unknown): SlideRevealDto[] | null {
  if (!Array.isArray(value)) return null;
  const out: SlideRevealDto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.index !== "number" ||
      !Number.isFinite(row.index) ||
      typeof row.atTurnIndex !== "number" ||
      !Number.isFinite(row.atTurnIndex) ||
      typeof row.atElapsedSeconds !== "number" ||
      !Number.isFinite(row.atElapsedSeconds)
    ) {
      continue;
    }
    out.push({
      index: Math.trunc(row.index),
      atTurnIndex: Math.trunc(row.atTurnIndex),
      atElapsedSeconds: Math.trunc(row.atElapsedSeconds),
    });
  }
  return out.length > 0 ? out : null;
}

/** Elapsed session seconds from started/completed ISO strings. */
export function computeElapsedSeconds(
  startedAt: string,
  completedAt: string | null,
): number | null {
  if (!completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

/**
 * Maps a Prisma `InteractionReport` row to the unified client-facing DTO.
 *
 * This mapping is intentionally explicit, field by field — never spread
 * the Prisma row here, for the same reason both legacy DTOs never did: an
 * object spread would silently leak `userId`, `transcriptKey`,
 * `interactionLogId`, `studentEmail`, `evalModel`'s private-by-convention
 * neighbours, or any future private column the instant it is added to the
 * schema, with no compiler error to catch it.
 *
 * Preserves the legacy null-guard: when `row.cameraMode === null` the
 * metrics block degrades to the same "pre-Phase-10 legacy row" state both
 * current DTOs emit — `visualUnscored`/`vocalUnscored` stay null and
 * nothing is synthesized (REQ-48), via the same `asCameraMode` narrowing
 * both legacy DTOs already used.
 */
export function toReportDto(row: InteractionReport): ReportDTO {
  const startedAt = row.startedAt.toISOString();
  const completedAt = row.completedAt ? row.completedAt.toISOString() : null;
  return {
    id: row.id,
    typeSlug: row.typeSlug,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : null,
    status: row.status,
    turnCount: row.turnCount,
    scores: asScoreMap(row.scores),
    metrics: {
      cameraMode: asCameraMode(row.cameraMode),
      visual: asVisualMetrics(row.visualMetrics),
      vocal: asVocalMetrics(row.vocalMetrics),
      visualUnscored: asVisualUnscoredReason(row.visualUnscoredReason),
      vocalUnscored: asVocalUnscoredReason(row.vocalUnscoredReason),
    },
    // Pass the whole narrowed InputSnapshot union through — never
    // cherry-pick interview-only fields (13-02 pitch-input defect fix).
    input: asInputSnapshot(row.inputSnapshot),
    terminationReason: row.terminationReason,
    terminationAtSeconds:
      typeof row.terminationAtSeconds === "number" ? row.terminationAtSeconds : null,
    outcome: asOutcomeRecord(row.outcome),
    slideHighWaterMark:
      typeof row.slideHighWaterMark === "number" ? row.slideHighWaterMark : null,
    slideReveals: asSlideReveals(row.slideReveals),
    timeBudgetSeconds:
      typeof row.timeBudgetSeconds === "number" ? row.timeBudgetSeconds : null,
    elapsedSeconds: computeElapsedSeconds(startedAt, completedAt),
    reportStructured: asStructuredReport(row.reportStructured),
    reportMarkdown: row.reportMarkdown,
    failureReason: row.failureReason,
    evalModel: row.evalModel,
    startedAt,
    completedAt,
  };
  // Deliberately excluded, never in the object literal above:
  // row.userId, row.transcriptKey, row.interactionLogId, row.studentEmail,
  // row.createdAt, row.updatedAt.
}
