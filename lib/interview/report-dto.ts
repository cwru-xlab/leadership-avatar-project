import type { InterviewReport } from "@prisma/client";

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
