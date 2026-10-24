/**
 * Phase 23 VOICE_DRILL shared shapes: the brief generated at path-generation
 * time, and the DTOs the drill API returns. The client contract is written up
 * in .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md.
 */
import type { CompetencyKey } from "../../mastery/competencies";
import type { CameraMode, VisualMetrics, VocalMetrics } from "../../metrics/types";

/** 23-CONTEXT.md: "a short 60-90s spoken rep". The shell shows a soft timer;
 * nothing hard-stops the student. */
export const DRILL_DURATION = { minSeconds: 60, maxSeconds: 90 } as const;

/** Below this much speech there is nothing to grade; completion is refused
 * (the student can simply try again). PROVISIONAL UNTIL CALIBRATED. */
export const MIN_GRADABLE_TRANSCRIPT_WORDS = 25;

export const PROMPT_BASES = ["MOMENT", "THEME", "COMPETENCY"] as const;
export type PromptBasis = (typeof PROMPT_BASES)[number];

/** What a VoiceDrill row stores about its brief. */
export interface VoiceDrillBrief {
  competencyKey: CompetencyKey;
  scenarioPrompt: string;
  /** ONE technique reminder, verbatim from the closed TECHNIQUE_LIBRARY. */
  tipText: string;
  techniqueId: string | null;
  promptBasis: PromptBasis;
  /** REQ-110 provenance, set only when the prompt quotes the student. */
  sourceReportId: string | null;
  quotedTurnIndex: number | null;
  quotedText: string | null;
  /** "template" or the model id that produced the prompt. */
  generationModel: string;
}

/** GET /api/study-plans/path-steps/{stepId}/drill */
export interface VoiceDrillDTO {
  stepId: string;
  planId: string;
  competencyKey: CompetencyKey;
  competencyLabel: string;
  scenarioPrompt: string;
  tipText: string;
  /** Present only when the prompt quotes the student's own line. */
  quotedText: string | null;
  durationSeconds: typeof DRILL_DURATION;
  stepStatus: string;
  attempts: VoiceDrillAttemptDTO[];
}

/**
 * An attempt as the client sees it. `score` and `feedback` are null until
 * the attempt is COMPLETED and graded — the API never exposes a number for
 * an open attempt, so nothing numeric can appear mid-drill.
 */
export interface VoiceDrillAttemptDTO {
  id: string;
  startedAt: string;
  completedAt: string | null;
  /** 1..5 on the shared rubric scale; null while open or ungraded. */
  score: number | null;
  /** The one "what to try next time" note. */
  feedback: string | null;
  /** Delivery figures shown with the result (null while open). */
  delivery: DrillDeliverySummary | null;
}

export interface DrillDeliverySummary {
  wordsPerMinute: number | null;
  fillerWordCount: number | null;
  pauseCount: number | null;
  eyeContactPct: number | null;
  spokenSeconds: number | null;
}

/** POST .../drill/attempts/{attemptId}/complete body. */
export interface CompleteDrillAttemptBody {
  transcript: string;
  spokenDurationMs: number;
  cameraMode: CameraMode;
  /** Same payload shape practice finish routes accept (SessionMetricsPayload
   * minus cameraMode); validated with parseMetricsPayload. */
  metrics: { visual: VisualMetrics | null; vocal: VocalMetrics | null } | null;
}
