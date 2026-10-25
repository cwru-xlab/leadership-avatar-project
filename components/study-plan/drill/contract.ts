/**
 * The props contract for the VOICE_DRILL runner (`VoiceDrillRunner`), mounted
 * on the shared session shell in `components/session/` (camera consent,
 * avatar stage, self-view + visual capture, vocal capture, push-to-talk).
 * `VoiceDrillShell` owns brief -> consent -> runner -> result around it.
 * Full write-up: .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md
 */
import type { DeliveryCapture } from "@/components/study-plan/DeliveryBandsCard";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import type { VoiceDrillAttemptDTO, VoiceDrillDTO } from "@/lib/study-plan/drill/types";

/** What the shared shell must hand back when the student stops speaking. */
export interface DrillCaptureResult {
  transcript: string;
  spokenDurationMs: number;
  cameraMode: CameraMode;
  metrics: { visual: VisualMetrics | null; vocal: VocalMetrics | null } | null;
}

/** The student's coach from Settings (GET /api/settings/coach), as coached mode uses. */
export interface DrillCoach {
  name: string;
  avatarId: string;
  voiceId: string;
}

/** What the runner captured, handed to the result view with the graded attempt. */
export type DrillDelivery = DeliveryCapture;

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
  /** The camera choice made at the consent step (locked for the rep). */
  cameraMode: CameraMode;
  /** Who sets the scene: the student's chosen coach. */
  coach: DrillCoach;
  /** 0 for the first rep; each "Try again" increments it on the same mount. */
  rep: number;
  /** False while the result is shown over the (kept-alive) room. */
  active: boolean;
  /** Technique NAME (closed library) the retry line names; null on rep 0. */
  retryFocus: string | null;
  /** The avatar session ended (e.g. idle timeout) — remount for the next rep. */
  onStageLost?: () => void;
  /**
   * Fired with the graded attempt (score 1..5, feedback, delivery) and the
   * capture this visit produced, for the end-only delivery bands.
   */
  onGraded: (attempt: VoiceDrillAttemptDTO, delivery: DrillDelivery) => void;
  /** Leave without completing; an open attempt is simply abandoned. */
  onExit: () => void;
}
