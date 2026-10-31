/**
 * One icon per deck mode for the deck-settings page. Partial on purpose: a new
 * row in `lib/pitch/deck-modes.ts` still renders (with the fallback) without
 * touching this file, so adding a mode stays data-only.
 */
import type { LucideIcon } from "lucide-react";
import { Banknote, Layers, Megaphone, PiggyBank, ShoppingBag } from "lucide-react";

import type { DeckModeSlug } from "@/lib/pitch/deck-modes";

const ICONS: Partial<Record<DeckModeSlug, LucideIcon>> = {
  "pitch-deck": Banknote,
  "pitch-funding": PiggyBank,
  "pitch-product": ShoppingBag,
  "pitch-talk": Megaphone,
  "pitch-general": Layers,
};

export function deckModeIcon(slug: DeckModeSlug): LucideIcon {
  return ICONS[slug] ?? Layers;
}
