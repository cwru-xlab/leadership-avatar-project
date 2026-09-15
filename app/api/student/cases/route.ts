import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { getDemoStudentCases, shouldUseDemoScenarios } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const topicFilter = searchParams.get("topic");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter is required" },
        { status: 400 }
      );
    }

    if (shouldUseDemoScenarios()) {
      const demo = getDemoStudentCases(topicFilter);
      return NextResponse.json({
        success: true,
        ...demo,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cohorts = await s3Storage.listCohorts();

    const studentCohorts = cohorts.filter((cohort) => {
      if (!cohort.isActive) return false;

      if (cohort.availableDate) {
        const now = new Date();
        const availDate = new Date(cohort.availableDate);
        if (now < availDate) return false;
      }

      if (cohort.expirationDate) {
        const now = new Date();
        const expDate = new Date(cohort.expirationDate);
        if (now > expDate) return false;
      }

      return cohort.students?.some(
        (s) => s.email.toLowerCase() === normalizedEmail && s.status === "joined"
      );
    });

    const assignedCaseIds = new Set<string>();
    const cohortInfo: Record<
      string,
      { cohortId: string; cohortName: string; heygenMinutesLimit: number | null }
    > = {};

    for (const cohort of studentCohorts) {
      const assignments =
        cohort.assignedCases ??
        (cohort.assignedCaseIds ?? []).map((id) => ({
          caseId: id,
          heygenMinutesLimit: null,
        }));
      for (const assignment of assignments) {
        assignedCaseIds.add(assignment.caseId);
        cohortInfo[assignment.caseId] = {
          cohortId: cohort.id,
          cohortName: cohort.name,
          heygenMinutesLimit: assignment.heygenMinutesLimit ?? null,
        };
      }
    }

    const cases = [];
    for (const caseId of assignedCaseIds) {
      const caseData = await s3Storage.getCase(caseId);
      if (caseData) {
        const resolvedTopic = caseData.topic || "courageous_conversation";
        if (topicFilter && resolvedTopic !== topicFilter) continue;
        cases.push({
          ...caseData,
          topic: resolvedTopic,
          cohortId: cohortInfo[caseId]?.cohortId,
          cohortName: cohortInfo[caseId]?.cohortName,
          heygenMinutesLimit: cohortInfo[caseId]?.heygenMinutesLimit ?? null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      cases,
      cohorts: studentCohorts.map((c) => ({
        id: c.id,
        name: c.name,
        assignedCaseIds:
          c.assignedCases?.map((a) => a.caseId) ?? c.assignedCaseIds ?? [],
      })),
    });
  } catch (error) {
    console.error("Error fetching student cases:", error);
    if (shouldUseDemoScenarios()) {
      const topicFilter = new URL(request.url).searchParams.get("topic");
      return NextResponse.json({
        success: true,
        ...getDemoStudentCases(topicFilter),
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch cases" },
      { status: 500 }
    );
  }
}
