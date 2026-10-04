import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  CURRENT_ATTESTATION_WORDING_VERSION,
  NETWORKING_ATTESTATION_WORDING,
  recordAttestation,
} from "@/lib/networking/attestation";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Serves the attestation wording the networking wizard must display.
 *
 * The client must never hardcode the wording — it displays what this route
 * serves, so the recorded wordingVersion always matches what was shown.
 *
 * Rate-limit note: a student can create many unspent attestation rows. Each
 * is harmless (unspent rows grant nothing and expire in 30 minutes). No rate
 * limiter is added here because the table is the audit trail and suppressing
 * writes would damage it.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    return response(
      {
        wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
        wording:
          NETWORKING_ATTESTATION_WORDING[CURRENT_ATTESTATION_WORDING_VERSION],
      },
      200,
    );
  } catch (error) {
    console.error("Networking attestation GET failed:", error);

    return response({ error: "Unable to load the agreement." }, 500);
  }
}

/**
 * Records a fresh attestation against the wording version the client claims
 * it showed. Stale wording returns 409 so the client re-fetches and redisplays.
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

    const wordingVersion = (body as { wordingVersion?: unknown } | null)
      ?.wordingVersion;

    if (typeof wordingVersion !== "string" || !wordingVersion.trim()) {
      return response({ error: "wordingVersion is required" }, 400);
    }

    const result = await recordAttestation({
      userId: currentUser.id,
      wordingVersion,
    });

    if (!result.ok) {
      // 409, not 400: the client's state is stale, not malformed.
      return response(
        {
          error: "This agreement has been updated. Please read it again.",
          wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
        },
        409,
      );
    }

    console.info("Networking attestation recorded", {
      userId: currentUser.id,
      wordingVersion,
    });

    return response(
      {
        attestationId: result.attestationId,
        attestedAt: result.attestedAt.toISOString(),
        wordingVersion,
      },
      201,
    );
  } catch (error) {
    console.error("Networking attestation POST failed:", error);

    return response({ error: "Unable to record the agreement." }, 500);
  }
}
