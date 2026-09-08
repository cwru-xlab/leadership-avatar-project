/**
 * Deterministic learning-plan engine for LeadPath.
 * Ranks weak skills by EMA gap vs target and attaches overlapping scenarios.
 */

import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import {
  SKILL_TARGET_SCORE,
  SKILL_EMA_ALPHA,
  FOCUS_SKILL_COUNT,
  PLAN_ACTIVITY_COUNT,
  SKILL_IMPROVEMENT_THRESHOLD,
  scoreToXp,
  xpToLevel,
  SKILL_META,
  type SkillKey,
} from "@/lib/topics";
import { isDatabaseConfigured } from "@/lib/db-config";

export type SkillScoreMap = Record<string, number>;

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function upsertSkillProgressFromScores(
  userId: string,
  skillScores: SkillScoreMap
): Promise<void> {
  for (const [skillKey, rawScore] of Object.entries(skillScores)) {
    const score = Math.min(100, Math.max(0, Number(rawScore) || 0));
    const existing = await prisma.skillProgress.findUnique({
      where: { userId_skillKey: { userId, skillKey } },
    });

    if (!existing) {
      const xp = scoreToXp(score);
      await prisma.skillProgress.create({
        data: {
          userId,
          skillKey,
          emaScore: score,
          xp,
          level: xpToLevel(xp),
          attemptCount: 1,
        },
      });
      continue;
    }

    const emaScore =
      existing.emaScore * (1 - SKILL_EMA_ALPHA) + score * SKILL_EMA_ALPHA;
    const xp = existing.xp + scoreToXp(score);
    await prisma.skillProgress.update({
      where: { id: existing.id },
      data: {
        emaScore,
        xp,
        level: xpToLevel(xp),
        attemptCount: existing.attemptCount + 1,
      },
    });
  }
}

async function listCandidateScenarios(): Promise<
  { id: string; name: string; targetSkills: string[]; topic?: string }[]
> {
  const fromDb = await prisma.case.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      slug: true,
      title: true,
      targetSkills: true,
      topic: true,
    },
  });

  const dbMapped = fromDb.map((c) => ({
    id: c.slug,
    name: c.title,
    targetSkills: parseJsonArray(c.targetSkills),
    topic: c.topic || undefined,
  }));

  try {
    const s3Cases = await s3Storage.listCases();
    const s3Mapped = s3Cases.map((c) => ({
      id: c.id,
      name: c.name,
      targetSkills: c.targetSkills || [],
      topic: c.topic,
    }));
    // Prefer S3 catalog when present; merge unique by id
    const byId = new Map<
      string,
      { id: string; name: string; targetSkills: string[]; topic?: string }
    >();
    for (const item of [...dbMapped, ...s3Mapped]) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values());
  } catch {
    return dbMapped;
  }
}

export async function regenerateLearningPlan(userId: string): Promise<void> {
  const progress = await prisma.skillProgress.findMany({ where: { userId } });

  const ranked = [...progress]
    .map((p) => ({
      skillKey: p.skillKey,
      gap: SKILL_TARGET_SCORE - p.emaScore,
      emaScore: p.emaScore,
    }))
    .filter((p) => p.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  const focusSkills = ranked.slice(0, FOCUS_SKILL_COUNT).map((r) => r.skillKey);

  // If student has no progress yet, seed a starter focus set
  const effectiveFocus =
    focusSkills.length > 0
      ? focusSkills
      : (["organization", "examples", "empathy"] as SkillKey[]);

  const rationale =
    focusSkills.length > 0
      ? `Focus on skills furthest from the ${SKILL_TARGET_SCORE} target: ${effectiveFocus
          .map((k) => SKILL_META[k as SkillKey]?.label || k)
          .join(", ")}.`
      : "Starter plan — complete a few assessed practice sessions to personalize your focus skills.";

  // Archive previous active plans
  await prisma.learningPlan.updateMany({
    where: { userId, status: "active" },
    data: { status: "archived" },
  });

  const plan = await prisma.learningPlan.create({
    data: {
      userId,
      focusSkills: JSON.stringify(effectiveFocus),
      status: "active",
      rationale,
    },
  });

  const scenarios = await listCandidateScenarios();
  const scored = scenarios
    .map((s) => {
      const overlap = s.targetSkills.filter((t) =>
        effectiveFocus.includes(t)
      );
      return { ...s, overlap };
    })
    .filter((s) => s.overlap.length > 0 || scenarios.length <= PLAN_ACTIVITY_COUNT)
    .sort((a, b) => b.overlap.length - a.overlap.length)
    .slice(0, PLAN_ACTIVITY_COUNT);

  // Resolve Prisma case ids by slug when possible
  const dbCases = await prisma.case.findMany({
    where: { slug: { in: scored.map((s) => s.id) } },
    select: { id: true, slug: true },
  });
  const slugToDbId = new Map(dbCases.map((c) => [c.slug, c.id]));

  let priority = 1;
  for (const s of scored) {
    await prisma.planActivity.create({
      data: {
        planId: plan.id,
        caseId: slugToDbId.get(s.id) || null,
        skillKeys: JSON.stringify(
          s.overlap.length > 0 ? s.overlap : effectiveFocus.slice(0, 2)
        ),
        priority: priority++,
        status: "pending",
        title: s.name,
      },
    });
  }
}

export async function markPlanActivitiesCompleted(
  userId: string,
  skillScores: SkillScoreMap
): Promise<void> {
  const plan = await prisma.learningPlan.findFirst({
    where: { userId, status: "active" },
    include: { activities: true },
  });
  if (!plan) return;

  for (const activity of plan.activities) {
    if (activity.status !== "pending") continue;
    const keys = parseJsonArray(activity.skillKeys);
    const improved = keys.some((k) => {
      const score = skillScores[k];
      return (
        typeof score === "number" &&
        score >= SKILL_TARGET_SCORE - SKILL_IMPROVEMENT_THRESHOLD
      );
    });
    if (improved) {
      await prisma.planActivity.update({
        where: { id: activity.id },
        data: { status: "completed", completedAt: new Date() },
      });
    }
  }
}

export async function persistAssessedAttempt(params: {
  userEmail: string;
  caseSlug: string;
  caseTitle: string;
  attemptNumber: number;
  score: number | null;
  skillScores: SkillScoreMap;
  evalResult: string;
  totalMessages: number;
  totalTimeSeconds: number;
  topic?: string;
  interactionLogS3Key?: string;
}): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn(
      "[learning-plan] DATABASE_URL unset — skipping attempt/skill persistence"
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: params.userEmail.toLowerCase() },
  });
  if (!user) {
    console.warn(
      `[learning-plan] No user for email ${params.userEmail}; skipping DB persist`
    );
    return;
  }

  let caseRow = await prisma.case.findUnique({
    where: { slug: params.caseSlug },
  });
  if (!caseRow) {
    caseRow = await prisma.case.create({
      data: {
        slug: params.caseSlug,
        title: params.caseTitle,
        isPublished: true,
        topic: params.topic || null,
        targetSkills: JSON.stringify(Object.keys(params.skillScores)),
      },
    });
  }

  await prisma.attempt.upsert({
    where: {
      userId_caseId_attemptNumber: {
        userId: user.id,
        caseId: caseRow.id,
        attemptNumber: params.attemptNumber,
      },
    },
    update: {
      score: params.score ?? undefined,
      skillScores: JSON.stringify(params.skillScores),
      evalResult: params.evalResult,
      totalMessages: params.totalMessages,
      totalTimeSeconds: params.totalTimeSeconds,
      topic: params.topic || caseRow.topic,
      submittedAt: new Date(),
      interactionLogS3Key: params.interactionLogS3Key,
    },
    create: {
      userId: user.id,
      caseId: caseRow.id,
      attemptNumber: params.attemptNumber,
      score: params.score ?? undefined,
      skillScores: JSON.stringify(params.skillScores),
      evalResult: params.evalResult,
      totalMessages: params.totalMessages,
      totalTimeSeconds: params.totalTimeSeconds,
      topic: params.topic || caseRow.topic,
      submittedAt: new Date(),
      interactionLogS3Key: params.interactionLogS3Key,
    },
  });

  await upsertSkillProgressFromScores(user.id, params.skillScores);
  await markPlanActivitiesCompleted(user.id, params.skillScores);
  await regenerateLearningPlan(user.id);
}
