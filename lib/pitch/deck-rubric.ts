/**
 * The four shared deck-judging rubric dimensions, extracted so every deck
 * mode (investor, funding request, product pitch, deck-led talk, general
 * deck pitch) reuses the exact same text instead of re-declaring it.
 *
 * These four judge the DECK, not the audience: structure, text density,
 * visual quality, and whether the speech tracked the slide on screen. Every
 * deck mode shares them. `negotiation` is deliberately ABSENT from this
 * module — 19-CONTEXT.md locks `negotiation` as investor-only, so it stays
 * declared on `pitch-deck`'s own distinctive dimensions, not here.
 *
 * Copied VERBATIM (key, label, description) from `lib/pitch/deck-type.ts` so
 * the investor deck's shipped rubric text does not drift. Do NOT edit
 * `lib/pitch/deck-type.ts` in this plan — plan 19-03 owns that file and will
 * switch it over to import this constant.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

export const SHARED_DECK_DIMENSIONS: InteractionTypeConfig["extraRubricDimensions"] =
  [
    {
      key: "deck_structure",
      label: "Deck structure",
      description:
        "Narrative arc and ordering — whether the essential investor questions are answered and in a sensible order. 1: slides feel random or skip the ask. 5: clear arc that builds to a defensible ask.",
    },
    {
      key: "deck_text_density",
      label: "Slide text density",
      description:
        "Wordiness per slide — walls of text, bullet overload, judged from extracted text. 1: dense slides the audience cannot scan. 5: spare, readable slides that support speech.",
    },
    {
      key: "deck_visual_quality",
      label: "Slide visual appearance",
      description:
        "Hierarchy, legibility, alignment, consistency — judged from the rendered slide images, not from word counts. 1: careless or illegible. 5: look made with care and read at a glance.",
    },
    {
      key: "slide_speech_correlation",
      label: "Slide / speech correlation",
      description:
        "Did the talk track track the slide on screen (and slides shown so far), unless a question pulled the conversation elsewhere. 1: speech ignored the deck. 5: speech and slides stayed aligned.",
    },
  ];
