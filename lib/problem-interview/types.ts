/**
 * Problem-solving interviews — the shared contract for the consulting case
 * interview and the product-management interview.
 *
 * Both are "one hard problem, worked out loud" interviews: a short fit
 * question, then a single prompt the candidate must structure and solve while
 * the interviewer answers clarifying questions, hands over data, and probes.
 * What a real interviewer grades is the PROCESS (did they clarify, structure,
 * prioritize, quantify, synthesize) as much as the answer, so each question
 * names a framework whose steps the report checks one by one.
 *
 * Content (question banks, frameworks, exhibits) lives in
 * `lib/case-interview/` and `lib/pm-interview/`. The machinery that runs a
 * session and renders the report lives beside this file. Neither side may
 * redefine these shapes; extend them here.
 */

/**
 * How a candidate handled one framework step.
 *
 * - `hit`: did it unprompted.
 * - `prompted`: only did it after the interviewer's neutral nudge.
 * - `missed`: never did it, nudged or not.
 * - `not_applicable`: the session ended before the step could be reached
 *   through no fault of the candidate's process (e.g. the interviewer ran out
 *   of time). Never use it to excuse a skipped step.
 *
 * Prompted and missed steps lower the `process_rigor` score (user decision
 * 2026-11-06); the scoring guide in `PROCESS_RIGOR_SCORING_GUIDE` is the one
 * place that rule is written down.
 */
export const PROCESS_STEP_STATUSES = [
  "hit",
  "prompted",
  "missed",
  "not_applicable",
] as const;

export type ProcessStepStatus = (typeof PROCESS_STEP_STATUSES)[number];

/** One step of a named method such as CIRCLE or a case-interview flow. */
export interface ProcessStepDef {
  /** Stable key, persisted in reports. Lowercase snake_case. */
  key: string;
  /** Short label shown on the report, e.g. "Identify the customer". */
  label: string;
  /** One sentence: what the step is for. Shown on the report on expand. */
  description: string;
  /** What counts as `hit`, written for the evaluator. */
  evidenceCriteria: string;
  /**
   * The neutral question a real interviewer might ask when the candidate
   * skips this step. Must not name the step, the framework, or the answer
   * (e.g. "Who do you see using this?" — never "Remember to identify the
   * customer").
   */
  nudge: string;
  /**
   * Optional: terms that, as the substance of a quote, are a non-answer for
   * this step (e.g. "everyone" for identifying a customer). A hit/prompted
   * whose evidence rests on one, with no sign of a choice, is reconciled to
   * `missed` server-side (`finalizeProblemOutcome`).
   */
  genericAnswerTerms?: string[];
}

export interface ProcessFramework {
  /** Stable key, e.g. "circle", "case-business", "metrics". */
  key: string;
  /** Display name, e.g. "CIRCLE method". */
  label: string;
  /** Where the method comes from, for the report's "why these steps" text. */
  source: string;
  steps: ProcessStepDef[];
}

/** A data exhibit the interviewer reveals mid-case (user decision: on-screen). */
export interface Exhibit {
  /** Unique within its question, e.g. "ex1". Used in the reveal marker. */
  id: string;
  title: string;
  kind: "table" | "bar";
  /** Units / footnote line under the exhibit, e.g. "Revenue, $M, FY2023". */
  caption?: string;
  /** Table: header row. Bar: [category label, value label]. */
  columns: string[];
  /** Table rows, or for `bar` one [label, number] pair per bar. */
  rows: (string | number)[][];
  /**
   * When the interviewer should reveal it, written for the live model, e.g.
   * "after the candidate asks about costs or lays out a profitability tree".
   */
  revealWhen: string;
  /** What a strong candidate reads from it. Evaluator only; never shown live. */
  keyInsight: string;
}

export interface ProblemQuestion {
  /** Stable id persisted on the report, e.g. "case-airline-cle-nyc". */
  id: string;
  /** Question family, e.g. "business-scenario", "guesstimate", "product-design". */
  family: string;
  /** Key of the `ProcessFramework` the report grades against. */
  frameworkKey: string;
  /** Short title for the report header, e.g. "Cleveland–New York route". */
  title: string;
  /** What the interviewer says to pose the problem. Deliberately abstract for PM. */
  prompt: string;
  /**
   * Facts the interviewer may give ONLY when the candidate asks for them
   * (clarifying answers, numbers). Hidden from the candidate until asked.
   */
  interviewerFacts: string[];
  exhibits?: Exhibit[];
  /**
   * What a strong answer reaches (benchmark estimate, recommendation, key
   * tradeoff). Evaluator only. Graded as a reference, not an answer key: a
   * well-reasoned different conclusion can still score well.
   */
  strongAnswerNotes: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  /** Provenance: the public source the question is modeled on. */
  source: string;
}

/** The evaluator's verdict on one step. Stored in the report's outcome. */
export interface ProcessStepResult {
  key: string;
  status: ProcessStepStatus;
  /** Verbatim candidate words that show the step, or "" when missed. */
  evidenceQuote: string;
  /** Seconds from session start of the evidence, or null. */
  timecodeSeconds: number | null;
  /** One sentence of coaching for this step. */
  note: string;
}

/**
 * Outcome fields every problem-interview type declares. Outcome fields are
 * scalars, so `processSteps` holds a JSON-encoded `ProcessStepResult[]` (the
 * same trick the difficult-conversation `reactionCauses` field uses).
 * The report narrows them defensively; a malformed value renders as absent.
 */
export const PROBLEM_OUTCOME_FIELD_KEYS = {
  questionId: "questionId",
  frameworkKey: "frameworkKey",
  processSteps: "processSteps",
} as const;

/** The rubric dimension both types add for the process itself. */
export const PROCESS_RIGOR_DIMENSION = {
  key: "process_rigor",
  label: "Process & structure",
  description:
    "Whether the candidate worked through every step of the method — unprompted — before landing an answer.",
} as const;

/**
 * The one statement of how step results bound `process_rigor_score`.
 * Given verbatim to every problem-interview evaluator.
 */
export const PROCESS_RIGOR_SCORING_GUIDE = `
process_rigor_score follows the step results, counting only applicable steps:
- 5: every step hit unprompted, in a sensible order.
- 4: at most one step prompted, none missed.
- 3: two prompted steps, or exactly one missed step.
- 2: two missed steps, or three or more prompted.
- 1: three or more missed steps, or the candidate jumped straight to an answer with no visible process.
Use the LOWER score when two bands apply. Do not raise it for a good final answer; that belongs to the other dimensions.
`.trim();

/**
 * `PROCESS_RIGOR_SCORING_GUIDE`'s bands, in code. The evaluator is given the
 * guide, but a validity study (3 runs × 7 PM fixtures, gpt-4.1) found its
 * `process_rigor_score` disagreeing with its OWN step results in every run
 * for several fixtures — so for problem interviews the stored score is
 * derived from the steps (see `lib/engine/evaluation-runner.ts`).
 *
 * Counts applicable steps only (`not_applicable` ignored); the lower band
 * wins when two apply. The guide's "jumped straight to an answer" clause
 * already lands in band 1 or 2 through the missed-step counts. Null when
 * there are no applicable steps.
 */
export function deriveProcessRigorScore(steps: ProcessStepResult[]): number | null {
  const applicable = steps.filter((step) => step.status !== "not_applicable");
  if (applicable.length === 0) return null;
  const prompted = applicable.filter((step) => step.status === "prompted").length;
  const missed = applicable.filter((step) => step.status === "missed").length;
  if (missed >= 3) return 1;
  if (missed === 2 || prompted >= 3) return 2;
  if (missed === 1 || prompted === 2) return 3;
  if (prompted === 1) return 4;
  return 5;
}

/**
 * Live turn-control markers added for problem interviews, on top of the
 * existing `<interview-turn kind=... />` grammar:
 *
 *   <interview-turn kind="nudge" step="identify_customer" />
 *     the reply contains the step's neutral nudge (lets the session record
 *     that the step was prompted, independent of the evaluator).
 *   <interview-turn kind="exhibit" exhibit="ex1" />
 *     the reply hands over that exhibit; the client shows it on screen.
 *
 * Markers are stripped before speech and history like the existing ones.
 */
export const PROBLEM_TURN_KINDS = ["nudge", "exhibit"] as const;
