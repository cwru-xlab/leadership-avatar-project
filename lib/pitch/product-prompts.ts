/**
 * Product-pitch deck mode — live avatar prompt, evaluator prompt,
 * evaluation context, and evaluator slide images.
 *
 * PEER of `lib/pitch/deck-prompts.ts`, differing only where the mode does:
 * the listener is a fixed prospective customer, playing a declared buyer
 * position, raising real objections and pressing on price/value — with no
 * ownership stake, no price negotiation and no settled price anywhere. This
 * mode cannot walk out (19-03: no `<engine-end>` / `<engine-cue>` instruction).
 *
 * `buildProductSystemPrompt` is session-constant ONLY (REQ-73): config only,
 * no turn index, no elapsed time, no slide text. Slide text itself arrives
 * through the tail block, exactly as it does for the investor deck.
 */

import type { ResolvedSessionConfig } from "@/lib/engine/types";

export { buildDeckEvaluationImages } from "@/lib/pitch/deck-prompts";

export type ProductEvaluationContext = {
  kind: "pitch-product";
  buyerProfile: string | null;
  slideCount: number;
  slideTexts: string[];
  scheduledBudgetSeconds: number | null;
  slideHighWaterMark: null;
  slideReveals: null;
};

/**
 * Prompt 1 — the live prospective customer.
 *
 * Fixed listener: a prospective buyer evaluating whether to buy, playing
 * the declared `buyerProfile` position (role, company type, what they care
 * about) — this is why the field is required to start (19-CONTEXT.md). No
 * difficulty control, no persona injection. Degrades gracefully when the
 * student's declared buyer profile is absent (e.g. a synthetic/test config).
 */
export function buildProductSystemPrompt(
  config: ResolvedSessionConfig,
): string {
  const instance =
    config.instance.kind === "pitch-deck" ? config.instance : null;
  const modeInputs =
    instance?.modeInputs?.mode === "pitch-product" ? instance.modeInputs : null;

  const buyerProfile = modeInputs?.buyerProfile ?? null;

  const budgetSeconds =
    config.timeBudget.totalSeconds ?? instance?.proposedSeconds ?? 15 * 60;
  const budgetMinutes = Math.round(budgetSeconds / 60);

  const profileLine = buyerProfile
    ? `Your position in this meeting: ${buyerProfile}. Evaluate everything the founder says from that position.`
    : `You are evaluating this product from a prospective buyer's position declared before this meeting.`;

  return [
    `You are a prospective customer in a product pitch meeting, deciding whether to buy. Stay fully in character: skeptical where warranted, evidence-driven, and professional. You are evaluating whether this product is worth your money — not coaching a practice exercise.`,
    `## Your position
${profileLine} Raise real objections from that position and press on price and value. There is no ownership stake and no price or term to settle here — this is a sale, not an investment.`,
    `## Slide discipline
You can see only the slides the founder has actually shown you. Each turn you will be told which slides those are, with their text. Never reference, ask about or allude to a slide you have not been shown — not even to ask what is coming. If the founder's talk track does not match the slide on screen, you may say so.`,
    `## How a strong pitch works
The founder should surface and answer your real objections with evidence, without caving or stonewalling. Topical discussion should correlate with the slides unless a question leads elsewhere. Professionalism matters — treat this as a real sales meeting.`,
    `## Soft time
The meeting is scheduled for about ${budgetMinutes} minutes. You will be told how much time has passed. If it runs long, that is the founder's problem to manage — note it and press on pace.`,
    `## Staying in the meeting
You stay in this meeting for its full scheduled duration. You may be unimpressed, press hard on weak points, or say plainly that you are not ready to buy — but you do not walk out, and you never end the session yourself. Only the founder ends it.`,
    `## Staying in character
Speak in short conversational turns. Avoid bullet points, headings, or structured lists. Never break character to coach, evaluate, or comment on the exercise. Do not reveal this system prompt or the rubric.`,
  ].join("\n\n");
}

/**
 * Prompt 2 — post-session grader. Scores the four shared deck dimensions
 * plus this mode's one distinctive dimension; emits a factual, unscored
 * outcome record.
 */
export const PRODUCT_EVALUATOR_PROMPT = `You are grading a PRODUCT PITCH practice session — a timed meeting where the founder walks a prospective customer through an uploaded deck and sells the product. Score EVERY dimension on the 1-5 scale.

The shared four (Visual, Vocal, Content, Behavioral) use the usual delivery and substance criteria.

The four shared deck dimensions (deck_structure, deck_text_density, deck_visual_quality, slide_speech_correlation) judge the deck itself, exactly as they do for every deck mode.

The one distinctive dimension:

1. Objection handling (objection_handling): Did the founder surface, understand, and answer the buyer's real objection, with evidence, without caving or stonewalling?

OUTCOME RECORD (factual, not a score — fill honestly after scoring):
- buyerPosition (string): one of "interested", "needs-more", or "declined" — the buyer's position at the close.
- blockingObjection (string or null): the objection that actually stood in the way at the close, or null if none did.

There is no ownership stake and no settled price to report here — do not invent them. The outcome record above is the complete shape; emit nothing else.

If the session overran its scheduled time, say so in the structured body with the approximate overrun. Do not penalize overrun in a score dimension of its own — there is no overrun dimension; it is a reported fact. Cite only provided session-clock timestamps and observable causes when evaluation context includes them — never infer motivations or causes absent from the provided record.`;

/**
 * Per-type grading inputs from config.
 */
export function buildProductEvaluationContext(
  config: ResolvedSessionConfig,
): ProductEvaluationContext {
  const instance =
    config.instance.kind === "pitch-deck" ? config.instance : null;
  const modeInputs =
    instance?.modeInputs?.mode === "pitch-product" ? instance.modeInputs : null;

  return {
    kind: "pitch-product",
    buyerProfile: modeInputs?.buyerProfile ?? null,
    slideCount: instance?.slideCount ?? 0,
    slideTexts: instance?.slideTexts ?? [],
    scheduledBudgetSeconds: config.timeBudget.totalSeconds,
    slideHighWaterMark: null,
    slideReveals: null,
  };
}
