import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { readContributions } from "@/lib/mastery/ledger";
import { computeMastery } from "@/lib/mastery/compute";
import { toMasteryDTO } from "@/lib/mastery/mastery-dto";
import { levelFor } from "@/lib/mastery/levels";
import { goalProgress } from "@/lib/study-plan/goals";

export const runtime = "nodejs";

/**
 * Weatherhead's declared default zone. Used ONLY when the client does not
 * send an `x-timezone` header — never as a silent fallback to UTC. A UTC day
 * boundary is wrong for every student in this cohort (21-18's plan names
 * this explicitly), so a declared, named default is used instead of the
 * server process's own (UTC) clock zone.
 */
const DEFAULT_TIME_ZONE = "America/New_York";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function currentUserFor(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

/**
 * GET-only. Mastery is derived from the contribution ledger — there is
 * nothing for this route to accept and write. No POST/PUT/PATCH/DELETE
 * exists here, deliberately: a client-writable mastery figure would be a
 * second source of truth alongside the ledger itself.
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await currentUserFor(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    // includeReversed defaults to false — a contested, successfully-reversed
    // mark is already excluded here, before computeMastery ever sees it.
    const contributions = await readContributions(currentUser.id);

    // The clock is read HERE, at the edge, not inside computeMastery — 21-09
    // made `now` a required parameter precisely so the one clock read in the
    // whole mastery chain happens at this boundary and nowhere else.
    const now = new Date();

    const result = computeMastery(contributions, now);

    // This is the ONLY serialization call in this route (21-13's single-exit
    // rule, and 20-06's finding that a guarantee applied after serialization
    // has already shipped the unsafe value to the client: attaching a
    // tier/disclosure at render time would be too late, because the browser
    // already received the bare payload). The raw arithmetic output above
    // is never returned to a client directly — only the DTO below is.
    const mastery = toMasteryDTO(result);

    // Levels are derived from the CURRENT figure, not the lifetime one. A
    // level is a claim about where the student stands NOW; levelling the
    // lifetime figure would be the easier-looking choice (it is usually the
    // more "established" of the two) but would show a student a level they
    // may no longer actually hold, since their current-window performance
    // can have fallen below it.
    const levels: Record<
      string,
      { current: ReturnType<typeof levelFor>; lifetime: ReturnType<typeof levelFor> }
    > = {};
    for (const competency of mastery.competencies) {
      levels[competency.competencyKey] = {
        current: levelFor({
          percent: competency.current.percent,
          tier: competency.current.tier,
        }),
        lifetime: levelFor({
          percent: competency.lifetime.percent,
          tier: competency.lifetime.tier,
        }),
      };
    }

    const timeZone = request.headers.get("x-timezone") || DEFAULT_TIME_ZONE;
    const goals = goalProgress({ contributions, now, timeZone });

    return response({ mastery, levels, goals, timeZone }, 200);
  } catch (error) {
    // Never return a Prisma error or stack body — a generic message only,
    // with the real error logged server-side for diagnosis.
    console.error("Mastery fetch failed:", error);
    return response({ error: "Unable to load your mastery data." }, 500);
  }
}
