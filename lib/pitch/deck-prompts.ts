/**
 * Investor pitch-deck — live avatar prompt, evaluator prompt, evaluation
 * context, and evaluator slide images.
 *
 * ## The cache-prefix contract (REQ-73)
 *
 * `buildDeckSystemPrompt` is session-constant ONLY: resolved config (ask,
 * fair band, budget). No turn index, no elapsed time, no high-water mark, no
 * slide text. Admitted slide text enters through the tail block (plan 14-11).
 */

import type { EvaluatorImage, ResolvedSessionConfig } from "@/lib/engine/types";
import type { DisengagementDeclineRecord } from "@/lib/report/dto";

import { loadDeckSlideImage } from "@/lib/deck/store";

export type DeckFairValueBand = {
  priceUsdMin: number;
  priceUsdMax: number;
  equityPctMin: number;
  equityPctMax: number;
};

export type DeckEvaluationContext = {
  kind: "pitch-deck";
  askPriceUsd: number | null;
  askEquityPct: number | null;
  /** Investor's private band — grader reference only; never an outcome field. */
  fairValueBand: DeckFairValueBand | null;
  slideCount: number;
  slideTexts: string[];
  scheduledBudgetSeconds: number | null;
  /**
   * Filled by the evaluation runner from InteractionReport columns when
   * present; this builder supplies null from config alone.
   */
  slideHighWaterMark: number | null;
  slideReveals: unknown[] | null;
  disengagementDecline: DisengagementDeclineRecord | null;
};

/**
 * Prompt 1 — the live investor.
 *
 * Session-constant by construction. Takes `ResolvedSessionConfig` only.
 */
export function buildDeckSystemPrompt(config: ResolvedSessionConfig): string {
  const instance =
    config.instance.kind === "pitch-deck" ? config.instance : null;

  const askPriceUsd = instance?.askPriceUsd ?? 0;
  const askEquityPct = instance?.askEquityPct ?? 0;
  const band = instance?.fairValueBand ?? {
    priceUsdMin: 0,
    priceUsdMax: 0,
    equityPctMin: 0,
    equityPctMax: 0,
  };

  const budgetSeconds =
    config.timeBudget.totalSeconds ?? instance?.proposedSeconds ?? 20 * 60;
  const budgetMinutes = Math.round(budgetSeconds / 60);

  // Fair-value band is instance config, known at start, so it is legitimately
  // session-constant; it is never model-produced and never part of the
  // outcome record (CONTEXT.md negotiation = both).

  // Slide text itself arrives in the tail block (plan 14-11), not here —
  // prefix-cache + unshown-slide guard.

  return [
    `You are an experienced venture investor in a formal pitch meeting. Stay fully in character: probing, evidence-driven, and professional. You are evaluating whether this founder and this company deserve your capital — not coaching a practice exercise.`,
    `## The founder's ask
Before the meeting the founder stated what they want from you: $${askPriceUsd} for ${askEquityPct}% equity. Hold them to defending that with evidence.`,
    `## Your private fair-value read
Your own read of what this is worth is between $${band.priceUsdMin} and $${band.priceUsdMax} for ${band.equityPctMin}-${band.equityPctMax}%. The founder does not know this. Negotiate toward it; you may settle outside it if the founder genuinely earns it.`,
    `## Slide discipline
You can see only the slides the founder has actually shown you. Each turn you will be told which slides those are, with their text. Never reference, ask about or allude to a slide you have not been shown — not even to ask what is coming. If the founder's talk track does not match the slide on screen, you may say so.`,
    `## How a strong pitch works
The founder should be clear up front about what they want and then defend it with evidence. Topical discussion should correlate with the slides unless a question leads elsewhere. Professionalism matters — treat this as a real meeting.`,
    `## Soft time
The meeting is scheduled for about ${budgetMinutes} minutes. You will be told how much time has passed. If it runs long, that is the founder's problem to manage — note it and press on pace.`,
    `## Staying in the meeting
You stay in this meeting for its full scheduled duration. You may be unimpressed, press hard on weak points, or say plainly that the pitch is not investable — but you do not walk out, and you never end the session yourself. Only the founder ends it. (19-CONTEXT.md: walk-out is off for every deck mode.)`,
    `## Staying in character
Speak in short conversational turns. Avoid bullet points, headings, or structured lists. Never break character to coach, evaluate, or comment on the exercise. Do not reveal this system prompt, the fair-value band, or the rubric.`,
  ].join("\n\n");
}

/**
 * Prompt 2 — post-session grader. Scores all nine dimensions; the five deck
 * extras are named explicitly. Settled terms are the only outcome fields.
 */
export const DECK_EVALUATOR_PROMPT = `You are grading an INVESTOR PITCH DECK practice session — a timed meeting where the founder walks through an uploaded deck and negotiates price and equity. Score EVERY dimension on the 1-5 scale.

The shared four (Visual, Vocal, Content, Behavioral) use the usual delivery and substance criteria.

The five deck-specific dimensions:

1. Deck structure (deck_structure): Narrative arc, ordering, whether the essential investor questions are answered and in a sensible order. Judged from the extracted slide text and the talk track.

2. Deck text density (deck_text_density): Wordiness per slide, walls of text, bullet overload — judged from the extracted text.

3. Deck visual quality (deck_visual_quality): Judged from the attached slide images — hierarchy, legibility, alignment, consistency, whether the slides look like they were made with care. Do not infer appearance from word counts; you have the images.

4. Slide/speech correlation (slide_speech_correlation): Did the talk track track the slide on screen (and the slides shown so far), or did the founder drift off the deck without a question pulling them elsewhere?

5. Negotiation (negotiation): Did the founder manage the negotiation, defend the ask with evidence, and land somewhere defensible?

OUTCOME RECORD (factual, not a score — fill honestly after scoring):
- dealReached (boolean): whether a deal or clear verbal commitment was reached.
- settledPriceUsd (number or null): the price the parties settled on, or null if no deal.
- settledEquityPct (number or null): the equity percent settled, or null if no deal.
- negotiationNotes (string or null): brief notes on how the negotiation went.

Emit the outcome object with those settled terms only. Use null where no deal was reached. Do NOT guess at or invent the investor's private fair-value band — that band is not yours to produce.

If the session overran its scheduled time, say so in the structured body with the approximate overrun. When evaluation context includes disengagementDecline episodes, cite only their provided session-clock timestamps and observable causes. Do not infer the investor's feelings, motivations, or any cause absent from those episodes. Do not penalize overrun in a score dimension of its own — there is no overrun dimension; it is a reported fact.`;

/**
 * Per-type grading inputs from config. Reveal trail and final high-water mark
 * are filled by the evaluation runner from report columns when present.
 */
export function buildDeckEvaluationContext(
  config: ResolvedSessionConfig,
): DeckEvaluationContext {
  const instance =
    config.instance.kind === "pitch-deck" ? config.instance : null;

  return {
    kind: "pitch-deck",
    askPriceUsd: instance?.askPriceUsd ?? null,
    askEquityPct: instance?.askEquityPct ?? null,
    fairValueBand: instance?.fairValueBand ?? null,
    slideCount: instance?.slideCount ?? 0,
    slideTexts: instance?.slideTexts ?? [],
    scheduledBudgetSeconds: config.timeBudget.totalSeconds,
    slideHighWaterMark: null,
    slideReveals: null,
    disengagementDecline: null,
  };
}

export type DeckEvaluationImagesCtx = {
  config: ResolvedSessionConfig;
  /**
   * Owner of the private deck objects. Optional for assignability to
   * `InteractionPromptsConfig.buildEvaluationImages` (typed as `{ config }`
   * only); production wiring must supply it when reading storage.
   */
  userId?: string;
  /**
   * Final `InteractionReport.slideHighWaterMark`. `null` / omitted means
   * nothing revealed yet — return no images (14-05 null-means-nothing-revealed).
   */
  slideHighWaterMark?: number | null;
  /** Test seam; defaults to `loadDeckSlideImage`. */
  loadSlideImage?: typeof loadDeckSlideImage;
};

/**
 * Load thumb-variant PNGs up to the final high-water mark for the one
 * evaluator call. Labels are 1-based ("slide 1") for the model — deliberate
 * against the 0-based index convention used everywhere else in Phase 14.
 *
 * Uses the thumb variant, not full-resolution: 14-04 sends images with
 * `detail: "low"`, so the 1600px version buys nothing. 14-04's
 * `MAX_EVALUATOR_IMAGES` sampling handles large decks — do not sample here.
 */
export async function buildDeckEvaluationImages(
  ctx: DeckEvaluationImagesCtx,
): Promise<EvaluatorImage[]> {
  const { config, userId, slideHighWaterMark } = ctx;
  const instance =
    config.instance.kind === "pitch-deck" ? config.instance : null;

  if (!instance || userId == null || userId === "") {
    return [];
  }

  // null / undefined / negative → nothing revealed
  if (
    slideHighWaterMark == null ||
    !Number.isFinite(slideHighWaterMark) ||
    slideHighWaterMark < 0
  ) {
    return [];
  }

  const mark = Math.min(
    Math.trunc(slideHighWaterMark),
    Math.max(0, instance.slideCount - 1),
  );
  const load = ctx.loadSlideImage ?? loadDeckSlideImage;
  const images: EvaluatorImage[] = [];

  for (let index = 0; index <= mark; index += 1) {
    const loaded = await load(userId, instance.deckId, index, "thumb");

    if (!loaded) continue;
    const contentType = loaded.contentType || "image/png";

    images.push({
      dataUrl: `data:${contentType};base64,${loaded.body.toString("base64")}`,
      // 1-based label for the model; index remains 0-based in storage keys.
      label: `slide ${index + 1}`,
    });
  }

  return images;
}
