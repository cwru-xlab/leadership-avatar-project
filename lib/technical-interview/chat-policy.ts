import { createHash } from "node:crypto";

import {
  MAX_TECHNICAL_HINTS,
  type TechnicalAssignmentPublic,
  type TechnicalHintTier,
} from "./types";

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
const SOLUTION_WORDS = /\b(solution|solve (it|this|the problem)|implement (it|this)|write (the )?code|pseudocode|answer|algorithm should i use|what (algorithm|data structure) should)\b/i;
const CLARIFICATION_WORDS = /\b(clarif|what does|does .* mean|can i assume|is .* allowed|constraint|input|output|signature|edge case)\b/i;

export function categorizeTechnicalChatRequest(content: string): TechnicalChatRequestCategory {
  // A direct visible-contract question may contain words such as “answer”; it
  // must not be mistaken for a solution request. This classifier selects a
  // reply style only—the server's static refusals remain the policy boundary.
  if (CLARIFICATION_WORDS.test(content)) return "clarification";
  if (SOLUTION_WORDS.test(content)) return "solution_request";
  if (HINT_WORDS.test(content)) return "hint_request";
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
 * Hints deliberately cite only learner-visible fields. They name a review task,
 * never an algorithm, data structure, solution step, or pseudocode.
 */
export function buildTechnicalHint(
  assignment: Pick<TechnicalAssignmentPublic, "title" | "constraints" | "expectedComplexity">,
  tier: TechnicalHintTier,
): string {
  const of = `of ${MAX_TECHNICAL_HINTS}`;
  if (tier === 1) {
    return `Hint 1 ${of}: For “${assignment.title},” restate the input/output contract in your own words, then name one boundary case from the stated constraints before choosing an approach.`;
  }
  const boundary = assignment.constraints[0] || "the stated constraints";
  if (tier === 2) {
    return `Hint 2 ${of}: Check that your proposed approach can satisfy the published target (${assignment.expectedComplexity}) while handling ${boundary.toLowerCase()}—explain why before changing code.`;
  }
  return `Hint 3 ${of}: Walk your current code against the smallest input that still exercises the main path, then against ${boundary.toLowerCase()}. Say what you expect at each step before you run it, and name the first place your expectation and the code disagree.`;
}

/** Spoken when a candidate asks for a hint after the last tier is spent. */
export const TECHNICAL_HINT_EXHAUSTED_REPLY =
  `That’s all ${MAX_TECHNICAL_HINTS} hints — I don’t have any more for this problem. I can still clarify the published problem statement, but from here the reasoning has to be yours. Talk me through where you are stuck and what you have ruled out.`;

export function technicalPolicyDirective(category: TechnicalChatRequestCategory): string {
  const common = "Use only the learner-visible problem statement, constraints, examples, starter signature, and published complexity target. Never provide code, pseudocode, an algorithm, a data structure recommendation, solution steps, or any private implementation, test, or scoring information.";
  if (category === "clarification") {
    return `${common} Answer only a direct clarification about those visible fields, then return to interview questioning.`;
  }
  return `${common} This is an interview-response turn; ask the candidate to articulate their own reasoning.`;
}
