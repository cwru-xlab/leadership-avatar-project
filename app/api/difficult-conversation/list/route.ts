import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { listDifficultConversations } from "@/lib/difficult-conversation/store";
import { SEEDED_CONVERSATIONS } from "@/lib/difficult-conversation/seeded";
import { s3Storage } from "@/lib/s3-client";
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
 * for list. `studentRole` / `situation` / `lastCheckStatus` power the 15-07
 * catalog cards without a second round-trip.
 */
type DiscoverySummary = {
  id: string;
  title: string;
  avatarRole: string;
  studentRole: string;
  situation: string;
  difficulty: string;
  published: boolean;
  updatedAt: string;
  isMine: boolean;
  /** Present for owned rows only; never exposed for another student's card. */
  lastCheckStatus?: "passed" | "rejected" | "unavailable" | null;
};

function publicFields(record: DifficultConversationRecord): {
  studentRole: string;
  situation: string;
  lastCheckStatus: "passed" | "rejected" | "unavailable" | null;
} {
  const status = record.lastCheck?.status ?? null;
  return {
    studentRole: record.studentRole,
    situation: record.situation,
    lastCheckStatus:
      status === "passed" || status === "rejected" || status === "unavailable"
        ? status
        : null,
  };
}

function fromSeeded(record: DifficultConversationRecord): DiscoverySummary {
  const pub = publicFields(record);
  return {
    id: record.id,
    title: record.title,
    avatarRole: record.avatarRole,
    studentRole: pub.studentRole,
    situation: pub.situation,
    difficulty: record.difficulty,
    published: record.published,
    updatedAt: record.updatedAt,
    isMine: false,
    // Seeded records are never "yours" — omit check state entirely.
  };
}

function fromRecord(
  record: DifficultConversationRecord,
  userId: string
): DiscoverySummary {
  const isMine = record.ownerId === userId;
  const pub = publicFields(record);
  return {
    id: record.id,
    title: record.title,
    avatarRole: record.avatarRole,
    studentRole: pub.studentRole,
    situation: pub.situation,
    difficulty: record.difficulty,
    published: record.published,
    updatedAt: record.updatedAt,
    isMine,
    // Check state only on the owner's own cards.
    ...(isMine ? { lastCheckStatus: pub.lastCheckStatus } : {}),
  };
}

async function hydrateSummaries(
  entries: DifficultConversationSummary[],
  userId: string
): Promise<DiscoverySummary[]> {
  const records = await Promise.all(
    entries.map((e) => s3Storage.getDifficultConversationObject(e.id))
  );
  const out: DiscoverySummary[] = [];
  for (let i = 0; i < entries.length; i++) {
    const record = records[i];
    const entry = entries[i]!;
    if (record) {
      out.push(fromRecord(record, userId));
    } else {
      // Index orphan — still show something, never invent private fields.
      out.push({
        id: entry.id,
        title: entry.title,
        avatarRole: entry.avatarRole,
        studentRole: "",
        situation: "",
        difficulty: entry.difficulty,
        published: entry.published,
        updatedAt: entry.updatedAt,
        isMine: entry.ownerId === userId,
      });
    }
  }
  return out;
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

    const mineEntries = (
      await listDifficultConversations({ ownerId: currentUser.id })
    )
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    const mine = await hydrateSummaries(mineEntries, currentUser.id);

    let fromOthersEntries = (
      await listDifficultConversations({ publishedOnly: true })
    ).filter((e) => e.ownerId && e.ownerId !== currentUser.id);

    fromOthersEntries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (cursor) {
      const cursorTime = new Date(cursor).getTime();
      if (Number.isFinite(cursorTime)) {
        fromOthersEntries = fromOthersEntries.filter(
          (e) => new Date(e.updatedAt).getTime() < cursorTime
        );
      }
    }

    const page = fromOthersEntries.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1]!.updatedAt : null;
    const fromOthers = await hydrateSummaries(page, currentUser.id);

    return response(
      {
        seeded,
        mine,
        fromOthers,
        nextCursor,
      },
      200
    );
  } catch (error) {
    console.error("Difficult conversation list error:", error);
    return response({ error: "Failed to list difficult conversations" }, 500);
  }
}
