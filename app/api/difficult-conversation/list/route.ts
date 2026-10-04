import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { listDifficultConversations } from "@/lib/difficult-conversation/store";
import { SEEDED_CONVERSATIONS } from "@/lib/difficult-conversation/seeded";
import type { DifficultConversationRecord } from "@/lib/difficult-conversation/types";
import type { DifficultConversationSummary } from "@/lib/difficult-conversation/store";

export const runtime = "nodejs";

/**
 * Test hook for scripts/verify-dc-routes.ts — when set, bypasses cookie auth.
 */
declare global {
  // eslint-disable-next-line no-var
  var __DC_AUTH_USER__: User | null | undefined;
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

/**
 * Discovery card shape. Carries `isMine` (owner presence) rather than the raw
 * ownerId. Deliberately omits the avatar's private stance — never on the wire
 * for list.
 */
type DiscoverySummary = {
  id: string;
  title: string;
  avatarRole: string;
  difficulty: string;
  published: boolean;
  updatedAt: string;
  isMine: boolean;
};

function fromSeeded(record: DifficultConversationRecord): DiscoverySummary {
  return {
    id: record.id,
    title: record.title,
    avatarRole: record.avatarRole,
    difficulty: record.difficulty,
    published: record.published,
    updatedAt: record.updatedAt,
    isMine: false,
  };
}

function fromIndex(
  entry: DifficultConversationSummary,
  userId: string
): DiscoverySummary {
  return {
    id: entry.id,
    title: entry.title,
    avatarRole: entry.avatarRole,
    difficulty: entry.difficulty,
    published: entry.published,
    updatedAt: entry.updatedAt,
    isMine: entry.ownerId === userId,
  };
}

/**
 * GET /api/difficult-conversation/list
 *
 * Three discovery sections in CONTEXT.md's locked order: seeded, mine,
 * fromOthers. Auth required (same as /case-play).
 *
 * Ordering/paging (Claude's Discretion): fromOthers sorted by updatedAt
 * descending; page with `cursor` (opaque updatedAt of the last item on the
 * previous page) + `limit` (default 24, max 100). Seeded and mine are not
 * paged — catalogs stay small enough for a single response.
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await resolveUser(request);
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") || "24", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 100)
      : 24;
    const cursor = searchParams.get("cursor");

    const seeded = SEEDED_CONVERSATIONS.map(fromSeeded);

    const mine = (await listDifficultConversations({ ownerId: currentUser.id }))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .map((e) => fromIndex(e, currentUser.id));

    let fromOthers = (
      await listDifficultConversations({ publishedOnly: true })
    ).filter((e) => e.ownerId && e.ownerId !== currentUser.id);

    fromOthers.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (cursor) {
      const cursorTime = new Date(cursor).getTime();
      if (Number.isFinite(cursorTime)) {
        fromOthers = fromOthers.filter(
          (e) => new Date(e.updatedAt).getTime() < cursorTime
        );
      }
    }

    const page = fromOthers.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1]!.updatedAt : null;

    return response(
      {
        seeded,
        mine,
        fromOthers: page.map((e) => fromIndex(e, currentUser.id)),
        nextCursor,
      },
      200
    );
  } catch (error) {
    console.error("Difficult conversation list error:", error);
    return response({ error: "Failed to list difficult conversations" }, 500);
  }
}
