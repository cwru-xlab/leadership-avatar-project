---
phase: 19-deck-led-pitch-family
plan: 01
subsystem: pitch
tags: [typescript, data-table, rubric, session-length]

# Dependency graph
requires:
  - phase: 14-deck-pitch-capability
    provides: PITCH_DECK_TYPE, DECK_ENVELOPE_SECONDS, proposeDeckSeconds(slideCount)
provides:
  - "lib/pitch/deck-modes.ts — DECK_MODES table naming all five deck modes and every per-mode difference (listener, scored line, envelope, negotiation marker, mode-input step, distinctive dimensions, outcome keys, wizard copy)"
  - "lib/pitch/deck-rubric.ts — SHARED_DECK_DIMENSIONS, the four deck-judging dimensions extracted verbatim from deck-type.ts"
  - "proposeDeckSeconds(slideCount, envelope?) generalized to any [low, high] envelope, defaulting to the investor range"
  - "scripts/verify-deck-mode-table.ts — nine mechanical assertions proving the table is complete and internally consistent"
affects: [19-02, 19-03, 19-04, 19-05, 19-06, 19-07, 19-08, 19-09, 19-10, 19-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single data-table + lookup pattern (DECK_MODES / getDeckMode / isDeckModeSlug / listDeckModes), mirroring lib/engine/registry.ts's getEngineType shape, so a sixth deck mode is a data row, not a code change"
    - "Shared rubric dimensions extracted to their own module (deck-rubric.ts) and spread into type records rather than copied"
    - "Pure functions taking an explicit envelope parameter instead of importing mode config, to avoid an import cycle (session-length.ts <- deck-modes.ts, never the reverse)"

key-files:
  created:
    - lib/pitch/deck-modes.ts
    - lib/pitch/deck-rubric.ts
    - scripts/verify-deck-mode-table.ts
  modified:
    - lib/pitch/session-length.ts

key-decisions:
  - "pitch-deck's envelope is imported from DECK_ENVELOPE_SECONDS (session-length.ts) rather than duplicated as a literal, so the two can never drift apart."
  - "DeckModeInputs has no member for pitch-deck (ask/equity stay on the instance per Phase 14) and no member for pitch-general (zero-setup, no audience field per 19-CONTEXT.md)."

patterns-established:
  - "Pattern: mode identity lives in exactly one table (DECK_MODES); any code that would branch on a pitch-* slug should call getDeckMode() instead."

requirements-completed: [REQ-88, REQ-90, REQ-94, P19-SC1, P19-SC3]

# Metrics
duration: 25min
completed: 2026-10-08
---

# Phase 19 Plan 01: Deck Mode Table Summary

**Five-mode deck data table (`DECK_MODES`) plus extracted shared rubric dimensions and a generalized slide-count-to-session-length proposal, proven by a nine-assertion verify script.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `lib/pitch/deck-rubric.ts` extracts the four shared deck-judging dimensions (`deck_structure`, `deck_text_density`, `deck_visual_quality`, `slide_speech_correlation`) verbatim from `deck-type.ts`, typed as `InteractionTypeConfig["extraRubricDimensions"]`, with `negotiation` deliberately absent.
- `lib/pitch/deck-modes.ts` declares all five deck modes (`pitch-deck`, `pitch-funding`, `pitch-product`, `pitch-talk`, `pitch-general`) as data: listener line, scored line, envelope, negotiation marker, mode-input step, distinctive rubric keys, outcome field keys, and wizard copy — with `getDeckMode`/`isDeckModeSlug`/`listDeckModes`/`deckModeNegotiates` lookups mirroring `getEngineType`'s shape. The `pitch-deck` row reproduces exactly what ships today.
- `proposeDeckSeconds` in `lib/pitch/session-length.ts` now accepts an optional `envelope` parameter (defaulting to `DECK_ENVELOPE_SECONDS`), so it can compute a proposal inside any mode's own range; every existing call site is unaffected.
- `scripts/verify-deck-mode-table.ts` mechanically proves all nine required invariants (five modes in picker order, exactly one negotiating mode, `pitch-general`'s empty fields, non-null mode-input steps elsewhere, no dimension-key collisions, valid envelopes, in-envelope proposals, non-empty card copy, and slug normalization) — ALL PASS.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the four shared deck rubric dimensions** - `4031842` (feat)
2. **Task 2: Build the five-mode deck table** - `f063c60` (feat)
3. **Task 3: Generalize the session-length proposal to any envelope, and prove the table** - `e69bf83` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/pitch/deck-rubric.ts` - `SHARED_DECK_DIMENSIONS`, the four deck-judging rubric dimensions
- `lib/pitch/deck-modes.ts` - `DECK_MODES` table, `DeckModeSlug`, `DeckModeInputs`, `DeckMode`, and lookups
- `lib/pitch/session-length.ts` - `proposeDeckSeconds` widened to accept an optional envelope
- `scripts/verify-deck-mode-table.ts` - nine-assertion mechanical proof of table completeness/consistency

## Decisions Made
- Imported `DECK_ENVELOPE_SECONDS` into `deck-modes.ts` for `pitch-deck`'s envelope instead of duplicating the literal `[20*60, 30*60]`, guaranteeing the two never drift (no import cycle: `session-length.ts` has no knowledge of `deck-modes.ts`).
- Card copy (listener lines, blurbs, wizard headlines) written per Claude's discretion per 19-CONTEXT.md, following the mode table laid out in the plan.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- `npx tsx -e "import('./lib/pitch/deck-modes')..."` (relative-path dynamic import in an eval string) failed to resolve the module from the tsx eval context; this was a tooling/invocation artifact, not a code defect. Verified instead with a scratch script using an absolute import path, which printed the five slugs in correct picker order as required.
- `scripts/verify-pitch-types.ts` has a pre-existing, unrelated failure (`PITCH_DECK_TYPE.terminationPolicy.avatarMayEnd === false`) caused by the Phase 18/19 walk-out amendment not yet applied to `deck-type.ts` — confirmed via `git stash` that this failure predates all of this plan's changes. That amendment is explicitly plan 19-03's responsibility (switching `pitch-deck`'s walk-out off); 19-01 did not touch `deck-type.ts` per its own constraints. No action taken here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/pitch/deck-modes.ts` and `lib/pitch/deck-rubric.ts` are ready for plan 19-02 (shared instance/input snapshot), 19-03 (switching `deck-type.ts` to import `SHARED_DECK_DIMENSIONS` and off its walk-out), and the four new TYPE records, picker, wizard, and report work in 19-04 through 19-10.
- No blockers. The one open item (`verify-pitch-types.ts`'s `avatarMayEnd` assertion) is tracked as plan 19-03's explicit scope, not a regression introduced here.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*

## Self-Check: PASSED

All created/modified files and all three task commit hashes verified present on disk and in git history.
