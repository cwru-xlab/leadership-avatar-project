import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SKILL_META, type SkillKey } from "@/lib/topics";
import { regenerateLearningPlan } from "@/lib/learning-plan";
import { isDatabaseConfigured } from "@/lib/db-config";
import { getDemoPlanPayload, shouldUseDemoLearningRecords } from "@/lib/demo-data";

function shouldUseDemoPlan(): boolean {
  return shouldUseDemoLearningRecords();
}

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (shouldUseDemoPlan()) {
      return NextResponse.json(getDemoPlanPayload());
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return NextResponse.json({
        success: true,
        plan: null,
      });
    }

    let plan = await prisma.learningPlan.findFirst({
      where: { userId: user.id, status: "active" },
      include: {
        activities: {
          include: { case: true },
          orderBy: { priority: "asc" },
        },
      },
      orderBy: { generatedAt: "desc" },
    });

    if (!plan) {
      await regenerateLearningPlan(user.id);
      plan = await prisma.learningPlan.findFirst({
        where: { userId: user.id, status: "active" },
        include: {
          activities: {
            include: { case: true },
            orderBy: { priority: "asc" },
          },
        },
        orderBy: { generatedAt: "desc" },
      });
    }

    if (!plan) {
      return NextResponse.json({ success: true, plan: null });
    }

    const focusSkills = JSON.parse(plan.focusSkills) as string[];

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        rationale: plan.rationale,
        generatedAt: plan.generatedAt,
        focusSkills: focusSkills.map((k) => ({
          skillKey: k,
          label: SKILL_META[k as SkillKey]?.label || k,
        })),
        activities: plan.activities.map((a) => {
          const skillKeys = JSON.parse(a.skillKeys) as string[];
          const slug = a.case?.slug;
          return {
            id: a.id,
            title: a.title || a.case?.title || "Practice trial",
            status: a.status,
            priority: a.priority,
            skillKeys,
            skillLabels: skillKeys.map(
              (k) => SKILL_META[k as SkillKey]?.label || k
            ),
            topic: a.case?.topic,
            caseSlug: slug,
            href: slug ? `/case-play/${slug}` : "/practice",
            completedAt: a.completedAt,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Plan API error:", error);
    if (shouldUseDemoPlan()) {
      return NextResponse.json(getDemoPlanPayload());
    }
    return NextResponse.json(
      { error: "Failed to load learning plan" },
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
    console.error("Plan regenerate error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate plan" },
      { status: 500 }
    );
  }
}
