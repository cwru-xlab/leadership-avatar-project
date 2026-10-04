/**
 * Server-authoritative slide high-water mark for pitch-deck sessions.
 *
 * CONTEXT.md: "The avatar's context contains every slide the student has ever
 * shown, not just slides 1..current. Navigating back to slide 3 after reaching
 * slide 7 does not un-show 4-7 — the investor already saw them. Un-shown slides
 * (beyond the high-water mark) never enter context."
 *
 * 14-RESEARCH.md Pitfall 2: a client-trusted cursor is a context-leak vector.
 * The request's slide index is an INPUT to the ratchet below, never a stored
 * or used value — only the returned mark reaches applyVisibleContext.
 *
 * **This function (`ratchetHighWaterMark`) is the only place in the repo where
 * a client-supplied slide index is read.** Any other reader is a bug.
 */

import type { ResolvedSessionConfig } from "@/lib/engine/types";

import { applyVisibleContext } from "@/lib/engine/visible-context";
import {
  SLIDES_CHANNEL_KEY,
  buildSlidesChannel,
} from "@/lib/pitch/slides-channel";

/** Per-slide text cap in the tail fragment — one pathological slide must not dominate. */
export const SLIDE_TAIL_TEXT_LIMIT = 1200;

/**
 * Monotonic, bounds-checked high-water mark.
 *
 * - `stored` null = nothing revealed yet (14-05 convention).
 * - Non-finite, negative, or `slideCount <= 0` → return `stored` unchanged.
 * - Otherwise `mark = max(stored ?? -1, clamp(trunc(requested), 0, slideCount - 1))`.
 * - A successful ratchet always yields `mark >= 0` (never persists -1).
 */
export function ratchetHighWaterMark({
  stored,
  requested,
  slideCount,
}: {
  stored: number | null;
  requested: unknown;
  slideCount: number;
}): { mark: number | null; advanced: boolean } {
  if (
    typeof requested !== "number" ||
    !Number.isFinite(requested) ||
    requested < 0 ||
    !(slideCount > 0)
  ) {
    return { mark: stored, advanced: false };
  }

  const clamped = Math.min(Math.max(Math.trunc(requested), 0), slideCount - 1);
  const mark = Math.max(stored ?? -1, clamped);
  const advanced = mark > (stored ?? -1);

  return { mark, advanced };
}

/**
 * Admit slides 0..mark via Phase 13's `applyVisibleContext` — no local filter.
 * `mark === null` → nothing has been shown → [].
 */
export function resolveRevealedSlides({
  config,
  mark,
}: {
  config: ResolvedSessionConfig;
  mark: number | null;
}): { index: number; text: string }[] {
  if (mark === null) return [];
  if (config.instance.kind !== "pitch-deck") return [];

  const channel = buildSlidesChannel(config.instance.slideTexts);
  const admitted = applyVisibleContext(
    config.visibleContext,
    { [SLIDES_CHANNEL_KEY]: channel },
    { cursors: { [SLIDES_CHANNEL_KEY]: mark } },
  );

  const slides = admitted[SLIDES_CHANNEL_KEY];

  if (!Array.isArray(slides)) return [];

  return slides as { index: number; text: string }[];
}

/**
 * **Tail-block content only.** This string grows as the session progresses and
 * must never be concatenated into a system prompt — REQ-73, and 14-RESEARCH.md
 * Pitfall 1. `lib/engine/time-budget.ts` carries the same warning for the same
 * reason.
 */
export function buildSlidesTailFragment(
  revealed: { index: number; text: string }[],
  { slideCount }: { slideCount: number },
): string {
  if (revealed.length === 0) return "";

  const first = revealed[0]!.index + 1;
  const last = revealed[revealed.length - 1]!.index + 1;
  const rangeLabel =
    first === last ? `slide ${first}` : `slides ${first}-${last}`;

  const lines: string[] = [
    "[SLIDES SHOWN — not spoken aloud, do not reference this label]",
    `The founder has shown you ${rangeLabel} of ${slideCount} so far.`,
  ];

  for (const slide of revealed) {
    const label = `Slide ${slide.index + 1}:`;
    const raw = slide.text ?? "";
    const text =
      raw.length > SLIDE_TAIL_TEXT_LIMIT
        ? `${raw.slice(0, SLIDE_TAIL_TEXT_LIMIT)}… [truncated]`
        : raw;

    lines.push(`${label}\n${text}`);
  }

  lines.push(
    "You have not seen any later slide. Do not reference or ask about content you have not been shown.",
  );

  return lines.join("\n\n");
}
