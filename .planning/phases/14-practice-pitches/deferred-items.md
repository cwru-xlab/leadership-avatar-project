# Deferred items (Phase 14)

## Found during 14-06

- **verify-deck-intake.ts** fails 1 assertion: expects slides[0].text to include
  `"Spike Deck Title"` but `spike-deck.pptx` (built in 14-01/14-03) uses
  `"Spike Deck Slide 1"`. Pre-existing fixture/assertion mismatch; not caused by
  14-06. Out of scope — do not fix in 14-06.
