import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = token ? await getCurrentUser(token) : null;
    const isAuthenticated = !!currentUser;
    const isPrivileged = currentUser?.role === "admin" || currentUser?.role === "professor";

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const accessCode = searchParams.get("accessCode");

    // Only authenticated privileged users can lookup by id
    if (id && !isPrivileged) {
      return NextResponse.json(
        { error: "Forbidden: id lookup requires authentication" },
        { status: 403 }
      );
    }

    if (!id && !accessCode) {
      return NextResponse.json(
        { error: "Missing id or accessCode parameter" },
        { status: 400 }
      );
    }

    let cohort;
    if (id) {
      cohort = await s3Storage.getCohort(id);
    } else if (accessCode) {
      cohort = await s3Storage.getCohortByAccessCode(accessCode);
    }

    if (!cohort) {
      return NextResponse.json(
        { error: "Cohort not found" },
        { status: 404 }
      );
    }

    // For unauthenticated users (join flow), return only public info
    if (!isAuthenticated) {
      return NextResponse.json({
        success: true,
        cohort: {
          id: cohort.id,
          name: cohort.name,
          isActive: cohort.isActive,
          availableDate: cohort.availableDate,
          expirationDate: cohort.expirationDate,
          accessMode: cohort.accessMode,
          // Do NOT include students array, allowedEmails, or other sensitive data
        },
      });
    }

    // For authenticated users, return full cohort data
    return NextResponse.json({
      success: true,
      cohort,
    });
  } catch (error) {
    console.error("Error fetching cohort:", error);
    return NextResponse.json(
      { error: "Failed to fetch cohort" },
      { status: 500 }
    );
  }
}
