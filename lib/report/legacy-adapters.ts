/**
 * Adapters that reshape the unified `ReportDTO` into the legacy per-type
 * DTO shapes the un-migrated report pages and `/reports` list still consume
 * until plan 13-12 / 13-13 move them. Pure projection — no DB reads.
 */

import type { InterviewReportDTO } from "@/lib/interview/report-dto";
import type { ScenarioReportDTO } from "@/lib/scenario/report-dto";
import type { ReportDTO } from "@/lib/report/dto";

function fourScores(scores: ReportDTO["scores"]): InterviewReportDTO["scores"] {
  return {
    visual: scores?.visual ?? null,
    vocal: scores?.vocal ?? null,
    content: scores?.content ?? null,
    behavioral: scores?.behavioral ?? null,
  };
}

/** Project unified DTO → `InterviewReportDTO` for legacy interview pages. */
export function toLegacyInterviewReportDTO(dto: ReportDTO): InterviewReportDTO {
  const input = dto.input?.kind === "interview" ? dto.input : null;

  return {
    id: dto.id,
    typeSlug: dto.typeSlug,
    status: dto.status,
    interviewerName: input?.interviewerName ?? null,
    turnCount: dto.turnCount,
    scores: fourScores(dto.scores),
    metrics: dto.metrics,
    customization: {
      industry: input?.industry ?? null,
      roleTitle: input?.roleTitle ?? null,
      difficulty: input?.difficulty ?? null,
      targetMinutes: input?.targetMinutes ?? null,
      targetQuestionCount: input?.targetQuestionCount ?? null,
      interviewerPersona: input?.interviewerPersona ?? null,
    },
    reportStructured: dto.reportStructured,
    reportMarkdown: dto.reportMarkdown,
    failureReason: dto.failureReason,
    startedAt: dto.startedAt,
    completedAt: dto.completedAt,
  };
}

/** Project unified DTO → `ScenarioReportDTO` for legacy case-play pages. */
export function toLegacyScenarioReportDTO(dto: ReportDTO): ScenarioReportDTO {
  const input = dto.input?.kind === "scenario" ? dto.input : null;

  const characters: ScenarioReportDTO["scenario"]["characters"] = [];
  if (Array.isArray(input?.avatars)) {
    for (const entry of input.avatars) {
      if (entry && typeof entry === "object") {
        const name = (entry as Record<string, unknown>).name;
        const role = (entry as Record<string, unknown>).role;
        characters.push({
          name: typeof name === "string" ? name : "",
          role: typeof role === "string" ? role : "",
        });
      }
    }
  }

  return {
    id: dto.id,
    caseId: input?.caseId ?? "",
    status: dto.status,
    turnCount: dto.turnCount,
    scores: fourScores(dto.scores),
    metrics: dto.metrics,
    scenario: {
      name: input?.caseName ?? "",
      background: input?.background ?? "",
      characters,
      criteria: input?.criteria ?? null,
    },
    reportStructured: dto.reportStructured,
    reportMarkdown: dto.reportMarkdown,
    failureReason: dto.failureReason,
    startedAt: dto.startedAt,
    completedAt: dto.completedAt,
  };
}
