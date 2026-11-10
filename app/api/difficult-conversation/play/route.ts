/**
 * GET /api/difficult-conversation/play?id=…
 *
 * Resolves a seeded or authored conversation for the practice page (15-08).
 * Returns the engine instance (including hiddenPosition for the live prompt
 * path — same client-held pattern as case-study's /api/case/get) plus a
 * display title. Discovery/list never uses this route.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { resolveDifficultConversationInstance } from "@/lib/difficult-conversation/resolve-instance";
import { findSeededConversation } from "@/lib/difficult-conversation/seeded";
import { findPersonaCase } from "@/lib/questioned-persona/cases";
import { loadDifficultConversationForPlay } from "@/lib/difficult-conversation/store";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return response({ error: "Conversation not found" }, 404);
    }

    const instance = await resolveDifficultConversationInstance(id);
    if (!instance) {
      return response({ error: "Conversation not found" }, 404);
    }
    // Questioned-persona cases (patients, clients) share this resolver. The
    // page names the type it serves; a mismatch is not found, so a patient
    // never loads as a courageous conversation or vice versa.
    const requestedType =
      request.nextUrl.searchParams.get("type")?.trim() || "difficult-conversation";
    if ((instance.personaCard?.style ?? "difficult-conversation") !== requestedType) {
      return response({ error: "Conversation not found" }, 404);
    }

    const seeded = findSeededConversation(id) ?? findPersonaCase(id);
    let title = seeded?.title ?? "";
    // Only the owner of an authored record may edit it. The page uses this to
    // offer an edit link when a legacy record was saved without an avatar.
    let canEdit = false;
    if (!seeded) {
      const authored = await loadDifficultConversationForPlay(id);
      title = authored?.title || instance.situation.slice(0, 80);
      canEdit = Boolean(authored?.ownerId) && authored?.ownerId === currentUser.id;
    }

    // The whole instance (persona card included) goes to the browser and is
    // resent on every chat turn, which is how the LIVE prompt gets it — the
    // same client-held pattern `hiddenPosition` and case-study's
    // `additionalInfo` already use. See the `personaCard` doc comment in
    // `lib/engine/types.ts` for what that does and does not guarantee.
    return response({ instance, title, canEdit }, 200);
  } catch (error) {
    console.error("Difficult-conversation play load failed:", error);
    return response({ error: "Unable to load conversation." }, 500);
  }
}
