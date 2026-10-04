/**
 * Adapter that makes Phase 13's visible-context cursor the avatar's slide view.
 *
 * The cursor passed to `applyVisibleContext` is the server-owned HIGH-WATER MARK
 * (`InteractionReport.slideHighWaterMark`), never a client-reported current
 * slide. Backward navigation does not lower it. There is deliberately no
 * second slide-gating function in this repo — if you are about to write one,
 * you want `applyVisibleContext` instead.
 *
 * Phase 13's VisibleContextConfig has no per-channel "mode" field: any array
 * channel is cursor-gated when `turn.cursors[channel]` is set. This module
 * names the channel and builds its entries; the primitive does the slice.
 */

import type { VisibleContextConfig } from "@/lib/engine/types";

export const SLIDES_CHANNEL_KEY = "slides" as const;

/**
 * One entry per slide, zero-based, matching `lib/deck/types.ts`'s convention.
 */
export function buildSlidesChannel(
  slideTexts: string[],
): { index: number; text: string }[] {
  return slideTexts.map((text, index) => ({ index, text }));
}

/**
 * Permissive default for every channel. The `slides` channel is gated at call
 * time by `turn.cursors[SLIDES_CHANNEL_KEY] = slideHighWaterMark` — Phase 13
 * has no separate "progressively revealed" config flag; the cursor on the
 * turn is the mode.
 */
export const DECK_VISIBLE_CONTEXT: VisibleContextConfig = {
  visibleChannels: "*",
};
