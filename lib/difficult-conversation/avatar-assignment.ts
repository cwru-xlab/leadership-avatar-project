/**
 * Deterministic avatar assignment for seeded difficult conversations.
 *
 * Seeded records deliberately leave `avatarId` / `voiceId` empty and resolve
 * them at session-start (or verification) time against the live ACTIVE HeyGen
 * LiveAvatar catalog. Hardcoding an id would silently break when the account's
 * catalog churns — the same failure class `/api/interview/interviewers` exists
 * to filter against.
 *
 * Filtering criteria mirror `app/api/interview/interviewers/route.ts`
 * (ACTIVE, non-expired, paired default_voice). The filter lives here rather
 * than being extracted from that route so Phase 15 parallel waves do not edit
 * the interviewers endpoint; keep the two in sync if either changes.
 *
 * Voice pairing: always return the chosen avatar's OWN `default_voice.id`.
 * Never cross-pair — same discipline as `CaseAvatar` in `types/index.ts`.
 */

import { createHash } from "crypto";

import { getHeygenApiKey, getLiveAvatarApiUrl } from "@/lib/heygen-server";

export interface ActiveAvatarWithVoice {
  avatarId: string;
  name: string;
  /** Present on some LiveAvatar payloads; often absent on this account. */
  gender?: string;
  voice: {
    id: string;
    name: string;
  };
}

interface LiveAvatarVoice {
  id: string;
  name: string;
}

interface LiveAvatarRecord {
  id: string;
  name: string;
  status?: string;
  is_expired?: boolean;
  gender?: string;
  default_voice?: LiveAvatarVoice | null;
}

/**
 * Same ACTIVE + default_voice gate as the interviewers catalog route.
 * Exported so verification can assert a resolved id is still in today's set.
 */
export function filterActiveAvatarsWithVoices(
  results: LiveAvatarRecord[],
): ActiveAvatarWithVoice[] {
  return results
    .filter(
      (avatar) =>
        avatar.status === "ACTIVE" &&
        avatar.is_expired !== true &&
        Boolean(avatar.id) &&
        Boolean(avatar.name) &&
        Boolean(avatar.default_voice?.id) &&
        Boolean(avatar.default_voice?.name),
    )
    .map((avatar) => ({
      avatarId: avatar.id,
      name: avatar.name,
      gender:
        typeof avatar.gender === "string" && avatar.gender.trim()
          ? avatar.gender.trim()
          : undefined,
      voice: {
        id: avatar.default_voice!.id,
        name: avatar.default_voice!.name,
      },
    }));
}

/**
 * Fetches the live account catalog and returns ACTIVE avatars that have a
 * paired default voice. Throws with a diagnosable message on missing key,
 * upstream failure, or an empty usable set — never silently substitutes.
 */
export async function fetchActiveAvatarCatalog(): Promise<
  ActiveAvatarWithVoice[]
> {
  const apiKey = getHeygenApiKey();

  if (!apiKey) {
    throw new Error(
      "Cannot resolve seeded conversation avatar: HEYGEN_API_KEY is not set on the server.",
    );
  }

  let response: Response;

  try {
    response = await fetch(`${getLiveAvatarApiUrl()}/v1/avatars`, {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Cannot resolve seeded conversation avatar: LiveAvatar catalog fetch failed (${detail}).`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new Error(
      `Cannot resolve seeded conversation avatar: LiveAvatar catalog returned HTTP ${response.status}${
        body ? ` — ${body.slice(0, 200)}` : ""
      }.`,
    );
  }

  const data = (await response.json()) as {
    data?: { results?: LiveAvatarRecord[] };
  };
  const catalog = filterActiveAvatarsWithVoices(data.data?.results ?? []);

  if (catalog.length === 0) {
    throw new Error(
      "Cannot resolve seeded conversation avatar: no ACTIVE, non-expired LiveAvatar profiles with a default_voice are available on this account.",
    );
  }

  return catalog;
}

/** Stable non-negative index from conversationId into a catalog of `length`. */
function catalogIndex(conversationId: string, length: number): number {
  const digest = createHash("sha256").update(conversationId).digest();
  const n = digest.readUInt32BE(0);

  return n % length;
}

/**
 * Soft gender match for the optional `genderHint`.
 * Prefer an API `gender` field when present; otherwise infer from the first
 * token of the display name against a small common-name set. Empty match set
 * always falls back to the full catalog — a hint, never a requirement.
 */
function matchesGenderHint(
  avatar: ActiveAvatarWithVoice,
  genderHint: string,
): boolean {
  const hint = genderHint.trim().toLowerCase();

  if (!hint) return true;

  if (avatar.gender) {
    const g = avatar.gender.toLowerCase();

    return g === hint || g.startsWith(hint) || hint.startsWith(g);
  }

  const first = avatar.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  if (!first) return false;

  // Compact set covering this account's catalog plus common English names.
  // Extend as the live catalog grows; miss → fall back to full set upstream.
  const FEMALE = new Set([
    "jenny",
    "jennifer",
    "jessica",
    "sarah",
    "emily",
    "amanda",
    "ashley",
    "stephanie",
    "nicole",
    "elizabeth",
    "rachel",
    "lauren",
    "megan",
    "anna",
    "maria",
    "lisa",
    "karen",
    "susan",
    "helen",
    "priya",
    "elena",
  ]);
  const MALE = new Set([
    "scott",
    "john",
    "michael",
    "richard",
    "james",
    "robert",
    "david",
    "william",
    "thomas",
    "daniel",
    "matthew",
    "andrew",
    "joseph",
    "mark",
    "paul",
    "steven",
    "kevin",
    "brian",
    "marcus",
    "devon",
  ]);

  if (hint === "female" || hint === "f" || hint === "woman") {
    return FEMALE.has(first);
  }
  if (hint === "male" || hint === "m" || hint === "man") {
    return MALE.has(first);
  }

  return false;
}

/**
 * Picks a live ACTIVE avatar (+ its own paired voice) for a seeded conversation.
 *
 * Deterministic: sort by avatarId, index by a stable hash of `conversationId`.
 * Same id → same pair while the catalog is unchanged. Never hardcodes an id.
 */
export async function assignSeededAvatar(
  conversationId: string,
  preference?: { genderHint?: string },
): Promise<{ avatarId: string; voiceId: string }> {
  if (!conversationId.trim()) {
    throw new Error(
      "Cannot resolve seeded conversation avatar: conversationId is required.",
    );
  }

  const catalog = await fetchActiveAvatarCatalog();
  const sorted = [...catalog].sort((a, b) =>
    a.avatarId.localeCompare(b.avatarId),
  );

  let pool = sorted;
  const hint = preference?.genderHint?.trim();

  if (hint) {
    const narrowed = sorted.filter((a) => matchesGenderHint(a, hint));

    if (narrowed.length > 0) {
      pool = narrowed;
    }
  }

  const chosen = pool[catalogIndex(conversationId.trim(), pool.length)]!;

  // CaseAvatar pairing discipline: avatarId and voiceId always travel as a pair
  // from this avatar's own default_voice — never a cross-paired voice id.
  return {
    avatarId: chosen.avatarId,
    voiceId: chosen.voice.id,
  };
}
