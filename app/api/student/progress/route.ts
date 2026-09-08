import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SKILL_META, SKILL_TARGET_SCORE, type SkillKey } from "@/lib/topics";
import { regenerateLearningPlan } from "@/lib/learning-plan";
import { isDatabaseConfigured } from "@/lib/db-config";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        success: true,
        skills: [],
        attempts: [],
        targetScore: SKILL_TARGET_SCORE,
        totals: { attempts: 0, skillsTracked: 0, avgEma: 0 },
        offline: true,
        message:
          "DATABASE_URL is not set — progress is empty until Postgres is connected.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return NextResponse.json({
        success: true,
        skills: [],
        attempts: [],
        targetScore: SKILL_TARGET_SCORE,
        totals: { attempts: 0, skillsTracked: 0, avgEma: 0 },
      });
    }

    const [skills, attempts] = await Promise.all([
      prisma.skillProgress.findMany({
        where: { userId: user.id },
        orderBy: { emaScore: "asc" },
      }),
      prisma.attempt.findMany({
        where: { userId: user.id, submittedAt: { not: null } },
        include: { case: { select: { title: true, slug: true, topic: true } } },
        orderBy: { submittedAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      success: true,
      targetScore: SKILL_TARGET_SCORE,
      skills: skills.map((s) => ({
        skillKey: s.skillKey,
        label: SKILL_META[s.skillKey as SkillKey]?.label || s.skillKey,
        category:
          SKILL_META[s.skillKey as SkillKey]?.category || "communication",
        level: s.level,
        xp: s.xp,
        emaScore: Math.round(s.emaScore),
        attemptCount: s.attemptCount,
        gap: Math.max(0, Math.round(SKILL_TARGET_SCORE - s.emaScore)),
      })),
      attempts: attempts.map((a) => ({
        id: a.id,
        score: a.score,
        topic: a.topic || a.case.topic,
        caseTitle: a.case.title,
        caseSlug: a.case.slug,
        attemptNumber: a.attemptNumber,
        submittedAt: a.submittedAt,
        skillScores: a.skillScores ? JSON.parse(a.skillScores) : {},
      })),
      totals: {
        attempts: attempts.length,
        skillsTracked: skills.length,
        avgEma:
          skills.length === 0
            ? 0
            : Math.round(
                skills.reduce((sum, s) => sum + s.emaScore, 0) / skills.length
              ),
      },
    });
  } catch (error) {
    console.error("Progress API error:", error);
    return NextResponse.json(
      { error: "Failed to load progress" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          offline: true,
          error: "DATABASE_URL is not set",
        },
        { status: 503 }
      );
    }
    const body = await request.json();
    const email = body.email as string | undefined;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    await regenerateLearningPlan(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress regenerate error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate plan" },
      { status: 500 }
    );
  }
}
