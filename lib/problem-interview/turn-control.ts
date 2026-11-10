/**
 * Turn-marker parsing for problem interviews.
 *
 * Same `<interview-turn ... />` grammar as `lib/interview/turn-control.ts`,
 * extended with the two kinds declared in `PROBLEM_TURN_KINDS`:
 *
 *   <interview-turn kind="nudge" step="identify_customer" />
 *   <interview-turn kind="exhibit" exhibit="ex1" />
 *
 * A problem reply may carry several markers (hand over an exhibit AND keep
 * probing), so unlike the five-stage interview parser this one reads every
 * marker, not only the trailing one. Every marker — well-formed, malformed, or
 * truncated at the token cap — is stripped before the text can reach the
 * avatar's voice, the transcript, or the next turn's history.
 *
 * Pure. Ids are NOT validated here; `reduceProblemTurn` drops unknown ones.
 */

import type { ProblemTurnAction } from "./session-state";

/**
 * Is the candidate's latest message a request for thinking time, rather than
 * an attempt at the current step?
 *
 * The live interviewer is told never to nudge a candidate who is thinking, and
 * it ignored that instruction in 6 of 6 case probe runs (and 5 of 6 before the
 * fac1cff hardening): "give me a second to think" was answered with the
 * `restate_prompt` nudge, which costs the candidate a `hit` they had done
 * nothing to lose. Three rounds of prompt wording did not move it.
 *
 * So the server decides instead. `buildProblemProgressBlock` injects the exact
 * nudge texts each turn and the model is forbidden to write its own, so
 * withholding the list makes the nudge unreachable rather than merely
 * discouraged — the same shape as `isInterviewIntegrityRequest`.
 *
 * Deliberately narrow: an explicit ask for time, or a bare filler turn. A
 * message that asks for time AND takes a run at the problem ("give me a sec —
 * so revenue is price times volume…") is a real attempt, so a nudge for a step
 * they then skipped stays available.
 */
export function isThinkingTimeRequest(message: string): boolean {
  const value = message.toLowerCase().trim();
  if (!value) return true;
  // Strip filler so "um, give me one second, okay" reads as the bare ask.
  const core = value
    .replace(/\b(?:um+|uh+|er+|hmm+|okay|ok|so|well|right|alright|sure|yeah|please|thanks?)\b/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!core) return true;
  const ASKS_FOR_TIME = [
    /\b(?:give|gimme)\b.{0,12}\b(?:a|one|1)?\s*(?:sec|secs|second|seconds|min|minute|minutes|moment|bit)\b/,
    /\b(?:let me|lemme|i'?ll|i am going to|im going to|i'?m gonna|i'?m going to|gonna|going to)\b.{0,16}\b(?:think|structure|organi[sz]e|collect|gather|jot|write|sketch|lay out|map out|work through)\b/,
    /\b(?:can|could|may)\b.{0,12}\b i\b.{0,24}\b(?:have|take|get)\b.{0,16}\b(?:sec|second|minute|moment|time|bit)\b/,
    /\b(?:one|just a|hold on|hang on|bear with me|give me)\b.{0,12}\b(?:sec|second|moment|minute)?\b\s*$/,
    /\b(?:take|taking|need|needing|want)\b.{0,16}\b(?:a|some)?\s*(?:sec|second|seconds|minute|minutes|moment|time)\b.{0,16}\b(?:think|structure|process)?\b/,
    /\b(?:thinking|still thinking|just thinking|let me think|structuring|writing this down|noting this down)\b/,
    /^\s*(?:pause|silence|thinking)\s*$/,
  ];
  if (!ASKS_FOR_TIME.some((pattern) => pattern.test(core))) return false;
  // An ask for time that also carries substantive content is an attempt: the
  // candidate is thinking OUT LOUD, which is exactly what we want graded.
  // "give me a second to think" is 6 words of pure ask; a real attempt runs on.
  return core.split(/\s+/).length <= 14;
}

const MARKER = /<interview-turn\b([^>]*?)\/?>/gi;
/** A marker cut off by the token cap: `<interview-turn kind="exh` at the end. */
const TRUNCATED_MARKER = /<interview-turn\b[^>]*$/i;
const ATTRIBUTE = /\b(kind|step|exhibit|category)=(?:"([^"]*)"|'([^']*)')/gi;

export interface ParsedProblemTurn {
  /** Spoken / displayed text with every marker removed. */
  content: string;
  actions: ProblemTurnAction[];
  /**
   * True when no stage marker (`planned` / `follow_up` / `closing`) was found
   * or a marker could not be read. Diagnostic only; never blocks the turn.
   */
  malformed: boolean;
}

export function parseProblemTurn(response: string): ParsedProblemTurn {
  const actions: ProblemTurnAction[] = [];
  let malformed = false;

  for (const match of response.matchAll(MARKER)) {
    const attributes: Record<string, string> = {};
    for (const attr of match[1].matchAll(ATTRIBUTE)) {
      attributes[attr[1].toLowerCase()] = (attr[2] ?? attr[3] ?? "").trim();
    }
    const kind = attributes.kind;
    if (kind === "planned" || kind === "follow_up" || kind === "closing") {
      actions.push({ kind });
    } else if (kind === "recovery") {
      // The five-stage interview's recovery kind: in a problem interview it is
      // just another probing turn.
      actions.push({ kind: "follow_up" });
    } else if (kind === "nudge" && attributes.step) {
      actions.push({ kind: "nudge", step: attributes.step });
    } else if (kind === "exhibit" && attributes.exhibit) {
      actions.push({ kind: "exhibit", exhibit: attributes.exhibit });
    } else {
      malformed = true;
    }
  }

  const content = response
    .replace(MARKER, "")
    .replace(TRUNCATED_MARKER, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  const hasStageAction = actions.some(
    (action) =>
      action.kind === "planned" ||
      action.kind === "follow_up" ||
      action.kind === "closing",
  );

  return { content, actions, malformed: malformed || !hasStageAction };
}
