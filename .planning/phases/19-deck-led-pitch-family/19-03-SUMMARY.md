---
phase: 19-deck-led-pitch-family
plan: 03
subsystem: engine
tags: [termination-policy, disengagement, pitch-deck, rubric, verification]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "19-01's SHARED_DECK_DIMENSIONS and deck-modes.ts (getDeckMode/listDeckModes) table"
  - phase: 18-avatar-disengagement-walk-out
    provides: "resolveTermination gate order and the disengagement mechanism itself"
provides:
  - "PITCH_DECK_TYPE with the walk-out opt-in removed (avatarMayEnd: false, no disengagementThreshold)"
  - "pitch-deck's rubric now spreads SHARED_DECK_DIMENSIONS plus an investor-only negotiation dimension"
  - "pitch-deck's timeBudget sourced from getDeckMode('pitch-deck').envelopeSeconds"
  - "pitch-deck setupSteps gains the shared 'interviewer' avatar-picker step"
  - "Live investor prompt with no engine-end / engine-cue exit instructions"
  - "verify-disengagement-termination.ts assertions inverted to assert no deck mode may opt in"
affects: ["19-04", "19-05", "19-07", "19-11", "18-05 human UAT / 18-VALIDATION.md"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deck modes resolve envelope/rubric/termination facts through getDeckMode()/listDeckModes() rather than re-declaring them per type record"
    - "Verifier assertions iterate the live mode table (listDeckModes + getEngineType) instead of hardcoding one type, so new modes are auto-covered"

key-files:
  created: []
  modified:
    - lib/pitch/deck-type.ts
    - lib/pitch/deck-prompts.ts
    - scripts/verify-disengagement-termination.ts

key-decisions:
  - "Removed the deck's disengagementThreshold key entirely (not set to null) and set avatarMayEnd: false / avatarEndReasons: [] — dropping the threshold alone leaves gate 4 skipped, which is not sufficient on its own"
  - "Kept avatarEndFloor: { minAssistantTurns: 4 } as dormant safety for any future re-opt-in, per plan"
  - "extraRubricDimensions now spreads SHARED_DECK_DIMENSIONS (19-01) plus a locally-declared NEGOTIATION_DIMENSION — negotiation stays investor-only and does not migrate into the shared module"
  - "deck-type.ts's envelope now reads getDeckMode('pitch-deck').envelopeSeconds and throws at module scope if that lookup is null, matching the fail-loud posture lib/engine/registry.ts uses for a missing preset"
  - "Added the shared Phase 13 'interviewer' setupStep to the investor deck per 19-CONTEXT.md's amendment (user decision 2026-10-08) — ask/equity/rubric stay Phase-14-unchanged, only avatar selection changes"
  - "verify-disengagement-termination.ts section 3's belowFloor fixture re-pointed at a locally-declared synthetic policy, since PITCH_DECK_TYPE.terminationPolicy would now be rejected at gate 1 (avatarMayEnd) rather than the floor gate it was meant to exercise"
  - "Section 4's two deck assertions were inverted (not deleted) into 'no deck mode opts into disengagement' and 'every deck mode keeps a dormant four-turn floor', both iterating listDeckModes()/getEngineType() so 19-04/19-05's four new modes are automatically covered once registered"
  - "pitch-elevator's existing opt-in assertion and ELEVATOR_DISENGAGEMENT_THRESHOLD (0.5) were left completely untouched — pitch-elevator is now the ONLY type still opted into Phase 18's disengagement walk-out"

requirements-completed: [REQ-88, REQ-93, P19-SC3]

duration: ~25min
completed: 2026-10-08
---

# Phase 19 Plan 03: Deck Walk-Out Removal Summary

**Turned off the investor pitch deck's disengagement walk-out (amending the deck half of Phase 18's REQ-84) while leaving the mechanism, the elevator, and Phase 18's verifier intact — then inverted (not deleted) the verifier's two deck-specific assertions to assert the opposite claim.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments
- `lib/pitch/deck-type.ts`: removed `DECK_DISENGAGEMENT_THRESHOLD` and the `disengagementThreshold` key; set `avatarMayEnd: false` / `avatarEndReasons: []`; the deck can no longer end a session itself while its four-turn floor stays as dormant safety.
- Same file: `extraRubricDimensions` now spreads 19-01's `SHARED_DECK_DIMENSIONS` plus an inline, investor-only `NEGOTIATION_DIMENSION`, in the original resolved order; `timeBudget`'s envelope now comes from `getDeckMode("pitch-deck").envelopeSeconds` (fail-loud if that lookup is null); `setupSteps` gained the shared `interviewer` avatar-picker step per 19-CONTEXT.md's amendment.
- `lib/pitch/deck-prompts.ts`: removed the `## Ending the conversation` section (the `<engine-cue>` / `<engine-end>` instructions) and the trailing "end in character" clause from `## Soft time`; replaced with a short section stating the investor stays for the full meeting and never ends it. `DECK_EVALUATOR_PROMPT` and `buildDeckEvaluationContext` left unchanged per plan (the `disengagementDecline` field and its citation-discipline sentence stay, since the elevator still produces decline records).
- `scripts/verify-disengagement-termination.ts`: inverted the two pitch-deck-specific assertions into generic, mode-table-driven checks (`no deck mode opts into disengagement`, `every deck mode keeps a dormant four-turn floor`), re-pointed the `belowFloor` fixture at a synthetic policy, and added a new direct assertion that a maximally disengaged investor still cannot walk out. `check(` count went from 14 to 16 — higher, not lower. The elevator's assertion and imports are untouched.

## verify-pitch-types.ts failure count (the expected signal)

- **Before this plan:** 3 failures.
- **After this plan:** 1 failure — `assistantTurnCount:2 + lost_interest ACCEPTED` (Phase 18's pending elevator regression at ~line 218; explicitly out of scope for this plan).
- The two deck assertions this plan targeted (`avatarMayEnd === false` at ~line 519 and ~line 679-680) are now GREEN.

## Task Commits

1. **Task 1: Switch the investor deck's walk-out off and consume the shared rubric** - `5765e29` (fix)
2. **Task 2: Remove the exit and cue instructions from the investor prompt** - `6fae7f1` (fix)
3. **Task 3: Invert the verifier's deck assertions — deliberately, never by deletion** - `93a4a97` (fix)

_Note: no plan-metadata commit separate from these — each task commit is already scoped to this plan's `files_modified`._

## Files Created/Modified
- `lib/pitch/deck-type.ts` - Walk-out opt-in removed; shared rubric consumed; envelope sourced from the mode table; `interviewer` setup step added.
- `lib/pitch/deck-prompts.ts` - Live prompt no longer instructs an exit or a disengagement cue; evaluator prompt untouched.
- `scripts/verify-disengagement-termination.ts` - Deck assertions inverted to the new intent; elevator assertion untouched; floor-gate fixture re-pointed at a synthetic policy; one new direct proof added.

## Decisions Made
See `key-decisions` in frontmatter above — all directly dictated by the plan and 19-CONTEXT.md, no independent architectural choices were required.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' verify commands passed on the first attempt; `npx tsc --noEmit` is clean for every file this plan touched (the only files it touches). Unrelated pre-existing/concurrent TypeScript errors were observed in `lib/engine/session.ts`, `lib/engine/evaluation-runner.ts`, and `app/api/interaction/chat/route.ts` — all three are being modified by other parallel executors (19-02/19-06/19-08) on `lib/engine/types.ts`, confirmed via `git status`/`git diff --stat` to be outside this plan's `files_modified` and not caused by any change in this plan. Left untouched per the scope boundary.

## Issues Encountered
None beyond the concurrent-executor interference noted above, which required no action from this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- `pitch-elevator` is now the **only** engine type opted into Phase 18's disengagement walk-out. **Phase 18's pending human UAT (18-05 / `18-VALIDATION.md`) must be run against the elevator, not the deck.** Per plan's output spec, `18-VALIDATION.md` and ROADMAP.md checkboxes were deliberately NOT edited by this plan.
- 19-04 and 19-05's four new deck modes will automatically satisfy this plan's inverted verifier assertions as soon as they register in `lib/engine/registry.ts`, since those checks iterate `listDeckModes()`/`getEngineType()` rather than hardcoding `pitch-deck`.
- 19-07 (removing the now-redundant auto-pick path for modes declaring the `interviewer` step) and 19-11 (human sign-off re-testing the investor wizard surface) can proceed against this plan's `setupSteps` change.
- `lib/pitch/elevator-type.ts`, `lib/pitch/elevator-prompts.ts`, and `lib/engine/` (disengagement.ts, termination.ts) are confirmed untouched (`git diff --stat` empty for all).

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*

## Self-Check: PASSED

All claimed files exist on disk and all three task commit hashes (`5765e29`, `6fae7f1`, `93a4a97`) are present in git history.
