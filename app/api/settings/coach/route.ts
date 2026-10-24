/**
 * Coach choice (REQ-113). The student picks their coach once, here; coached
 * sessions resolve it server-side via `resolveCoachForUser`. There is no
 * picker in the coached flow.
 *
 * This route deliberately starts nothing: it must not touch the coached
 * runtime entry points (`scripts/verify-coached-entry.ts` requires exactly one
 * route to do so).
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COACH,
  resolveCoachForUser,
} from "@/lib/study-plan/coached/coach-identity";
import {
  GET as listInterviewers,
  type InterviewerOption,
} from "@/app/api/interview/interviewers/route";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authenticate(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return response({ error: "Unauthorized" }, 401);
  return response({ coach: await resolveCoachForUser(user.id) });
}

export async function PUT(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return response({ error: "Unauthorized" }, 401);

  let body: { avatarId?: unknown; voiceId?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request body" }, 400);
  }
  const avatarId = typeof body?.avatarId === "string" ? body.avatarId : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : "";
  if (!avatarId || !voiceId) {
    return response({ error: "avatarId and voiceId are required" }, 400);
  }

  let name: string;
  if (avatarId === DEFAULT_COACH.avatarId && voiceId === DEFAULT_COACH.voiceId) {
    name = DEFAULT_COACH.name;
  } else {
    let interviewers: InterviewerOption[];
    try {
      const res = await listInterviewers();
      if (!res.ok) {
        return response({ error: "Coach roster is unavailable" }, 503);
      }
      interviewers = ((await res.json()) as { interviewers: InterviewerOption[] })
        .interviewers;
    } catch {
      return response({ error: "Coach roster is unavailable" }, 503);
    }
    const option = interviewers.find(
      (o) => o.avatarId === avatarId && o.voice.id === voiceId,
    );
    if (!option) {
      return response({ error: "That coach is not available" }, 400);
    }
    // Never trust the client's name; first word token for display.
    name = option.name.trim().split(/\s+/)[0] || option.name;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { coachAvatarId: avatarId, coachVoiceId: voiceId, coachName: name },
  });
  return response({ coach: await resolveCoachForUser(user.id) });
}

export async function DELETE(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return response({ error: "Unauthorized" }, 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { coachAvatarId: null, coachVoiceId: null, coachName: null },
  });
  return response({ coach: await resolveCoachForUser(user.id) });
}
