import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import { loadOwnedDifficultConversation } from "@/lib/difficult-conversation/store";
import {
  runPrePublishCheck,
  type PrePublishVerdict,
} from "@/lib/difficult-conversation/prepublish-check";

const screenForPublish = runPrePublishCheck;
import type {
  DifficultConversationLastCheck,
  DifficultConversationRecord,
} from "@/lib/difficult-conversation/types";

export const runtime = "nodejs";

/**
 * Test hooks for scripts/verify-dc-routes.ts.
 */
declare global {
  // eslint-disable-next-line no-var
  var __DC_AUTH_USER__: User | null | undefined;
  // eslint-disable-next-line no-var
  var __DC_RUN_PREPUBLISH_CHECK__:
    | ((record: DifficultConversationRecord) => Promise<PrePublishVerdict>)
    | undefined;
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function resolveUser(request: NextRequest): Promise<User | null> {
  if (typeof globalThis.__DC_AUTH_USER__ !== "undefined") {
    return globalThis.__DC_AUTH_USER__;
  }
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

async function checkPrePublish(
  record: DifficultConversationRecord
): Promise<PrePublishVerdict> {
  if (typeof globalThis.__DC_RUN_PREPUBLISH_CHECK__ === "function") {
    return globalThis.__DC_RUN_PREPUBLISH_CHECK__(record);
  }
  return screenForPublish(record);
}

function toLastCheck(
  verdict: PrePublishVerdict
): DifficultConversationLastCheck {
  const checkedAt = new Date().toISOString();
  if (verdict.status === "passed") {
    return { status: "passed", checkedAt };
  }
  // Persist unavailable with a distinct runtime status so 15-07 can tell
  // "could not check" from "rejected". The 15-02 type only names passed|
  // rejected; cast keeps the wire/store value accurate without widening
  // types.ts (owned by an earlier plan).
  if (verdict.status === "unavailable") {
    return {
      status: "unavailable" as DifficultConversationLastCheck["status"],
      checkedAt,
      reason: verdict.reason,
      fix: verdict.fix,
    };
  }
  return {
    status: "rejected",
    checkedAt,
    reason: verdict.reason,
    fix: verdict.fix,
  };
}

/**
 * POST /api/difficult-conversation/publish
 *
 * This deliberately reuses the Phase 7 `published` flag, which gates DISCOVERY
 * only and is not access control — that semantic is unchanged: reading a
 * conversation by id stays untouched.
 *
 * What is NEW in Phase 15 is an automated pre-publish screen on every
 * transition TO published. Unpublishing is never gated.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await resolveUser(request);
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      typeof body.published !== "boolean"
    ) {
      return response({ error: "Invalid request body" }, 400);
    }

    const existing = await loadOwnedDifficultConversation(
      body.id,
      currentUser.id
    );
    if (!existing) {
      return response({ error: "Difficult conversation not found" }, 404);
    }

    // Unpublish is NEVER gated — even if the check would throw.
    if (body.published === false) {
      const updated: DifficultConversationRecord = {
        ...existing,
        published: false,
        updatedAt: new Date().toISOString(),
      };
      await s3Storage.saveDifficultConversationObject(updated);
      return response({ published: false }, 200);
    }

    const verdict = await checkPrePublish(existing);
    const lastCheck = toLastCheck(verdict);

    if (verdict.status === "passed") {
      const updated: DifficultConversationRecord = {
        ...existing,
        published: true,
        lastCheck,
        updatedAt: new Date().toISOString(),
      };
      await s3Storage.saveDifficultConversationObject(updated);
      return response({ published: true }, 200);
    }

    // Store the check result but do NOT write published:true. Scenario stays
    // saved and privately playable.
    const blocked: DifficultConversationRecord = {
      ...existing,
      published: false,
      lastCheck,
      updatedAt: new Date().toISOString(),
    };
    await s3Storage.saveDifficultConversationObject(blocked);

    if (verdict.status === "rejected") {
      return response(
        {
          published: false,
          blocked: "rejected",
          category: verdict.category,
          reason: verdict.reason,
          fix: verdict.fix,
          stillPlayable: true,
          message:
            "This scenario could not be published. It is still saved and still privately playable — fix the problem below and try again.",
        },
        422
      );
    }

    // unavailable — distinct copy; never accuse the author of abuse/injection.
    return response(
      {
        published: false,
        blocked: "unavailable",
        reason: verdict.reason,
        fix: verdict.fix,
        message:
          "This scenario could not be checked right now — try again in a minute. It is still saved and privately playable.",
      },
      503
    );
  } catch (error) {
    console.error("Difficult conversation publish error:", error);
    return response({ error: "Failed to update publish state" }, 500);
  }
}
