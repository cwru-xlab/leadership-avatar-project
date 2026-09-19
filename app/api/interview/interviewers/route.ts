import {
  getHeygenApiKey,
  getLiveAvatarApiUrl,
  heygenJsonError,
} from "@/lib/heygen-server";

interface LiveAvatarVoice {
  id: string;
  name: string;
}

interface LiveAvatarRecord {
  id: string;
  name: string;
  preview_url?: string;
  availability?: string;
  status?: string;
  default_voice?: LiveAvatarVoice | null;
}

export interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: {
    id: string;
    name: string;
  };
}

interface CacheEntry {
  interviewers: InterviewerOption[];
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: CacheEntry | null = null;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "private, max-age=600",
      "Content-Type": "application/json",
    },
  });
}

/**
 * Lists the interviewer profiles available to this LiveAvatar account.
 *
 * Each option deliberately keeps an avatar paired with its own default voice.
 * The account's key cannot access HeyGen's separate Platform voice catalog, and
 * arbitrary voice IDs have not been validated with LiveAvatar sessions.
 */
export async function GET() {
  const apiKey = getHeygenApiKey();
  if (!apiKey) {
    return heygenJsonError(
      "HEYGEN_MISSING_KEY",
      "HEYGEN_API_KEY is not set on the server.",
      503
    );
  }

  if (cache && cache.expiresAt > Date.now()) {
    return json({ interviewers: cache.interviewers });
  }

  try {
    const response = await fetch(`${getLiveAvatarApiUrl()}/v1/avatars`, {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[interviewers] LiveAvatar catalog request failed", {
        status: response.status,
        error,
      });
      return heygenJsonError(
        response.status === 401 || response.status === 403
          ? "HEYGEN_INVALID_KEY"
          : "HEYGEN_UPSTREAM_ERROR",
        "Unable to load available interviewers. Please try again.",
        response.status === 401 || response.status === 403 ? response.status : 502
      );
    }

    const data = (await response.json()) as {
      data?: { results?: LiveAvatarRecord[] };
    };

    const interviewers = (data.data?.results ?? [])
      .filter(
        (avatar) =>
          avatar.status === "ACTIVE" &&
          avatar.availability === "usable" &&
          Boolean(avatar.id) &&
          Boolean(avatar.name) &&
          Boolean(avatar.default_voice?.id) &&
          Boolean(avatar.default_voice?.name)
      )
      .map((avatar): InterviewerOption => ({
        avatarId: avatar.id,
        name: avatar.name,
        previewUrl: avatar.preview_url || null,
        voice: {
          id: avatar.default_voice!.id,
          name: avatar.default_voice!.name,
        },
      }));

    if (!interviewers.length) {
      console.error("[interviewers] No usable LiveAvatar profiles found");
      return heygenJsonError(
        "HEYGEN_UPSTREAM_ERROR",
        "No interviewers are currently available. Please try again later.",
        503
      );
    }

    cache = { interviewers, expiresAt: Date.now() + CACHE_TTL_MS };
    return json({ interviewers });
  } catch (error) {
    console.error("[interviewers] LiveAvatar catalog request errored", error);
    return heygenJsonError(
      "HEYGEN_UPSTREAM_ERROR",
      "Unable to load available interviewers. Please try again.",
      502
    );
  }
}
