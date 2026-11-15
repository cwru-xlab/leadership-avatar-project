/**
 * What the technical-coding evaluator is given, and the guards applied to
 * what it returns.
 *
 * Before 2026-11-15 the evaluator saw only the conversation: the final code,
 * the problem, the language and the hints were placed on the evaluation
 * context but never serialized, so `coding_quality` was graded from what the
 * candidate SAID and the model invented test results ("Solution was accepted
 * by the system"). See docs/technical-coding/grading-probe.md.
 *
 * Pure: no I/O. The runner loads the hint rows and the snapshot and passes
 * them in; `lib/engine/evaluation.ts` renders the message and runs the guard.
 */

import { asProcessStepResults } from "@/lib/problem-interview/outcome";
import type { StructuredReport } from "@/lib/report/structured";

import type { TechnicalVisibleTurn } from "./evidence";
import { CODING_STEPS_OUTCOME_KEY, TECHNICAL_CODING_FRAMEWORK } from "./process-framework";
import {
  MAX_TECHNICAL_HINTS,
  TECHNICAL_CODING_LANGUAGE_PROFILE,
  isTechnicalCodingLanguage,
  type TechnicalAssignmentPublic,
  type TechnicalCodingLanguage,
} from "./types";

/** The literal line the evaluator must see. Verified by scripts/verify-technical-evaluator-input.ts. */
export const EXECUTION_NOT_RUN_LINE =
  "Execution: NOT RUN — no test results exist; do not claim any test passed or failed.";

/** One system-issued hint, located in the transcript. */
export interface TechnicalHintEvidence {
  tier: number;
  text: string;
  /** 1-based position in the evaluator transcript; null when not found. */
  turnNumber: number | null;
  /** Seconds from session start, on the transcript's [m:ss] clock. */
  atSeconds: number | null;
}

/** The technical-coding fields the runner adds to the evaluation context. */
export interface TechnicalCodingEvaluationFields {
  kind: "technical-coding";
  assignment: TechnicalAssignmentPublic | null;
  language: TechnicalCodingLanguage | null;
  finalSource: string | null;
  hints: TechnicalHintEvidence[];
  omittedVisibleTurns: number;
}

/**
 * Match each issued hint to the interviewer turn that delivered it. The chat
 * route persists the hint text verbatim as the assistant turn, so an exact
 * content match is reliable; a hint whose turn was dropped by the cap keeps
 * its issue time.
 */
export function locateHintTurns(
  hints: ReadonlyArray<{ tier: number; hintText: string; issuedAt: Date | number }>,
  turns: readonly TechnicalVisibleTurn[],
  startedAt: number,
): TechnicalHintEvidence[] {
  const used = new Set<number>();
  return [...hints]
    .sort((a, b) => Number(a.issuedAt) - Number(b.issuedAt))
    .map((hint) => {
      const index = turns.findIndex(
        (turn, i) => !used.has(i) && turn.role === "assistant" && turn.content.trim() === hint.hintText.trim(),
      );
      if (index !== -1) used.add(index);
      const at = index !== -1 && turns[index]!.timestamp ? turns[index]!.timestamp! : Number(hint.issuedAt);
      return {
        tier: hint.tier,
        text: hint.hintText,
        turnNumber: index === -1 ? null : index + 1,
        atSeconds: Number.isFinite(at) ? Math.max(0, Math.round((at - startedAt) / 1000)) : null,
      };
    });
}

function stamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function fence(source: string, language: TechnicalCodingLanguage | null): string {
  // A source that itself contains ``` must not close the fence early.
  const ticks = source.includes("```") ? "~~~~" : "```";
  return `${ticks}${language ?? ""}\n${source.replace(/\s+$/, "")}\n${ticks}`;
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Narrow the runner-supplied context; unknown shapes degrade to "not recorded". */
export function asTechnicalCodingEvaluationFields(
  context: Record<string, unknown>,
): TechnicalCodingEvaluationFields {
  const assignment =
    context.assignment && typeof context.assignment === "object"
      ? (context.assignment as TechnicalAssignmentPublic)
      : null;
  const hints = Array.isArray(context.hints)
    ? (context.hints as TechnicalHintEvidence[]).filter(
        (hint) => hint && typeof hint.text === "string" && typeof hint.tier === "number",
      )
    : [];
  return {
    kind: "technical-coding",
    assignment,
    language: isTechnicalCodingLanguage(context.language) ? context.language : null,
    finalSource: typeof context.finalSource === "string" && context.finalSource.trim() ? context.finalSource : null,
    hints,
    omittedVisibleTurns:
      typeof context.omittedVisibleTurns === "number" && context.omittedVisibleTurns > 0
        ? context.omittedVisibleTurns
        : 0,
  };
}

/**
 * The evaluator's user message for a coding interview. Replaces the generic
 * interview envelope: a coding grade has no use for `resume_text` or an
 * empty `role_context`, and the job posting is interviewer-only context.
 */
export function buildTechnicalCodingUserMessage(
  transcript: string,
  context: Record<string, unknown>,
  metrics: { visualMetrics: unknown; vocalMetrics: unknown },
): string {
  const fields = asTechnicalCodingEvaluationFields(context);
  const { assignment, language, finalSource, hints } = fields;
  const profile = language ? TECHNICAL_CODING_LANGUAGE_PROFILE[language] : null;
  const sections: string[] = [];

  if (assignment) {
    const lines = [
      "coding_problem:",
      `Title: ${assignment.title}`,
      `Statement: ${assignment.statement}`,
    ];
    if (assignment.constraints.length) {
      lines.push("Constraints:", ...assignment.constraints.map((c) => `- ${c}`));
    }
    if (assignment.examples.length) {
      lines.push(
        "Examples:",
        ...assignment.examples.map(
          (e) => `- input ${e.input} → output ${e.output}${e.explanation ? ` (${e.explanation})` : ""}`,
        ),
      );
    }
    lines.push(`Target complexity: ${assignment.expectedComplexity}`);
    sections.push(lines.join("\n"));
  } else {
    sections.push("coding_problem: (not recorded for this session)");
  }

  sections.push(
    `language: ${profile ? `${profile.label} (${profile.fileName})` : "(not recorded)"}`,
  );

  if (assignment?.publicTests.length) {
    sections.push(
      [
        "visible_example_tests (shown to the candidate, who could run them in the browser; no result was recorded):",
        ...assignment.publicTests.map(
          (t) => `- ${t.label}: input ${json(t.input)} → expected ${json(t.expected)}`,
        ),
      ].join("\n"),
    );
  }

  sections.push(
    finalSource
      ? `final_source (the code in the editor when the session ended — grade coding_quality from this):\n${fence(finalSource, language)}`
      : "final_source: (not recorded)",
  );

  sections.push(
    hints.length
      ? [
          `hints_given (issued by the system when the candidate pressed the hint button; ${hints.length} of ${MAX_TECHNICAL_HINTS} used):`,
          ...hints.map((hint) => {
            const where = [
              hint.atSeconds !== null ? `at [${stamp(hint.atSeconds)}]` : null,
              hint.turnNumber !== null ? `transcript turn ${hint.turnNumber}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return `- Tier ${hint.tier}${where ? ` ${where}` : ""}: ${json(hint.text)}`;
          }),
        ].join("\n")
      : `hints_given: none (0 of ${MAX_TECHNICAL_HINTS} used)`,
  );

  sections.push(EXECUTION_NOT_RUN_LINE);

  if (fields.omittedVisibleTurns > 0) {
    sections.push(
      `transcript_note: ${fields.omittedVisibleTurns} turns from the middle of this long session were dropped for length. The opening and the most recent turns are complete; do not treat the gap as silence.`,
    );
  }

  sections.push(`full_transcript:\n${transcript}`);
  sections.push(
    `visual_metrics: ${metrics.visualMetrics ? JSON.stringify(metrics.visualMetrics) : "null"}\nvocal_metrics: ${metrics.vocalMetrics ? JSON.stringify(metrics.vocalMetrics) : "null"}`,
  );
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Guard: no claim that tests ran
// ---------------------------------------------------------------------------

// Deliberately narrow: "fails on the empty-string case" is a legitimate
// reading of the code, so bare "case"/"example" is not a test word.
const TEST_WORD = String.raw`(?:unit\s+)?(?:tests?|test\s*cases?|test\s+suite|testcases?|(?:visible|hidden|public|private|sample)\s+(?:cases|examples?))`;
const OUTCOME = String.raw`(?:pass(?:es|ed|ing)?|fail(?:s|ed|ing)?|succeed(?:s|ed)?|green)`;

/** Each pattern is an assertion that something was executed and had a result. */
const CLAIM_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b${TEST_WORD}\b[^.!?;]{0,60}?\b${OUTCOME}\b`, "i"),
  new RegExp(String.raw`\b${OUTCOME}\b[^.!?;]{0,40}?\b${TEST_WORD}\b`, "i"),
  /\b(?:passed|failed|passes|fails|passing|failing)\s+(?:execution|the\s+harness|the\s+grader|the\s+judge)\b/i,
  /\bexecution\s+(?:passed|failed|succeeded|was\s+successful)\b/i,
  /\b(?:solution|code|submission|implementation|answer|program)\b[^.!?;]{0,30}\b(?:was|were|is|got|been|being)\s+accepted\b/i,
  /\baccepted\s+by\s+the\s+(?:system|judge|grader|platform|harness|checker)\b/i,
  /\b(?:ran|runs|executed|compiled)\s+(?:successfully|correctly|cleanly|without\s+(?:errors?|issues))\b/i,
  /\b(?:correct|works?|worked|working|succeeds?)\s+(?:on|for|against|with)\s+(?:(?:all|both|every|the)\s+)*(?:(?:visible|hidden|public|sample)\s+)?(?:tests?|test\s*cases?)\b/i,
];

/**
 * A sentence that mentions tests but is NOT an execution claim: a reading or
 * trace of the code, a report of what the candidate said, or the fact that
 * nothing ran. Applies to the whole sentence.
 */
const SENTENCE_KEEP: RegExp[] = [
  /\btrac(?:e|ed|es|ing)\b|\bby\s+hand\b|\bby\s+reading\b|\breading\s+(?:the|your)\s+code\b|\bby\s+inspection\b|\bon\s+paper\b|\bwalk(?:ed|ing)?\s+(?:it\s+)?through\b|\bdry[-\s]run/i,
  /\b(?:you|the\s+candidate|candidate|they)\s+(?:said|says|claimed|claims|stated|states|asserted|asserts|reported|reports|mentioned|told|insisted|assumed|announced)\b/i,
  /\b(?:your|their|the\s+candidate's)\s+claim\b|\bclaim(?:ed|ing)?\s+(?:that\s+)?(?:it|the|your)\b|\bunverified\b|\bself-report/i,
  /\bwithout\s+(?:verif|check|trac|testing|running)/i,
  /\b(?:no|none\s+of\s+the)\s+(?:tests?|code)\s+(?:was|were)\s+(?:run|executed)\b|\bnot\s+(?:run|executed)\b|\bwere(?:n't|\s+not)\s+run\b|\bnot\s+recorded\b|\bwhether\b/i,
];

/**
 * Local exemptions, checked against one claim match and the words just before
 * it: a prediction ("would fail on") or advice is not a result, and "failed
 * to test" is about the candidate's process. Local, so "passed both tests
 * but would fail on ''" still loses its first half.
 */
const LOCAL_KEEP: RegExp[] = [
  /\b(?:would|will|could|might|may|should|must|can|cannot|can't|make\s+sure|ensure|confirm|check|until)\s+(?:\w+\s+){0,2}(?:pass|fail|succeed|work|be\s+correct)\w*\b/i,
  /\bfail(?:s|ed|ing)?\s+to\s+(?:test|run|check|trace|consider|verify|write|cover|mention|explain)\b/i,
];

export function isExecutionClaim(sentence: string): boolean {
  if (SENTENCE_KEEP.some((pattern) => pattern.test(sentence))) return false;
  for (const pattern of CLAIM_PATTERNS) {
    for (const match of sentence.matchAll(new RegExp(pattern.source, "gi"))) {
      const from = Math.max(0, (match.index ?? 0) - 30);
      const window = sentence.slice(from, (match.index ?? 0) + match[0].length);
      if (!LOCAL_KEEP.some((keep) => keep.test(window))) return true;
    }
  }
  return false;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=["'“A-Z0-9(`])/).filter((part) => part.length > 0);
}

/** Drop every execution-claim sentence from one text. */
export function stripExecutionClaimText(text: string): { text: string; stripped: number } {
  let stripped = 0;
  const kept = splitSentences(text).filter((sentence) => {
    if (isExecutionClaim(sentence)) {
      stripped += 1;
      return false;
    }
    return true;
  });
  return { text: stripped ? kept.join(" ").trim() : text, stripped };
}

export const EXECUTION_GUARD_SUMMARY_FALLBACK =
  "No tests were run in this session, so this report reads your final code and the conversation rather than test results.";

/**
 * Post-parse guard for the structured report. Removes any sentence claiming a
 * test passed or failed, that the code was "accepted", or that it "passed
 * execution"; an item whose title or whole body was such a claim is dropped.
 */
export function stripExecutionClaims(report: StructuredReport): {
  report: StructuredReport;
  strippedCount: number;
} {
  let strippedCount = 0;
  const clean = (text: string) => {
    const result = stripExecutionClaimText(text);
    strippedCount += result.stripped;
    return result.text;
  };

  const strengths = report.strengths.flatMap((item) => {
    const title = clean(item.title);
    const detail = clean(item.detail);
    if (!title || !detail) return [];
    const evidence = item.evidence === null ? null : clean(item.evidence) || null;
    return [{ ...item, title, detail, evidence }];
  });
  const growth_areas = report.growth_areas.flatMap((item) => {
    const title = clean(item.title);
    const detail = clean(item.detail);
    if (!title || !detail) return [];
    return [{ ...item, title, detail, suggestion: clean(item.suggestion) }];
  });
  const rubric_notes = report.rubric_notes.flatMap((item) => {
    const note = clean(item.note);
    return note ? [{ ...item, note }] : [];
  });
  const category = (value: string | null) => (value === null ? null : clean(value) || null);

  const summary = clean(report.overall_summary);
  return {
    report: {
      ...report,
      overall_summary: summary || EXECUTION_GUARD_SUMMARY_FALLBACK,
      strengths,
      growth_areas,
      category_notes: {
        visual: category(report.category_notes.visual),
        vocal: category(report.category_notes.vocal),
        content: category(report.category_notes.content),
        behavioral: category(report.category_notes.behavioral),
      },
      rubric_notes,
      practice_next: clean(report.practice_next),
    },
    strippedCount,
  };
}

/**
 * `rubric_notes[].item` must be the dimension KEY ("coding_quality"), never a
 * free-text label, so the report's "By rubric item" figures resolve (contract
 * with loop/coding-report-ui, 2026-11-15). The prompt asks for keys; this maps
 * the labels and near-misses the model still writes ("Coding Quality",
 * "coding quality score") onto them. Unrecognized items are left as written.
 */
export function normalizeRubricNoteItems(
  report: StructuredReport,
  dimensions: ReadonlyArray<{ key: string; label: string }>,
): StructuredReport {
  const slug = (text: string) =>
    text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_score$/, "");
  const byName = new Map<string, string>();
  for (const dim of dimensions) {
    byName.set(slug(dim.key), dim.key);
    byName.set(slug(dim.label), dim.key);
  }
  return {
    ...report,
    rubric_notes: report.rubric_notes.map((note) => {
      const key = byName.get(slug(note.item));
      return key && key !== note.item ? { ...note, item: key } : note;
    }),
  };
}

// ---------------------------------------------------------------------------
// codingSteps outcome
// ---------------------------------------------------------------------------

/**
 * Narrow the evaluator's `codingSteps` to the framework's steps, in order,
 * and run the execution guard over each coaching note. The verbatim
 * `evidenceQuote` is the candidate's own words and is left alone (a candidate
 * may well have said "it passes the tests"). Representation-preserving: the
 * field stays a JSON-encoded string. A missing or unparseable value is
 * removed so the report shows no checklist rather than a broken one.
 */
export function finalizeCodingStepsOutcome(
  outcome: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!outcome || !(CODING_STEPS_OUTCOME_KEY in outcome)) return outcome;
  const next = { ...outcome };
  const parsed = asProcessStepResults(outcome[CODING_STEPS_OUTCOME_KEY]);
  const byKey = new Map((parsed ?? []).map((row) => [row.key, row]));
  const rows = TECHNICAL_CODING_FRAMEWORK.steps.flatMap((step) => {
    const row = byKey.get(step.key);
    if (!row) return [];
    const note = stripExecutionClaimText(row.note).text;
    return [{ ...row, note }];
  });
  if (rows.length === 0) {
    delete next[CODING_STEPS_OUTCOME_KEY];
  } else {
    next[CODING_STEPS_OUTCOME_KEY] = JSON.stringify(rows);
  }
  return next;
}
