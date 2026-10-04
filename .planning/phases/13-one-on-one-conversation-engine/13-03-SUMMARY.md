---
phase: 13-one-on-one-conversation-engine
plan: 03
subsystem: engine
tags: [typescript, engine-primitives, termination, context-slicing, outcome-validation, time-budget]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{types,registry,resolve}.ts from plan 13-01 — the four primitive config shapes and ENGINE_TYPES this plan's runtime primitives operate on"
provides:
  - "lib/engine/termination.ts: parseTerminationMarker(assistantText) and resolveTermination({policy, source, reason}) — avatar-initiated session end with a recorded, policy-gated reason"
  - "lib/engine/visible-context.ts: applyVisibleContext(config, sessionState, turn) — general per-turn session-state slicing with optional per-channel cursor, zero slide/deck vocabulary"
  - "lib/engine/outcome.ts: validateOutcome(config, produced) — type-declared JSON outcome record validation"
  - "lib/engine/time-budget.ts: computeTimeBudgetState({config, startedAt, now}) and buildTimeBudgetFragment(state) — pure remaining-time computation and its tail-block-only fragment"
  - "scripts/verify-engine-primitives.ts: executable proof of all four primitives, including the negative cases, against the real ENGINE_TYPES records"
affects: [13-06-prompt-assembly, 13-07-session-routes, "14-pitch-elevator (termination + time budget + outcome consumer)", "14-16 new interaction types generally"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Avatar-initiated termination reuses lib/interview/turn-control.ts's trailing-marker idiom via a new, separate marker (<engine-end reason=\"...\" />) rather than inventing a second mechanism or extending the existing marker's grammar"
    - "The per-turn visible-context slice is a general session-state slicer keyed by opaque channel names plus an optional per-channel array cursor — not slide/deck-specific; verified by a grep assertion in the plan itself"
    - "Time-budget state is computed with an injected `now` (never Date.now() internally), and its rendering is a tail-block-only fragment — mirrors buildProgressBlock's REQ-73 discipline, documented with the same reasoning in the file header"

key-files:
  created:
    - lib/engine/termination.ts
    - lib/engine/visible-context.ts
    - lib/engine/outcome.ts
    - lib/engine/time-budget.ts
    - scripts/verify-engine-primitives.ts
  modified: []

key-decisions:
  - "Marker syntax chosen and documented in termination.ts's file header: a trailing `<engine-end reason=\"...\" />`, distinct from turn-control.ts's `<interview-turn .../>` so the two controller mechanisms never collide in the same reply."
  - "parseTerminationMarker only recognizes a TRAILING marker (unlike parseInterviewTurn, which also strips non-trailing stray markers) — termination is a final-turn-only concept, so a mid-reply occurrence is left as-is rather than silently stripped, keeping the function simpler without losing the required round-trip guarantee."
  - "A termination marker with no reason attribute is stripped but returns termination: null — the model must supply SOME reason to be considered at all; resolveTermination is what then checks the reason against the policy's closed list. This two-stage split (parse, then resolve) keeps avatarEndReasons enforcement entirely out of the regex layer."
  - "applyVisibleContext's cursor is read off the TURN argument, not the config — VisibleContextConfig only declares which channels are admitted (\"*\" or a list). The cursor mechanism needed for progressive reveal (REQ-63's slide-10/slide-4 example, deliberately described without naming slides in the file so the grep assertion holds) lives in the per-call turn object instead, since it varies per call and the config must stay a static, session-constant declaration."
  - "validateOutcome treats every declared field as optional with no required-field concept — the plan's done criteria only asked for unknown-key rejection, kind-mismatch rejection, and missing-optional-field acceptance; no built-in type declares any outcome fields today, so there was no real case to decide required-ness against, and omitting the concept keeps the validator's surface smaller for 14-16 to extend."

requirements-completed: [REQ-62, REQ-63, REQ-64]

# Metrics
duration: 30min
completed: 2026-10-04
---

# Phase 13 Plan 03: Engine Runtime Primitives Summary

**Four pure `lib/engine/` modules — avatar-initiated termination with a policy-gated recorded reason, a general per-turn visible-context slice, type-declared outcome validation, and a tail-block-only time budget — proven against the real `ENGINE_TYPES` records with zero route wiring.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-04T01:23 (approx, by first commit)
- **Completed:** 2026-10-04T01:53
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments
- `termination.ts` reuses `turn-control.ts`'s trailing-marker idiom under a new, non-colliding marker (`<engine-end reason="..." />`); `resolveTermination` gates student/avatar termination against `TerminationPolicyConfig`, rejecting any avatar reason outside the closed `avatarEndReasons` list.
- `visible-context.ts` generalizes per-turn session-state slicing over opaque named channels plus an optional per-channel array cursor, with zero slide/deck vocabulary anywhere in the file (verified by `grep -in "slide\|deck"` returning nothing).
- `outcome.ts` validates a produced outcome record against a type's declared field list: unknown keys and kind mismatches rejected, missing fields allowed, empty-fields types accept only `{}`.
- `time-budget.ts` computes remaining time purely from an injected `now`, with `remainingSeconds: null` preserved for unbudgeted types, and its rendering fragment documented and built as tail-block-only content per REQ-73.
- `scripts/verify-engine-primitives.ts` proves all of the above in 7 sections (24 assertions), including rejecting avatar termination against every one of the 5 real `ENGINE_TYPES` records (all ship `avatarMayEnd: false` today).

## Task Commits

Each task was committed atomically:

1. **Task 1: terminationPolicy — avatar-initiated end with a recorded reason** - `2211c66` (feat)
2. **Task 2: visible-context slice, outcome record, and time budget** - `fb9b466` (feat)
3. **Task 3: Prove all four primitives, including the negative cases** - `eeaaa36` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/termination.ts` - `parseTerminationMarker`, `resolveTermination`
- `lib/engine/visible-context.ts` - `applyVisibleContext`
- `lib/engine/outcome.ts` - `validateOutcome`
- `lib/engine/time-budget.ts` - `computeTimeBudgetState`, `buildTimeBudgetFragment`
- `scripts/verify-engine-primitives.ts` - 7-section executable proof

## Decisions Made
See `key-decisions` in frontmatter above — summarized: (1) a new, distinct marker syntax (`<engine-end reason="..." />`) rather than extending the existing turn-control marker; (2) termination marker recognition is trailing-only, simpler than `parseInterviewTurn`'s stray-marker handling since termination is inherently a final-turn concept; (3) the parse/resolve split keeps reason-vocabulary enforcement entirely in `resolveTermination`, never in the regex; (4) the visible-context cursor lives on the per-call `turn` argument, not the static config, since a config value must stay session-constant; (5) `validateOutcome` has no required-field concept, since no built-in type declares outcome fields yet and the plan's done criteria didn't ask for it.

## Deviations from Plan

None — plan executed exactly as written. One eslint `--fix` pass in Task 3 reformatted Task 1's already-committed `termination.ts` (whitespace/line-wrapping only, no behavior change), folded into the Task 3 commit rather than a separate commit, following the same precedent `13-01-SUMMARY.md` recorded.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/engine/{termination,visible-context,outcome,time-budget}.ts` are ready for plan 13-06 (chat route / prompt assembly) and 13-07 (session routes) to wire against without redefining these signatures.
- Exported signatures for 13-06/13-07 to consume: `parseTerminationMarker(assistantText): { cleanedText, termination: {reason} | null }`; `resolveTermination({policy, source, reason}): {ok, recordedReason}`; `applyVisibleContext(config, sessionState, turn?): sessionState`; `validateOutcome(config, produced): {ok, outcome} | {ok, errors}`; `computeTimeBudgetState({config, startedAt, now}): TimeBudgetState`; `buildTimeBudgetFragment(state): string`.
- Chosen termination marker syntax for 13-06/13-07 to instruct models to emit (via a type's own `liveSystemPrompt`, not this plan): trailing `<engine-end reason="..." />`.
- Zero behavior change confirmed: `git diff --stat` shows only this plan's new files plus the pre-existing (not-this-plan) `AGENTS.md` modification; `lib/interview/prompts.ts` and `lib/interview/turn-control.ts` are byte-unchanged.
- Nothing wired into a route by this plan, per the plan's own non-negotiable — all four primitives have no consumer yet.

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/engine/termination.ts
- FOUND: lib/engine/visible-context.ts
- FOUND: lib/engine/outcome.ts
- FOUND: lib/engine/time-budget.ts
- FOUND: scripts/verify-engine-primitives.ts
- FOUND commit: 2211c66 (feat(13-03): terminationPolicy — avatar-initiated end with a recorded reason)
- FOUND commit: fb9b466 (feat(13-03): visible-context slice, outcome validation, and time budget)
- FOUND commit: eeaaa36 (test(13-03): prove all four engine primitives including the negative cases)
- `npx tsc --noEmit` clean
- `npx eslint lib/engine` clean (0 errors, 0 warnings)
- `npx tsx scripts/verify-engine-primitives.ts` exits 0, all 7 sections PASS (24 assertions)
- `npx tsx scripts/verify-engine-config.ts` still exits 0 (13-01 unbroken)
- `grep -in "slide\|deck" lib/engine/visible-context.ts` returns nothing
- `git diff --stat` against `lib/interview/prompts.ts` and `lib/interview/turn-control.ts` is empty — byte-unchanged
