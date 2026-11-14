/**
 * The five-move checklist a courageous conversation is graded against, in
 * the problem-interview `ProcessFramework` shape so the step contract (and
 * its `ProcessStepResult` verdicts, parser, sanitizer and report panel) is
 * shared rather than re-invented — the same reuse the questioned-persona
 * checklists make (`lib/questioned-persona/frameworks.ts`).
 *
 * The five moves are the client's own list (2026-11-14): find common ground,
 * share facts and observations, frame the concern, lead with inquiry, and
 * create a next step. They are ALIGNED WITH the principles of the
 * Crucial Conversations model (Patterson, Grenny, McMillan & Switzler) —
 * mutual purpose, facts before stories, curiosity about the other person's
 * view, and a concrete move to action — but the wording below is ours. Do
 * not paste that book's proprietary phrasing or acronyms into step text.
 *
 * Steps are graded `hit` / `partly` / `missed` / `not_applicable`; `prompted`
 * does not apply (there is no interviewer nudging). `nudge` is required by the shared
 * contract but is never used live: the character does not coach.
 *
 * The checklist sits BESIDE the four scored conversation dimensions; it does
 * not replace them, so already-graded reports, mastery competencies and
 * the scorecards stay byte-compatible. A report without the outcome field
 * simply shows no checklist.
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

/** Outcome key the evaluator writes the JSON-encoded step verdicts to. */
export const CONVERSATION_STEPS_OUTCOME_KEY = "conversationSteps";

export const COURAGEOUS_CONVERSATION_FRAMEWORK: ProcessFramework = {
  key: "courageous-conversation",
  label: "five moves of a courageous conversation",
  source:
    "The five moves your program teaches for a hard conversation — common ground, facts, the concern, inquiry, and a next step. They line up with widely taught dialogue principles such as those in Crucial Conversations (Patterson, Grenny, McMillan & Switzler): establish a mutual purpose, lead with facts rather than conclusions, invite the other person's view, and end with a clear plan for who does what by when.",
  steps: [
    {
      key: "common_ground",
      label: "Find common ground",
      description:
        "Names a goal or interest you both share, so the other person hears the conversation is for something you both want — not an attack.",
      evidenceCriteria:
        "The student explicitly names a goal, value or interest both people share (e.g. 'We both want this launch to land', 'I want this to work for you and for the team'), or states their own good intent for the relationship or outcome. Generic pleasantries ('thanks for meeting') or flattery alone do NOT count. Re-establishing shared purpose after the conversation got heated also counts.",
      nudge: "What is this actually about?",
    },
    {
      key: "facts_observations",
      label: "Share facts and observations",
      description:
        "Describes specific, observable facts — what happened, when, how often — before any judgment or label about the person.",
      evidenceCriteria:
        "The student cites at least one concrete, checkable observation (a date, a count, a specific event, something said or done) rather than only a conclusion, label or motive ('you don't care', 'you're always late', 'everyone knows'). Missed if the student leads with judgments or accusations and never grounds them in specifics.",
      nudge: "What are you talking about, specifically?",
    },
    {
      key: "frame_concern",
      label: "Frame the concern",
      description:
        "States the problem and why it matters — its impact — clearly and without blame, so there is no doubt what the conversation is about.",
      evidenceCriteria:
        "The student says plainly what the problem is AND its impact or why it matters (to the work, the team, the student, or the other person), using tentative or 'I' language rather than an accusation (e.g. 'I'm concerned that…', 'The impact is…'). Missed if the concern is buried in hedging, only implied, or delivered as a personal attack.",
      nudge: "So what's the problem, exactly?",
    },
    {
      key: "lead_with_inquiry",
      label: "Lead with inquiry",
      description:
        "Asks genuine, open questions to understand the other person's view — and listens to the answer — instead of only telling.",
      evidenceCriteria:
        "The student asks at least one genuine open question about the other person's perspective, reasons or constraints (e.g. 'How do you see it?', 'What's getting in the way?', 'What am I missing?') AND responds to what the person actually answered (reflects, follows up, or adjusts). Rhetorical or leading questions ('Don't you think you should…?') and questions the student does not listen to do NOT count.",
      nudge: "Do you even want to hear my side?",
    },
    {
      key: "next_step",
      label: "Create a next step",
      description:
        "Ends with a concrete, agreed pathway forward — who will do what, by when, and how you'll follow up.",
      evidenceCriteria:
        "The student proposes or confirms a specific next step with at least two of: who does it, what exactly, by when, how it will be checked or followed up (e.g. 'You'll send the draft by Thursday and we'll review it Friday'). A vague 'let's keep talking' or 'let's do better' does NOT count. Use not_applicable ONLY if the character ended the conversation before a next step could reasonably be raised AND the student's process up to that point was not the cause.",
      nudge: "So where does that leave us?",
    },
  ],
};

/**
 * Evaluator section describing the checklist and the exact outcome format.
 * Appended to `CONVERSATION_EVALUATOR_PROMPT`; generated from the framework
 * so the prompt and the report can never name different steps.
 */
export function buildConversationStepsEvaluatorSection(
  framework: ProcessFramework = COURAGEOUS_CONVERSATION_FRAMEWORK,
): string {
  const steps = framework.steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.label} (key "${step.key}"): ${step.description}\n   Counts as hit: ${step.evidenceCriteria}`,
    )
    .join("\n\n");

  return `## The five moves (graded checklist)

Separately from the scores, grade the student's conversation against these five moves, in this order. These are the moves the program teaches, so the student will read your verdicts as their main feedback.

${steps}

For EACH move, find the student's own words first, then check them against EVERY required part of its "counts as hit" criteria (a criterion joined by AND needs both parts — e.g. the concern needs the problem AND its impact). Then decide:
- "hit": the student's own words meet every required part of the criteria. If any part is absent, it is not a hit. Quote them verbatim in evidenceQuote — the shortest span that shows the move, at most about 30 words (trim with "…").
- "partly": the student attempted the move but it was incomplete or vague — e.g. a goal named only for themselves, a fact mixed with a label, a concern with no impact, one open question they then ignored, a next step with no owner or date. Quote the attempt; the note says exactly what would have made it a hit.
- "missed": no real attempt, or the attempt worked against the move — an accusation or label instead of a fact or concern, a rhetorical question, a vague "let's keep talking about it". These are ALWAYS missed, never partly: partly is for an attempt that moved the conversation in the right direction but stopped short. evidenceQuote is "" — or quote the counter-productive line — and the note gives a concrete phrase that would have been a hit.
- "not_applicable": ONLY when the character ended the conversation before this move could reasonably come up through no fault of the student's process. Never use it to excuse a skipped move.
- timecodeSeconds: the [m:ss] stamp of the transcript line holding the quote, converted to total seconds (minutes × 60 + seconds: [1:25] → 85, NOT 125; [3:05] → 185, NOT 305); null when there is no quote.
- note: ONE short sentence (under 35 words) of coaching addressed to the student ("you"). For a hit, say what made it work. For partly, say what would have made it a hit. For a miss, give a concrete phrase they could have used at that point in THIS conversation, built only from facts in the scenario or the transcript — never invent events, numbers or names.

These moves also inform the scores above — use the same evidence, do not contradict it: facts and the concern feed clarity; common ground and inquiry feed empathy; a next step feeds objective_achieved. The report shows this checklist on its own, so do NOT repeat the five moves as strengths or growth areas — use those for everything else (tone, holding the line, how you handled pushback, pacing, word choice).

- ${CONVERSATION_STEPS_OUTCOME_KEY}: a STRING containing a JSON array with exactly one object per move, in the order above: [{"key": "${framework.steps[0]?.key ?? ""}", "status": "hit" | "partly" | "missed" | "not_applicable", "evidenceQuote": string, "timecodeSeconds": number | null, "note": string}, ...]. Never a raw JSON array value.`;
}
