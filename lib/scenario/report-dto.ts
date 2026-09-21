import type { ScenarioReport } from "@prisma/client";

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
