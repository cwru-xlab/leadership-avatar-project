import {
  BEHAVIORAL_CATEGORIES,
  type BehavioralCategory,
  type InterviewProgress,
} from "./types";

export type InterviewTurnKind = "planned" | "follow_up" | "recovery" | "closing";

export interface InterviewTurnAction {
  kind: InterviewTurnKind;
  category?: BehavioralCategory;
}

export interface ParsedInterviewTurn {
  content: string;
  action: InterviewTurnAction | null;
  malformed: boolean;
}

interface ProgressOptions {
  hasResume: boolean;
  targetQuestionCount: number;
}

const TURN_MARKER = /\s*<interview-turn\b([^>]*)\/?>(?:\s*)$/i;
const ATTRIBUTE = /\b(kind|category)=(?:"([^"]*)"|'([^']*)')/gi;

function isBehavioralCategory(value: string | undefined): value is BehavioralCategory {
  return Boolean(value) && BEHAVIORAL_CATEGORIES.includes(value as BehavioralCategory);
}

function isTurnKind(value: string | undefined): value is InterviewTurnKind {
  return value === "planned" || value === "follow_up" || value === "recovery" || value === "closing";
}

/**
 * Removes the model's final controller marker before content reaches the UI,
 * transcript, or avatar. A malformed final marker is removed too, but it never
 * changes progress.
 */
export function parseInterviewTurn(response: string): ParsedInterviewTurn {
  const marker = response.match(TURN_MARKER);
  if (!marker) {
    if (/<interview-turn\b[^>]*\/?>/i.test(response)) {
      return {
        content: response.replace(/<interview-turn\b[^>]*\/?>/gi, "").trim(),
        action: null,
        malformed: true,
      };
    }
    // No marker at all. Previously reported as well-formed, which made it the
    // ONLY failure mode that logged nothing anywhere — and it is the most
    // common one, since a reply truncated at the token cap loses its trailing
    // marker line. Progress silently stopped advancing with no diagnostic.
    return { content: response.trim(), action: null, malformed: true };
  }

  const attributes: Record<string, string> = {};
  for (const match of marker[1].matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }

  // Strip every marker, not only the trailing one. Slicing at `marker.index`
  // alone left an earlier marker embedded in `content` whenever the model
  // emitted two — and `content` is spoken aloud by the avatar and written to
  // the transcript, so controller metadata leaked into both.
  const content = response
    .slice(0, marker.index)
    .replace(/<interview-turn\b[^>]*\/?>/gi, "")
    .trim();
  const kind = attributes.kind;
  const category = attributes.category;
  const categoryRequired = kind === "recovery";
  const invalidCategory = category !== undefined && !isBehavioralCategory(category);

  if (!content || !isTurnKind(kind) || invalidCategory || (categoryRequired && !isBehavioralCategory(category))) {
    return { content, action: null, malformed: true };
  }

  return {
    content,
    action: isBehavioralCategory(category) ? { kind, category } : { kind },
    malformed: false,
  };
}

/**
 * Deliberately narrow: normal interview content about feedback, job duties, or
 * difficult conversations must not be mistaken for an attempt to control the interviewer.
 */
export function isInterviewIntegrityRequest(message: string): boolean {
  const value = message.toLowerCase();
  return [
    /\b(?:ignore|disregard|override|forget)\b.{0,40}\b(?:previous|prior|earlier|system|your)\b.{0,32}\b(?:instruction|rule|prompt)/,
    /\b(?:reveal|show|give|print|summari[sz]e)\b.{0,40}\b(?:system prompt|hidden instruction|developer message|internal rule|grading rubric|evaluation rubric)/,
    /\b(?:what|which)\b.{0,24}\b(?:model|assistant|ai)\b.{0,24}\b(?:are you|is this|are we using)/,
    /\b(?:you are now|pretend to be|act as|roleplay as)\b.{0,48}\b(?:assistant|system|different|another)/,
  ].some((pattern) => pattern.test(value));
}

function nextPlannedProgress(
  previous: InterviewProgress,
  action: InterviewTurnAction,
  { hasResume, targetQuestionCount }: ProgressOptions
): InterviewProgress {
  const next: InterviewProgress = {
    ...previous,
    categoriesCovered: [...previous.categoriesCovered],
    dodgedCategories: [...previous.dodgedCategories],
    followUpsUsed: 0,
  };
  const resumeQuestionCap = hasResume ? Math.max(1, Math.round(targetQuestionCount / 3)) : 0;
  const behavioralCategoryQuota = Math.min(
    BEHAVIORAL_CATEGORIES.length,
    Math.max(2, Math.round(targetQuestionCount / 3))
  );

  if (previous.stage === "opening") {
    next.questionsAsked += 1;
    next.stage = hasResume ? "resume" : "behavioral";
    return next;
  }

  if (previous.stage === "resume") {
    next.questionsAsked += 1;
    if (next.questionsAsked >= resumeQuestionCap) next.stage = "behavioral";
    return next;
  }

  if (previous.stage === "behavioral") {
    // An uncategorised behavioral turn used to `return previous` — discarding
    // the whole update. That was a deadlock, not a guard: with no resume the
    // stage goes opening -> behavioral immediately, so the SECOND question is
    // already behavioral, and the prompt lists the bare
    // `<interview-turn kind="planned" />` first. A model emitting it had its
    // progress dropped, the stage never advanced, so the next turn was
    // behavioral too — forever, with the counter pinned at 1 and the progress
    // note giving the model no reason to change what it emitted.
    //
    // The guard's real intent is narrower than what it did: never mark an
    // UNRELATED category as covered on a malformed reply. That is preserved
    // below — an uncategorised turn simply covers no category. What it no
    // longer does is pretend the question was never asked.
    if (action.category && !next.categoriesCovered.includes(action.category)) {
      next.categoriesCovered.push(action.category);
    }
    next.questionsAsked += 1;
    next.behavioralQuestionsAsked = (previous.behavioralQuestionsAsked ?? 0) + 1;

    // Two independent ways out, because the first one depends on the model
    // labelling its markers and the whole point of this block is that it
    // sometimes does not.
    const quotaMet = next.categoriesCovered.length >= behavioralCategoryQuota;
    const askedEnough = next.behavioralQuestionsAsked >= behavioralCategoryQuota;
    if (quotaMet || askedEnough) next.stage = "role_specific";
    return next;
  }

  if (previous.stage === "role_specific") {
    next.questionsAsked += 1;
    next.stage = "closing";
    return next;
  }

  return next;
}

/** Updates persisted progress only from a validated, hidden turn action. */
export function reduceInterviewProgress(
  previous: InterviewProgress,
  action: InterviewTurnAction | null,
  options: ProgressOptions
): InterviewProgress {
  if (!action) return previous;

  if (action.kind === "planned") {
    return nextPlannedProgress(previous, action, options);
  }

  if (action.kind === "follow_up") {
    if (previous.followUpsUsed >= 1) return previous;
    const latestCategory = previous.categoriesCovered.at(-1);
    const dodgedCategories =
      previous.stage === "behavioral" && latestCategory && !previous.dodgedCategories.includes(latestCategory)
        ? [...previous.dodgedCategories, latestCategory]
        : [...previous.dodgedCategories];
    return { ...previous, dodgedCategories, followUpsUsed: 1 };
  }

  if (action.kind === "recovery") {
    return {
      ...previous,
      dodgedCategories: action.category
        ? previous.dodgedCategories.filter((category) => category !== action.category)
        : previous.dodgedCategories,
      followUpsUsed: 0,
    };
  }

  return { ...previous, stage: "closing", followUpsUsed: 0 };
}
