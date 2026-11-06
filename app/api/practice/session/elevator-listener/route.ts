/**
 * The wizard's level-filtered view of the listener the student's next elevator
 * session will draw. Read-only: no report row is created, and `startSession`
 * makes the real selection from the same inputs.
 *
 * POST only because the pitch subject is private and must stay out of URLs.
 * At `blind` this returns null without drawing anyone (ListenerKnowledgeStep's
 * fetch discipline): what reaches the browser is what the level allows.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { drawElevatorListener } from "@/lib/pitch/elevator-listener-draw";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const body = (await request.json().catch(() => null)) as {
      listenerKnowledge?: unknown;
      pitchSubject?: unknown;
    } | null;
    const level = body?.listenerKnowledge;

    if (level !== "name-role" && level !== "full-profile") {
      return response({ listener: null }, 200);
    }

    const { persona, previewUrl } = await drawElevatorListener({
      userId: currentUser.id,
      pitchSubject:
        typeof body?.pitchSubject === "string" ? body.pitchSubject : "",
      blind: false,
    });

    return response(
      {
        listener: {
          name: persona.name,
          role: persona.role,
          previewUrl,
          ...(level === "full-profile"
            ? { interests: persona.interests, priorities: persona.priorities }
            : {}),
        },
      },
      200,
    );
  } catch (error) {
    console.error("Elevator listener preview failed:", error);
    return response({ error: "Unable to load your listener." }, 500);
  }
}
