/**
 * The interviewer catalog: the account's avatars plus the curated seated slice
 * of HeyGen's public roster. Moved out of `app/api/interview/interviewers` so
 * the elevator pitch's server-side listener draw reads the same filtered,
 * cached list the picker renders (a route module cannot export this).
 */

import {
  FACULTY_VOICE_GENDER,
  PUBLIC_AVATAR_PLAYS,
  SEATED_PUBLIC_AVATAR_ID_SET,
  SEATED_PUBLIC_AVATAR_IDS,
  type AvatarPlays,
} from "@/lib/avatar-roster";
import { getHeygenApiKey, getLiveAvatarApiUrl } from "@/lib/heygen-server";
import type { HeygenErrorCode } from "@/lib/heygen-types";

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
  language?: string | null;
}

/** The facets one preset-voice record can contribute to an option. */
interface VoiceFacets {
  gender?: string;
  language?: string;
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
   * the avatar's own `default_voice.id`, and for the faculty filled in from
   * `FACULTY_VOICE_GENDER`. The avatar records carry no demographic metadata
   * of their own, so those are the only two sources available for filtering.
   *
   * THE VENDOR WINS where it supplies a value; the curated map only fills the
   * gap the preset catalog leaves for the account's custom faculty voices.
   * That gap used to mean all five faculty stayed visible under BOTH gender
   * choices, which showed four male instructors to a student asking for a
   * female voice. The curated values are stated by the course owners about
   * named colleagues, not inferred from names or faces — guessing remains the
   * wrong move, and nothing here guesses.
   *
   * ABSENT IS STILL MEANINGFUL, and still possible: a future faculty avatar
   * with no entry in that map supplies no gender. **A gender filter must keep
   * treating an absent value as always-visible** — filtering it out would hide
   * a face rather than admit the data is missing.
   *
   * Note this is the VOICE's gender, a reliable proxy only because HeyGen
   * pairs each avatar with its own voice (`Ann Therapist` ships `Ann - IA`).
   */
  gender?: string;
  /**
   * Voice-catalog language, joined from the same `/v1/voices` record as
   * `gender`, so it carries the same contract: **absent means "we were told
   * nothing", and such an option stays visible under a language filter.** The
   * faculty's custom voices supply no language either.
   *
   * The vendor ships a short code, not a display name — every preset voice on
   * this account reads `"en"` today — so the value is kept VERBATIM and any
   * label is the UI's job. A picker facet built on it should expect to find
   * only one distinct value and hide itself accordingly.
   */
  language?: string;
  /**
   * What this face is dressed to play, from the curated map in
   * `lib/avatar-roster.ts`. Curated, never inferred — see that map's comment.
   * A stock face not in that map is `general`, which is a real answer rather
   * than a gap: plain business dress can sit opposite a student in any
   * scenario.
   *
   * ABSENT FOR THE FACULTY, deliberately. The five custom avatars are real
   * Weatherhead instructors, and type-casting a named colleague as a role is
   * not this app's call to make. They are grouped by `faculty` instead, which
   * is a fact about which catalog they came from rather than a judgement about
   * them.
   */
  plays?: AvatarPlays;
  /**
   * True for the account's own avatars (`/v1/avatars`) — the Weatherhead
   * faculty likenesses. False for the curated public roster. Unlike the other
   * facets this is always known, because it is which catalog the record came
   * from rather than anything the vendor had to tell us.
   */
  faculty: boolean;
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
  facetsByVoiceId: ReadonlyMap<string, VoiceFacets>,
  faculty: boolean,
): InterviewerOption {
  const voiceId = avatar.default_voice!.id;
  const facets = facetsByVoiceId.get(voiceId);
  const vendorGender =
    facets?.gender && facets.gender !== "unknown" ? facets.gender : undefined;
  // Curated faculty voices fill the gap the preset catalog leaves, and ONLY
  // that gap: the vendor's own value wins wherever it exists, so this can
  // never contradict `/v1/voices`. See `FACULTY_VOICE_GENDER`.
  const gender = vendorGender ?? FACULTY_VOICE_GENDER[avatar.id];
  const language = facets?.language;
  // The faculty get no `plays` at all — see the field's comment. A stock face
  // the curated map does not mention is `general`, which is an answer.
  const plays = faculty
    ? undefined
    : (PUBLIC_AVATAR_PLAYS[avatar.id] ?? "general");
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
    ...(gender ? { gender } : {}),
    ...(language && language !== "unknown" ? { language } : {}),
    ...(plays ? { plays } : {}),
    faculty,
  };
}

/**
 * Preset voice catalog, reduced to the two fields worth filtering on.
 *
 * A failure here costs the gender and language facets and nothing else —
 * every option still renders — so it degrades silently rather than failing
 * the picker. Both fields ride the SAME request on purpose: they come from one
 * record, so a partial join (gender but no language) is not a state worth
 * having.
 */
async function fetchVoiceFacets(
  apiKey: string,
): Promise<ReadonlyMap<string, VoiceFacets>> {
  const facetsByVoiceId = new Map<string, VoiceFacets>();
  for (let page = 1; page <= PUBLIC_MAX_PAGES; page += 1) {
    const result = await fetchLiveAvatar(
      `/v1/voices?page=${page}&page_size=${PUBLIC_PAGE_SIZE}`,
      apiKey,
    );
    if (!result.ok) break;
    const voices = result.results as unknown as LiveAvatarVoiceRecord[];
    for (const voice of voices) {
      if (!voice.id) continue;
      if (!voice.gender && !voice.language) continue;
      facetsByVoiceId.set(voice.id, {
        ...(voice.gender ? { gender: voice.gender } : {}),
        ...(voice.language ? { language: voice.language } : {}),
      });
    }
    if (voices.length < PUBLIC_PAGE_SIZE) break;
  }
  return facetsByVoiceId;
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

export type InterviewerCatalogResult =
  | { ok: true; interviewers: InterviewerOption[] }
  | { ok: false; code: HeygenErrorCode; message: string; status: number };

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
export async function loadInterviewerCatalog(): Promise<InterviewerCatalogResult> {
  const apiKey = getHeygenApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "HEYGEN_MISSING_KEY",
      message: "HEYGEN_API_KEY is not set on the server.",
      status: 503,
    };
  }

  if (cache && cache.expiresAt > Date.now()) {
    return { ok: true, interviewers: cache.interviewers };
  }

  try {
    // The account's own avatars — the Weatherhead faculty likenesses — lead the
    // picker, ahead of the stock roster.
    const [custom, publicSeated, facetsByVoiceId] = await Promise.all([
      fetchLiveAvatar("/v1/avatars", apiKey),
      fetchSeatedPublicAvatars(apiKey),
      fetchVoiceFacets(apiKey),
    ]);

    if (!custom.ok && publicSeated.records.length === 0) {
      const authStatus = custom.authStatus ?? publicSeated.authStatus;
      return {
        ok: false,
        code: authStatus ? "HEYGEN_INVALID_KEY" : "HEYGEN_UPSTREAM_ERROR",
        message: "Unable to load available interviewers. Please try again.",
        status: authStatus ?? 502,
      };
    }

    // `faculty` is set per catalog here rather than inside `toOption`, because
    // WHICH catalog a record arrived from is the only place that fact exists.
    const interviewers = [
      ...(custom.ok ? custom.results : []).map((avatar) => ({
        avatar,
        faculty: true,
      })),
      ...publicSeated.records.map((avatar) => ({ avatar, faculty: false })),
    ]
      .filter(({ avatar }) => isUsable(avatar))
      .map(({ avatar, faculty }) =>
        toOption(avatar, facetsByVoiceId, faculty),
      );

    if (!interviewers.length) {
      console.error("[interviewers] No usable LiveAvatar profiles found");
      return {
        ok: false,
        code: "HEYGEN_UPSTREAM_ERROR",
        message:
          "No interviewers are currently available. Please try again later.",
        status: 503,
      };
    }

    cache = { interviewers, expiresAt: Date.now() + CACHE_TTL_MS };
    return { ok: true, interviewers };
  } catch (error) {
    console.error("[interviewers] LiveAvatar catalog request errored", error);
    return {
      ok: false,
      code: "HEYGEN_UPSTREAM_ERROR",
      message: "Unable to load available interviewers. Please try again.",
      status: 502,
    };
  }
}
