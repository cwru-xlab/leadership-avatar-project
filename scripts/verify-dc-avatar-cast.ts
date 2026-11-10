/**
 * Proves the seeded difficult-conversation cast without a network or database:
 * every seeded counterpart resolves to a stock avatar with its own voice, the
 * voice's gender matches the scenario's pronouns, no faculty face is ever
 * chosen (even as a fallback), and an authored record keeps the avatar its
 * author picked.
 *
 * Run: npx tsx scripts/verify-dc-avatar-cast.ts
 */

import { SEATED_PUBLIC_AVATAR_ID_SET } from "@/lib/avatar-roster";
import { resolveSeededCounterpart } from "@/lib/difficult-conversation/avatar-assignment";
import { mapRecordToInstance } from "@/lib/difficult-conversation/resolve-instance";
import {
  SEEDED_CONVERSATIONS,
  SEEDED_COUNTERPART_CAST,
} from "@/lib/difficult-conversation/seeded";
import type { InterviewerOption } from "@/lib/interview/avatar-catalog";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

function option(
  avatarId: string,
  name: string,
  voiceId: string,
  gender?: "female" | "male",
): InterviewerOption {
  return {
    avatarId,
    name,
    previewUrl: null,
    voice: { id: voiceId, name: name.split(" ")[0]! },
    ...(gender ? { gender } : {}),
  };
}

// Today's catalog entries for the cast, plus faculty-shaped custom avatars
// (no gender, not in the public roster) and spare stock avatars for fallback.
const FACULTY: InterviewerOption[] = [
  option("52b24044-7b0c-4211-b113-239443801a5b", "Scott Cowen", "66f105d8-a342-4a5d-9d41-6ffd21674806"),
  option("0f0eec42-9bcb-4365-8b31-09b2d30b594d", "John Paul Stephens", "fa23626c-f9f2-437b-aa79-19b38ca4f385"),
];
const CAST_OPTIONS: InterviewerOption[] = [
  option("e2336732-dc9b-4c90-8a91-3d80f4b8dd13", "Maya (Friendly)", "8d7ca40c-5ee6-45f3-8b4a-e2b01df302a1", "female"),
  option("6c2017bc-1eef-4071-ba70-0e9d5bcbf00f", "Thomas (Friendly)", "6ec23890-d16c-4a40-82f5-10d4f57e1b9f", "male"),
  option("af93e3b6-e07d-4246-8219-ad7f0fd2e6ed", "Andrew (Friendly)", "832850fa-468d-4704-81a5-4acf9f9fe994", "male"),
  option("4857d1c6-a3b0-4d0a-b363-48cb9a62e496", "Lucy (Friendly)", "d8102af2-20f5-47eb-88d5-68f979675d10", "female"),
  option("7b888024-f8c9-4205-95e1-78ce01497bda", "Shawn Therapist", "51afbab6-7af4-473b-95fc-6ce26aac8bb1", "male"),
  option("a4991f42-d211-4581-9631-639f7fe7c635", "William (Friendly)", "33e686e7-cae5-4b2b-a8c4-003c91aa6cfd", "male"),
  option("bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", "Marianne Sitting", "8a504f9b-95dd-42d4-8b0c-edc2567b6382", "female"),
];
const SPARES: InterviewerOption[] = [
  option("9bbf0dbc-d1d4-491b-a4af-549b3715c230", "Matthew (Friendly)", "b0ffbf82-f35e-48e9-96e4-23939c879eaa", "male"),
  option("3bda0e5e-382f-4c29-b7b0-2b53e223b179", "Rachel (Friendly)", "372c00f2-cc42-47d1-9c88-db22c95d103d", "female"),
];
const CATALOG = [...FACULTY, ...CAST_OPTIONS, ...SPARES];
const byId = new Map(CATALOG.map((o) => [o.avatarId, o]));
const facultyIds = new Set(FACULTY.map((o) => o.avatarId));

/** "he"/"she" the scenario uses for the counterpart, from its shared text. */
function pronounGender(text: string): "male" | "female" | null {
  const male = /\b(he|him|his)\b/i.test(text);
  const female = /\b(she|her|hers)\b/i.test(text);
  if (male === female) return null;
  return male ? "male" : "female";
}

/**
 * Scenarios whose pronouns describe the STUDENT, not the counterpart:
 * ask-for-raise calls the student "she" and never gives the manager one.
 */
const PRONOUNS_ARE_THE_STUDENTS = new Set(["ask-for-raise"]);

/** Names the student brief uses for the counterpart. */
const NAMED: Record<string, string> = {
  "confront-low-performer": "Maya",
  "fire-team-member": "Jordan",
  "challenge-grade": "Chen",
};

console.log("\n1. Every seeded counterpart: stock face, own voice, matching gender");
console.log("   conversation                    avatar               voice     gender");
for (const record of SEEDED_CONVERSATIONS) {
  const cast = SEEDED_COUNTERPART_CAST[record.id];
  check(`"${record.id}" has a cast entry`, Boolean(cast));
  if (!cast) continue;
  const pair = resolveSeededCounterpart(record.id, CATALOG)!;
  const live = byId.get(pair.avatarId);
  console.log(
    `   ${record.id.padEnd(31)} ${(live?.name ?? "?").padEnd(20)} ${(live?.voice.name ?? "?").padEnd(9)} ${live?.gender}`,
  );
  check(`"${record.id}" is the cast avatar`, pair.avatarId === cast.avatarId);
  check(
    `"${record.id}" is a stock avatar, not faculty`,
    SEATED_PUBLIC_AVATAR_ID_SET.has(pair.avatarId) && !facultyIds.has(pair.avatarId),
  );
  check(`"${record.id}" voice is the avatar's own default`, live?.voice.id === pair.voiceId);
  check(`"${record.id}" pinned voice matches today's catalog`, cast.voiceId === live?.voice.id);
  check(`"${record.id}" voice gender = cast presentation`, live?.gender === cast.presentation);

  const shared = `${record.situation}\n${record.sharedBackstory}\n${record.stakes}`;
  const pronoun = PRONOUNS_ARE_THE_STUDENTS.has(record.id)
    ? null
    : pronounGender(shared);
  check(
    `"${record.id}" presentation agrees with the scenario's pronouns`,
    pronoun === null || pronoun === cast.presentation,
    `text says ${pronoun ?? "nothing"}, cast ${cast.presentation}`,
  );

  const avatarFirst = live?.name.split(/[\s(]/)[0] ?? "";
  const named = NAMED[record.id];
  check(
    `"${record.id}" avatar name does not contradict the counterpart's name`,
    !named || avatarFirst === named || !new RegExp(`\\b${avatarFirst}\\b`).test(shared),
    named ? `counterpart ${named}, avatar ${avatarFirst}` : "unnamed",
  );
}

const castIds = Object.values(SEEDED_COUNTERPART_CAST).map((c) => c.avatarId);
check("no two seeded scenarios share a face", new Set(castIds).size === castIds.length);
check(
  "the cast covers exactly the seeded scenarios",
  Object.keys(SEEDED_COUNTERPART_CAST).sort().join() ===
    SEEDED_CONVERSATIONS.map((r) => r.id).sort().join(),
);

console.log("\n2. Fallbacks never reach a faculty face");
{
  const id = "confront-low-performer";
  const cast = SEEDED_COUNTERPART_CAST[id]!;
  const withoutCast = CATALOG.filter((o) => o.avatarId !== cast.avatarId);
  const sub = resolveSeededCounterpart(id, withoutCast)!;
  const subOption = byId.get(sub.avatarId);
  check(
    "cast avatar churned out -> a stock substitute",
    SEATED_PUBLIC_AVATAR_ID_SET.has(sub.avatarId) && !facultyIds.has(sub.avatarId),
    subOption?.name,
  );
  check("substitute keeps the presentation", subOption?.gender === cast.presentation);
  check("substitute keeps its own voice", subOption?.voice.id === sub.voiceId);
  check("substitute is not another scenario's face", !castIds.includes(sub.avatarId));
  check(
    "substitute is stable",
    resolveSeededCounterpart(id, withoutCast)!.avatarId === sub.avatarId,
  );

  const outage = resolveSeededCounterpart(id, null)!;
  check(
    "catalog outage -> the cast's pinned pair",
    outage.avatarId === cast.avatarId && outage.voiceId === cast.voiceId,
  );
  const facultyOnly = resolveSeededCounterpart(id, FACULTY)!;
  check(
    "catalog with only faculty -> pinned stock pair, never faculty",
    facultyOnly.avatarId === cast.avatarId,
  );
  check(
    "an authored (non-seeded) id is never recast",
    resolveSeededCounterpart("authored-abc123", CATALOG) === null,
  );
}

console.log("\n3. A student-picked avatar is preserved");
{
  const facultyPick = FACULTY[0]!;
  const authored = {
    ...SEEDED_CONVERSATIONS[0]!,
    id: "authored-abc123",
    ownerId: "student-1",
    avatarId: facultyPick.avatarId,
    voiceId: facultyPick.voice.id,
  };
  const instance = mapRecordToInstance(authored, "authored", {
    avatarId: authored.avatarId,
    voiceId: authored.voiceId,
  });
  check(
    "authored record with a faculty pick keeps that avatar and voice",
    instance.avatarId === facultyPick.avatarId && instance.voiceId === facultyPick.voice.id,
  );
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
