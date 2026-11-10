/**
 * Problem-interview session state — the server-owned record of where a
 * problem interview has got to and what the interviewer did.
 *
 * Lives on the report's `inputSnapshot.problem` (an interview snapshot, see
 * `lib/report/snapshot.ts`). The chosen question is pinned there at session
 * start; the stage, revealed exhibits and nudged steps are rewritten by the
 * chat route after every assistant turn, from the turn markers the model
 * emitted. Nothing here is client-authored: the browser only ever receives a
 * public projection of it.
 *
 * Why the snapshot rather than a new column: the interview snapshot already
 * travels to the evaluator and (narrowed) to the report page, and a nullable
 * JSON column would force a migration the report read path must survive
 * (see `REPORT_DTO_SELECT`). The events list is append-only and small (one
 * entry per stage change, nudge or exhibit).
 *
 * Pure: no I/O, no clock. Callers pass `atSeconds` / `turnIndex`.
 */

import type {
  Exhibit,
  ProblemQuestion,
  ProcessFramework,
} from "./types";

/**
 * The five stages of a problem interview, in order. Fixed — they are the
 * shape of a real case / product interview, not a per-type choice.
 */
export const PROBLEM_INTERVIEW_STAGES = [
  "opening",
  "fit",
  "problem",
  "candidate_questions",
  "closing",
] as const;

export type ProblemInterviewStage = (typeof PROBLEM_INTERVIEW_STAGES)[number];

export interface ProblemInterviewState {
  stage: ProblemInterviewStage;
  /** Follow-ups spent on the fit question. Capped at 1. */
  fitFollowUpsUsed: number;
  /** True once the interviewer has posed the problem prompt. */
  promptPosed: boolean;
  /** Exhibit ids handed over so far, in reveal order. */
  revealedExhibits: string[];
  /** Framework step keys the interviewer has nudged (at most once each). */
  nudgedSteps: string[];
  /**
   * `turnIndex` of the most recent turn that nudged, or null if none has.
   *
   * Exists to space nudges OUT, which `nudgedSteps` cannot do: that list only
   * stops the SAME step being nudged twice, so an interviewer could still fire
   * three different steps on three consecutive turns. A real PM estimation
   * session did exactly that — "What exactly are we counting here?", then
   * "How are you going to break that down?", then "Where does that number
   * come from?" — because `buildProblemProgressBlock` offered every
   * un-nudged step's text on every turn and the candidate's answers did not
   * tick the rubric's boxes fast enough.
   *
   * Read by `buildProblemProgressBlock` to withhold the nudge list for
   * `NUDGE_COOLDOWN_TURNS` after a nudge. Recording is NOT gated on it: if
   * the model nudges anyway, that is still ground truth the evaluator must
   * see, so `reduceProblemTurn` records it and merely restarts the cooldown.
   */
  lastNudgedTurnIndex: number | null;
}

/**
 * How many assistant turns must pass after a nudge before the nudge list is
 * offered again. 1 = never two nudge-eligible turns back to back, which is
 * the observed defect; the candidate gets at least one turn to respond to a
 * redirect before being redirected again.
 *
 * Deliberately not tunable per type: the defect is a property of the prompt
 * assembly, not of a particular framework.
 */
export const NUDGE_COOLDOWN_TURNS = 1;

/** An exhibit as the candidate sees it: no reveal rule, no key insight. */
export type PublicExhibit = Pick<
  Exhibit,
  "id" | "title" | "kind" | "caption" | "columns" | "rows"
>;

/** The parts of a question the candidate may read once it is posed. */
export type PublicProblemQuestion = Pick<
  ProblemQuestion,
  "id" | "title" | "prompt" | "family" | "difficulty" | "source"
>;

/** A framework as the report shows it: no evidence criteria, no nudges. */
export interface PublicProcessFramework {
  key: string;
  label: string;
  source: string;
  steps: Array<{ key: string; label: string; description: string }>;
}

/** One server-recorded interviewer event. Ground truth for the evaluator. */
export type ProblemInterviewEvent =
  | {
      kind: "stage";
      stage: ProblemInterviewStage;
      atSeconds: number;
      turnIndex: number;
    }
  | { kind: "nudge"; step: string; atSeconds: number; turnIndex: number }
  | {
      kind: "exhibit";
      exhibitId: string;
      /** Copied at reveal time so the report survives later bank edits. */
      exhibit: PublicExhibit;
      atSeconds: number;
      turnIndex: number;
    };

/** `InterviewInputSnapshot.problem`. Absent on every non-problem interview. */
export interface ProblemSessionSnapshot {
  version: 1;
  questionId: string;
  frameworkKey: string;
  selectedAt: string;
  question: PublicProblemQuestion;
  framework: PublicProcessFramework;
  state: ProblemInterviewState;
  events: ProblemInterviewEvent[];
}

export function initialProblemState(): ProblemInterviewState {
  return {
    stage: "opening",
    fitFollowUpsUsed: 0,
    promptPosed: false,
    revealedExhibits: [],
    nudgedSteps: [],
    lastNudgedTurnIndex: null,
  };
}

export function toPublicExhibit(exhibit: Exhibit): PublicExhibit {
  return {
    id: exhibit.id,
    title: exhibit.title,
    kind: exhibit.kind,
    ...(exhibit.caption ? { caption: exhibit.caption } : {}),
    columns: [...exhibit.columns],
    rows: exhibit.rows.map((row) => [...row]),
  };
}

export function toPublicQuestion(question: ProblemQuestion): PublicProblemQuestion {
  return {
    id: question.id,
    title: question.title,
    prompt: question.prompt,
    family: question.family,
    difficulty: question.difficulty,
    source: question.source,
  };
}

export function toPublicFramework(
  framework: ProcessFramework,
): PublicProcessFramework {
  return {
    key: framework.key,
    label: framework.label,
    source: framework.source,
    steps: framework.steps.map((step) => ({
      key: step.key,
      label: step.label,
      description: step.description,
    })),
  };
}

/** Build the snapshot pinned at session start. */
export function buildProblemSessionSnapshot(
  question: ProblemQuestion,
  framework: ProcessFramework,
  selectedAt: string,
): ProblemSessionSnapshot {
  return {
    version: 1,
    questionId: question.id,
    frameworkKey: framework.key,
    selectedAt,
    question: toPublicQuestion(question),
    framework: toPublicFramework(framework),
    state: initialProblemState(),
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** One parsed controller action. See `./turn-control`. */
export type ProblemTurnAction =
  | { kind: "planned" }
  | { kind: "follow_up" }
  | { kind: "closing" }
  | { kind: "nudge"; step: string }
  | { kind: "exhibit"; exhibit: string }
  /** Server-inferred only (never a model marker): the reply posed the problem. */
  | { kind: "posed" };

export interface ReduceProblemTurnInput {
  question: ProblemQuestion;
  framework: ProcessFramework;
  atSeconds: number;
  turnIndex: number;
}

export interface ReduceProblemTurnResult {
  state: ProblemInterviewState;
  /** Only the events THIS turn produced. Append to the stored list. */
  events: ProblemInterviewEvent[];
}

const NEXT_STAGE_ON_PLANNED: Record<ProblemInterviewStage, ProblemInterviewStage> = {
  opening: "fit",
  fit: "problem",
  problem: "candidate_questions",
  candidate_questions: "candidate_questions",
  closing: "closing",
};

function stageIndex(stage: ProblemInterviewStage): number {
  return PROBLEM_INTERVIEW_STAGES.indexOf(stage);
}

/**
 * Applies one assistant turn's actions. Unknown step / exhibit ids are
 * dropped (the model may not invent either), a step is nudged at most once,
 * an exhibit is revealed at most once, and the stage never moves backwards.
 *
 * Self-healing: a nudge or exhibit before the problem stage proves the
 * problem was posed even if the model mislabeled the posing turn, so the
 * stage jumps forward to `problem` rather than leaving the tail block telling
 * the model it is still on the fit question.
 */
export function reduceProblemTurn(
  previous: ProblemInterviewState,
  actions: ProblemTurnAction[],
  { question, framework, atSeconds, turnIndex }: ReduceProblemTurnInput,
): ReduceProblemTurnResult {
  const state: ProblemInterviewState = {
    ...previous,
    revealedExhibits: [...previous.revealedExhibits],
    nudgedSteps: [...previous.nudgedSteps],
  };
  const events: ProblemInterviewEvent[] = [];
  const stepKeys = new Set(framework.steps.map((step) => step.key));
  const exhibitsById = new Map(
    (question.exhibits ?? []).map((exhibit) => [exhibit.id, exhibit]),
  );

  const moveTo = (stage: ProblemInterviewStage) => {
    if (stageIndex(stage) <= stageIndex(state.stage)) return;
    state.stage = stage;
    if (stageIndex(stage) >= stageIndex("problem")) state.promptPosed = true;
    events.push({ kind: "stage", stage, atSeconds, turnIndex });
  };

  // Content actions first, so the self-heal lands before the stage action.
  for (const action of actions) {
    if (action.kind === "nudge") {
      if (!stepKeys.has(action.step) || state.nudgedSteps.includes(action.step)) {
        continue;
      }
      moveTo("problem");
      state.nudgedSteps.push(action.step);
      // Always recorded, even if this turn should not have nudged: a nudge the
      // model fired anyway is ground truth the evaluator grades against, and
      // suppressing the record would hide it. Recording restarts the cooldown.
      state.lastNudgedTurnIndex = turnIndex;
      events.push({ kind: "nudge", step: action.step, atSeconds, turnIndex });
    } else if (action.kind === "exhibit") {
      const exhibit = exhibitsById.get(action.exhibit);
      if (!exhibit || state.revealedExhibits.includes(exhibit.id)) continue;
      moveTo("problem");
      state.revealedExhibits.push(exhibit.id);
      events.push({
        kind: "exhibit",
        exhibitId: exhibit.id,
        exhibit: toPublicExhibit(exhibit),
        atSeconds,
        turnIndex,
      });
    }
  }

  // At most one stage action counts per turn: the last one emitted.
  const stageAction = [...actions]
    .reverse()
    .find(
      (action) =>
        action.kind === "planned" ||
        action.kind === "follow_up" ||
        action.kind === "closing",
    );

  if (stageAction?.kind === "planned") {
    moveTo(NEXT_STAGE_ON_PLANNED[state.stage]);
  } else if (stageAction?.kind === "follow_up") {
    if (state.stage === "fit") {
      state.fitFollowUpsUsed = Math.min(1, state.fitFollowUpsUsed + 1);
    }
  } else if (stageAction?.kind === "closing") {
    moveTo("closing");
  }

  if (actions.some((action) => action.kind === "posed")) moveTo("problem");

  return { state, events };
}

// ---------------------------------------------------------------------------
// Defensive narrowing (report + chat route read this from stored JSON)
// ---------------------------------------------------------------------------

function isStage(value: unknown): value is ProblemInterviewStage {
  return (
    typeof value === "string" &&
    (PROBLEM_INTERVIEW_STAGES as readonly string[]).includes(value)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPublicExhibit(value: unknown): PublicExhibit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.title !== "string" ||
    (v.kind !== "table" && v.kind !== "bar") ||
    !Array.isArray(v.columns) ||
    !Array.isArray(v.rows)
  ) {
    return null;
  }
  const rows = v.rows
    .filter(Array.isArray)
    .map((row) =>
      (row as unknown[]).filter(
        (cell): cell is string | number =>
          typeof cell === "string" ||
          (typeof cell === "number" && Number.isFinite(cell)),
      ),
    );
  return {
    id: v.id,
    title: v.title,
    kind: v.kind,
    ...(typeof v.caption === "string" && v.caption ? { caption: v.caption } : {}),
    columns: stringArray(v.columns),
    rows,
  };
}

function asEvent(value: unknown): ProblemInterviewEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const atSeconds = finiteNumber(v.atSeconds);
  const turnIndex = finiteNumber(v.turnIndex);
  if (atSeconds === null || turnIndex === null) return null;
  if (v.kind === "stage" && isStage(v.stage)) {
    return { kind: "stage", stage: v.stage, atSeconds, turnIndex };
  }
  if (v.kind === "nudge" && typeof v.step === "string") {
    return { kind: "nudge", step: v.step, atSeconds, turnIndex };
  }
  if (v.kind === "exhibit" && typeof v.exhibitId === "string") {
    const exhibit = asPublicExhibit(v.exhibit);
    if (!exhibit) return null;
    return { kind: "exhibit", exhibitId: v.exhibitId, exhibit, atSeconds, turnIndex };
  }
  return null;
}

function asState(value: unknown): ProblemInterviewState {
  const fallback = initialProblemState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  return {
    stage: isStage(v.stage) ? v.stage : fallback.stage,
    fitFollowUpsUsed: Math.max(0, Math.min(1, finiteNumber(v.fitFollowUpsUsed) ?? 0)),
    promptPosed: v.promptPosed === true,
    revealedExhibits: stringArray(v.revealedExhibits),
    nudgedSteps: stringArray(v.nudgedSteps),
    // Sessions that started before this field existed have no value. null
    // (not 0) is the honest reading: 0 would claim a nudge happened on turn 0
    // and suppress the next turn's list for no reason.
    lastNudgedTurnIndex: finiteNumber(v.lastNudgedTurnIndex),
  };
}

/**
 * Narrow an unknown value (the stored `inputSnapshot.problem`) into a
 * `ProblemSessionSnapshot`. Malformed → null; never throws. Missing pieces of
 * an otherwise identifiable snapshot degrade (empty events, initial state)
 * rather than hiding the whole problem section.
 */
export function asProblemSessionSnapshot(
  value: unknown,
): ProblemSessionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.questionId !== "string" || typeof v.frameworkKey !== "string") {
    return null;
  }
  const q =
    v.question && typeof v.question === "object" && !Array.isArray(v.question)
      ? (v.question as Record<string, unknown>)
      : null;
  const f =
    v.framework && typeof v.framework === "object" && !Array.isArray(v.framework)
      ? (v.framework as Record<string, unknown>)
      : null;
  if (!q || typeof q.title !== "string" || typeof q.prompt !== "string") {
    return null;
  }
  const difficulty =
    q.difficulty === "Beginner" ||
    q.difficulty === "Intermediate" ||
    q.difficulty === "Advanced"
      ? q.difficulty
      : "Intermediate";
  const steps = Array.isArray(f?.steps)
    ? (f!.steps as unknown[]).flatMap((step) => {
        if (!step || typeof step !== "object") return [];
        const s = step as Record<string, unknown>;
        return typeof s.key === "string" && typeof s.label === "string"
          ? [
              {
                key: s.key,
                label: s.label,
                description: typeof s.description === "string" ? s.description : "",
              },
            ]
          : [];
      })
    : [];
  return {
    version: 1,
    questionId: v.questionId,
    frameworkKey: v.frameworkKey,
    selectedAt: typeof v.selectedAt === "string" ? v.selectedAt : "",
    question: {
      id: v.questionId,
      title: q.title,
      prompt: q.prompt,
      family: typeof q.family === "string" ? q.family : "",
      difficulty,
      source: typeof q.source === "string" ? q.source : "",
    },
    framework: {
      key: typeof f?.key === "string" ? f.key : v.frameworkKey,
      label: typeof f?.label === "string" ? f.label : "",
      source: typeof f?.source === "string" ? f.source : "",
      steps,
    },
    state: asState(v.state),
    events: Array.isArray(v.events)
      ? v.events.map(asEvent).filter((e): e is ProblemInterviewEvent => e !== null)
      : [],
  };
}

/** What the live client needs after a turn: stage, prompt once posed, exhibits. */
export interface ProblemLiveView {
  stage: ProblemInterviewStage;
  /** Present only once the problem has been posed. */
  question: Pick<PublicProblemQuestion, "title" | "prompt"> | null;
  exhibits: PublicExhibit[];
}

export function toProblemLiveView(snapshot: ProblemSessionSnapshot): ProblemLiveView {
  return {
    stage: snapshot.state.stage,
    question: snapshot.state.promptPosed
      ? { title: snapshot.question.title, prompt: snapshot.question.prompt }
      : null,
    exhibits: revealedExhibits(snapshot),
  };
}

/** Revealed exhibits in reveal order, from the event trail. */
export function revealedExhibits(snapshot: ProblemSessionSnapshot): PublicExhibit[] {
  return snapshot.events.flatMap((event) =>
    event.kind === "exhibit" ? [event.exhibit] : [],
  );
}

// ---------------------------------------------------------------------------
// Conservative fallback for dropped markers
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 3);
}

/**
 * Share of a prompt's content words that must reappear in a turn before that
 * turn counts as having said the prompt. One constant for both callers below,
 * so the "has it been posed?" inference and the "is it on screen twice?"
 * question can never answer differently about the same turn.
 */
const PROMPT_OVERLAP = 0.7;

/**
 * Whether `text` says substantially what `prompt` says.
 *
 * WHY THIS IS PUBLIC. The interviewer is told to read the problem out loud
 * verbatim (`prompts.ts`: "read this word for word, once, then stop"), and
 * the same prompt is also published to the live view for the Case materials
 * card. Measured in a live session, that put the whole case on screen TWICE
 * in adjacent blocks — about 120px of a 900px rail spent on words the student
 * was already reading in the transcript. The card can stand down while the
 * turn still carries the text, which needs this comparison in the UI.
 *
 * Word overlap, not substring: the model reads the prompt closely but not
 * always character-for-character, and a near-verbatim reading is still a
 * duplicate to the eye.
 */
export function turnSaysPrompt(prompt: string, text: string): boolean {
  const promptWords = [...new Set(contentWords(prompt))];
  if (promptWords.length < 4) return false;
  const textWords = new Set(contentWords(text));
  const overlap = promptWords.filter((word) => textWords.has(word)).length;
  return overlap / promptWords.length >= PROMPT_OVERLAP;
}

const SCREEN_PHRASE = /\b(on|to|onto) your screen\b|\bputting (up|together)?\s*(some|the|a|this)?\s*(data|numbers|table|chart|exhibit)/i;

/**
 * The model sometimes performs an action but drops its marker (a real-model
 * study saw exhibit markers dropped 2/6 and nudge markers 3/6). This infers
 * the missing action from the reply text — deliberately conservative, so a
 * false positive is rarer than the miss it repairs:
 *
 *  - exhibit: the reply names a pending exhibit's title verbatim, OR says it
 *    is putting something "on your screen" while exactly ONE exhibit is
 *    still pending;
 *  - nudge (problem stage only): the reply contains a not-yet-nudged step's
 *    nudge text verbatim (case/punctuation-insensitive);
 *  - posing the problem (opening/fit only): at least 70% of the prompt's
 *    content words appear in the reply.
 *
 * Returns only actions the explicit markers did not already carry.
 */
export function inferUnmarkedActions(
  reply: string,
  explicit: ProblemTurnAction[],
  state: ProblemInterviewState,
  question: ProblemQuestion,
  framework: ProcessFramework,
): ProblemTurnAction[] {
  const text = normalize(reply);
  if (!text) return [];
  const inferred: ProblemTurnAction[] = [];

  const hasExhibit = explicit.some((action) => action.kind === "exhibit");
  const pending = (question.exhibits ?? []).filter(
    (exhibit) => !state.revealedExhibits.includes(exhibit.id),
  );
  if (!hasExhibit && pending.length > 0) {
    const byTitle = pending.find((exhibit) => {
      const title = normalize(exhibit.title);
      return title.length >= 8 && text.includes(title);
    });
    if (byTitle) {
      inferred.push({ kind: "exhibit", exhibit: byTitle.id });
    } else if (pending.length === 1 && SCREEN_PHRASE.test(reply)) {
      inferred.push({ kind: "exhibit", exhibit: pending[0]!.id });
    }
  }

  const stageAfterPosing =
    state.stage === "problem" || state.promptPosed || inferred.length > 0;
  if (stageAfterPosing) {
    const explicitNudges = new Set(
      explicit.flatMap((action) => (action.kind === "nudge" ? [action.step] : [])),
    );
    for (const step of framework.steps) {
      if (state.nudgedSteps.includes(step.key) || explicitNudges.has(step.key)) continue;
      const nudge = normalize(step.nudge);
      if (nudge.length >= 12 && text.includes(nudge)) {
        inferred.push({ kind: "nudge", step: step.key });
      }
    }
  }

  if ((state.stage === "opening" || state.stage === "fit") && !state.promptPosed) {
    // Same comparison the UI uses to spot a duplicate on screen, via one
    // shared threshold — see `turnSaysPrompt`.
    if (turnSaysPrompt(question.prompt, reply)) inferred.push({ kind: "posed" });
  }

  return inferred;
}
