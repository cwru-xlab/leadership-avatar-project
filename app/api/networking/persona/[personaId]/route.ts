/**
 * Owner-scoped get + delete for a single distilled networking persona.
 *
 * Deliberately no PATCH — a persona is immutable once distilled; re-distilling
 * means a new attestation and a new persona. Deliberately no publish/share
 * verb of any kind (16-CONTEXT.md decision 7): there is no analogue of
 * `app/api/scenario/publish/route.ts` here.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  deleteOwnedNetworkingPersona,
  loadOwnedNetworkingPersona,
  type NetworkingPersonaRecord,
} from "@/lib/networking/persona-store";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Client-facing persona DTO. Strips private fields (`ownerId`, `attestationId`)
 * the caller has no use for — same field-by-field (never-spread) posture as
 * `lib/report/dto.ts`'s `toReportDto`, hand-rolled because that DTO is
 * InteractionReport-shaped and does not generalize here.
 */
function toPersonaDto(record: NetworkingPersonaRecord) {
  return {
    kind: record.kind,
    personaId: record.personaId,
    displayName: record.displayName,
    persona: record.persona,
    source: record.source,
    attestedAt: record.attestedAt,
    attestedWordingVersion: record.attestedWordingVersion,
    createdAt: record.createdAt,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ personaId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { personaId } = await context.params;

    if (!personaId) {
      return response({ error: "Not found" }, 404);
    }

    // null → 404 `{ error: "Not found" }` — never 403 (loadOwnedScenario idiom).
    const record = await loadOwnedNetworkingPersona(personaId, currentUser.id);

    if (!record) {
      return response({ error: "Not found" }, 404);
    }

    return response(toPersonaDto(record), 200);
  } catch (error) {
    console.error("Networking persona GET failed:", error);

    return response({ error: "Unable to load persona." }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ personaId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { personaId } = await context.params;

    if (!personaId) {
      return response({ error: "Not found" }, 404);
    }

    const deleted = await deleteOwnedNetworkingPersona(
      personaId,
      currentUser.id,
    );

    if (!deleted) {
      return response({ error: "Not found" }, 404);
    }

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Networking persona DELETE failed:", error);

    return response({ error: "Unable to delete persona." }, 500);
  }
}
