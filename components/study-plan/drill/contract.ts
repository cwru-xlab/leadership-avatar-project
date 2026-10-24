/**
 * The props contract for the VOICE_DRILL runner, to be mounted on the shared
 * session shell (camera consent, self-view + visual capture, vocal capture,
 * push-to-talk) once that shell is extracted (Phase 22 G4 / the shared-shell
 * worktree). Nothing here renders; it pins the seam both sides build to.
 * Full write-up: .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md
 */
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import type { VoiceDrillAttemptDTO, VoiceDrillDTO } from "@/lib/study-plan/drill/types";

/** What the shared shell must hand back when the student stops speaking. */
export interface DrillCaptureResult {
  transcript: string;
  spokenDurationMs: number;
  cameraMode: CameraMode;
  metrics: { visual: VisualMetrics | null; vocal: VocalMetrics | null } | null;
}

export interface VoiceDrillRunnerProps {
  planId: string;
  stepId: string;
  /** From fetchDrill(stepId). */
  drill: VoiceDrillDTO;
  /**
   * Shown LIVE during the rep, as-is: `drill.tipText` (one technique
   * reminder, never words to say). Nothing numeric is shown until
   * `onGraded` fires.
   */
  liveTip: string;
  /** Soft timer target; the shell never hard-stops the student. */
  durationSeconds: VoiceDrillDTO["durationSeconds"];
  /** Fired with the graded attempt (score 1..5, feedback, delivery). */
  onGraded: (attempt: VoiceDrillAttemptDTO) => void;
  /** Leave without completing; an open attempt is simply abandoned. */
  onExit: () => void;
}
