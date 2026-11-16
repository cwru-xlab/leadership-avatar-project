import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { isSeededCaseStudyId } from "@/lib/case-study/seeded";

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing case ID" },
        { status: 400 }
      );
    }

    if (isSeededCaseStudyId(id)) {
      return NextResponse.json(
        { error: "Built-in case studies are read-only. Change them in lib/case-study/seeded.ts." },
        { status: 403 }
      );
    }

    const exists = await s3Storage.caseExists(id);
    if (!exists) {
      return NextResponse.json(
        { error: `Case with ID '${id}' not found` },
        { status: 404 }
      );
    }

    await s3Storage.deleteCase(id);

    return NextResponse.json({
      success: true,
      id,
      message: "Case deleted successfully",
    });
  } catch (error) {
    console.error("Case delete error:", error);

    if (error instanceof Error) {
      if (error.message.includes("credentials")) {
        return NextResponse.json(
          { error: "S3 configuration error" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete case" },
      { status: 500 }
    );
  }
}
