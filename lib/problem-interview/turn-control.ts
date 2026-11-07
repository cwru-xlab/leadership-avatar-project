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
