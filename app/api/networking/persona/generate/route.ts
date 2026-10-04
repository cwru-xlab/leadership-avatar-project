import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { generatePersonDescription } from "@/lib/networking/person-generation";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * One-shot AI person generation for networking practice (Phase 16).
 *
 * Accepts a rough student hint and returns an editable fictional person
 * description. The description this route returns is shown to the student in
 * an editable box; the EDITED text is what reaches the Phase 8 distiller
 * (16-CONTEXT.md decision 2). This route itself never distills and never
 * persists.
 *
 * NOT attestation-gated and does not need to be: 16-CONTEXT.md decision 8
 * scopes the attestation to PASTED third-party text. A generated person is
 * fictional by construction.
 *
 * RETENTION: the hint and the generated description are used for exactly one
 * non-streaming model call and are never written to Prisma, S3, or any cache,
 * and never logged — only lengths are logged.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return response({ error: "Invalid JSON body" }, 400);
    }

    const hint = (body as { hint?: unknown } | null)?.hint;

    if (typeof hint !== "string" || !hint.trim()) {
      return response({ error: "hint is required" }, 400);
    }

    let generated: { description: string };

    try {
      generated = await generatePersonDescription(hint);
    } catch (error) {
      console.error(
        "Networking person generation failed",
        error instanceof Error ? error.constructor.name : typeof error,
      );

      return response(
        { error: "We could not generate a description. Please try again." },
        502,
      );
    }

    const { description } = generated;

    console.info("Networking person generated", {
      userId: currentUser.id,
      hintLength: hint.trim().length,
      outputLength: description.length,
    });

    return response({ description }, 200);
  } catch (error) {
    console.error("Networking person generation request failed:", error);

    return response(
      { error: "Unable to generate a description. Please try again." },
      500,
    );
  }
}
