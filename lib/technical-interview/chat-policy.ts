import { createHash } from "node:crypto";

import type { TechnicalAssignmentPublic } from "./types";

/** Closed, server-decided categories for technical chat turns. */
export type TechnicalChatRequestCategory =
  | "clarification"
  | "hint_request"
  | "solution_request"
  | "interview_response";

export interface TechnicalHintRecord {
  requestKey: string;
  tier: 1 | 2;
  text: string;
  issuedAt: string;
}

const HINT_WORDS = /\b(hint|nudge|stuck|help me|direction|where do i start)\b/i;
const SOLUTION_WORDS = /\b(solution|solve (it|this|the problem)|implement (it|this)|write (the )?code|pseudocode|answer|algorithm should i use|what (algorithm|data structure) should)\b/i;
const CLARIFICATION_WORDS = /\b(clarif|what does|does .* mean|can i assume|is .* allowed|constraint|input|output|signature|edge case)\b/i;

export function categorizeTechnicalChatRequest(content: string): TechnicalChatRequestCategory {
  if (SOLUTION_WORDS.test(content)) return "solution_request";
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
 * Hints deliberately cite only learner-visible fields. They name a review task,
 * never an algorithm, data structure, solution step, or pseudocode.
 */
export function buildTechnicalHint(
  assignment: Pick<TechnicalAssignmentPublic, "title" | "constraints" | "expectedComplexity">,
  tier: 1 | 2,
): string {
  if (tier === 1) {
    return `Hint 1 of 2: For “${assignment.title},” restate the input/output contract in your own words, then name one boundary case from the stated constraints before choosing an approach.`;
  }
  const boundary = assignment.constraints[0] || "the stated constraints";
  return `Hint 2 of 2: Check that your proposed approach can satisfy the published target (${assignment.expectedComplexity}) while handling ${boundary.toLowerCase()}—explain why before changing code.`;
}

export function technicalPolicyDirective(category: TechnicalChatRequestCategory): string {
  const common = "Use only the learner-visible problem statement, constraints, examples, starter signature, and published complexity target. Never provide code, pseudocode, an algorithm, a data structure recommendation, solution steps, or any private implementation, test, or scoring information.";
  if (category === "clarification") {
    return `${common} Answer only a direct clarification about those visible fields, then return to interview questioning.`;
  }
  return `${common} This is an interview-response turn; ask the candidate to articulate their own reasoning.`;
}
