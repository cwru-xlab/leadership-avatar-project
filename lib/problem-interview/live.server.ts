/**
 * Server-side reads and writes of a live problem interview's pinned question
 * and state. Used only by `POST /api/interaction/chat`.
 *
 * Load: the report must be owned by the caller and IN_PROGRESS, its snapshot
 * must carry `problem`, and the pinned question must still be in the bank
 * (and its framework in the type) — otherwise the turn is refused rather
 * than silently degrading into a generic interview.
 *
 * Record: after the model's reply has streamed, its markers (plus any action
 * `inferUnmarkedActions` conservatively recovers from a dropped marker) are
 * reduced into the stored state and the new events appended. Re-reads the row first so a
 * slow turn can never overwrite a newer one's events with stale state.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { ProblemQuestion, ProcessFramework } from "./types";
import { findProblemQuestion } from "./banks.server";
import {
  asProblemSessionSnapshot,
  inferUnmarkedActions,
  reduceProblemTurn,
  toProblemLiveView,
  type ProblemLiveView,
  type ProblemSessionSnapshot,
  type ProblemTurnAction,
} from "./session-state";

export interface ProblemTurnContext {
  reportId: string;
  startedAt: Date;
  snapshot: ProblemSessionSnapshot;
  question: ProblemQuestion;
  framework: ProcessFramework;
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadProblemTurnContext({
  userId,
  reportId,
  typeSlug,
  frameworks,
}: {
  userId: string;
  reportId: string;
  typeSlug: string;
  frameworks: readonly ProcessFramework[];
}): Promise<ProblemTurnContext | null> {
  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId, typeSlug, status: "IN_PROGRESS" },
    select: { id: true, startedAt: true, inputSnapshot: true },
  });
  const raw = snapshotRecord(report?.inputSnapshot);
  if (!report || raw?.kind !== "interview") return null;
  const snapshot = asProblemSessionSnapshot(raw.problem);
  if (!snapshot) return null;
  const question = findProblemQuestion(typeSlug, snapshot.questionId);
  const framework = frameworks.find((f) => f.key === snapshot.frameworkKey) ?? null;
  if (!question || !framework) return null;
  return { reportId: report.id, startedAt: report.startedAt, snapshot, question, framework };
}

export async function recordProblemTurn({
  context,
  actions: markedActions,
  replyText,
  turnIndex,
}: {
  context: ProblemTurnContext;
  actions: ProblemTurnAction[];
  /** The marker-free reply, for the dropped-marker fallback. */
  replyText: string;
  turnIndex: number;
}): Promise<ProblemLiveView> {
  const report = await prisma.interactionReport.findFirst({
    where: { id: context.reportId, status: "IN_PROGRESS" },
    select: { inputSnapshot: true },
  });
  const raw = snapshotRecord(report?.inputSnapshot);
  const stored = asProblemSessionSnapshot(raw?.problem) ?? context.snapshot;
  if (!raw) return toProblemLiveView(stored);
  const actions = [
    ...markedActions,
    ...inferUnmarkedActions(
      replyText,
      markedActions,
      stored.state,
      context.question,
      context.framework,
    ),
  ];
  if (actions.length === 0) return toProblemLiveView(stored);

  const atSeconds = Math.max(
    0,
    Math.round((Date.now() - context.startedAt.getTime()) / 1000),
  );
  const { state, events } = reduceProblemTurn(stored.state, actions, {
    question: context.question,
    framework: context.framework,
    atSeconds,
    turnIndex,
  });
  const next: ProblemSessionSnapshot = {
    ...stored,
    state,
    events: [...stored.events, ...events],
  };

  await prisma.interactionReport.update({
    where: { id: context.reportId },
    data: {
      inputSnapshot: { ...raw, problem: next } as unknown as Prisma.InputJsonValue,
    },
  });

  return toProblemLiveView(next);
}
