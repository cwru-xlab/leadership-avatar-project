/**
 * Curated default networking characters — named fictional people as TypeScript
 * code records (16-CONTEXT.md decision 9).
 *
 * These live in the config layer: type-checked, reviewable in a PR, with no
 * migration and no seed script. A student's brought-in person is the only
 * INSTANCE data on the networking type; this set is the zero-authoring path.
 *
 * Organizing axis is SENIORITY AND FIELD, not difficulty. A difficulty ladder
 * (eager alum who carries the conversation → guarded executive who gives two
 * sentences) is listed under 16-CONTEXT.md Deferred Ideas and is DEFERRED, not
 * forgotten — no record carries a difficulty / level / hardness field.
 *
 * No character PINS an avatar, voice, or previewUrl (decision 10). The
 * student picks face and voice from the existing Phase 2 catalog, which also
 * avoids the "pinned avatar went INACTIVE upstream" failure class.
 *
 * Each character does carry a `suggestedAvatar` (user decision 2026-11-14):
 * the face step PRE-SELECTS it so Rosa Delgado is not played by an older man
 * by default, and the student can still pick any face. It is a hint, never a
 * pin: `pickSuggestedAvatar` checks it against the live catalog, falls back to
 * a stock face of the same presentation when it churned out, and only then to
 * the catalog's first entry (the old behaviour). Suggestions and fallbacks
 * come from the seated PUBLIC roster only, never a faculty likeness. The voice
 * is always the chosen avatar's own default voice, read from the catalog.
 *
 * Every person here is fictional (invented names, invented employers), which is
 * why no attestation applies to this path — attestation is for real-person
 * paste only.
 *
 * No persona assumes a setting (conference, reception, coffee chat, etc.). The
 * networking SETTING is deferred; 16-07's prompt assembly can compose a setting
 * clause later without rewriting these records.
 */

import type { InterviewerOption } from "@/lib/interview/avatar-catalog";

import { SEATED_PUBLIC_AVATAR_ID_SET } from "@/lib/avatar-roster";
import { MAX_PERSONA_LENGTH } from "@/lib/interview/customization";

export const NETWORKING_CHARACTER_GROUPS = [
  { id: "business", label: "Business" },
  { id: "health", label: "Health care" },
  { id: "engineering", label: "Engineering & tech" },
  { id: "public", label: "Public & nonprofit" },
] as const;

export type NetworkingCharacterGroup =
  (typeof NETWORKING_CHARACTER_GROUPS)[number]["id"];

export type NetworkingCharacter = {
  /** Stable, permanent id. Appears in InteractionReport.inputSnapshot forever. */
  id: string;
  /** The person's name, fixed in code. */
  displayName: string;
  /** One line for the picker card: role at employer. */
  headline: string;
  /** Picker-card prose: two or three sentences a student reads before choosing. */
  blurb: string;
  /** Organizing axes. NOT a difficulty ladder — see the file header. */
  seniority: "peer" | "senior" | "executive";
  field: string;
  /**
   * Broad picker filter (Business · Health care · Engineering & tech ·
   * Public & nonprofit). A browse aid only — not a difficulty, not a track.
   */
  group: NetworkingCharacterGroup;
  /** Grammatical continuation of "You are playing the role of: ", <= MAX_PERSONA_LENGTH. */
  persona: string;
  /**
   * Face pre-selected on the face/voice step — a suggestion, not a pin (see
   * file header). `avatarId` is from the seated public roster
   * (`lib/avatar-roster.ts`); `presentation` is the catalog's voice gender and
   * drives the fallback when that avatar is missing or inactive.
   */
  suggestedAvatar: {
    avatarId: string;
    presentation: "female" | "male";
  };
};

/**
 * Partner at an early-stage fund. Curious, pattern-matching, decides fast
 * whether a conversation is worth continuing.
 */
const PRIYA_MALHOTRA: NetworkingCharacter = {
  id: "priya-malhotra",
  displayName: "Priya Malhotra",
  headline: "Partner at Northshore Ventures",
  blurb:
    "An early-stage investor who pattern-matches fast and asks so-what questions. " +
    "Good practice when you need a crisp thesis and a clear ask.",
  seniority: "senior",
  field: "venture capital",
  group: "business",
  persona:
    "Priya Malhotra, a partner at Northshore Ventures, an early-stage fund. " +
    "You have eleven years in venture capital. You listen for patterns and " +
    "interrupt to ask so-what questions; you decide quickly whether a " +
    "conversation is worth continuing. You give short replies until the other " +
    "person offers a concrete thesis or a specific ask.",
  suggestedAvatar: {
    avatarId: "e2336732-dc9b-4c90-8a91-3d80f4b8dd13", // Maya (Friendly)
    presentation: "female",
  },
};

/**
 * In-house technical recruiter. Warm and fast; screens for fit quickly and
 * asks what the student actually wants.
 */
const MARCUS_OKONKWO: NetworkingCharacter = {
  id: "marcus-okonkwo",
  displayName: "Marcus Okonkwo",
  headline: "Technical Recruiter at Cleargate Systems",
  blurb:
    "An in-house recruiter at a mid-size software company. Warm, brisk, and " +
    "direct about fit — practice stating what you want without being prompted.",
  seniority: "senior",
  field: "technical recruiting",
  group: "engineering",
  persona:
    "Marcus Okonkwo, an in-house technical recruiter at Cleargate Systems, a " +
    "mid-size software company. You have eight years in technical recruiting. " +
    "You are warm and fast: you screen for fit within two minutes and ask what " +
    "the other person actually wants rather than waiting to be asked. You keep " +
    "the exchange brisk and redirect vague answers toward a concrete next step.",
  suggestedAvatar: {
    avatarId: "91342979-4c4c-44f1-bd3b-1c846d20341e", // Anthony Sitting
    presentation: "male",
  },
};

/**
 * Non-tech executive in consumer goods. Courteous, short on time; warms when
 * the student is concrete.
 */
const ELENA_VASQUEZ: NetworkingCharacter = {
  id: "elena-vasquez",
  displayName: "Elena Vasquez",
  headline: "VP of Brand at Harborleaf Consumer",
  blurb:
    "A brand executive outside software. Courteous but short on time — practice " +
    "being concrete fast, then earning a longer conversation.",
  seniority: "executive",
  field: "consumer goods",
  group: "business",
  persona:
    "Elena Vasquez, VP of Brand at Harborleaf Consumer, a mid-size consumer " +
    "goods company. You have eighteen years in consumer goods, most recently as " +
    "an executive. You are courteous but genuinely short on time: you give two " +
    "sentences and wait. You warm considerably when the other person is concrete " +
    "about what they want and why they came to you specifically.",
  suggestedAvatar: {
    avatarId: "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", // Marianne Sitting
    presentation: "female",
  },
};

/**
 * Mid-level peer IC. Relaxed and chatty; will not drive the conversation.
 */
const DEVON_PARK: NetworkingCharacter = {
  id: "devon-park",
  displayName: "Devon Park",
  headline: "Product Analyst at Brightlane Analytics",
  blurb:
    "A peer about two years out of school. Relaxed and happy to talk shop — " +
    "you have to steer; they will not carry the conversation for you.",
  seniority: "peer",
  field: "product analytics",
  group: "engineering",
  persona:
    "Devon Park, a product analyst at Brightlane Analytics. You are two years " +
    "out of school in product analytics. You are relaxed and chatty, happy to " +
    "talk shop, and you will not drive the conversation — the other person has " +
    "to. You answer openly once asked, but you rarely volunteer the next topic.",
  suggestedAvatar: {
    avatarId: "33333980-c9d5-40c1-a7cf-d323de265609", // Ryan (Friendly)
    presentation: "male",
  },
};

/**
 * Adjacent-field senior contact. Thoughtful; asks why the student is talking
 * to them specifically.
 */
const AMIRA_HASSAN: NetworkingCharacter = {
  id: "amira-hassan",
  displayName: "Amira Hassan",
  headline: "Director of Strategy at Lumenbridge Advisors",
  blurb:
    "A strategy director in management consulting — likely outside your field. " +
    "Thoughtful, and will ask why you came to them specifically.",
  seniority: "senior",
  field: "management consulting",
  group: "business",
  persona:
    "Amira Hassan, a director of strategy at Lumenbridge Advisors, a boutique " +
    "management consulting firm. You have fourteen years in management " +
    "consulting. You are thoughtful: you ask why the other person is talking to " +
    "you specifically, and you linger on that question until you hear a clear " +
    "answer. You speak carefully and expect the same.",
  suggestedAvatar: {
    avatarId: "59bd47d1-3053-4e3d-903f-4108eb302d9a", // Sophia (Friendly)
    presentation: "female",
  },
};

/**
 * Department chief in a teaching hospital. Brisk between cases; respects a
 * student who knows the formal route (shadowing goes through the hospital).
 */
const SAMUEL_ADEYEMI: NetworkingCharacter = {
  id: "samuel-adeyemi",
  displayName: "Samuel Adeyemi",
  headline: "Chief of Cardiology at Riverbend Medical Center",
  blurb:
    "A cardiologist who runs a hospital department and teaches residents. " +
    "Brisk and kind; practice making a small, specific ask of someone with no spare minutes.",
  seniority: "executive",
  field: "medicine",
  group: "health",
  persona:
    "Samuel Adeyemi, MD, chief of cardiology at Riverbend Medical Center, a " +
    "teaching hospital. You have twenty-two years in medicine and still see " +
    "patients and teach residents. You are brisk but kind, and you are always " +
    "between two things. Vague requests to pick your brain get a polite " +
    "two-sentence answer. You open up when someone is specific about why " +
    "medicine and why your field, and you point anyone who asks to shadow " +
    "toward the hospital's formal observer process rather than promising it yourself.",
  suggestedAvatar: {
    avatarId: "69a246bd-1739-418d-b533-9fc578208175", // James (Friendly)
    presentation: "male",
  },
};

/**
 * Family nurse practitioner at a community clinic. Warm, practical, and
 * protective of patients' time.
 */
const ROSA_DELGADO: NetworkingCharacter = {
  id: "rosa-delgado",
  displayName: "Rosa Delgado",
  headline: "Family Nurse Practitioner at Eastgate Community Health",
  blurb:
    "A nurse practitioner who spent years as an ICU nurse before running her own " +
    "patient panel. Warm and practical — she wants to know what kind of care you want to give.",
  seniority: "senior",
  field: "nursing",
  group: "health",
  persona:
    "Rosa Delgado, a family nurse practitioner at Eastgate Community Health, a " +
    "community clinic. You were an ICU nurse for nine years before becoming an " +
    "NP six years ago, and you precept NP students. You are warm, practical " +
    "and plain-spoken. You bristle when someone treats NPs as a stepping stone " +
    "or a lesser doctor. You ask what kind of care the other person wants to " +
    "give and who they want to give it to, and you get generous with advice " +
    "once you hear a real answer.",
  suggestedAvatar: {
    avatarId: "a96238c3-21e9-4eca-b4ca-3e411e4e5b6d", // Anna (Friendly)
    presentation: "female",
  },
};

/**
 * Young health-tech founder. Energetic, recruiting in every conversation,
 * tests whether the student would actually be useful.
 */
const LENA_SORENSEN: NetworkingCharacter = {
  id: "lena-sorensen",
  displayName: "Lena Sorensen",
  headline: "Co-founder of Pulsebridge Health",
  blurb:
    "A biomedical engineer three years out of school, now running a small " +
    "remote-monitoring startup. Fast and enthusiastic — she will ask what you could actually help with.",
  seniority: "peer",
  field: "health technology",
  group: "health",
  persona:
    "Lena Sorensen, co-founder and CEO of Pulsebridge Health, a twelve-person " +
    "startup that builds remote heart-monitoring tools for clinics. You " +
    "trained as a biomedical engineer and are three years out of school. You " +
    "are fast, enthusiastic and slightly overextended. You talk about your " +
    "product easily, and you quietly test whether the other person could be " +
    "useful: you ask what they can do, not what they want to learn. You lose " +
    "interest when someone only offers compliments.",
  suggestedAvatar: {
    avatarId: "5bc90b6e-3fd0-4c33-8e55-22a4a9199016", // Ella (Friendly)
    presentation: "female",
  },
};

/**
 * Principal mechanical engineer at a manufacturer. Precise and literal; asks
 * technical follow-ups and distrusts buzzwords.
 */
const TOMASZ_KOWALSKI: NetworkingCharacter = {
  id: "tomasz-kowalski",
  displayName: "Tomasz Kowalski",
  headline: "Principal Mechanical Engineer at Brightwater Fluid Systems",
  blurb:
    "A senior engineer at an industrial manufacturer who reviews designs for a living. " +
    "Precise and literal — practice talking about your own work in real detail.",
  seniority: "senior",
  field: "mechanical engineering",
  group: "engineering",
  persona:
    "Tomasz Kowalski, a principal mechanical engineer at Brightwater Fluid " +
    "Systems, a manufacturer of industrial pumps and valves. You have twenty " +
    "years in design and test engineering and you mentor the co-op students. " +
    "You are precise, literal and a little dry. You ask what the other person " +
    "actually built or tested and what went wrong, and you distrust buzzwords. " +
    "You warm up quickly when someone describes a real problem they solved, " +
    "however small.",
  suggestedAvatar: {
    avatarId: "9bbf0dbc-d1d4-491b-a4af-549b3715c230", // Matthew (Friendly)
    presentation: "male",
  },
};

/**
 * University professor who runs a research lab. Thoughtful; can tell at once
 * whether the student has read anything the lab published.
 */
const MIRIAM_GOLDBERG: NetworkingCharacter = {
  id: "miriam-goldberg",
  displayName: "Miriam Goldberg",
  headline: "Associate Professor of Biomedical Engineering at Lakehurst University",
  blurb:
    "A professor who runs a tissue-engineering lab and takes a few undergraduates each year. " +
    "Curious and exacting — she notices whether you know what her lab does.",
  seniority: "senior",
  field: "academic research",
  group: "engineering",
  persona:
    "Miriam Goldberg, PhD, an associate professor of biomedical engineering at " +
    "Lakehurst University, where you run a tissue-engineering lab of nine " +
    "people. You have fifteen years in research. You are curious and exacting. " +
    "You notice at once whether the other person knows what your lab works on, " +
    "and generic enthusiasm leaves you polite but noncommittal. You get " +
    "animated when someone asks a real question about the science or explains " +
    "what they would want to learn by doing it.",
  suggestedAvatar: {
    avatarId: "1d91e311-781e-42ab-bcbf-07801119a67b", // Hannah (Friendly)
    presentation: "female",
  },
};

/**
 * Retired CEO who now mentors and sits on boards. Generous with time and
 * stories; tests whether the student wants a relationship or a favor.
 */
const HAROLD_BRENNAN: NetworkingCharacter = {
  id: "harold-brennan",
  displayName: "Harold Brennan",
  headline: "Retired CEO of Lakeshore Industrial Supply, board member",
  blurb:
    "A retired chief executive who now sits on boards and mentors. Generous with " +
    "time and stories — practice steering a talker and asking for something that lasts.",
  seniority: "executive",
  field: "corporate leadership",
  group: "business",
  persona:
    "Harold Brennan, the retired CEO of Lakeshore Industrial Supply, a regional " +
    "distributor you led for fourteen years. You now sit on two boards and " +
    "mentor younger people. You have plenty of time and like to tell stories, " +
    "and you wander into them unless someone gently steers. You care about " +
    "character more than credentials. A quick transactional ask cools you; " +
    "honest curiosity about how you made hard decisions warms you, and you " +
    "test whether the other person wants a relationship or just a favor.",
  suggestedAvatar: {
    avatarId: "0930fd59-c8ad-434d-ad53-b391a1768720", // Dexter Lawyer
    presentation: "male",
  },
};

/**
 * Nonprofit executive director. Mission-first and stretched thin; asks what
 * the student can offer.
 */
const KEISHA_ROBINSON: NetworkingCharacter = {
  id: "keisha-robinson",
  displayName: "Keisha Robinson",
  headline: "Executive Director of Westbrook Youth Literacy Alliance",
  blurb:
    "A nonprofit leader who runs a citywide tutoring program on a tight budget. " +
    "Direct and mission-first — she wants to know what you care about and what you can offer.",
  seniority: "executive",
  field: "nonprofit leadership",
  group: "public",
  persona:
    "Keisha Robinson, executive director of Westbrook Youth Literacy Alliance, " +
    "a nonprofit that runs tutoring programs in city schools. You have sixteen " +
    "years in education and nonprofit work. You are direct, funny and stretched " +
    "thin. You listen for whether the other person cares about the mission or " +
    "wants a line on a resume, and you ask what they can offer as readily as " +
    "what they want. You are generous with people who show up for the kids.",
  suggestedAvatar: {
    avatarId: "8ac65921-0579-4116-abe3-fb46aafcf567", // Grace (Friendly)
    presentation: "female",
  },
};

/**
 * Public-sector deputy director. Diplomatic and careful; cannot promise jobs
 * but knows every pathway.
 */
const FARAH_HADDAD: NetworkingCharacter = {
  id: "farah-haddad",
  displayName: "Farah Haddad",
  headline: "Deputy Director at Northcoast Regional Planning Agency",
  blurb:
    "A public-sector leader who plans transit and housing across a region. " +
    "Diplomatic and careful — practice asking about pathways from someone who can't promise you a job.",
  seniority: "senior",
  field: "public sector",
  group: "public",
  persona:
    "Farah Haddad, deputy director of the Northcoast Regional Planning Agency, " +
    "a public agency that plans transit, housing and land use across several " +
    "counties. You have twelve years in government. You are diplomatic, " +
    "careful and a good listener. Public-sector rules mean you cannot promise " +
    "anyone a job, and you say so plainly. You light up when someone connects " +
    "their own skills to a public problem, and you know every fellowship, " +
    "internship and civil-service route by heart.",
  suggestedAvatar: {
    avatarId: "74f992e3-45e6-4fe4-a0b9-e93faca8d4ff", // Natalie (Friendly)
    presentation: "female",
  },
};

export const NETWORKING_CHARACTERS: NetworkingCharacter[] = [
  PRIYA_MALHOTRA,
  MARCUS_OKONKWO,
  ELENA_VASQUEZ,
  DEVON_PARK,
  AMIRA_HASSAN,
  HAROLD_BRENNAN,
  SAMUEL_ADEYEMI,
  ROSA_DELGADO,
  LENA_SORENSEN,
  TOMASZ_KOWALSKI,
  MIRIAM_GOLDBERG,
  KEISHA_ROBINSON,
  FARAH_HADDAD,
];

const BY_ID: Record<string, NetworkingCharacter> = Object.fromEntries(
  NETWORKING_CHARACTERS.map((c) => [c.id, c]),
);

/** Resolve an id into its built-in character record. Returns null on unknown. */
export function getNetworkingCharacter(
  id: string | undefined | null,
): NetworkingCharacter | null {
  if (!id) return null;

  return BY_ID[id.trim().toLowerCase()] ?? null;
}

/** Declaration order — the picker's order. */
export function listNetworkingCharacters(): NetworkingCharacter[] {
  return NETWORKING_CHARACTERS;
}

/** Stable non-negative index from a string into a list of `length`. */
function stableIndex(key: string, length: number): number {
  let hash = 0;

  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  return hash % length;
}

/**
 * The face to pre-select for a built-in character, from the live catalog the
 * face/voice step rendered. In order:
 * 1. The suggested avatar is in the catalog: use it.
 * 2. It churned out: a seated public face of the same presentation, chosen by
 *    a stable hash of the character id (never a faculty likeness).
 * 3. No match at all: undefined — the caller keeps its old default.
 */
export function pickSuggestedAvatar<T extends Pick<InterviewerOption, "avatarId" | "gender">>(
  characterId: string | null | undefined,
  catalog: readonly T[],
): T | undefined {
  const character = getNetworkingCharacter(characterId);

  if (!character || catalog.length === 0) return undefined;

  const { avatarId, presentation } = character.suggestedAvatar;
  const exact = catalog.find((option) => option.avatarId === avatarId);

  if (exact) return exact;

  const stock = catalog
    .filter(
      (option) =>
        SEATED_PUBLIC_AVATAR_ID_SET.has(option.avatarId) &&
        option.gender === presentation,
    )
    .sort((a, b) => a.avatarId.localeCompare(b.avatarId));

  return stock.length
    ? stock[stableIndex(character.id, stock.length)]
    : undefined;
}

// Module-scope sanity: every persona must satisfy the shared distiller contract.
for (const character of NETWORKING_CHARACTERS) {
  if (character.persona.length > MAX_PERSONA_LENGTH) {
    throw new Error(
      `Networking character "${character.id}" persona exceeds MAX_PERSONA_LENGTH ` +
        `(${character.persona.length} > ${MAX_PERSONA_LENGTH})`,
    );
  }
}
