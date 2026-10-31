/**
 * Minute labels for the deck family, shared by the pitches picker and the
 * deck-settings page. Pure — reads only the envelopes it is handed.
 */
import type { DeckMode } from "@/lib/pitch/deck-modes";

export function minutesRange(envelopeSeconds: readonly [number, number]): string {
  const [low, high] = envelopeSeconds;

  return `${Math.round(low / 60)}–${Math.round(high / 60)} min`;
}

/** The whole family's span: the lowest floor to the highest ceiling. */
export function deckFamilyMinutes(modes: readonly DeckMode[]): string {
  const floors = modes.map((mode) => mode.envelopeSeconds[0] / 60);
  const ceilings = modes.map((mode) => mode.envelopeSeconds[1] / 60);

  return `${Math.min(...floors)}–${Math.max(...ceilings)} min`;
}
