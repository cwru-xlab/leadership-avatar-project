/**
 * Server side of the elevator listener draw: gathers the student's history and
 * the live catalog, then hands both to the pure rule in `elevator-personas.ts`.
 * Used by the wizard's preview and by startSession, which compute the same
 * person from the same inputs.
 */

import { prisma } from "@/lib/prisma";
import { asInputSnapshot } from "@/lib/report/snapshot";
import { loadInterviewerCatalog } from "@/lib/interview/avatar-catalog";

import {
  ELEVATOR_LISTENER_ROSTER,
  ELEVATOR_RECENT_WINDOW,
  chooseElevatorListener,
  type ElevatorListenerPersona,
  type ElevatorListenerStart,
} from "./elevator-personas";

export interface ElevatorListenerDraw {
  persona: ElevatorListenerPersona;
  /** The avatar's own current default voice when the catalog knows it. */
  voiceId: string;
  previewUrl: string | null;
}

export async function drawElevatorListener({
  userId,
  pitchSubject,
  blind,
}: {
  userId: string;
  pitchSubject: string;
  blind: boolean;
}): Promise<ElevatorListenerDraw> {
  const [reports, catalog] = await Promise.all([
    prisma.interactionReport.findMany({
      where: { userId, typeSlug: "pitch-elevator" },
      orderBy: { createdAt: "desc" },
      take: ELEVATOR_RECENT_WINDOW + 1,
      select: { id: true, status: true, createdAt: true, inputSnapshot: true },
    }),
    // A catalog failure must not stop a student starting. The roster's own
    // pairings stay valid unless the account churned, and the session's avatar
    // error path covers that case.
    loadInterviewerCatalog(),
  ]);

  const options = catalog.ok ? catalog.interviewers : [];
  const optionById = new Map(options.map((o) => [o.avatarId, o]));

  const persona = chooseElevatorListener({
    userId,
    pitchSubject: pitchSubject.trim(),
    blind,
    nowMs: Date.now(),
    availableIds: new Set(
      ELEVATOR_LISTENER_ROSTER.filter((p) => optionById.has(p.avatarId)).map(
        (p) => p.id,
      ),
    ),
    history: reports.map((report) => {
      const snapshot = asInputSnapshot(report.inputSnapshot);
      const pitch = snapshot?.kind === "pitch" ? snapshot : null;
      return {
        reportId: report.id,
        status: report.status,
        createdAtMs: report.createdAt.getTime(),
        personaId: pitch?.listenerPersona ?? null,
        pitchSubject: pitch?.pitchSubject?.trim() ?? null,
      };
    }),
  });

  const option = optionById.get(persona.avatarId);
  return {
    persona,
    voiceId: option?.voice.id ?? persona.voiceId,
    previewUrl: option?.previewUrl ?? null,
  };
}

/** The start response: casting always, identity only when the level allows. */
export function toElevatorListenerStart(
  draw: ElevatorListenerDraw,
  level: "blind" | "name-role" | "full-profile",
): ElevatorListenerStart {
  return {
    avatarId: draw.persona.avatarId,
    voiceId: draw.voiceId,
    name: level === "blind" ? null : draw.persona.name,
  };
}
