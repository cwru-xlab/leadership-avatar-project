/**
 * The five moves of a courageous conversation — common ground, facts, the
 * concern, inquiry, a next step — each Hit / Missed / N/A with the student's
 * own words, timecode and one coaching note. Same checklist body as the
 * problem-interview process steps (`ProcessStepsSection`).
 *
 * Self-nulls when the outcome carries no `conversationSteps` (every report
 * graded before the checklist existed), so old reports render unchanged.
 */

import type { ReportDTO } from "@/lib/report/dto";
import { asProcessStepResults } from "@/lib/problem-interview/outcome";
import {
  CONVERSATION_STEPS_OUTCOME_KEY,
  COURAGEOUS_CONVERSATION_FRAMEWORK,
} from "@/lib/difficult-conversation/framework";

import { ProcessStepsSection } from "./ProcessStepsPanel";

export default function ConversationStepsPanel({ report }: { report: ReportDTO }) {
  const raw = report.outcome?.[CONVERSATION_STEPS_OUTCOME_KEY];
  if (!asProcessStepResults(raw)) return null;

  return (
    <ProcessStepsSection
      framework={COURAGEOUS_CONVERSATION_FRAMEWORK}
      stepResults={raw}
      heading="The five moves"
      testId="conversation-steps"
      summaryStatuses={["hit", "missed", "not_applicable"]}
    />
  );
}
