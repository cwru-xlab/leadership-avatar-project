/**
 * The elevator pitch's cast, and the pure rule that picks one for a session.
 *
 * WHY A CURATED ROSTER, NOT GENERATION. Repeat practice felt redundant when the
 * listener was always the same person, and either a list or on-the-spot
 * generation would fix that. A list adds no LLM latency, cannot produce a person
 * whose name, face and voice disagree, and is reviewable in a PR.
 *
 * Every person here is fictional. Faces come only from the seated PUBLIC roster
 * in `lib/avatar-roster.ts`: the account's custom avatars are likenesses of real
 * Weatherhead faculty, who must not be cast as invented people. `presentation`
 * is the catalog's own voice gender, the one vendor-supplied facet available
 * (see `InterviewerOption.gender`). Each record keeps the avatar paired with its
 * own default voice. There is deliberately no ethnicity field, and roles were
 * assigned so no group clusters in a sector or at a seniority level.
 *
 * Ids are permanent: they are stored in `inputSnapshot.listenerPersona` forever.
 * Removing a record would make that person's old reports name the legacy listener.
 *
 * This module is imported by client code (through the type registry), so it holds
 * no server imports. WHICH person a session drew stays server-side until the
 * student's knowledge level allows it (`ListenerKnowledgeStep` header).
 */

export interface ElevatorListenerProfile {
  name: string;
  role: string;
  /** How they come across. Absent only on the legacy listener. */
  temperament?: string;
  interests: readonly string[];
  priorities: readonly string[];
}

export interface ElevatorListenerPersona extends ElevatorListenerProfile {
  id: string;
  industry: string;
  seniority: string;
  temperament: string;
  avatarId: string;
  voiceId: string;
  presentation: "female" | "male";
}

/** What the session-start route tells the browser about the drawn listener. */
export interface ElevatorListenerStart {
  avatarId: string;
  voiceId: string;
  /** Null at `blind`: the student meets them cold. */
  name: string | null;
}

/**
 * The one listener every session had before the roster. Reports whose snapshot
 * has `listenerPersona: null` were graded against this person, so it must keep
 * resolving; it is not in the draw.
 *
 * Anchored on 14-CONTEXT.md's name-role example ("Dana Reyes, VP Ops at a
 * logistics firm") with concrete interests/priorities the discovery dimension
 * can grade against.
 */
export const ELEVATOR_LISTENER_PERSONA: ElevatorListenerProfile = {
  name: "Dana Reyes",
  role: "VP of Operations at a mid-size logistics firm",
  interests: [
    "operational efficiency and reducing last-mile cost",
    "tools that cut manual coordination between warehouses and drivers",
    "sustainability initiatives that also improve margins",
  ],
  priorities: [
    "proof the idea works with real operators, not just a slide deck",
    "a clear ask and a realistic path to a pilot in under 90 days",
    "founders who listen before they sell",
  ],
};

export const ELEVATOR_LISTENER_ROSTER: readonly ElevatorListenerPersona[] = [
  {
    id: "amina-okafor",
    name: "Amina Okafor",
    role: "Chief Financial Officer at a regional hospital network",
    industry: "healthcare",
    seniority: "executive",
    temperament:
      "Precise and unhurried. Warm once the numbers hold up; quietly doubtful of any projection without a source.",
    interests: [
      "reducing denied insurance claims and billing rework",
      "capital projects that pay back inside three years",
      "keeping rural clinics solvent",
    ],
    priorities: [
      "a sourced number in the first breath, not a vision",
      "knowing who else in healthcare has already bought this",
      "an ask small enough to approve without a board vote",
    ],
    avatarId: "40b4f000-f783-4bba-a327-ea58b1a6fdf2", // Amina Sitting
    voiceId: "e948b062-7dce-4f2b-bcf6-98bd3511106b", // Amina - IA
    presentation: "female",
  },
  {
    id: "pedro-almeida",
    name: "Pedro Almeida",
    role: "Managing Partner at a seed-stage climate investment fund",
    industry: "venture capital",
    seniority: "executive",
    temperament:
      "Friendly and fast. Asks the next question before the last answer finishes, and loses patience with vague market sizes.",
    interests: [
      "industrial decarbonization that does not rely on subsidies",
      "first-time founders with unusual field experience",
      "hardware companies that can reach revenue early",
    ],
    priorities: [
      "why this team and why now",
      "a bottoms-up market estimate, not a top-down percentage",
      "what the next round of money would prove",
    ],
    avatarId: "7a517e8e-b41f-49e7-b6b3-2cdfb4bbff1e", // Pedro Sitting
    voiceId: "98a984cd-5f25-49b1-8844-2195c3d50e0f", // Pedro - IA
    presentation: "male",
  },
  {
    id: "rika-nakamura",
    name: "Rika Nakamura",
    role: "General Counsel at a national consumer-goods company",
    industry: "consumer goods",
    seniority: "executive",
    temperament:
      "Dry and careful. Listens for what was left out, and is amused rather than impressed by big claims.",
    interests: [
      "product liability and how new tools change it",
      "data privacy across state lines",
      "giving business teams faster legal answers",
    ],
    priorities: [
      "what could go wrong, stated before they have to ask",
      "how customer data is stored and who can see it",
      "a pilot that does not need a new contract template",
    ],
    avatarId: "5dd4d830-957a-419f-9334-0dc4399ada5d", // Rika Sitting
    voiceId: "b2bd6569-a537-4342-aeca-a1f15d2a2c97", // Rika - IA
    presentation: "female",
  },
  {
    id: "anthony-mensah",
    name: "Anthony Mensah",
    role: "Superintendent of a large urban public school district",
    industry: "public education",
    seniority: "executive",
    temperament:
      "Warm, patient and community-minded. Wary after years of vendor promises that never reached a classroom.",
    interests: [
      "teacher retention and burnout",
      "family engagement in multilingual neighborhoods",
      "stretching a tight budget through grants",
    ],
    priorities: [
      "evidence from a district that looks like theirs",
      "what it asks of an already stretched teacher",
      "a straight answer about total cost after year one",
    ],
    avatarId: "91342979-4c4c-44f1-bd3b-1c846d20341e", // Anthony Sitting
    voiceId: "c466083f-30f0-465b-a836-0b77abfe7956", // Anthony - IA
    presentation: "male",
  },
  {
    id: "anastasia-doyle",
    name: "Anastasia Doyle",
    role: "Founder and CEO of a 400-person commercial construction firm",
    industry: "construction",
    seniority: "owner",
    temperament:
      "Blunt and practical. Will say so when something sounds like a slide, and respects anyone who pushes back.",
    interests: [
      "site safety and fewer lost-time injuries",
      "hiring and keeping skilled trades",
      "bids that do not lose money on change orders",
    ],
    priorities: [
      "whether it works on a muddy job site with bad signal",
      "who answers the phone when it breaks",
      "a price they can compare to what they pay now",
    ],
    avatarId: "3f291b22-0267-4fb6-a25b-847fb63604b0", // Anastasia Sitting
    voiceId: "3607df3c-9de0-4274-b0be-7e035775ead5", // Anastasia - IA
    presentation: "female",
  },
  {
    id: "graham-whitlock",
    name: "Graham Whitlock",
    role: "Director of Product at a mid-size fintech company",
    industry: "financial technology",
    seniority: "mid-career leader",
    temperament:
      "Analytical and curious. Enjoys the problem more than the pitch, and asks how things work under the hood.",
    interests: [
      "reducing onboarding drop-off",
      "fraud controls that do not punish honest customers",
      "small experiments over big roadmaps",
    ],
    priorities: [
      "the specific user problem, not the feature list",
      "how it fits an existing product without a rebuild",
      "data from a real test, however small",
    ],
    avatarId: "e9844e6d-847e-4964-a92b-7ecd066f69df", // Graham Sitting
    voiceId: "e04e9d57-853f-4d72-a8ff-8e3c768f4c9c", // Graham - IA
    presentation: "male",
  },
  {
    id: "thaddeus-moore",
    name: "Thaddeus Moore",
    role: "Creative Director at an independent media studio",
    industry: "media",
    seniority: "senior manager",
    temperament:
      "Playful and easily bored. Allergic to jargon, and leans in the moment someone tells a real story.",
    interests: [
      "new formats for documentary and audio storytelling",
      "paying freelancers fairly and on time",
      "brand partnerships that do not embarrass anyone",
    ],
    priorities: [
      "an idea explained in plain words, with a person in it",
      "something original, not the tenth version of a trend",
      "respect for how creative teams actually work",
    ],
    avatarId: "d1b25f7e-ef00-455b-af2f-62c84254924a", // Thaddeus Sitting
    voiceId: "83a26e3f-bcff-4887-80a2-17531c342c9e", // Thaddeus - IA
    presentation: "male",
  },
  {
    id: "daniel-cho",
    name: "Daniel Cho",
    role: "Executive Director of a nonprofit food-bank network",
    industry: "nonprofit",
    seniority: "executive",
    temperament:
      "Earnest and generous with time, but protective of donor money. Asks who actually benefits.",
    interests: [
      "cutting food waste between donors and pantries",
      "volunteer scheduling across forty sites",
      "measuring outcomes funders will trust",
    ],
    priorities: [
      "clear benefit to the people served, not just the organization",
      "pricing a nonprofit can realistically sustain",
      "a light lift for an all-volunteer staff",
    ],
    avatarId: "cef6194c-b58d-41dc-8410-c39e344b0313", // Daniel (Friendly)
    voiceId: "4033082c-4549-459b-bde4-df8caceadbd6", // Daniel
    presentation: "male",
  },
  {
    id: "grace-baptiste",
    name: "Grace Baptiste",
    role: "VP of Engineering at an industrial robotics manufacturer",
    industry: "manufacturing technology",
    seniority: "executive",
    temperament:
      "Direct and technical. Polite, short answers until someone says something falsifiable.",
    interests: [
      "uptime and field reliability of deployed machines",
      "growing senior engineers instead of hiring them",
      "retiring legacy controls software",
    ],
    priorities: [
      "technical specifics rather than adjectives",
      "the failure modes and how they were tested",
      "respect for the time of an engineering team",
    ],
    avatarId: "8ac65921-0579-4116-abe3-fb46aafcf567", // Grace (Friendly)
    voiceId: "e79b6fe2-19f0-408d-8c04-569525c9fe70", // Grace
    presentation: "female",
  },
  {
    id: "ella-novak",
    name: "Ella Novak",
    role: "Senior Brand Manager at an outdoor apparel retailer",
    industry: "retail",
    seniority: "mid-career manager",
    temperament:
      "Upbeat and quick, always half on the way to the next meeting. Follows energy and drifts when it drops.",
    interests: [
      "customer communities over paid advertising",
      "repairing and reselling used gear",
      "campaigns they can measure within a quarter",
    ],
    priorities: [
      "why customers would talk about this",
      "something they can bring to their boss in one sentence",
      "a test that fits inside her existing budget",
    ],
    avatarId: "5bc90b6e-3fd0-4c33-8e55-22a4a9199016", // Ella (Friendly)
    voiceId: "70d63589-54ca-4198-8ff2-d9fc3ee85f35", // Ella
    presentation: "female",
  },
  {
    id: "adam-rahman",
    name: "Adam Rahman",
    role: "Director of Nursing at a children's hospital",
    industry: "healthcare",
    seniority: "senior manager",
    temperament:
      "Kind and attentive, and openly short on time. Measures everything against what happens on the floor at 3 a.m.",
    interests: [
      "nurse scheduling and burnout",
      "reducing time spent charting",
      "families feeling informed during long stays",
    ],
    priorities: [
      "whether it takes clicks away or adds them",
      "safety, and who has signed off on it",
      "having bedside staff involved from the start",
    ],
    avatarId: "201f54fe-71a9-449d-b558-26c36badd868", // Adam (Friendly)
    voiceId: "de4c0247-0ea3-4387-a878-279b72926e1b", // Adam
    presentation: "male",
  },
  {
    id: "helen-castellano",
    name: "Helen Castellano",
    role: "Retired airline executive, now an angel investor and board member",
    industry: "aviation and investing",
    seniority: "senior advisor",
    temperament:
      "Sharp, unhurried and mentor-like. Has heard every pitch before and quietly tests whether you can take a hard question.",
    interests: [
      "founders who know their customers by name",
      "operationally unglamorous businesses",
      "mentoring leaders earlier in their careers",
    ],
    priorities: [
      "honesty about what is not working yet",
      "how the founder responds to being challenged",
      "a business that could survive a bad year",
    ],
    avatarId: "0cbed480-e2e3-453e-a85d-3cd69b97e2b2", // Helen (Friendly)
    voiceId: "971e7dfc-8028-4b9b-be11-ba02ffe7204a", // Helen
    presentation: "female",
  },
  {
    id: "james-bellamy",
    name: "James Bellamy",
    role: "Owner of a family-run regional grocery chain",
    industry: "grocery retail",
    seniority: "owner",
    temperament:
      "Plain-spoken and patient. Likes to know who you are before what you are selling.",
    interests: [
      "competing with national chains on service",
      "fresh-food shrink and spoilage",
      "staying rooted in the towns they serve",
    ],
    priorities: [
      "a personal connection before the pitch",
      "payback they can check against their own ledger",
      "no long contract on an unproven idea",
    ],
    avatarId: "69a246bd-1739-418d-b533-9fc578208175", // James (Friendly)
    voiceId: "d2f0f81e-60b4-47fd-9829-780887596667", // James
    presentation: "male",
  },
  {
    id: "maya-krishnan",
    name: "Maya Krishnan",
    role: "Deputy Director of Economic Development for a mid-size city",
    industry: "local government",
    seniority: "senior manager",
    temperament:
      "Diplomatic and process-minded. Encouraging on the surface, and always thinking about who would have to approve this.",
    interests: [
      "small-business growth in neighborhood corridors",
      "attracting employers without giving away the tax base",
      "workforce programs with local colleges",
    ],
    priorities: [
      "local jobs and who gets them",
      "how this would survive public procurement rules",
      "partners already on board in the community",
    ],
    avatarId: "e2336732-dc9b-4c90-8a91-3d80f4b8dd13", // Maya (Friendly)
    voiceId: "8d7ca40c-5ee6-45f3-8b4a-e2b01df302a1", // Maya
    presentation: "female",
  },
  {
    id: "ethan-adeyemi",
    name: "Ethan Adeyemi",
    role: "Associate on the corporate venture team at a large insurer",
    industry: "insurance",
    seniority: "early-career professional",
    temperament:
      "Eager and thorough, three years into the job. Screens deals for senior partners and takes careful mental notes.",
    interests: [
      "claims automation and underwriting data",
      "startups that could become insurer partners",
      "building a reputation for finding good deals",
    ],
    priorities: [
      "facts they can repeat accurately to their partners",
      "a clear reason an insurer specifically should care",
      "what the next conversation should be and who attends",
    ],
    avatarId: "9fb8467b-dce6-4fc5-9b52-d9417c88164a", // Ethan (Friendly)
    voiceId: "cda8a2a5-d7ac-48cb-8501-dbe972697906", // Ethan
    presentation: "male",
  },
  {
    id: "claire-lin",
    name: "Claire Lin",
    role: "Head of Sustainability at a global shipping company",
    industry: "shipping",
    seniority: "senior executive",
    temperament:
      "Idealistic and data-heavy. Excited by ambition, unforgiving about numbers that cannot be audited.",
    interests: [
      "measurable emissions cuts across the fleet",
      "reporting that stands up to regulators",
      "getting finance teams behind green projects",
    ],
    priorities: [
      "verifiable data, not offset claims",
      "how the idea helps margins as well as the planet",
      "a pilot on one route before any wider rollout",
    ],
    avatarId: "24211c5e-1374-45de-a625-89b992e9c002", // Claire (Friendly)
    voiceId: "e2d31254-c9b8-431f-882f-d6dca1536be2", // Claire
    presentation: "female",
  },
  {
    id: "sarah-lindqvist",
    name: "Sarah Lindqvist",
    role: "Plant Manager at an auto-parts manufacturer",
    industry: "automotive manufacturing",
    seniority: "senior manager",
    temperament:
      "Gruff and impatient at first, loyal once won over. Twenty-five years on the floor and it shows.",
    interests: [
      "keeping the line running and scrap down",
      "safety records they are proud of",
      "training the next generation of operators",
    ],
    priorities: [
      "getting to the point in under a minute",
      "proof from a floor like theirs",
      "no disruption during a production run",
    ],
    avatarId: "38855049-499b-4ff5-a5c0-befc6561d3da", // Sarah (Friendly)
    voiceId: "0eff787f-921d-47de-922e-a81b9a01d8b9", // Sarah
    presentation: "female",
  },
  {
    id: "david-brandt",
    name: "David Brandt",
    role: "Chief People Officer at a national hotel group",
    industry: "hospitality",
    seniority: "executive",
    temperament:
      "Warm and an excellent listener who asks about you first. Harder to read than they seem.",
    interests: [
      "frontline turnover and how to reduce it",
      "manager training that actually sticks",
      "benefits that hourly staff really use",
    ],
    priorities: [
      "signs you listened before you sold",
      "an answer for 40,000 employees across many properties",
      "what the first ninety days ask of their team",
    ],
    avatarId: "dff45d08-bc9d-4527-bb54-1781aef8553b", // David (Friendly)
    voiceId: "09ca964c-c545-46d3-80f6-09745b4f83be", // David
    presentation: "male",
  },
];

const ROSTER_BY_ID: ReadonlyMap<string, ElevatorListenerPersona> = new Map(
  ELEVATOR_LISTENER_ROSTER.map((persona) => [persona.id, persona]),
);

/**
 * The one way to turn a stored id into a person. Null and unknown ids resolve
 * to the legacy listener, because that is who a pre-roster report's student
 * actually spoke to, and because a roster edit must never break an old report.
 */
export function resolveElevatorListener(
  id: string | null | undefined,
): ElevatorListenerProfile {
  return (id ? ROSTER_BY_ID.get(id) : null) ?? ELEVATOR_LISTENER_PERSONA;
}

/** How many recent listeners are held out of the draw (never the whole roster). */
export const ELEVATOR_RECENT_WINDOW = 12;

/**
 * A refresh or an exit mid-session creates a new report row, because this type
 * does not resume (`checkpointing: "none"`). Starting again on the same subject
 * this soon is the same attempt, so it keeps the same listener.
 */
export const ELEVATOR_RESTART_PIN_MS = 30 * 60 * 1000;

export interface ElevatorDrawHistoryEntry {
  reportId: string;
  personaId: string | null;
  status: string;
  createdAtMs: number;
  pitchSubject: string | null;
}

/** FNV-1a, so the draw is reproducible in the browser bundle and in scripts. */
function hashToIndex(key: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Final avalanche: FNV alone is weak in the low bits a modulo reads.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 13;
  return (hash >>> 0) % length;
}

/**
 * Pick the listener for the student's next session. Pure and deterministic:
 * the wizard's preview and the start route compute the same person from the
 * same history, so nothing client-supplied decides who the listener is, and a
 * wizard refresh shows the same person until a new report row exists.
 *
 * `blind` draws someone other than the sighted pick, so previewing "name and
 * role" and then switching to "completely blind" cannot reveal the listener.
 *
 * @param history The student's elevator reports, newest first.
 * @param availableIds Roster ids live in the catalog right now. An empty list
 *   means the catalog told us nothing usable, so the whole roster stays eligible.
 */
export function chooseElevatorListener({
  userId,
  history,
  pitchSubject,
  blind,
  availableIds,
  nowMs,
}: {
  userId: string;
  history: readonly ElevatorDrawHistoryEntry[];
  pitchSubject: string;
  blind: boolean;
  availableIds: ReadonlySet<string>;
  nowMs: number;
}): ElevatorListenerPersona {
  const latest = history[0];
  if (
    latest?.personaId &&
    latest.status === "IN_PROGRESS" &&
    latest.pitchSubject === pitchSubject &&
    nowMs - latest.createdAtMs <= ELEVATOR_RESTART_PIN_MS
  ) {
    const pinned = ROSTER_BY_ID.get(latest.personaId);
    if (pinned) return pinned;
  }

  const live = ELEVATOR_LISTENER_ROSTER.filter((p) => availableIds.has(p.id));
  const pool = live.length ? live : ELEVATOR_LISTENER_ROSTER;

  // Hold out the most recent listeners, but always leave at least two people,
  // so the blind draw has someone other than the sighted pick.
  const heldOut = new Set(
    history
      .map((entry) => entry.personaId)
      .filter((id): id is string => Boolean(id))
      .slice(0, Math.min(ELEVATOR_RECENT_WINDOW, Math.max(pool.length - 2, 0))),
  );
  const fresh = pool.filter((p) => !heldOut.has(p.id));

  // The latest report id changes the seed exactly when a new session starts.
  const seed = `${userId}:${latest?.reportId ?? "first"}`;
  const sighted = fresh[hashToIndex(seed, fresh.length)];
  if (!blind) return sighted;

  const others = fresh.filter((p) => p.id !== sighted.id);
  return others.length ? others[hashToIndex(`${seed}:blind`, others.length)] : sighted;
}
