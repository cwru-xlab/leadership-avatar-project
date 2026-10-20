/**
 * The structured report body shared by the interview and scenario evaluators.
 *
 * WHY THIS EXISTS: the evaluators used to return one opaque `report_markdown`
 * string, with section titles emitted as `**Bold**` paragraphs rather than
 * headings. Rendering that as tabs or expandable rows would have meant
 * regex-splitting model prose to build UI — brittle in exactly the way this
 * codebase avoids elsewhere. The model now returns DATA, and markdown is
 * composed from it here.
 *
 * SINGLE SOURCE OF TRUTH: the model does NOT emit markdown. Asking for both
 * would pay output tokens twice and let the prose and the structured data
 * disagree — a report whose tabs said one thing and whose narrative said
 * another. `composeReportMarkdown` derives one from the other, so they cannot
 * drift.
 *
 * This module is a pure library: no Prisma, no network, no React. Both
 * evaluators and both report DTOs depend on it; it depends on neither.
 *
 * IMPORT-CYCLE CHECK (quick-004): this module now narrows an incoming
 * `growth_areas[].dimension` against `lib/mastery/competencies.ts`'s
 * `allRubricDimensionKeys()`. That module derives its catalog from
 * `lib/engine/registry.ts`'s `ENGINE_TYPES`, which in turn pulls in every
 * built-in type's prompt/config module (`lib/interview/prompts.ts`,
 * `lib/scenario/prompts.ts`, `lib/networking/prompts.ts`, the pitch
 * `*-type.ts` files, `lib/difficult-conversation/conversation-type.ts`).
 * None of those modules — nor `lib/engine/types.ts` — imports this file or
 * `lib/mastery/competencies.ts`, so importing `allRubricDimensionKeys` here
 * does NOT close a cycle. (`lib/engine/rubric.ts` and
 * `lib/engine/evaluation.ts` DO import this file, but neither sits on
 * `ENGINE_TYPES`'s import path, so that is a one-way dependency, not a
 * cycle.) Verified by direct inspection of every file's import list plus a
 * live `tsx` run of `scripts/verify-report-structure.ts` after this change.
 */
import { allRubricDimensionKeys } from "@/lib/mastery/competencies";

/**
 * The closed vocabulary an evaluator may declare a feedback item's evidence
 * basis under. See `lib/report/source-attribution.ts` for the server-side
 * enforcement that makes "resume" / "both" impossible when no resume exists.
 */
export const FEEDBACK_SOURCES = ["resume", "conversation", "both"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** One thing the candidate did well. */
export interface ReportStrength {
  title: string;
  detail: string;
  /** A transcript quote or close paraphrase. Null when the model had none
   * worth citing — better than a fabricated one. */
  evidence: string | null;
  /** Which input this finding rests on, self-declared by the evaluator.
   * `null`/absent means the evaluator did not declare a source — consumers
   * must render nothing in that case, never an "unknown" badge. Optional in
   * TypeScript (not merely nullable) so pre-existing literals built without
   * this field (fixtures, scripts) stay `tsc`-clean. */
  source?: FeedbackSource | null;
}

/** One thing to work on, with the moment(s) it showed up. */
export interface ReportGrowthArea {
  title: string;
  detail: string;
  suggestion: string;
  /** `m:ss` stamps on the SESSION clock, matching the transcript and the
   * episode timeline. This is what lets a growth area link to the moment it
   * came from instead of merely describing it. */
  timecodes: string[];
  /** Which input this finding rests on, self-declared by the evaluator.
   * `null`/absent means the evaluator did not declare a source — consumers
   * must render nothing in that case, never an "unknown" badge. Optional in
   * TypeScript (not merely nullable) so pre-existing literals built without
   * this field (fixtures, scripts) stay `tsc`-clean. */
  source?: FeedbackSource | null;
  /** Which rubric dimension (`lib/mastery/competencies.ts`'s
   * `allRubricDimensionKeys()`) this growth area critiques, self-declared by
   * the evaluator — a recorded FACT rather than a derived inference. `null`
   * means the evaluator genuinely did not declare one, left the field out,
   * or declared a value outside the known dimension-key set; an unrecognized
   * value degrades to `null` rather than being passed through. Optional in
   * TypeScript (not merely nullable) so pre-existing literals built without
   * this field (fixtures, scripts, and every report row written before this
   * field existed) stay `tsc`-clean. Consumers that need a competency for a
   * `null` dimension must fall back to their own derivation —
   * `lib/study-plan/checks/sources.ts` does exactly that. */
  dimension?: string | null;
}

export interface ReportRubricNote {
  item: string;
  note: string;
}

export interface StructuredReport {
  overall_summary: string;
  strengths: ReportStrength[];
  growth_areas: ReportGrowthArea[];
  category_notes: {
    visual: string | null;
    vocal: string | null;
    content: string | null;
    behavioral: string | null;
  };
  /** Per-rubric-item one-liners. Empty for scenario reports, whose prompt has
   * no equivalent section — consumers must tolerate that rather than render an
   * empty panel. */
  rubric_notes: ReportRubricNote[];
  practice_next: string;
}

// ---------------------------------------------------------------------------
// JSON schema fragment
// ---------------------------------------------------------------------------

/**
 * Both evaluator schemas run with `strict: true`, which imposes rules that are
 * easy to violate by habit: EVERY property must be listed in `required`, every
 * object needs `additionalProperties: false`, and an optional-in-spirit field
 * must be spelled `type: ["string", "null"]` rather than omitted. There is no
 * such thing as an optional key — the model emits an empty array or an
 * explicit null instead.
 */
const STRING_OR_NULL = { type: ["string", "null"] } as const;

/**
 * One 1–5 integer-or-null score property for a rubric dimension. Used by
 * `lib/engine/rubric.ts`'s type-derived evaluator schema so every dimension —
 * the four shared ones and any type-declared extras — emits the same shape
 * the two hardcoded schemas used for `visual_score` / `vocal_score` / etc.
 *
 * `label` is accepted for future description text; today's schemas carry no
 * `description` field, so this helper matches that byte-for-byte.
 */
export function rubricDimensionProperty(_key: string, _label: string) {
  return {
    type: ["integer", "null"] as const,
    minimum: 1,
    maximum: 5,
  };
}

export const STRUCTURED_REPORT_PROPERTIES = {
  overall_summary: { type: "string" },
  strengths: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["title", "detail", "evidence", "source"],
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        evidence: STRING_OR_NULL,
        source: STRING_OR_NULL,
      },
    },
  },
  growth_areas: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["title", "detail", "suggestion", "timecodes", "source", "dimension"],
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        suggestion: { type: "string" },
        timecodes: { type: "array", items: { type: "string" } },
        source: STRING_OR_NULL,
        dimension: STRING_OR_NULL,
      },
    },
  },
  category_notes: {
    type: "object",
    additionalProperties: false,
    required: ["visual", "vocal", "content", "behavioral"],
    properties: {
      visual: STRING_OR_NULL,
      vocal: STRING_OR_NULL,
      content: STRING_OR_NULL,
      behavioral: STRING_OR_NULL,
    },
  },
  rubric_notes: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["item", "note"],
      properties: {
        item: { type: "string" },
        note: { type: "string" },
      },
    },
  },
  practice_next: { type: "string" },
} as const;

export const STRUCTURED_REPORT_REQUIRED = [
  "overall_summary",
  "strengths",
  "growth_areas",
  "category_notes",
  "rubric_notes",
  "practice_next",
] as const;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s.length > 0 ? s : null;
}

function strArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean).slice(0, cap);
}

/**
 * Coerces a model-declared source into the closed vocabulary, or `null`.
 * This is the one place the vocabulary is enforced on the way in — an
 * out-of-vocabulary value degrades to `null` rather than failing the whole
 * response (the JSON schema intentionally carries no `enum` on this field;
 * see `STRUCTURED_REPORT_PROPERTIES`).
 */
function feedbackSource(value: unknown): FeedbackSource | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (FEEDBACK_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as FeedbackSource)
    : null;
}

/**
 * Coerces a model-declared `growth_areas[].dimension` into a known rubric
 * dimension key, or `null`. This is the one place the key set is enforced on
 * the way in — an unrecognized value (a hallucinated key, a stale key from a
 * removed type, a typo) degrades to `null` rather than being carried through
 * as an uncheckable string, matching `feedbackSource` above (the JSON schema
 * intentionally carries no `enum` here either, since `allRubricDimensionKeys`
 * is computed at runtime from the live engine registry, not statically
 * enumerable in a JSON schema literal).
 */
function rubricDimensionKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return allRubricDimensionKeys().includes(normalized) ? normalized : null;
}

/** Caps on list lengths. The prompt asks for 3-5 of each; these exist so a
 * runaway model cannot push an unbounded blob into a `Json` column. */
const MAX_LIST_ITEMS = 12;
const MAX_TIMECODES = 8;

/**
 * Coerces a model response into a `StructuredReport`, or returns null when
 * there is no usable body.
 *
 * "No usable body" is deliberately narrow: a report with a summary but no
 * bullets is thin, not broken, and should still reach the student. Only a
 * response with neither a summary nor any section at all counts as empty —
 * that is the case the caller turns into a FAILED report rather than storing
 * a blank one.
 */
export function parseStructuredReport(raw: unknown): StructuredReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const strengths: ReportStrength[] = Array.isArray(r.strengths)
    ? r.strengths
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
        .map((e) => ({
          title: str(e.title),
          detail: str(e.detail),
          evidence: strOrNull(e.evidence),
          source: feedbackSource(e.source),
        }))
        .filter((e) => e.title || e.detail)
        .slice(0, MAX_LIST_ITEMS)
    : [];

  const growthAreas: ReportGrowthArea[] = Array.isArray(r.growth_areas)
    ? r.growth_areas
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
        .map((e) => ({
          title: str(e.title),
          detail: str(e.detail),
          suggestion: str(e.suggestion),
          timecodes: strArray(e.timecodes, MAX_TIMECODES),
          source: feedbackSource(e.source),
          dimension: rubricDimensionKey(e.dimension),
        }))
        .filter((e) => e.title || e.detail)
        .slice(0, MAX_LIST_ITEMS)
    : [];

  const rubricNotes: ReportRubricNote[] = Array.isArray(r.rubric_notes)
    ? r.rubric_notes
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
        .map((e) => ({ item: str(e.item), note: str(e.note) }))
        .filter((e) => e.item && e.note)
        .slice(0, MAX_LIST_ITEMS * 3)
    : [];

  const notes = (r.category_notes ?? {}) as Record<string, unknown>;
  const overallSummary = str(r.overall_summary);
  const practiceNext = str(r.practice_next);

  const hasAnything =
    Boolean(overallSummary) ||
    Boolean(practiceNext) ||
    strengths.length > 0 ||
    growthAreas.length > 0 ||
    rubricNotes.length > 0;
  if (!hasAnything) return null;

  return {
    overall_summary: overallSummary,
    strengths,
    growth_areas: growthAreas,
    category_notes: {
      visual: strOrNull(notes.visual),
      vocal: strOrNull(notes.vocal),
      content: strOrNull(notes.content),
      behavioral: strOrNull(notes.behavioral),
    },
    rubric_notes: rubricNotes,
    practice_next: practiceNext,
  };
}

/** Re-narrows a stored `Json?` column. Mirrors `asVisualMetrics` in
 * `lib/metrics/ingest.ts`: a hand-edited or pre-migration row degrades to null
 * rather than crashing a report page. */
export function asStructuredReport(value: unknown): StructuredReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return parseStructuredReport(value);
}

// ---------------------------------------------------------------------------
// Markdown composition
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** "Interview" or "Scenario" — only the top heading differs. */
  title: string;
  /** Row labels for the category table, in display order. */
  categoryLabels?: {
    visual: string;
    vocal: string;
    content: string;
    behavioral: string;
  };
  scores: {
    visual: number | null;
    vocal: number | null;
    content: number | null;
    behavioral: number | null;
  };
}

const DEFAULT_CATEGORY_LABELS = {
  visual: "Visual & Environment",
  vocal: "Vocal Delivery",
  content: "Content & Structure",
  behavioral: "Behavioral & Mindset",
};

function scoreCell(score: number | null): string {
  return score === null ? "Not available — requires video/audio analysis" : String(score);
}

/** Prefixes a strength/growth-area bullet with its evidence basis, so
 * `reportMarkdown` cannot drift from the structured `source` field — the
 * module's own single-source-of-truth rule. `null`/absent renders nothing. */
function sourcePrefix(source: FeedbackSource | null | undefined): string {
  if (source === "resume") return "From your resume: ";
  if (source === "conversation") return "From the conversation: ";
  if (source === "both") return "From your resume and the conversation: ";
  return "";
}

/**
 * Renders the structured body back into the markdown shape the report used to
 * come in as.
 *
 * This is NOT redundant with the structured data — it is what keeps
 * `reportMarkdown` populated for consumers that cannot use the new shape:
 * reports written before this change have nothing else, and
 * `lib/study-plan/generate.ts`'s `extractBehavioralFeedback` regex-scans this
 * text for `- Label: Rating` bullets. The `rubric_notes` section below is
 * emitted in exactly that form so that scan keeps matching.
 */
export function composeReportMarkdown(
  report: StructuredReport,
  opts: ComposeOptions
): string {
  const labels = opts.categoryLabels ?? DEFAULT_CATEGORY_LABELS;
  const out: string[] = [`### ${opts.title}`];

  if (report.overall_summary) {
    out.push(`**Overall Summary** ${report.overall_summary}`);
  }

  if (report.strengths.length) {
    out.push("**Strengths**");
    out.push(
      report.strengths
        .map((s) => {
          const evidence = s.evidence ? ` ("${s.evidence}")` : "";
          return `- **${s.title}:** ${sourcePrefix(s.source)}${s.detail}${evidence}`;
        })
        .join("\n")
    );
  }

  if (report.growth_areas.length) {
    out.push("**Growth Areas**");
    out.push(
      report.growth_areas
        .map((g) => {
          const when = g.timecodes.length ? ` (${g.timecodes.join(", ")})` : "";
          return `- **${g.title}:** ${sourcePrefix(g.source)}${g.detail}${when} *Consider trying this:* ${g.suggestion}`;
        })
        .join("\n")
    );
  }

  out.push("**Category Breakdown**");
  out.push(
    [
      "| Category | Score | Notes |",
      "| --- | --- | --- |",
      `| ${labels.visual} | ${scoreCell(opts.scores.visual)} | ${report.category_notes.visual ?? ""} |`,
      `| ${labels.vocal} | ${scoreCell(opts.scores.vocal)} | ${report.category_notes.vocal ?? ""} |`,
      `| ${labels.content} | ${scoreCell(opts.scores.content)} | ${report.category_notes.content ?? ""} |`,
      `| ${labels.behavioral} | ${scoreCell(opts.scores.behavioral)} | ${report.category_notes.behavioral ?? ""} |`,
    ].join("\n")
  );

  if (report.rubric_notes.length) {
    out.push("**Detailed Notes by Rubric Item**");
    // `- Item: Note` — the exact shape `extractBehavioralFeedback` matches.
    out.push(report.rubric_notes.map((n) => `- ${n.item}: ${n.note}`).join("\n"));
  }

  if (report.practice_next) {
    out.push(`**One Thing to Practice Next Time** ${report.practice_next}`);
  }

  return out.join("\n\n");
}
