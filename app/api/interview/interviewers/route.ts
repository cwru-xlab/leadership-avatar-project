import { SEATED_PUBLIC_AVATAR_ID_SET, SEATED_PUBLIC_AVATAR_IDS } from "@/lib/avatar-roster";
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
  status?: string;
  is_expired?: boolean;
  error_message?: string | null;
  default_voice?: LiveAvatarVoice | null;
}

interface LiveAvatarVoiceRecord {
  id: string;
  gender?: string | null;
}

export interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: {
    id: string;
    name: string;
  };
  /**
   * Presented gender, joined from the preset voice catalog (`/v1/voices`) via
   * the avatar's own `default_voice.id`. The avatar records carry no
   * demographic metadata of their own, so this is the only vendor-supplied
   * facet available for filtering.
   *
   * ABSENT IS MEANINGFUL, not a failure: the account's five custom faculty
   * avatars use custom voices that are not in the preset catalog, so no gender
   * is supplied for them. They are real people, and guessing from a name is
   * exactly the wrong move. **A gender filter must treat an absent value as
   * always-visible** — filtering it out would hide the faculty, who are the
   * roster's most important entries.
   *
   * Note this is the VOICE's gender, a reliable proxy only because HeyGen
   * pairs each avatar with its own voice (`Ann Therapist` ships `Ann - IA`).
   */
  gender?: string;
}

interface CacheEntry {
  interviewers: InterviewerOption[];
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
/** `/v1/avatars/public` caps page_size at 100; ~293 records today. */
const PUBLIC_PAGE_SIZE = 100;
/** Hard stop so an upstream `next` that never clears cannot spin forever. */
const PUBLIC_MAX_PAGES = 10;

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
 * Liveness filter, applied identically to both catalogs.
 *
 * `/v1/avatars` does not return an `availability` field; liveness is carried by
 * `status` plus `is_expired`. Requiring `availability` silently filtered out
 * every avatar and surfaced as a 503.
 */
function isUsable(avatar: LiveAvatarRecord): boolean {
  return (
    avatar.status === "ACTIVE" &&
    avatar.is_expired !== true &&
    !avatar.error_message &&
    Boolean(avatar.id) &&
    Boolean(avatar.name) &&
    Boolean(avatar.default_voice?.id) &&
    Boolean(avatar.default_voice?.name)
  );
}

function toOption(
  avatar: LiveAvatarRecord,
  genderByVoiceId: ReadonlyMap<string, string>,
): InterviewerOption {
  const voiceId = avatar.default_voice!.id;
  const gender = genderByVoiceId.get(voiceId);
  return {
    avatarId: avatar.id,
    name: avatar.name,
    previewUrl: avatar.preview_url || null,
    voice: {
      id: voiceId,
      name: avatar.default_voice!.name,
    },
    // Omit rather than emit a placeholder, so "we were told nothing" stays
    // distinguishable from a real "unknown" the catalog reports.
    ...(gender && gender !== "unknown" ? { gender } : {}),
  };
}

/**
 * Preset voice catalog, reduced to the one field worth filtering on.
 *
 * A failure here costs the gender facet and nothing else — every option still
 * renders — so it degrades silently rather than failing the picker.
 */
async function fetchVoiceGenders(
  apiKey: string,
): Promise<ReadonlyMap<string, string>> {
  const genderByVoiceId = new Map<string, string>();
  for (let page = 1; page <= PUBLIC_MAX_PAGES; page += 1) {
    const result = await fetchLiveAvatar(
      `/v1/voices?page=${page}&page_size=${PUBLIC_PAGE_SIZE}`,
      apiKey,
    );
    if (!result.ok) break;
    const voices = result.results as unknown as LiveAvatarVoiceRecord[];
    for (const voice of voices) {
      if (voice.id && voice.gender) genderByVoiceId.set(voice.id, voice.gender);
    }
    if (voices.length < PUBLIC_PAGE_SIZE) break;
  }
  return genderByVoiceId;
}

/**
 * One upstream page. `authStatus` is carried on the failure arm so a 401/403
 * still surfaces as HEYGEN_INVALID_KEY instead of being flattened into a
 * generic 502 — request-scoped, never module state, since several of these run
 * concurrently.
 */
type FetchResult =
  | { ok: true; results: LiveAvatarRecord[] }
  | { ok: false; authStatus: number | null };

async function fetchLiveAvatar(
  path: string,
  apiKey: string,
): Promise<FetchResult> {
  const response = await fetch(`${getLiveAvatarApiUrl()}${path}`, {
    headers: { "X-API-KEY": apiKey },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[interviewers] LiveAvatar request failed", {
      path,
      status: response.status,
      error: await response.text(),
    });
    return {
      ok: false,
      authStatus:
        response.status === 401 || response.status === 403
          ? response.status
          : null,
    };
  }
  const data = (await response.json()) as {
    data?: { results?: LiveAvatarRecord[]; next?: string | null };
  };
  return { ok: true, results: data.data?.results ?? [] };
}

/**
 * HeyGen's public catalog, narrowed to the curated seated roster.
 *
 * A failure here degrades to the custom avatars rather than failing the picker:
 * losing the stock roster is a smaller harm than a student unable to start a
 * session at all. The 503 below still covers the case where nothing survives.
 */
async function fetchSeatedPublicAvatars(
  apiKey: string,
): Promise<{ records: LiveAvatarRecord[]; authStatus: number | null }> {
  const collected: LiveAvatarRecord[] = [];
  let authStatus: number | null = null;

  for (let page = 1; page <= PUBLIC_MAX_PAGES; page += 1) {
    const result = await fetchLiveAvatar(
      `/v1/avatars/public?page=${page}&page_size=${PUBLIC_PAGE_SIZE}`,
      apiKey,
    );
    if (!result.ok) {
      authStatus = result.authStatus;
      break;
    }
    collected.push(
      ...result.results.filter((a) => SEATED_PUBLIC_AVATAR_ID_SET.has(a.id)),
    );
    if (result.results.length < PUBLIC_PAGE_SIZE) break;
  }

  // Surface catalog churn instead of letting the roster quietly shrink.
  const found = new Set(collected.map((a) => a.id));
  const missing = Object.entries(SEATED_PUBLIC_AVATAR_IDS)
    .filter(([id]) => !found.has(id))
    .map(([, name]) => name);
  if (missing.length) {
    console.error("[interviewers] curated public avatars not found upstream", {
      count: missing.length,
      missing,
    });
  }

  return { records: collected, authStatus };
}

/**
 * Lists the interviewer profiles available to this LiveAvatar account.
 *
 * Two catalogs are merged: the account's own avatars (`/v1/avatars`) and the
 * curated seated slice of HeyGen's public roster (`/v1/avatars/public`, filtered
 * by `lib/avatar-roster.ts`). The custom avatars come first.
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
      503,
    );
  }

  if (cache && cache.expiresAt > Date.now()) {
    return json({ interviewers: cache.interviewers });
  }

  try {
    // The account's own avatars — the Weatherhead faculty likenesses — lead the
    // picker, ahead of the stock roster.
    const [custom, publicSeated, genderByVoiceId] = await Promise.all([
      fetchLiveAvatar("/v1/avatars", apiKey),
      fetchSeatedPublicAvatars(apiKey),
      fetchVoiceGenders(apiKey),
    ]);

    if (!custom.ok && publicSeated.records.length === 0) {
      const authStatus = custom.authStatus ?? publicSeated.authStatus;
      return heygenJsonError(
        authStatus ? "HEYGEN_INVALID_KEY" : "HEYGEN_UPSTREAM_ERROR",
        "Unable to load available interviewers. Please try again.",
        authStatus ?? 502,
      );
    }

    const interviewers = [
      ...(custom.ok ? custom.results : []),
      ...publicSeated.records,
    ]
      .filter(isUsable)
      .map((avatar) => toOption(avatar, genderByVoiceId));

    if (!interviewers.length) {
      console.error("[interviewers] No usable LiveAvatar profiles found");
      return heygenJsonError(
        "HEYGEN_UPSTREAM_ERROR",
        "No interviewers are currently available. Please try again later.",
        503,
      );
    }

    cache = { interviewers, expiresAt: Date.now() + CACHE_TTL_MS };
    return json({ interviewers });
  } catch (error) {
    console.error("[interviewers] LiveAvatar catalog request errored", error);
    return heygenJsonError(
      "HEYGEN_UPSTREAM_ERROR",
      "Unable to load available interviewers. Please try again.",
      502,
    );
  }
}
