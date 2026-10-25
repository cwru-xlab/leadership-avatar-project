/**
 * Per-turn competency scoring for coached-moment selection (22-07).
 *
 * WHY THIS EXISTS: no per-turn data exists anywhere. `SessionMoment` carries no
 * score, and the only scores are session-level (`asScoreMap` on
 * `InteractionReport.scores`). 22-CONTEXT.md decided the coached session reworks
 * the student's LOWEST-scored turn on the competency, so those scores have to be
 * built. This module builds them with a model grader and caches them.
 *
 * COST: one model call per UNCACHED report (all of that report's candidate turns
 * batched together). Scores are cached forever per (report, turn, competency) in
 * `MomentCompetencyScore`, so a re-entry, a path-placement check, and a later
 * entry re-score nothing, and the same moment is chosen every time.
 *
 * PRIVACY: the caller must pass only turns that have already come through
 * `prepareMomentsForGeneration` (lib/study-plan/moment-boundary.ts), the ONLY
 * path by which transcript text may reach a model call. See
 * 22-COACH-LAYER-DECISION.md "Privacy scope". This module never reads a
 * transcript itself.
 *
 * VALIDATION: model output is validated, never repaired. An invalid response is
 * discarded and retried (up to 2 extra attempts); after that a
 * `TurnScoringFailedError` is thrown and the caller decides on the recorded
 * growth-area fallback.
 */
import { prisma } from "@/lib/prisma";
import {
  COMPETENCIES,
  DIMENSION_TO_COMPETENCY,
  type CompetencyKey,
} from "@/lib/mastery/competencies";
import { gradingSampling } from "../grading-determinism";

export interface TurnToScore {
  turnIndex: number;
  studentText: string;
  precedingAvatarText: string | null;
}

export interface TurnScore {
  turnIndex: number;
  evidencesCompetency: boolean;
  /** 1..5 when evidencing, null otherwise. */
  score: number | null;
  rationale: string;
}

export type TurnScorer = (args: {
  competencyKey: CompetencyKey;
  turns: TurnToScore[];
}) => Promise<TurnScore[]>;

export class TurnScoringFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnScoringFailedError";
  }
}

const MAX_RATIONALE_CHARS = 400;
const EXTRA_ATTEMPTS = 2;

/**
 * Strict validation. Returns the scores ordered by turnIndex, or null when the
 * output is not exactly right. Never coerces or repairs.
 */
export function validateTurnScores(
  turns: ReadonlyArray<{ turnIndex: number }>,
  raw: unknown,
): TurnScore[] | null {
  if (!Array.isArray(raw)) return null;
  const wanted = new Set(turns.map((t) => t.turnIndex));
  if (raw.length !== wanted.size) return null;
  const seen = new Set<number>();
  const out: TurnScore[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const { turnIndex, evidencesCompetency, score, rationale } = r;
    if (typeof turnIndex !== "number" || !Number.isInteger(turnIndex)) return null;
    if (!wanted.has(turnIndex) || seen.has(turnIndex)) return null;
    if (typeof evidencesCompetency !== "boolean") return null;
    if (evidencesCompetency) {
      if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
        return null;
      }
    } else if (score !== null) {
      return null;
    }
    if (
      typeof rationale !== "string" ||
      rationale.trim().length === 0 ||
      rationale.length > MAX_RATIONALE_CHARS
    ) {
      return null;
    }
    seen.add(turnIndex);
    out.push({
      turnIndex,
      evidencesCompetency,
      score: evidencesCompetency ? (score as number) : null,
      rationale,
    });
  }
  return out.sort((a, b) => a.turnIndex - b.turnIndex);
}

function coachModel(): string {
  return process.env.COACH_MODEL || "gpt-4.1";
}

async function callModelOnce(args: {
  competencyKey: CompetencyKey;
  turns: TurnToScore[];
}): Promise<unknown> {
  const competency = COMPETENCIES.find((c) => c.key === args.competencyKey);
  if (!competency) throw new Error(`Unknown competency ${args.competencyKey}`);
  const dimensions = Array.from(DIMENSION_TO_COMPETENCY.entries())
    .filter(([, key]) => key === args.competencyKey)
    .map(([dim]) => dim);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });

  const systemPrompt =
    `You assess a student's own turns from a recorded leadership conversation against ONE competency.\n` +
    `Competency: ${competency.label}. ${competency.description}\n` +
    `Rubric dimensions that feed it: ${dimensions.join(", ")}.\n` +
    `For EACH numbered student turn (shown with the other person's preceding line as context), decide ` +
    `whether the turn actually bears on this competency. If it does, score it 1 (clearly weak) to 5 ` +
    `(exemplary) with a one-sentence rationale. Greetings, logistics and acknowledgements do not evidence ` +
    `any competency: mark evidencesCompetency false, score null. Return JSON: ` +
    `{"scores":[{"turnIndex":number,"evidencesCompetency":boolean,"score":integer 1-5 or null,"rationale":string}]} ` +
    `with exactly one entry per requested turnIndex.`;

  const userMessage = JSON.stringify({
    turns: args.turns.map((t) => ({
      turnIndex: t.turnIndex,
      otherPersonSaid: t.precedingAvatarText,
      studentSaid: t.studentText,
    })),
  });

  const completion = await openai.chat.completions.create({
    model: coachModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2_000,
    ...gradingSampling(coachModel()),
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Turn scoring model returned no content");
  const parsed = JSON.parse(content) as { scores?: unknown };
  return parsed.scores;
}

/** ONE model call per report per attempt; invalid output is discarded and retried. */
export const defaultTurnScorer: TurnScorer = async ({ competencyKey, turns }) => {
  let lastReason = "no attempt made";
  for (let attempt = 0; attempt <= EXTRA_ATTEMPTS; attempt += 1) {
    try {
      const raw = await callModelOnce({ competencyKey, turns });
      const valid = validateTurnScores(turns, raw);
      if (valid) return valid;
      lastReason = "invalid model output";
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "unknown error";
    }
  }
  throw new TurnScoringFailedError(
    `Per-turn scoring failed after ${EXTRA_ATTEMPTS + 1} attempts (${lastReason})`,
  );
};

export async function scoreTurnsForCompetency(
  args: {
    userId: string;
    reportId: string;
    competencyKey: CompetencyKey;
    turns: TurnToScore[];
  },
  opts?: { scorer?: TurnScorer },
): Promise<TurnScore[]> {
  const { userId, reportId, competencyKey, turns } = args;
  if (turns.length === 0) return [];

  // CACHE FIRST. Scoped by userId as well as the unique key.
  const cachedRows = await prisma.momentCompetencyScore.findMany({
    where: {
      userId,
      reportId,
      competencyKey,
      turnIndex: { in: turns.map((t) => t.turnIndex) },
    },
  });
  const byIndex = new Map<number, TurnScore>();
  for (const row of cachedRows) {
    byIndex.set(row.turnIndex, {
      turnIndex: row.turnIndex,
      evidencesCompetency: row.evidencesCompetency,
      score: row.score,
      rationale: row.rationale,
    });
  }

  const uncached = turns.filter((t) => !byIndex.has(t.turnIndex));
  if (uncached.length > 0) {
    const scorer = opts?.scorer ?? defaultTurnScorer;
    const raw = await scorer({ competencyKey, turns: uncached });
    // Validate injected scorers too: never persist unvalidated output.
    const fresh = validateTurnScores(uncached, raw);
    if (!fresh) {
      throw new TurnScoringFailedError("Scorer returned output that failed validation");
    }
    await prisma.momentCompetencyScore.createMany({
      data: fresh.map((s) => ({
        userId,
        reportId,
        turnIndex: s.turnIndex,
        competencyKey,
        evidencesCompetency: s.evidencesCompetency,
        score: s.score,
        rationale: s.rationale,
        model: opts?.scorer ? "stub" : coachModel(),
      })),
      skipDuplicates: true,
    });
    for (const s of fresh) byIndex.set(s.turnIndex, s);
  }

  return turns
    .map((t) => byIndex.get(t.turnIndex))
    .filter((s): s is TurnScore => s !== undefined)
    .sort((a, b) => a.turnIndex - b.turnIndex);
}
