/**
 * Knowledge checks that TEACH (Phase 23, K1/K2/K5): the explanation shown
 * after an answer, the deterministic option shuffle, and the conversational
 * context line. Pure — no Prisma, no model call, no Node built-ins — so the
 * generation and grading batteries exercise it with no credentials.
 *
 * EXPLANATIONS ARE TIED TO THE CLOSED TECHNIQUE LIBRARY. Every explanation
 * names a technique from `TECHNIQUE_LIBRARY` (coached/tips.ts) for the
 * check's competency. A model-proposed technique id outside that
 * competency's list is replaced, never trusted.
 *
 * EXPLANATIONS NEVER MISQUOTE. A model explanation that puts any text in
 * quotation marks must quote, byte for byte, one of the check's own
 * options / candidates / quoted line / context line — otherwise the
 * explanation is replaced by the template. (Replaced, not discarded with
 * the check: the check's own quote already passed the verbatim gate, and a
 * weak explanation is not a reason to lose a valid question.)
 *
 * OLDER ROWS have no stored explanation; `explanationFor` falls back to a
 * template built from the best-matching technique for the competency — and
 * to a technique-free template when nothing matches. It NEVER falls back to
 * the competency's first technique (user decision, 2026-10-24).
 *
 * WRITTEN FORMATS ONLY GET WRITTEN TECHNIQUES. Every check format is read
 * and answered in text, so a body/voice technique (eyes, shoulders, pace,
 * pauses, breath) can never be named on one — not by the template, and not
 * from a stored or model-proposed id. See `isWrittenTechnique`.
 */
import type { InterviewTranscript } from "../../interview/transcript";
import {
  COMPETENCIES,
  type CompetencyKey,
} from "../../mastery/competencies";
import { techniquesForCompetency, type Technique } from "../coached/tips";
import type { CheckExplanation } from "./types";

export const EXPLANATION_LIMITS = { why: 400, option: 300 } as const;

function isCompetencyKey(key: string): key is CompetencyKey {
  return COMPETENCIES.some((c) => c.key === key);
}

/**
 * Library techniques that are about the body or the voice — meaningless on
 * a written check. Every delivery_presence entry (eyes up, pace, pause after
 * the point, sweep the room) plus the visible-breath move under pressure.
 */
const SPOKEN_ONLY_TECHNIQUE_IDS: ReadonlySet<string> = new Set([
  "delivery-eyes-up",
  "delivery-slow-down",
  "delivery-pause-after-point",
  "delivery-own-the-room",
  "pressure-slow-your-response",
]);

export function isWrittenTechnique(t: Pick<Technique, "id">): boolean {
  return !SPOKEN_ONLY_TECHNIQUE_IDS.has(t.id);
}

/** The techniques a written check may name for this competency (may be empty). */
export function writtenTechniquesFor(competencyKey: string): Technique[] {
  if (!isCompetencyKey(competencyKey)) return [];
  return techniquesForCompetency(competencyKey).filter(isWrittenTechnique);
}

function lowerFirst(s: string): string {
  return s.length ? s[0]!.toLowerCase() + s.slice(1) : s;
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * The WRITTEN library technique whose name + reminder shares the most words
 * with `text` (ties go to library order). Null when no technique shares a
 * single word — never a default pick. Used only when no valid technique id
 * was stored — a heuristic for older rows, not a grading input.
 */
export function bestTechniqueFor(competencyKey: string, text: string): Technique | null {
  const target = words(text);
  let best: Technique | null = null;
  let bestScore = 0;
  for (const t of writtenTechniquesFor(competencyKey)) {
    let score = 0;
    for (const w of words(`${t.name} ${t.reminder}`)) if (target.has(w)) score += 1;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** The library entry for `id` IF it belongs to this competency AND is a
 * written technique; else null. */
export function techniqueById(competencyKey: string, id: string | null | undefined): Technique | null {
  if (!id) return null;
  return writtenTechniquesFor(competencyKey).find((t) => t.id === id) ?? null;
}

/** The technique-free "why" for when no written technique matches. */
export function competencyWhy(competencyKey: string): string {
  const c = COMPETENCIES.find((x) => x.key === competencyKey);
  return c
    ? `The stronger answer handles this moment better on ${c.label.toLowerCase()}: ${lowerFirst(c.description)}`
    : "The stronger answer handles this moment better.";
}

export function templateWhy(t: Technique): string {
  return `The stronger answer uses "${t.name}": ${lowerFirst(t.reminder)}`;
}

export function templateOptionMiss(t: Technique | null): string {
  return t ? `This option doesn't apply "${t.name}".` : "This option is weaker than the stronger answer.";
}

/**
 * Every span inside straight or curly double quotes must be a substring of
 * one of `sources`. A technique NAME in quotes is also allowed (the template
 * itself quotes it). Returns false on the first unverifiable quote.
 */
export function quotesAreVerbatim(text: string, sources: readonly string[], allowed: readonly string[] = []): boolean {
  const spans = text.matchAll(/["“]([^"“”]+)["”]/g);
  for (const match of spans) {
    const span = match[1]!;
    if (allowed.includes(span)) continue;
    if (!sources.some((s) => s.includes(span))) return false;
  }
  return true;
}

export interface ProposedExplanation {
  techniqueId: string | null;
  why: string | null;
  /** Per option, same order as the options; null/absent entries allowed. */
  options: (string | null)[] | null;
}

export interface SanitizeArgs {
  competencyKey: string;
  proposed: ProposedExplanation;
  /** Option count for MC/PBR; null for formats without options. */
  optionCount: number | null;
  /** Index of the correct option (its `options` entry is forced to null). */
  correctIndex: number | null;
  /** Text the explanation may quote: options, candidates, quoted line, context. */
  quotableSources: readonly string[];
  /** Fallback text to match a technique against (prompt + correct answer). */
  matchText: string;
}

export interface SanitizedExplanation {
  explanation: CheckExplanation;
  /** Which parts were replaced by templates — diagnostics only. */
  replaced: Array<"techniqueId" | "why" | "options">;
}

/**
 * Turns a model-proposed explanation into a stored one that is always valid:
 * a library technique for this competency, a bounded `why` with no
 * unverifiable quote, and per-option misses aligned to the options. Any part
 * that fails is replaced by its template; the result never throws for a
 * known competency.
 */
export function sanitizeExplanation(args: SanitizeArgs): SanitizedExplanation | null {
  if (!isCompetencyKey(args.competencyKey)) return null;
  const replaced: SanitizedExplanation["replaced"] = [];
  let technique = techniqueById(args.competencyKey, args.proposed.techniqueId);
  if (!technique) {
    // No match -> no technique (null), never a default one.
    technique = bestTechniqueFor(args.competencyKey, args.matchText);
    replaced.push("techniqueId");
  }
  const allowedQuotes = technique ? [technique.name] : [];

  const okText = (value: string | null | undefined, max: number): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    quotesAreVerbatim(value, args.quotableSources, allowedQuotes);

  let why = args.proposed.why?.trim() ?? null;
  // A model "why" written around a technique that was just replaced (or
  // dropped) would name the wrong move; only keep it with its own technique.
  const keepWhy = !replaced.includes("techniqueId");
  if (!keepWhy || !okText(why, EXPLANATION_LIMITS.why)) {
    why = technique ? templateWhy(technique) : competencyWhy(args.competencyKey);
    replaced.push("why");
  }

  let options: (string | null)[] | null = null;
  if (args.optionCount !== null) {
    const proposed = args.proposed.options;
    const aligned = Array.isArray(proposed) && proposed.length === args.optionCount;
    if (!aligned) replaced.push("options");
    options = Array.from({ length: args.optionCount }, (_, i) => {
      if (i === args.correctIndex) return null;
      const entry = aligned ? proposed![i]?.trim() ?? null : null;
      if (okText(entry, EXPLANATION_LIMITS.option)) return entry;
      if (aligned && !replaced.includes("options")) replaced.push("options");
      return templateOptionMiss(technique);
    });
  }

  return { explanation: { techniqueId: technique?.id ?? null, why: why!, options }, replaced };
}

/**
 * The explanation to show after grading: the stored one when present and
 * still pointing at a library technique, otherwise the template (older rows).
 */
export function explanationFor(
  competencyKey: string,
  stored: CheckExplanation | undefined,
  matchText: string,
): { technique: Technique | null; why: string; options: (string | null)[] | null } | null {
  if (!isCompetencyKey(competencyKey)) return null;
  if (stored && stored.techniqueId === null) {
    return { technique: null, why: stored.why, options: stored.options };
  }
  const storedTechnique = stored ? techniqueById(competencyKey, stored.techniqueId) : null;
  if (stored && storedTechnique) {
    return { technique: storedTechnique, why: stored.why, options: stored.options };
  }
  // No stored explanation, or one naming a technique a written check may not
  // show (e.g. an older delivery pick): template, technique line dropped
  // when nothing matches.
  const technique = bestTechniqueFor(competencyKey, matchText);
  return {
    technique,
    why: technique ? templateWhy(technique) : competencyWhy(competencyKey),
    options: null,
  };
}

// ---------------------------------------------------------------------------
// Deterministic shuffle (K1)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit — a stable seed from a string (the check id). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A permutation of 0..n-1 determined entirely by `seed`:
 * shuffled[i] = original[order[i]]. Same seed, same order, every time.
 */
export function shuffleOrder(seed: string, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const rand = prng(hashSeed(seed));
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function applyOrder<T>(items: readonly T[], order: readonly number[]): T[] {
  return order.map((i) => items[i]!);
}

// ---------------------------------------------------------------------------
// Conversational context (K5)
// ---------------------------------------------------------------------------

/**
 * The nearest assistant turn BEFORE `turnIndex`, copied exactly from the
 * stored transcript (no trimming, no redaction, no model text) — the same
 * rule `extractSessionMoments` uses for `precedingAvatarText`. Null when the
 * student spoke first or `turnIndex` is not a user turn.
 */
export function precedingAssistantTurn(transcript: InterviewTranscript, turnIndex: number): string | null {
  const turn = transcript.turns[turnIndex];
  if (!turn || turn.role !== "user") return null;
  for (let j = turnIndex - 1; j >= 0; j -= 1) {
    if (transcript.turns[j]!.role === "assistant") return transcript.turns[j]!.content;
  }
  return null;
}
