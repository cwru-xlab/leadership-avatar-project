import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import type { InteractionLog } from "@/types";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and get current user
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { log } = body as { log: InteractionLog };

    if (!log || !log.id || !log.caseId) {
      return NextResponse.json(
        { error: "Missing required interaction log data" },
        { status: 400 }
      );
    }

    // Authorization: Students can only save their own logs.
    // For students, override the studentEmail with the verified identity.
    // For admins/professors, allow them to specify any studentEmail.
    const isPrivileged = currentUser.role === "admin" || currentUser.role === "professor";
    if (!isPrivileged) {
      log.studentEmail = currentUser.email;
    } else if (!log.studentEmail) {
      return NextResponse.json(
        { error: "studentEmail is required for privileged users" },
        { status: 400 }
      );
    }

    // Only save assessed mode interactions
    if (log.mode !== "assessed") {
      return NextResponse.json({
        success: true,
        message: "Explore mode - not saving to S3",
      });
    }

    // Update timestamps
    const now = Date.now();
    log.lastSavedAt = now;
    log.updatedAt = new Date(now).toISOString();
    log.totalTimeSeconds = Math.round((now - log.startedAt) / 1000);

    // Count total messages across all role interactions
    let totalMessages = 0;
    for (const roleInteraction of Object.values(log.roleInteractions)) {
      totalMessages += roleInteraction.messages.length;
    }
    log.totalMessages = totalMessages;

    await s3Storage.saveInteractionLog(log);

    return NextResponse.json({
      success: true,
      message: "Interaction log saved",
      lastSavedAt: now,
    });
  } catch (error) {
    console.error("Error saving interaction:", error);
    return NextResponse.json(
      { error: "Failed to save interaction" },
      { status: 500 }
    );
  }
}
