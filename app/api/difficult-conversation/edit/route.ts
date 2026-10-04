import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import { loadOwnedDifficultConversation } from "@/lib/difficult-conversation/store";
import { validateDifficultConversationInput } from "@/lib/difficult-conversation/validation";
import {
  runPrePublishCheck as screenForPublish,
  type PrePublishVerdict,
} from "@/lib/difficult-conversation/prepublish-check";
import type {
  DifficultConversationLastCheck,
  DifficultConversationRecord,
  DifficultyBand,
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
 * POST /api/difficult-conversation/edit
 *
 * Owner-scoped update. When the record is currently published, the edited
 * text is re-screened BEFORE it becomes visible — closing the
 * publish-clean-then-edit hole. Non-owner → 404, never a permission-denied status.
 *
 * Branch outcomes (complete set — a fifth path that saves-but-keeps-published
 * without a check must never be added):
 * 1. currently private → save, no check
 * 2. currently published + check passed → save, stay published
 * 3. currently published + check rejected → save edit, demote to private, 422
 * 4. currently published + check unavailable → save edit, demote, 503
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await resolveUser(request);
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.id !== "string") {
      return response({ error: "Invalid request body" }, 400);
    }

    const existing = await loadOwnedDifficultConversation(
      body.id,
      currentUser.id
    );
    if (!existing) {
      return response({ error: "Difficult conversation not found" }, 404);
    }

    // Strip server-owned / non-authored keys before validation.
    const { id: _id, published: _p, ownerId: _o, ...authored } = body as Record<
      string,
      unknown
    > & { id: string };
    void _id;
    void _p;
    void _o;

    const errors = validateDifficultConversationInput(authored);
    if (errors.length > 0) {
      return response({ errors }, 400);
    }

    const edited: DifficultConversationRecord = {
      ...existing,
      title: String(authored.title).trim(),
      avatarRole: String(authored.avatarRole).trim(),
      studentRole: String(authored.studentRole).trim(),
      situation: String(authored.situation).trim(),
      sharedBackstory: String(authored.sharedBackstory).trim(),
      hiddenPosition: String(authored.hiddenPosition).trim(),
      studentObjective: String(authored.studentObjective).trim(),
      stakes: String(authored.stakes).trim(),
      difficulty: String(authored.difficulty).trim() as DifficultyBand,
      avatarId:
        typeof authored.avatarId === "string" ? authored.avatarId.trim() : "",
      voiceId:
        typeof authored.voiceId === "string" ? authored.voiceId.trim() : "",
      // Immutable ownership / id / createdAt preserved from existing.
      id: existing.id,
      ownerId: existing.ownerId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Currently private — not publish-visible; no check.
    if (existing.published !== true) {
      const saved: DifficultConversationRecord = {
        ...edited,
        published: false,
        lastCheck: existing.lastCheck,
      };
      await s3Storage.saveDifficultConversationObject(saved);
      return response({ id: saved.id, published: false }, 200);
    }

    // Currently published — re-screen the EDITED text before it becomes visible.
    const verdict = await checkPrePublish(edited);
    const lastCheck = toLastCheck(verdict);

    if (verdict.status === "passed") {
      const saved: DifficultConversationRecord = {
        ...edited,
        published: true,
        lastCheck,
      };
      await s3Storage.saveDifficultConversationObject(saved);
      return response({ id: saved.id, published: true }, 200);
    }

    // Fail closed: save the edit AND demote. Never leave old published text
    // live while storing new rejected text the author no longer sees.
    const demoted: DifficultConversationRecord = {
      ...edited,
      published: false,
      lastCheck,
    };
    await s3Storage.saveDifficultConversationObject(demoted);

    if (verdict.status === "rejected") {
      return response(
        {
          published: false,
          demoted: true,
          category: verdict.category,
          reason: verdict.reason,
          fix: verdict.fix,
          stillPlayable: true,
          message:
            "Your changes were saved, but this scenario has been unpublished until the problem below is fixed.",
        },
        422
      );
    }

    return response(
      {
        published: false,
        demoted: true,
        blocked: "unavailable",
        reason: verdict.reason,
        fix: verdict.fix,
        stillPlayable: true,
        message:
          "Your changes were saved, but this scenario has been unpublished because it could not be checked right now — try publishing again in a minute.",
      },
      503
    );
  } catch (error) {
    console.error("Difficult conversation edit error:", error);
    return response({ error: "Failed to update difficult conversation" }, 500);
  }
}
