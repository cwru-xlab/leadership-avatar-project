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
   * was recorded. */
  input: InputSnapshot | null;
  /** REQ-62: the recorded reason an avatar-initiated end produced. `null`
   * means the session ended normally. */
  terminationReason: string | null;
  /** REQ-64: the type-declared outcome record. `null` when the type has
   * none or the session never reached one. */
  outcome: unknown | null;
  /** Structured body (see `lib/report/structured.ts`). Null on pre-migration
   * rows, which fall back to rendering `reportMarkdown`. */
  reportStructured: StructuredReport | null;
  reportMarkdown: string | null;
  failureReason: string | null;
  evalModel: string | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
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
  return {
    id: row.id,
    typeSlug: row.typeSlug,
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
    input: asInputSnapshot(row.inputSnapshot),
    terminationReason: row.terminationReason,
    outcome: row.outcome,
    reportStructured: asStructuredReport(row.reportStructured),
    reportMarkdown: row.reportMarkdown,
    failureReason: row.failureReason,
    evalModel: row.evalModel,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
  // Deliberately excluded, never in the object literal above:
  // row.userId, row.transcriptKey, row.interactionLogId, row.studentEmail,
  // row.createdAt, row.updatedAt.
}
