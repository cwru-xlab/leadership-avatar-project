/**
 * Owner-scoped create + list for distilled networking personas.
 *
 * Deliberately no PATCH — a persona is immutable once distilled; re-distilling
 * means a new attestation and a new persona. Deliberately no publish/share
 * verb of any kind (16-CONTEXT.md decision 7): there is no analogue of
 * `app/api/scenario/publish/route.ts` here.
 */

import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { MAX_PERSONA_LENGTH } from "@/lib/interview/customization";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/interview/persona-distill";
import {
  listOwnedNetworkingPersonas,
  saveNetworkingPersona,
  type NetworkingPersonaRecord,
} from "@/lib/networking/persona-store";

export const runtime = "nodejs";

const SOURCES = ["pasted", "written", "generated"] as const;

type PersonaSource = (typeof SOURCES)[number];

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * SECOND of two enforcement points for 16-CONTEXT.md decision 8.
 *
 * The gate itself is `consumeAttestation` before distillation (16-05). This
 * check ensures an ungated distillation cannot be laundered into a saved
 * networking persona: the attestation must exist, belong to the caller, and
 * already be spent (`consumedAt !== null`). A still-unspent attestation here
 * means the caller skipped the distill gate.
 *
 * `source: "generated"` and `source: "written"` ALSO require an attestation.
 * The student's own writing may still describe a real person, and a
 * "generated" description may have been hand-edited into one. Only the
 * built-in characters (16-06) are attestation-free, and they are not instances.
 *
 * Not-found and not-owned return the same opaque failure — never distinguish.
 */
export async function requireSpentOwnedAttestation(
  attestationId: string,
  userId: string,
): Promise<
  | {
      ok: true;
      attestedAt: string;
      attestedWordingVersion: string;
    }
  | { ok: false; reason: "rejected" }
> {
  const row = await prisma.networkingAttestation.findUnique({
    where: { id: attestationId },
  });

  if (!row || row.userId !== userId) {
    return { ok: false, reason: "rejected" };
  }

  if (row.consumedAt === null) {
    return { ok: false, reason: "rejected" };
  }

  return {
    ok: true,
    attestedAt: row.attestedAt.toISOString(),
    attestedWordingVersion: row.wordingVersion,
  };
}

/**
 * GET returns the current user's own personas only — never accepts a userId
 * from the client (same posture as `app/api/metrics/consent/route.ts`).
 * List DTO omits `persona` and `attestationId` — a picker needs a name and a date.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const records = await listOwnedNetworkingPersonas(currentUser.id);

    return response(
      {
        personas: records.map((r) => ({
          personaId: r.personaId,
          displayName: r.displayName,
          source: r.source,
          createdAt: r.createdAt,
        })),
      },
      200,
    );
  } catch (error) {
    console.error("Networking persona GET list failed:", error);

    return response({ error: "Unable to list personas." }, 500);
  }
}

/**
 * POST creates a persona from an ALREADY-DISTILLED sentence.
 * Body: { persona, displayName, source, attestationId }.
 * Rejects if a raw-paste key is present at all (explicit tripwire).
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return response({ error: "Invalid JSON body" }, 400);
    }

    // Explicit tripwire: raw paste must never enter this storage layer.
    if (Object.prototype.hasOwnProperty.call(body, "profileText")) {
      return response(
        {
          error:
            "profileText is not accepted; submit the distilled persona only",
        },
        400,
      );
    }

    const persona = body.persona;
    const displayName = body.displayName;
    const source = body.source;
    const attestationId = body.attestationId;

    if (typeof attestationId !== "string" || !attestationId.trim()) {
      return response({ error: "attestationId is required" }, 400);
    }

    if (typeof persona !== "string" || !persona.trim()) {
      return response({ error: "persona is required" }, 400);
    }

    if (persona.length > MAX_PERSONA_LENGTH) {
      return response(
        { error: `persona must be <= ${MAX_PERSONA_LENGTH} characters` },
        400,
      );
    }

    if (typeof displayName !== "string" || !displayName.trim()) {
      return response({ error: "displayName is required" }, 400);
    }

    if (displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
      return response(
        {
          error: `displayName must be <= ${MAX_DISPLAY_NAME_LENGTH} characters`,
        },
        400,
      );
    }

    if (
      typeof source !== "string" ||
      !(SOURCES as readonly string[]).includes(source)
    ) {
      return response(
        { error: 'source must be "pasted", "written", or "generated"' },
        400,
      );
    }

    const receipt = await requireSpentOwnedAttestation(
      attestationId.trim(),
      currentUser.id,
    );

    if (!receipt.ok) {
      // Opaque: not-found, not-owned, and unconsumed all look the same.
      return response({ error: "Attestation required" }, 403);
    }

    const personaId = randomUUID();
    const createdAt = new Date().toISOString();

    const record: NetworkingPersonaRecord = {
      kind: "networking-persona",
      personaId,
      ownerId: currentUser.id,
      displayName: displayName.trim(),
      persona: persona.trim(),
      source: source as PersonaSource,
      attestationId: attestationId.trim(),
      attestedAt: receipt.attestedAt,
      attestedWordingVersion: receipt.attestedWordingVersion,
      createdAt,
    };

    try {
      await saveNetworkingPersona(record);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid persona record";

      return response({ error: message }, 400);
    }

    console.info("Networking persona saved", {
      userId: currentUser.id,
      personaId,
      source,
      personaLength: record.persona.length,
    });

    // Do not echo `persona` back — the client already has it.
    return response(
      { personaId, displayName: record.displayName, createdAt },
      201,
    );
  } catch (error) {
    console.error("Networking persona POST failed:", error);

    return response({ error: "Unable to save persona." }, 500);
  }
}
