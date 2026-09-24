/**
 * Shared background scenario evaluation runner.
 *
 * The scenario analogue of `lib/interview/evaluation-runner.ts`, which stays
 * untouched and diff-empty. `runAndPersistScenarioEvaluation` is the single
 * place that turns a stored scenario transcript into a `READY` or `FAILED`
 * `ScenarioReport` row. Never throws, and never leaves the row PENDING —
 * every failure path (missing row, missing transcript, evaluator failure, or
 * an unexpected exception) is caught and, wherever possible, recorded as a
 * FAILED row with an operator-readable reason.
 *
 * Reads every grading input from the REPORT ROW's run-time snapshot
 * (REQ-33), never re-fetching the live S3 scenario — re-fetching would grade
 * against an edited or deleted scenario and break REQ-33/REQ-34.
 */

import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import {
  runScenarioEvaluation,
  type RunScenarioEvaluationInput,
} from "./evaluation";
import type { ScenarioEvaluationCharacter } from "./prompts";
import type { InteractionLog, InteractionEvent } from "@/types";
import { asVisualMetrics, asVocalMetrics } from "@/lib/metrics/ingest";
import { resolveVisualOutcome, resolveVocalOutcome } from "@/lib/metrics/coverage";
import type { CameraMode } from "@/lib/metrics/types";

const MAX_ERROR_MESSAGE_LENGTH = 500;

function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

/**
 * Flattens an `InteractionLog`'s per-role message store into speaker-labelled
 * text. `roleInteractions` is the authoritative record of what was actually
 * said — it is what both finish routes compute `totalMessages` from — whereas
 * `events` is an audit trail that is not guaranteed to carry `messageContent`
 * for every turn.
 */
function buildTranscriptFromRoleInteractions(log: InteractionLog): string {
  const lines: string[] = [];

  const roles = Object.values(log.roleInteractions ?? {}).sort(
    (a, b) => a.enteredAt - b.enteredAt
  );

  for (const role of roles) {
    const messages = role.messages ?? [];
    if (messages.length === 0) continue;

    const roleName = role.roleName || role.roleId || "Unknown";
    lines.push(`\n--- Conversation with: ${roleName} ---`);

    for (const message of [...messages].sort((a, b) => a.timestamp - b.timestamp)) {
      const time = new Date(message.timestamp).toLocaleTimeString();
      const speaker =
        message.role === "user" ? `Student → ${roleName}` : `${roleName} → Student`;
      lines.push(`[${time}] ${speaker}: ${message.content}`);
    }
  }

  return lines.join("\n");
}

/**
 * Flattens an `InteractionLog`'s events into speaker-labelled text.
 * Reproduces the event-walking logic of `buildInteractionText` in
 * `app/api/interaction/finish/route.ts` (copied here, not imported — that
 * route is never edited by this feature).
 *
 * Used only as a fallback: see `buildScenarioTranscript`.
 */
function buildTranscriptFromEvents(log: InteractionLog): string {
  const events = [...log.events].sort(
    (a: InteractionEvent, b: InteractionEvent) => a.timestamp - b.timestamp
  );

  const lines: string[] = [];
  let currentRole: string | null = null;

  for (const event of events) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "start_session":
        lines.push(`[${time}] Session started`);
        break;
      case "enter_role":
        currentRole = event.roleName || event.roleId || "Unknown";
        lines.push(`\n[${time}] Student entered conversation with: ${currentRole}`);
        break;
      case "exit_role":
        lines.push(`[${time}] Student left conversation with: ${event.roleName || currentRole}`);
        currentRole = null;
        break;
      case "send_message":
        lines.push(`[${time}] Student → ${currentRole || "Unknown"}: ${event.messageContent}`);
        break;
      case "receive_message":
        lines.push(`[${time}] ${currentRole || "Unknown"} → Student: ${event.messageContent}`);
        break;
      case "end_session":
        lines.push(`\n[${time}] Session ended`);
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Builds the transcript handed to the evaluator.
 *
 * Prefers `roleInteractions` (the authoritative message store) and falls back
 * to the event trail only when no role carries any message. A run whose events
 * recorded session boundaries but not message content used to yield a
 * non-empty—but conversation-free—transcript, which the evaluator then graded
 * as if the student had said nothing.
 */
function buildScenarioTranscript(log: InteractionLog): string {
  const fromRoles = buildTranscriptFromRoleInteractions(log);
  if (fromRoles.trim()) return fromRoles;

  return buildTranscriptFromEvents(log);
}

/**
 * Narrows the report row's `avatarsSnapshot` (a Prisma `Json` column) down
 * to the evaluator's minimal `{name, role}` shape, dropping `profileId`,
 * `id`, and the character's hidden `additionalInfo` briefing before it ever
 * reaches the model call.
 */
function toEvaluationCharacters(avatarsSnapshot: unknown): ScenarioEvaluationCharacter[] {
  if (!Array.isArray(avatarsSnapshot)) return [];
  const characters: ScenarioEvaluationCharacter[] = [];
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
 * Load the stored transcript, run the evaluator, and persist the outcome.
 *
 * Ownership is baked into the initial `findFirst({id, userId})` WHERE
 * clause, exactly as the interview runner does, so a mismatched owner
 * yields `null` (and this function returns silently) rather than a leak.
 */
export async function runAndPersistScenarioEvaluation(
  userId: string,
  reportId: string
): Promise<void> {
  console.info("Scenario evaluation starting", { userId, reportId });

  try {
    const report = await prisma.scenarioReport.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      console.warn("Scenario evaluation: report not found, skipping", {
        userId,
        reportId,
      });
      return;
    }

    await prisma.scenarioReport.update({
      where: { id: reportId },
      data: { status: "PENDING" },
    });

    if (!report.interactionLogId || !report.studentEmail) {
      await persistFailure(reportId, "No transcript was recorded for this run.");
      console.error("Scenario evaluation failed: missing transcript pointer", {
        userId,
        reportId,
        status: "FAILED",
      });
      return;
    }

    const log = await s3Storage.getInteractionLog(
      report.studentEmail,
      report.caseId,
      report.interactionLogId
    );

    if (!log) {
      await persistFailure(reportId, "No transcript was recorded for this run.");
      console.error("Scenario evaluation failed: missing interaction log", {
        userId,
        reportId,
        status: "FAILED",
      });
      return;
    }

    const transcript = buildScenarioTranscript(log);

    if (!transcript.trim()) {
      await persistFailure(reportId, "No transcript was recorded for this run.");
      console.error("Scenario evaluation failed: empty transcript", {
        userId,
        reportId,
        status: "FAILED",
      });
      return;
    }

    await prisma.scenarioReport.update({
      where: { id: reportId },
      data: { turnCount: log.totalMessages },
    });

    // Parse the row's own stored Json? columns back into the shared types
    // through the SAME discriminator that validated them on the way in
    // (lib/metrics/ingest.ts) — never a third private copy. Mirrors
    // lib/interview/evaluation-runner.ts exactly.
    const visual = asVisualMetrics(report.visualMetrics);
    const vocal = asVocalMetrics(report.vocalMetrics);

    // The liveness-vs-performance discriminator (REQ-42, lib/metrics/coverage.ts).
    // A camera-ON session whose face was never detected is a scoreable LOW
    // visual score, not an unscored one — only a dead pipeline is unscorable.
    const cameraMode = (report.cameraMode as CameraMode | null) ?? "OFF";
    const visualOutcome = resolveVisualOutcome(cameraMode, visual);
    const vocalOutcome = resolveVocalOutcome(vocal);

    // Metrics reach the evaluator ONLY when the outcome says scored, so a
    // technical failure can never yield a fabricated score.
    const input: RunScenarioEvaluationInput = {
      caseName: report.caseName,
      background: report.backgroundSnapshot,
      characters: toEvaluationCharacters(report.avatarsSnapshot),
      authorCriteria: report.criteriaSnapshot,
      transcript,
      visualMetrics: visualOutcome.scored ? visual : null,
      vocalMetrics: vocalOutcome.scored ? vocal : null,
    };

    const result = await runScenarioEvaluation(input);

    await prisma.scenarioReport.update({
      where: { id: reportId },
      data: {
        status: "READY",
        visualScore: result.visualScore,
        vocalScore: result.vocalScore,
        contentScore: result.contentScore,
        behavioralScore: result.behavioralScore,
        reportMarkdown: result.reportMarkdown,
        failureReason: null,
        evalModel: result.evalModel,
        completedAt: new Date(),
        // A legacy row (cameraMode === null) keeps both reason columns null,
        // so the report page still renders it as "Not yet measured" (REQ-48)
        // while modern rows carry a STORED, never-re-derived cause (REQ-45).
        visualUnscoredReason:
          report.cameraMode === null ? null : visualOutcome.reason,
        vocalUnscoredReason:
          report.cameraMode === null ? null : vocalOutcome.reason,
      },
    });

    console.info("Scenario evaluation completed", {
      userId,
      reportId,
      status: "READY",
      cameraMode: report.cameraMode,
      visualUnscoredReason:
        report.cameraMode === null ? null : visualOutcome.reason,
      vocalUnscoredReason:
        report.cameraMode === null ? null : vocalOutcome.reason,
    });
  } catch (error) {
    // Best-effort FAILED write. A background job must never leave the row
    // stuck PENDING because of an unhandled throw. Swallow any secondary
    // error from this write itself.
    const message = error instanceof Error ? error.message : String(error);
    try {
      await persistFailure(reportId, truncateErrorMessage(message));
    } catch (secondaryError) {
      console.error("Scenario evaluation: secondary failure writing FAILED status", {
        userId,
        reportId,
        error:
          secondaryError instanceof Error
            ? secondaryError.message
            : String(secondaryError),
      });
    }
    console.error("Scenario evaluation threw unexpectedly", {
      userId,
      reportId,
      status: "FAILED",
      error: error instanceof Error ? error.constructor.name : typeof error,
    });
  }
}

/**
 * Flip the row to FAILED with a readable reason. Never clears
 * `interactionLogId`, `studentEmail`, or the run-time snapshot columns.
 */
async function persistFailure(reportId: string, reason: string, model?: string): Promise<void> {
  // Ownership was already verified by the caller's findFirst({id, userId})
  // lookup; `update` itself only accepts a unique field (id) in `where`.
  await prisma.scenarioReport.update({
    where: { id: reportId },
    data: {
      status: "FAILED",
      failureReason: reason,
      evalModel: model,
      completedAt: new Date(),
    },
  });
}
