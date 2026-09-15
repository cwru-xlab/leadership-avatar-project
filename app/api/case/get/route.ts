import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { getDemoScenario, shouldUseDemoScenarios } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing case ID parameter" },
        { status: 400 }
      );
    }

    if (shouldUseDemoScenarios()) {
      const demo = getDemoScenario(id);
      if (demo) {
        return NextResponse.json({
          success: true,
          caseStudy: demo,
          demo: true,
          message: "Demo scenario (placeholder)",
        });
      }
    }

    const caseStudy = await s3Storage.getCase(id);

    if (!caseStudy) {
      const demo = getDemoScenario(id);
      if (demo && shouldUseDemoScenarios()) {
        return NextResponse.json({
          success: true,
          caseStudy: demo,
          demo: true,
        });
      }
      return NextResponse.json(
        { error: `Case with ID '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      caseStudy,
      message: "Case retrieved successfully",
    });
  } catch (error) {
    console.error("Case get error:", error);
    const id = new URL(request.url).searchParams.get("id");
    const demo = id ? getDemoScenario(id) : null;
    if (demo && shouldUseDemoScenarios()) {
      return NextResponse.json({
        success: true,
        caseStudy: demo,
        demo: true,
      });
    }

    if (error instanceof Error && error.message.includes("credentials")) {
      return NextResponse.json(
        { error: "S3 configuration error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to retrieve case" },
      { status: 500 }
    );
  }
}
