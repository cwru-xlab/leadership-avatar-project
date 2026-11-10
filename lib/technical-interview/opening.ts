import { MAX_TECHNICAL_VISIBLE_TURN_BYTES } from "./evidence";
import type { TechnicalAssignmentPublic } from "./types";

/**
 * The interviewer's spoken brief at the start of a coding session.
 *
 * Composed from LEARNER-VISIBLE fields only — the same title, statement,
 * constraint and complexity target already rendered in the problem panel — so
 * speaking it reveals nothing the candidate cannot read. It restates the
 * problem and asks for an approach; it never suggests an algorithm, a data
 * structure, or a solution step, which is why this is fixed text rather than
 * a model turn that could drift into coaching.
 *
 * Written to be heard, not read: short sentences, no code, no symbols that a
 * text-to-speech voice would mangle.
 */
export function buildTechnicalOpening(
  assignment: Pick<
    TechnicalAssignmentPublic,
    "title" | "statement" | "constraints" | "expectedComplexity" | "publicTests"
  >,
): string {
  const statement = assignment.statement.trim().replace(/\s+/g, " ");
  const spokenStatement = /[.!?]$/.test(statement) ? statement : `${statement}.`;
  const visibleTests = assignment.publicTests.length;
  const testSentence =
    visibleTests === 1
      ? "There is one visible test in the panel, which you can run locally in your browser."
      : `There are ${visibleTests} visible tests in the panel, which you can run locally in your browser.`;

  const opening = [
    `Thanks for making time today. Let's work through a problem called ${assignment.title}.`,
    `Here's the task. ${spokenStatement}`,
    `The signature you need is in the editor, and I'm looking for ${assignment.expectedComplexity}.`,
    testSentence,
    "Before you write any code, talk me through how you're thinking about it — and ask me anything about the problem that isn't clear.",
  ].join(" ");

  // Visible turns are bounded; a long statement must not silently drop the
  // whole greeting when it is persisted.
  return Buffer.byteLength(opening, "utf8") > MAX_TECHNICAL_VISIBLE_TURN_BYTES
    ? `Thanks for making time today. Let's work through ${assignment.title}. The problem statement and visible tests are in the panel beside the editor, and I'm looking for ${assignment.expectedComplexity}. Before you write any code, talk me through your approach — and ask me anything that isn't clear.`
    : opening;
}
