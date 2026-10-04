# Deferred items (Phase 14)

## Found during 14-06

- **verify-deck-intake.ts** fails 1 assertion: expects slides[0].text to include
  `"Spike Deck Title"` but `spike-deck.pptx` (built in 14-01/14-03) uses
  `"Spike Deck Slide 1"`. Pre-existing fixture/assertion mismatch; not caused by
  14-06. Out of scope — do not fix in 14-06.

## Found during 14-10 (human verify — future enhancement, NOT a defect)

- **Walk-out auto-end / "temperature" session close.** When the avatar gets
  uninterested they verbally say they are going to leave but the session does
  not close. Future wish: a "temperature" variable that, after going below a
  threshold, plays one last statement from the avatar (user cannot cut off or
  respond) and then automatically ends the session to generate the report —
  framed as a failure instance. Explicitly **not** in 14-10 scope; do not
  implement here. Pick up in a later phase / tuning plan.
