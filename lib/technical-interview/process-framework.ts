/**
 * The step-by-step process a technical coding interview is graded against,
 * in the shared problem-interview `ProcessFramework` shape so the verdicts,
 * parser, sanitizer and report panel are reused rather than re-invented (the
 * same reuse the courageous-conversation and questioned-persona checklists make).
 *
 * Statuses: `hit`, `prompted` (reached only after the interviewer's nudge or a
 * hint), `partly` (attempted but incomplete or vague), `missed`, and
 * `not_applicable`. The checklist sits BESIDE the coding rubric scores; it does
 * not replace them. A report without the outcome field shows no checklist.
 *
 * CONTRACT (2026-11-15 coding-report loop): loop/coding-grading writes the
 * verdicts; loop/coding-report-ui renders them. Change keys only with both.
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

/** Outcome key the evaluator writes the JSON-encoded step verdicts to. */
export const CODING_STEPS_OUTCOME_KEY = "codingSteps";

export const TECHNICAL_CODING_FRAMEWORK: ProcessFramework = {
  key: "technical-coding",
  label: "steps of a coding interview",
  source:
    "The habits interviewers look for when a candidate solves a problem out loud: understand the problem, try examples, state an approach and its cost before coding, narrate while writing, then test and wrap up.",
  steps: [
    {
      key: "clarify",
      label: "Clarify the problem",
      description: "Restates the task and asks about inputs, outputs and constraints before solving.",
      evidenceCriteria:
        "The candidate restates the problem in their own words or asks at least one substantive question about input size, types, ordering, duplicates, empty input or expected output. Repeating the prompt verbatim does not count.",
      nudge: "Before you start, is anything about the input unclear?",
    },
    {
      key: "examples_edge_cases",
      label: "Work examples and edge cases",
      description: "Walks a small example and names the edge cases the solution must handle.",
      evidenceCriteria:
        "The candidate works through at least one concrete example AND names at least one edge case (empty input, a single element, duplicates, negatives, very large input) before or while designing the solution.",
      nudge: "What would a small example look like?",
    },
    {
      key: "approach_before_code",
      label: "State the approach before coding",
      description: "Explains the plan — the idea and the data structures — before writing code.",
      evidenceCriteria:
        "Before the code is written, the candidate describes the algorithm and the main data structure clearly enough that another engineer could implement it. Comparing a brute-force idea with a better one counts strongly.",
      nudge: "How are you thinking of approaching it?",
    },
    {
      key: "complexity",
      label: "Analyze time and space",
      description: "States the time and space cost of the approach, and gets it right.",
      evidenceCriteria:
        "The candidate states BOTH time and space complexity for their approach and the statement is correct for the code they wrote. A wrong complexity claim is `partly` at best.",
      nudge: "How does that scale as the input grows?",
    },
    {
      key: "narrate_implementation",
      label: "Narrate while coding",
      description: "Talks through the code while writing it, so the interviewer can follow decisions.",
      evidenceCriteria:
        "While implementing, the candidate explains what each part does or why a choice was made. Long silent stretches followed by finished code are `missed`.",
      nudge: "Can you talk me through what you're writing?",
    },
    {
      key: "test_and_trace",
      label: "Test and trace the code",
      description: "Checks the code against an example or edge case and fixes what they find.",
      evidenceCriteria:
        "After writing code the candidate traces it by hand on an input, or runs the visible tests and reasons about the result, including at least one edge case. Finding and fixing a bug this way counts as `hit`.",
      nudge: "How would you check that it works?",
    },
    {
      key: "wrap_up",
      label: "Wrap up and reflect",
      description: "Summarizes the solution and names what they would improve with more time.",
      evidenceCriteria:
        "The candidate closes with a short summary of the solution and its cost, and names a limitation, an alternative or a next improvement.",
      nudge: "If you had more time, what would you change?",
    },
  ],
};
