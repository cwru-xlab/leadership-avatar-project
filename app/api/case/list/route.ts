import { NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { DEMO_SCENARIOS, shouldUseDemoScenarios } from "@/lib/demo-data";

export async function GET() {
  try {
    if (shouldUseDemoScenarios()) {
      return NextResponse.json({
        success: true,
        cases: DEMO_SCENARIOS,
        demo: true,
        message: "Demo scenarios (placeholder)",
      });
    }

    const cases = await s3Storage.listCases();

    return NextResponse.json({
      success: true,
      cases,
      message: "Cases retrieved successfully",
    });
  } catch (error) {
    console.error("Case list error:", error);
    if (shouldUseDemoScenarios()) {
      return NextResponse.json({
        success: true,
        cases: DEMO_SCENARIOS,
        demo: true,
        message: "Demo scenarios (placeholder, S3 unavailable)",
      });
    }

    if (error instanceof Error && error.message.includes("credentials")) {
      return NextResponse.json(
        { error: "S3 configuration error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to list cases" },
      { status: 500 }
    );
  }
}
