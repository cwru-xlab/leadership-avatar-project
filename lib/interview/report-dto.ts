import type { InterviewReport } from "@prisma/client";
import type {
  CameraMode,
  VisualMetrics,
  VocalMetrics,
  VisualUnscoredReason,
  VocalUnscoredReason,
} from "@/lib/metrics/types";

/**
 * Client-facing shape of an InterviewReport row.
 *
 * Deliberately excludes the S3 transcript pointer, the resume identifier and
 * text snapshot, and the owning user id — none of those private columns may
 * ever reach the browser. See `toInterviewReportDTO` for the explicit,
 * field-by-field mapping that enforces this.
 *
 * `customization` is derived, student-owned data: what industry, role,
 * difficulty, length and interviewer persona actually produced this session.
 * It is safe to return to its owner — the route this DTO backs is already
 * owner-scoped with a 404-never-403 contract. `interviewerPersona` here is
 * always the distilled, bounded summary produced at session start, never the
 * raw pasted third-party profile text, which is never stored. Rows written
 * before Phase 8 have all six source columns null, so every field in this
 * block is nullable too; no fallback guessing from `typeSlug` happens here —
 * that fallback chain belongs in the evaluator and the report page.
 */
export interface InterviewReportDTO {
  id: string;
  typeSlug: string;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
  interviewerName: string | null;
  turnCount: number;
  scores: {
    visual: number | null;
    vocal: number | null;
    content: number | null;
    behavioral: number | null;
  };
  /**
   * Phase 10 derived metrics. `cameraMode === null` marks a pre-Phase-10 row —
   * the "Not yet measured" legacy state (REQ-48). A non-null `visualUnscored`
   * or `vocalUnscored` carries the CAUSE of a null score, so the report page
   * never has to guess it back from the null (REQ-45).
   *
   * Safe to return to its owner: these are the student's own derived numbers
   * and the route this DTO backs is already owner-scoped with a
   * 404-never-403 contract. No media reference can appear here.
   */
  metrics: {
    cameraMode: CameraMode | null;
    visual: VisualMetrics | null;
    vocal: VocalMetrics | null;
    visualUnscored: VisualUnscoredReason | null;
    vocalUnscored: VocalUnscoredReason | null;
  };
  customization: {
    industry: string | null;
    roleTitle: string | null;
    difficulty: string | null;
    targetMinutes: number | null;
    targetQuestionCount: number | null;
    interviewerPersona: string | null;
  };
  reportMarkdown: string | null;
  failureReason: string | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
}

/**
 * Statuses that mean the report page should stop polling.
 */
export const REPORT_TERMINAL_STATUSES = ["READY", "FAILED"] as const;

/**
 * The `visualMetrics`/`vocalMetrics` columns are Prisma `Json?`, so they
 * arrive typed as `Prisma.JsonValue` (effectively `unknown`). This
 * defensively narrows to the shared shape, keyed on one field that only a
 * real payload would have. The column is written only by this app's own
 * metrics pipeline, but a hand-edited or pre-contract row must degrade to
 * null rather than crash the report page.
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
const VOCAL_UNSCORED_REASONS: readonly VocalUnscoredReason[] = ["TYPED_ONLY", "INSUFFICIENT_DATA"];

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
 * Maps a Prisma `InterviewReport` row to the client-facing DTO.
 *
 * This mapping is intentionally explicit, field by field. Never spread the
 * Prisma row here — an object spread would silently leak the S3 transcript
 * pointer and the resume text snapshot (and any future private column) the
 * instant it is added to the schema, with no compiler error to catch it.
 */
export function toInterviewReportDTO(row: InterviewReport): InterviewReportDTO {
  return {
    id: row.id,
    typeSlug: row.typeSlug,
    status: row.status,
    interviewerName: row.interviewerName,
    turnCount: row.turnCount,
    scores: {
      visual: row.visualScore,
      vocal: row.vocalScore,
      content: row.contentScore,
      behavioral: row.behavioralScore,
    },
    metrics: {
      cameraMode: asCameraMode(row.cameraMode),
      visual: asVisualMetrics(row.visualMetrics),
      vocal: asVocalMetrics(row.vocalMetrics),
      visualUnscored: asVisualUnscoredReason(row.visualUnscoredReason),
      vocalUnscored: asVocalUnscoredReason(row.vocalUnscoredReason),
    },
    customization: {
      industry: row.industry,
      roleTitle: row.roleTitle,
      difficulty: row.difficulty,
      targetMinutes: row.targetMinutes,
      targetQuestionCount: row.targetQuestionCount,
      interviewerPersona: row.interviewerPersona,
    },
    reportMarkdown: row.reportMarkdown,
    failureReason: row.failureReason,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
