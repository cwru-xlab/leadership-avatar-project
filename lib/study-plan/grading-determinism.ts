/**
 * Deterministic sampling for every GRADING / SCORING model call (drill grade,
 * drill note regeneration, coached attempt grade, rewrite-check grade,
 * per-turn moment scoring, coached reply classifier). Generation calls
 * (coach speech, drill prompts, check generation) do NOT use this.
 *
 * Why: with default sampling the same recording graded 5 and then 3.
 *
 * MODEL CHECK (2026-10-25): every grader defaults to `gpt-4.1` (no grader
 * model env var is set), a non-reasoning chat model that accepts both
 * `temperature` and `seed` on Chat Completions (openai SDK 6.32). Reasoning
 * models (o-series, gpt-5*) reject a non-default `temperature`; for those
 * we send only the fixed `seed` — the most deterministic setting they accept.
 * `seed` is best-effort on OpenAI's side (same seed + params -> mostly the
 * same output), so `scripts/calibrate-graders.ts` measures the real spread.
 */
export const GRADING_SEED = 23_1024;

export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim());
}

export function gradingSampling(model: string): { temperature?: number; seed: number } {
  return isReasoningModel(model) ? { seed: GRADING_SEED } : { temperature: 0, seed: GRADING_SEED };
}
