import type { StudyPlan } from "@prisma/client";

import { validateStudyPlanContent, type StudyPlanContent } from "./types";

export interface StudyPlanSummaryDTO {
  id: string;
  title: string;
  sourceReportCount: number;
  savedAt: string;
  priorityThemes: Array<{ priority: number; theme: string }>;
}

export interface StudyPlanDTO extends StudyPlanSummaryDTO {
  content: StudyPlanContent;
}

function contentFromRow(row: StudyPlan): StudyPlanContent {
  return validateStudyPlanContent(row.content, row.sourceReportCount);
}

/** Explicit mapping prevents future private model columns leaking to the client. */
export function toStudyPlanSummaryDTO(row: StudyPlan): StudyPlanSummaryDTO {
  const content = contentFromRow(row);
  return {
    id: row.id,
    title: row.title,
    sourceReportCount: row.sourceReportCount,
    savedAt: row.savedAt.toISOString(),
    priorityThemes: content.priorityThemes.map(({ priority, theme }) => ({ priority, theme })),
  };
}

export function toStudyPlanDTO(row: StudyPlan): StudyPlanDTO {
  const content = contentFromRow(row);
  return {
    id: row.id,
    title: row.title,
    sourceReportCount: row.sourceReportCount,
    savedAt: row.savedAt.toISOString(),
    priorityThemes: content.priorityThemes.map(({ priority, theme }) => ({ priority, theme })),
    content,
  };
}
