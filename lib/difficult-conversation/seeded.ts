/**
 * Seeded conversations are code records with no owner (research Section E).
 * They are playable by anyone, editable only by code review, and deliberately
 * have no ownerId so the authoring routes' owner-scoped loaders return null for
 * them — which is what makes a seeded id un-editable and un-deletable through
 * the API.
 *
 * Avatar ids are left empty on the records and filled at resolve time by
 * `assignSeededAvatar` from `SEEDED_COUNTERPART_CAST` below, checked against
 * the live catalog. Nothing is stored per scenario, so a recast reaches every
 * student on their next session without touching any data.
 *
 * Default difficulty is `"guarded"` (the middle band); the student may pick
 * another band at setup. Nothing else about a seeded conversation is adjustable.
 */

import type { DifficultConversationRecord } from "@/lib/difficult-conversation/types";

/** Fixed timestamps — seeded content is version-controlled, not user-edited. */
const SEEDED_AT = "2026-10-04T00:00:00.000Z";

/** Resolve-time placeholder — filled by assignSeededAvatar from the cast. */
const UNRESOLVED = "";

export interface SeededCounterpartCast {
  avatarId: string;
  /** The avatar's own default voice, as the catalog paired it. */
  voiceId: string;
  /** The catalog's voice gender; matches the scenario's pronouns for them. */
  presentation: "female" | "male";
}

/**
 * Who plays the other person in each seeded conversation, keyed by id.
 *
 * WHY STOCK FACES. These used to be drawn from the account's custom avatars,
 * which are likenesses of real Weatherhead faculty, so a real professor played
 * the defensive analyst or the employee being let go. Every face here comes
 * from the seated PUBLIC roster in `lib/avatar-roster.ts`, as the elevator
 * pitch's cast does (`lib/pitch/elevator-personas.ts`). A student building
 * their own conversation can still pick a faculty avatar deliberately.
 *
 * WHY PINNED, NOT HASHED. A hash over the catalog could land a woman's voice on
 * a scenario that calls the counterpart "he", or a person named Maya on a face
 * the catalog calls Thomas. Pinning keeps name, pronouns, face and voice in
 * agreement and is reviewable here. `presentation` follows the scenario's
 * pronouns; where the scenario names the person, the avatar's catalog name
 * does not contradict it.
 *
 * CASTING. Authority roles (manager, professor, client, senior leader) and the
 * harder seats (the analyst, the employee being let go, the credit-taking peer)
 * were spread so no group clusters on either side. The visa worry in
 * fire-team-member was deliberately not used to pick a face.
 *
 * The voice id is a fallback for a catalog outage; the live catalog's current
 * default voice for the same avatar wins when it is reachable.
 */
export const SEEDED_COUNTERPART_CAST: Readonly<
  Record<string, SeededCounterpartCast>
> = {
  // Maya, product analyst.
  "confront-low-performer": {
    avatarId: "e2336732-dc9b-4c90-8a91-3d80f4b8dd13", // Maya (Friendly)
    voiceId: "8d7ca40c-5ee6-45f3-8b4a-e2b01df302a1", // Maya
    presentation: "female",
  },
  // Jordan, direct report being let go.
  "fire-team-member": {
    avatarId: "6c2017bc-1eef-4071-ba70-0e9d5bcbf00f", // Thomas (Friendly)
    voiceId: "6ec23890-d16c-4a40-82f5-10d4f57e1b9f", // Thomas
    presentation: "male",
  },
  // The student's manager.
  "ask-for-raise": {
    avatarId: "af93e3b6-e07d-4246-8219-ad7f0fd2e6ed", // Andrew (Friendly)
    voiceId: "832850fa-468d-4704-81a5-4acf9f9fe994", // Andrew
    presentation: "male",
  },
  // Professor Chen.
  "challenge-grade": {
    avatarId: "4857d1c6-a3b0-4d0a-b363-48cb9a62e496", // Lucy (Friendly)
    voiceId: "d8102af2-20f5-47eb-88d5-68f979675d10", // Lucy
    presentation: "female",
  },
  // Client stakeholder.
  "deliver-bad-news-client": {
    avatarId: "7b888024-f8c9-4205-95e1-78ce01497bda", // Shawn Therapist
    voiceId: "51afbab6-7af4-473b-95fc-6ce26aac8bb1", // Shawn - IA
    presentation: "male",
  },
  // Peer on a neighbouring squad.
  "peer-conflict": {
    avatarId: "a4991f42-d211-4581-9631-639f7fe7c635", // William (Friendly)
    voiceId: "33e686e7-cae5-4b2b-a8c4-003c91aa6cfd", // William
    presentation: "male",
  },
  // Senior leader.
  "decline-senior-request": {
    avatarId: "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", // Marianne Sitting
    voiceId: "8a504f9b-95dd-42d4-8b0c-edc2567b6382", // Marianne - IA
    presentation: "female",
  },
};

/**
 * Claude's Discretion neighbours (beyond the brief's four), chosen for coverage
 * of a different power direction or a different kind of pressure:
 *
 * - deliver-bad-news-client — outward-facing; no authority over the other person
 * - peer-conflict — no power differential; holding the line without authority
 * - decline-senior-request — upward refusal; the inverse of ask-for-raise
 *
 * Mirrored role-swap variants are deferred — seven situations, one perspective each.
 */
export const SEEDED_CONVERSATIONS: DifficultConversationRecord[] = [
  {
    id: "confront-low-performer",
    title: "Confronting a low-performing teammate",
    avatarRole: "Direct report — product analyst",
    studentRole: "Engineering manager",
    // Student-facing brief — nothing from the character's private stance.
    situation:
      "You manage Maya, a product analyst on your squad. Her delivery has " +
      "slipped this quarter, and the next release is approaching. You are " +
      "meeting one-on-one to discuss the performance gap and what needs " +
      "attention before the release.",
    sharedBackstory:
      "Maya missed two deadlines this quarter after strong work in the first " +
      "half of the year. You had one prior verbal conversation about delivery " +
      "six weeks ago. The next release is three weeks out and her module is " +
      "on the critical path. Both of you know the missed dates and that prior talk.",
    // Character direction — second person TO Maya. Never shown to the student.
    hiddenPosition:
      "You believe the real problem is being given work with no spec and a " +
      "teammate who misses handoffs. You have been carrying two people's load " +
      "and you will not accept a written plan unless the manager acknowledges " +
      "the handoff problem first. You are defensive and want credit for the " +
      "extra work before agreeing to any formal improvement document.",
    studentObjective:
      "Discuss the performance gap and explore a workable path forward before the next release.",
    stakes:
      "If it escalates she goes to HR about workload; if it goes nowhere the " +
      "team misses the next release.",
    difficulty: "guarded", // middle band default; student chooses at setup
    // Filled at resolve time from SEEDED_COUNTERPART_CAST.
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null, // seeded text is reviewed by code review, not pre-publish
  },
  {
    id: "fire-team-member",
    title: "Firing a team member",
    avatarRole: "Direct report being let go",
    studentRole: "People manager",
    situation:
      "You are meeting Jordan because HR has approved ending his employment, " +
      "with his last day in two weeks. You need to discuss the decision and " +
      "the transition with him in a conversation that carries significant stakes.",
    sharedBackstory:
      "Jordan was on a documented three-month performance plan with two missed " +
      "checkpoints. HR reviewed the file and approved the termination. His last " +
      "day is two weeks from today. Both of you know the plan existed and that " +
      "the checkpoints were missed.",
    hiddenPosition:
      "You half-expect this meeting, but you are frightened about your visa and " +
      "health insurance. You will cycle through bargaining for more time, then " +
      "anger about never being warned clearly enough, then ask what you are " +
      "supposed to tell your family. You want any sign the decision might reverse.",
    studentObjective:
      "Discuss the employment decision and the transition in a way that is clear and respectful.",
    stakes:
      "A muddled delivery leaves him believing it is reversible and creates a " +
      "legal exposure for the company.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
  {
    id: "ask-for-raise",
    title: "Asking your manager for a raise",
    avatarRole: "Your manager",
    studentRole: "Individual contributor",
    situation:
      "You are meeting your manager to discuss your compensation. You have taken " +
      "on more scope since your last adjustment, and the conversation may shape " +
      "how you both view your role and future growth.",
    sharedBackstory:
      "You led the service migration last year and took on a departed " +
      "colleague's work. Your last raise was twenty-two months ago. The next " +
      "formal review cycle is four months away. Both of you know the migration " +
      "outcome and how long it has been since your last adjustment.",
    hiddenPosition:
      "You agree the employee is underpaid, but your budget was cut. You have a lower " +
      "number you can get approved today and a higher one that needs your own " +
      "boss. You will offer the low number first and only move if they make a " +
      "specific, evidenced case. You prefer to stall toward the review cycle.",
    studentObjective:
      "Discuss how your expanded responsibilities should be reflected in your compensation.",
    stakes: "Another vague deferral and you start interviewing elsewhere.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
  {
    id: "challenge-grade",
    title: "Challenging a professor over an unfair grade",
    avatarRole: "Course professor",
    studentRole: "Undergraduate student",
    situation:
      "You are meeting Professor Chen about a grade you believe was scored " +
      "against an ambiguous rubric row. You want to understand how the rubric " +
      "was applied and address your concerns before grades lock.",
    sharedBackstory:
      "The assignment, the published rubric, and your grade are all on record. " +
      "You sent one prior email that went unanswered for a week. Office hours " +
      "this week are the next chance to resolve it before grades lock. Both of " +
      "you have the rubric and the scored submission in front of you.",
    hiddenPosition:
      "You privately know the rubric row was ambiguous but will not say so " +
      "unprompted. You are defensive about being second-guessed and have had " +
      "three other students complain this week. You will regrade only if the " +
      "student argues from the rubric rather than from effort or from their GPA.",
    studentObjective:
      "Discuss the grade and seek clarity about how the rubric was applied.",
    stakes: "The grade decides whether you clear a scholarship threshold.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
  {
    id: "deliver-bad-news-client",
    title: "Telling a client the project has slipped",
    avatarRole: "Client stakeholder",
    studentRole: "Account lead",
    // Neighbour: outward-facing — no authority over the other person.
    situation:
      "You are the account lead calling your client to explain that the project has " +
      "slipped six weeks. The late notice puts the relationship under pressure, " +
      "and you need to discuss what happens next with the client.",
    sharedBackstory:
      "The original launch date was committed in the SOW. Two dependency " +
      "vendors slipped last month and your team re-estimated last Friday. The " +
      "client has not yet been told the new six-week date. You both know the " +
      "original date and that status reports had been green until recently.",
    hiddenPosition:
      "You have already promised the original date to your own board. You are " +
      "less angry about the slip than about finding out late. You will accept a " +
      "new date only with a credible explanation of what changed and what " +
      "prevents it recurring. A soft apology without a plan will not move you.",
    studentObjective:
      "Discuss the delay, its impact, and a path forward with the client.",
    stakes:
      "He has a competitor's proposal on his desk and will escalate if he " +
      "still cannot explain the delay upward.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
  {
    id: "peer-conflict",
    title: "Addressing a peer who claims your team's work",
    avatarRole: "Peer collaborator",
    studentRole: "Peer team lead",
    // Neighbour: no power differential — holding the line without authority.
    situation:
      "A peer on a neighbouring squad keeps presenting your team's work as his " +
      "own in leadership forums. Neither of you manages the other, and the issue " +
      "is straining a relationship you still need for the next shared deliverable.",
    sharedBackstory:
      "Your team built the analysis deck that landed in last month's ops " +
      "review. He presented the deck in the forum and answered questions as if " +
      "he owned the work. Two people on your team noticed and flagged it to you. " +
      "You both still need to collaborate on the next shared deliverable.",
    hiddenPosition:
      "You genuinely do not see it that way. You believe you did the synthesis " +
      "that made the work land and that credit naturally follows the presenter. " +
      "You will become cold and procedural if accused outright, but you will " +
      "agree to a concrete attribution practice if given a way to keep face.",
    studentObjective:
      "Address the attribution concern while preserving the working relationship.",
    stakes:
      "Escalating to a shared manager damages both of you and freezes the " +
      "next shared deliverable.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
  {
    id: "decline-senior-request",
    title: "Declining a senior leader's request you cannot absorb",
    avatarRole: "Senior leader",
    studentRole: "Team lead",
    // Neighbour: upward refusal — the inverse of ask-for-raise's upward ask.
    situation:
      "A senior leader has asked your team to absorb a high-visibility request " +
      "on a date that conflicts with two committed deliverables. You need to " +
      "discuss the request, the trade-offs, and your team's capacity with her.",
    sharedBackstory:
      "Your team already has two dated commitments on the roadmap this month. " +
      "The senior request landed yesterday with a hard date in ten days. She " +
      "has not seen your current load board. Both of you know the request and " +
      "the stated date; she may not know what else is committed.",
    hiddenPosition:
      "You have already committed the date upward and do not actually know what " +
      "else this team is carrying. You will respect a clear no with an " +
      "alternative far more than a reluctant yes — but you will push twice first " +
      "to test whether the refusal is real. Soft hedging reads as capacity to you.",
    studentObjective:
      "Discuss the request and its trade-offs while maintaining the relationship.",
    stakes:
      "Accepting sinks two committed deliverables and trains leadership that " +
      "your team will absorb impossible dates.",
    difficulty: "guarded",
    avatarId: UNRESOLVED,
    voiceId: UNRESOLVED,
    ownerId: null,
    published: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    lastCheck: null,
  },
];

export function findSeededConversation(
  id: string,
): DifficultConversationRecord | undefined {
  return SEEDED_CONVERSATIONS.find((record) => record.id === id);
}
