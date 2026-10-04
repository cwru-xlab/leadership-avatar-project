import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { loadDeckManifest } from "@/lib/deck/store";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Owner-only deck manifest.
 *
 * Missing deck and "not your deck" both return 404 — never 403 — matching
 * the practice report GET posture. Per-slide text is included because the
 * caller is already proven to be the owner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { deckId } = await params;
    const manifest = await loadDeckManifest(currentUser.id, deckId);

    if (!manifest) {
      return response({ error: "Not found" }, 404);
    }

    return response(
      {
        deckId: manifest.deckId,
        format: manifest.format,
        slideCount: manifest.slideCount,
        slides: manifest.slides.map((s) => ({
          index: s.index,
          text: s.text,
          widthPx: s.widthPx,
          heightPx: s.heightPx,
        })),
      },
      200,
    );
  } catch (error) {
    console.error("Practice deck manifest fetch failed:", error);

    return response({ error: "Unable to load the deck." }, 500);
  }
}
