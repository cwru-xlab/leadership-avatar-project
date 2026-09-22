import type { ScenarioReport } from "@prisma/client";
import type {
  CameraMode,
  VisualMetrics,
  VocalMetrics,
  VisualUnscoredReason,
  VocalUnscoredReason,
} from "@/lib/metrics/types";

/**
 * Client-facing shape of a ScenarioReport row.
 *
 * Deliberately excludes `userId` (the owning user's id), `studentEmail`,
 * `interactionLogId` (the S3 transcript pointer), `evalModel`, `createdAt`,
 * and `updatedAt` — none of those private columns may ever reach the
 * browser. See `toScenarioReportDTO` for the explicit, field-by-field
 * mapping that enforces this, mirroring the same discipline documented in
 * `lib/interview/report-dto.ts`.
 *
 * `scenario` is the REQ-33 run-time snapshot (`caseName`,
 * `backgroundSnapshot`, `avatarsSnapshot`, `criteriaSnapshot`) — safe to
 * show its owner because it was written once when the run happened and
 * never mutates, and because each character entry is narrowed to only
 * `{ name, role }` (see `toScenarioReportCharacters`), stripping the
 * character's hidden `additionalInfo` briefing before it ever leaves this
 * module.
 */
export interface ScenarioReportCharacterDTO {
  name: string;
  role: string;
}

export interface ScenarioReportDTO {
  id: string;
  caseId: string;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
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
  scenario: {
    name: string;
    background: string;
    characters: ScenarioReportCharacterDTO[];
    criteria: string | null;
  };
  reportMarkdown: string | null;
  failureReason: string | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
}

/**
 * Statuses that mean the report page should stop polling. Matches
 * `lib/interview/report-dto.ts`'s `REPORT_TERMINAL_STATUSES` polling
 * contract.
 */
export const SCENARIO_REPORT_TERMINAL_STATUSES = ["READY", "FAILED"] as const;

/**
 * `avatarsSnapshot` is a Prisma `Json` column, so it arrives typed as
 * `Prisma.JsonValue` (not a typed array). This defensively narrows it to a
 * plain `{ name, role }[]`, dropping `profileId`, `id`, and — critically —
 * `additionalInfo`, which is each character's hidden briefing and must
 * never reach the report page. Anything that isn't an array (including
 * `null`, a legacy row's default, or a malformed value) becomes `[]`.
 */
function toScenarioReportCharacters(
  avatarsSnapshot: unknown
): ScenarioReportCharacterDTO[] {
  if (!Array.isArray(avatarsSnapshot)) return [];

  const characters: ScenarioReportCharacterDTO[] = [];
  for (const entry of avatarsSnapshot) {
    if (entry && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name;
      const role = (entry as Record<string, unknown>).role;
      characters.push({
        name: typeof name === "string" ? name : "",
        role: typeof role === "string" ? role : "",
      });
    }
  }
  return characters;
}

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
 * Maps a Prisma `ScenarioReport` row to the client-facing DTO.
 *
 * This mapping is intentionally explicit, field by field. Never spread the
 * Prisma row here — an object spread would silently leak `userId`,
 * `studentEmail`, `interactionLogId`, `evalModel`, and any future private
 * column the instant it is added to the schema, with no compiler error to
 * catch it.
 */
export function toScenarioReportDTO(row: ScenarioReport): ScenarioReportDTO {
  return {
    id: row.id,
    caseId: row.caseId,
    status: row.status,
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
    scenario: {
      name: row.caseName,
      background: row.backgroundSnapshot,
      characters: toScenarioReportCharacters(row.avatarsSnapshot),
      criteria: row.criteriaSnapshot,
    },
    reportMarkdown: row.reportMarkdown,
    failureReason: row.failureReason,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
  // Deliberately excluded, never in the object literal above:
  // row.userId, row.studentEmail, row.interactionLogId, row.evalModel,
  // row.createdAt, row.updatedAt.
}
