/**
 * Seeded conversations are code records with no owner (research Section E).
 * They are playable by anyone, editable only by code review, and deliberately
 * have no ownerId so the authoring routes' owner-scoped loaders return null for
 * them — which is what makes a seeded id un-editable and un-deletable through
 * the API.
 *
 * Avatar ids are left empty and filled at resolve time by `assignSeededAvatar`
 * against the live ACTIVE HeyGen catalog — never hardcoded.
 *
 * Default difficulty is `"guarded"` (the middle band); the student may pick
 * another band at setup. Nothing else about a seeded conversation is adjustable.
 */

import type { DifficultConversationRecord } from "@/lib/difficult-conversation/types";

/** Fixed timestamps — seeded content is version-controlled, not user-edited. */
const SEEDED_AT = "2026-10-04T00:00:00.000Z";

/** Resolve-time placeholder — filled by assignSeededAvatar, never a real id. */
const UNRESOLVED = "";

/**
 * Optional gender hints for `assignSeededAvatar`, keyed by conversation id.
 * Not part of DifficultConversationRecord — resolve-time preference only.
 * Derived from the character pronouns in each scenario ("she" / "he").
 */
export const SEEDED_AVATAR_GENDER_HINTS: Readonly<
  Record<string, "male" | "female">
> = {
  "confront-low-performer": "female",
  "fire-team-member": "male",
  "ask-for-raise": "male",
  "challenge-grade": "female",
  "deliver-bad-news-client": "male",
  "peer-conflict": "male",
  "decline-senior-request": "female",
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
      "slipped this quarter and you need a clear, time-bound improvement plan " +
      "from her before the next release. You are meeting one-on-one to raise " +
      "the performance gap and lock a written commitment with dates.",
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
      "Get a commitment to a specific written improvement plan with dates.",
    stakes:
      "If it escalates she goes to HR about workload; if it goes nowhere the " +
      "team misses the next release.",
    difficulty: "guarded", // middle band default; student chooses at setup
    // Filled at resolve time by assignSeededAvatar — never hardcoded.
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
      "You are meeting Jordan to end his employment. HR has already signed off " +
      "and his last day is in two weeks. Your job is to deliver the decision " +
      "clearly, not reopen the case, and walk him through logistics with dignity.",
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
      "Deliver the decision clearly, do not negotiate it, and get him through " +
      "the logistics with dignity.",
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
      "You are meeting your manager to ask for a raise. You have taken on more " +
      "scope since your last adjustment and you want a specific number and a " +
      "date, not another vague promise to revisit later.",
    sharedBackstory:
      "You led the service migration last year and took on a departed " +
      "colleague's work. Your last raise was twenty-two months ago. The next " +
      "formal review cycle is four months away. Both of you know the migration " +
      "outcome and how long it has been since your last adjustment.",
    hiddenPosition:
      "You agree she is underpaid, but your budget was cut. You have a lower " +
      "number you can get approved today and a higher one that needs your own " +
      "boss. You will offer the low number first and only move if she makes a " +
      "specific, evidenced case. You prefer to stall toward the review cycle.",
    studentObjective:
      'Leave with a specific number and a date — not "we\'ll revisit it".',
    stakes: "Another vague deferral and she starts interviewing elsewhere.",
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
      "against an ambiguous rubric row. You want either a concrete regrade or a " +
      "written explanation tied to the rubric, not a brush-off about effort.",
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
      "Get a concrete regrade or a written explanation tied to the rubric.",
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
      "You are the account lead calling your client to say the project has " +
      "slipped six weeks. You need to land a new date he can trust and keep the " +
      "relationship intact after the late notice.",
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
    studentObjective: "Land the new date and keep the client relationship.",
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
      "own in leadership forums. Neither of you manages the other. You need an " +
      "explicit agreement about attribution going forward without blowing up " +
      "the working relationship.",
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
      "Reach an explicit agreement about attribution going forward.",
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
      "on a date you cannot meet without sinking two committed deliverables. " +
      "You need to decline the scope or renegotiate it without damaging the " +
      "relationship or quietly accepting an impossible yes.",
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
      "Decline the scope or renegotiate it without damaging the relationship " +
      "or quietly accepting it.",
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
