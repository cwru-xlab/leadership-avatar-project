import { createHash } from "node:crypto";

import {
  MAX_TECHNICAL_HINTS,
  type TechnicalAssignmentPrivate,
  type TechnicalHintTier,
} from "./types";
import type { TechnicalSourceCheckpoint } from "./evidence";

/** Closed, server-decided categories for technical chat turns. */
export type TechnicalChatRequestCategory =
  | "clarification"
  | "hint_request"
  | "solution_request"
  | "interview_response";

export interface TechnicalHintRecord {
  requestKey: string;
  tier: TechnicalHintTier;
  text: string;
  issuedAt: string;
}

const HINT_WORDS = /\b(hint|nudge|stuck|help me|direction|where do i start)\b/i;
// Only an explicit request for interviewer-provided work is a solution
// request. A candidate saying "I'll write the code now" is normal interview
// progress, not a request that we write it for them.
const SOLUTION_REQUESTS = [
  /\b(?:can|could|would|will) you\s+(?:write|implement|code|solve|provide|give)\b/i,
  /\b(?:write|implement|code|solve)\s+(?:it|this|the problem)?\s*(?:for me)\b/i,
  /\b(?:give|show|provide)\s+(?:me\s+)?(?:the\s+)?(?:solution|code|pseudocode)\b/i,
  /\b(?:what|which)\s+(?:algorithm|data structure)\s+(?:should|do)\b/i,
];
const CLARIFICATION_WORDS = /\b(clarif|what does|does .* mean|can i assume|is .* allowed|constraint|input|output|signature|edge case)\b/i;

export function categorizeTechnicalChatRequest(content: string): TechnicalChatRequestCategory {
  // A direct visible-contract question may contain words such as “answer”; it
  // must not be mistaken for a solution request. This classifier selects a
  // reply style only—the server's static refusals remain the policy boundary.
  if (SOLUTION_REQUESTS.some((pattern) => pattern.test(content))) return "solution_request";
  // Mixed requests such as “can you clarify — could I get a hint?” consume a
  // hint. Checking this before clarification prevents bypassing the ledger.
  if (HINT_WORDS.test(content)) return "hint_request";
  if (CLARIFICATION_WORDS.test(content)) return "clarification";
  return "interview_response";
}

/** A stable fallback makes repeated browser retries idempotent without trusting a client id. */
export function technicalHintRequestKey(content: string, clientKey: unknown): string {
  if (typeof clientKey === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(clientKey)) {
    return `client:${clientKey}`;
  }
  return `message:${createHash("sha256").update(content).digest("hex")}`;
}

/**
 * Converts server-owned source checkpoints into a conservative implementation
 * stage. This is deliberately a one-way nudge: uncertainty returns an earlier
 * hint, while clear code structure skips a hint the candidate has outgrown.
 */
export function inferTechnicalHintTier(
  assignment: Pick<TechnicalAssignmentPrivate, "starterCode">,
  checkpoints: readonly TechnicalSourceCheckpoint[],
): TechnicalHintTier {
  const source = checkpoints.at(-1)?.source ?? assignment.starterCode;
  const body = source
    .replace(/^[ \t]*def\s+[A-Za-z_]\w*\s*\([^)]*\)\s*:\s*$/m, "")
    .replace(/#[^\n]*/g, "")
    .replace(/\bpass\b/g, "")
    .trim();

  if (!body) return 1;
  // A concrete result indicates the candidate has selected a direction.
  if (!/\b(return|yield)\b/.test(body)) return 1;
  // Branching/iteration indicates they are implementing and benefit most from
  // an invariant/debugging nudge rather than restating the approach.
  if (/\b(for|while|if|elif|else|try|except)\b/.test(body)) return 3;
  return 2;
}

/**
 * Allocate the next unissued authored hint at or beyond the inferred stage.
 * We never go backwards: a candidate who has already implemented the earlier
 * idea should not spend an interaction on a redundant nudge.
 */
export function selectTechnicalHintTier(
  assignment: Pick<TechnicalAssignmentPrivate, "starterCode">,
  checkpoints: readonly TechnicalSourceCheckpoint[],
  issuedTiers: readonly number[],
): TechnicalHintTier | null {
  const minimum = inferTechnicalHintTier(assignment, checkpoints);
  for (let tier = minimum; tier <= MAX_TECHNICAL_HINTS; tier += 1) {
    if (!issuedTiers.includes(tier)) return tier as TechnicalHintTier;
  }
  return null;
}

/** The text itself is private catalogue data; only the numbered response is sent. */
export function buildTechnicalHint(
  assignment: Pick<TechnicalAssignmentPrivate, "hintLadder">,
  tier: TechnicalHintTier,
): string {
  return `Hint ${tier} of ${MAX_TECHNICAL_HINTS}: ${assignment.hintLadder[tier - 1]}`;
}

/** Spoken when a candidate asks for a hint after the last tier is spent. */
export const TECHNICAL_HINT_EXHAUSTED_REPLY =
  `That’s all ${MAX_TECHNICAL_HINTS} hints — I don’t have any more for this problem. I can still clarify the published problem statement, but from here the reasoning has to be yours. Talk me through where you are stuck and what you have ruled out.`;

/** Historical v1 snapshots predate the current authored-hint contract. */
export const TECHNICAL_HISTORICAL_V1_HINT_UNAVAILABLE_REPLY =
  "Hints are unavailable for this historical coding session. I can still clarify the published problem statement, and you can talk me through your reasoning.";

export function technicalPolicyDirective(category: TechnicalChatRequestCategory): string {
  const common = "Use only the learner-visible problem statement, constraints, examples, starter signature, and published complexity target. Never provide code, pseudocode, an algorithm, a data structure recommendation, solution steps, or any private implementation, test, or scoring information.";
  if (category === "clarification") {
    return `${common} Answer only a direct clarification about those visible fields, then return to interview questioning.`;
  }
  return `${common} This is an interview-response turn; ask the candidate to articulate their own reasoning.`;
}
