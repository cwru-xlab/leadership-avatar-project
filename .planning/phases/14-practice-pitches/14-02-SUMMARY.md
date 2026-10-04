---
phase: 14-practice-pitches
plan: 02
subsystem: engine
tags: [typescript, engine-config, termination, time-budget, pitch, snapshot]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{types,termination,time-budget}.ts and lib/report/snapshot.ts — seams consumed verbatim (no name drift)"
provides:
  - "TerminationPolicyConfig.avatarEndFloor + resolveTermination floor gate (fail-closed)"
  - "TimeBudgetConfig.firstTurnWindowSeconds / adjustableRangeSeconds + first-turn tail fragment + clampAdjustableBudget"
  - "InstanceConfig pitch-elevator and pitch-deck members; InteractionTypeConfig.instance.authoredInWizard"
  - "PitchInputSnapshot as kind:'pitch' member of InputSnapshot"
  - "scripts/verify-pitch-engine-extensions.ts — nine assertion sections including Phase 13 regression"
affects: [14-08-pitch-elevator-registry, 14-09-pitch-deck-registry, 14-05-slide-cursor-column, 14-11-visible-context-cursor, "15-16 types inheriting floor/soft-window/clamp"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Avatar-end floor is config-driven (avatarEndFloor.minAssistantTurns), never a hardcoded turn number; omission of assistantTurnCount fails closed when a floor is set"
    - "First-turn soft window is tail-block-only (REQ-73); no hardStop/expired flag on the window state"
    - "Student-adjustable session length is a clamp over adjustableRangeSeconds; proposal logic stays per-type"

key-files:
  created:
    - scripts/verify-pitch-engine-extensions.ts
  modified:
    - lib/engine/types.ts
    - lib/engine/termination.ts
    - lib/engine/time-budget.ts
    - lib/report/snapshot.ts

key-decisions:
  - "avatarEndFloor / firstTurnWindowSeconds / adjustableRangeSeconds / authoredInWizard are optional so registry.ts stays diff-empty — Plans 14-08 and 14-09 own the two pitch registry entries"
  - "checkpointing already lived on InteractionTypeConfig (Phase 13-07); this plan did not relocate or change any existing record's value"
  - "firstTurnWindow is optional on TimeBudgetState so Phase 13's verify-engine-primitives.ts object literals compile unchanged"
  - "package.json has no verify-* script pattern; invoke via `npx tsx scripts/verify-pitch-engine-extensions.ts`"

patterns-established:
  - "Pitch vocabulary (slide/deck) is confined to InstanceConfig / PitchInputSnapshot; termination.ts and time-budget.ts stay free of it"
  - "PitchInputSnapshot field names mirror pitch InstanceConfig members so the two cannot drift"

requirements-completed: [P14-SC1, P14-SC5]

# Metrics
duration: 5min
completed: 2026-10-04
---

# Phase 14 Plan 02: Pitch Engine Config Extensions Summary

**Additive Phase-13-shaped primitives for avatar-end floor, soft opening-turn window, adjustable budget clamp, and typed pitch instance/snapshot members — Phase 13's five types still reject every avatar end.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-04T04:13:03Z
- **Completed:** 2026-10-04T04:17:34Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Extended `TerminationPolicyConfig`, `TimeBudgetConfig`, `InteractionTypeConfig.instance`, and `InstanceConfig` with the four pitch-needed knobs without touching `registry.ts`.
- Enforced the avatar-end floor in `resolveTermination` (fail-closed when turn count missing) and rendered the soft first-turn window as REQ-73 tail-block content via `buildTimeBudgetFragment`; added `clampAdjustableBudget`.
- Added `PitchInputSnapshot` (`kind: "pitch"`) to the one `InputSnapshot` union with defensive `asInputSnapshot` narrowing.
- Proved all of the above — including every negative case and a Phase 13 ENGINE_TYPES regression — with `scripts/verify-pitch-engine-extensions.ts` (9 sections, all passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the engine config types with the floor, the soft window, the adjustable range and the pitch instance members** - `da26f83` (feat)
2. **Task 2: Enforce the floor in resolveTermination and render the soft window in the tail block** - `99c942f` (feat)
3. **Task 3: Prove the extensions, including every negative case** - `74a1fca` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/types.ts` — `avatarEndFloor`, `firstTurnWindowSeconds`, `adjustableRangeSeconds`, `authoredInWizard`, `pitch-elevator` / `pitch-deck` InstanceConfig members
- `lib/engine/termination.ts` — floor gate in `resolveTermination`; optional `assistantTurnCount`; `reason: "floor-not-met"`
- `lib/engine/time-budget.ts` — `firstTurnWindow` state, first-turn tail fragment, `clampAdjustableBudget`
- `lib/report/snapshot.ts` — `PitchInputSnapshot` + narrowing
- `scripts/verify-pitch-engine-extensions.ts` — executable proof (300 lines)

## Phase 13 seam reconciliation

Compared `phase_13_seams_consumed` against real exports in `13-01` / `13-02` / `13-03` SUMMARYs and the live modules:

| Plan name | Real export | Drift |
| --- | --- | --- |
| `InteractionTypeConfig`, `TerminationPolicyConfig`, `TimeBudgetConfig`, `VisibleContextConfig`, `InstanceConfig`, `ResolvedSessionConfig` | same | none |
| `resolveTermination`, `parseTerminationMarker` | same | none |
| `computeTimeBudgetState`, `buildTimeBudgetFragment` | same (+ new `clampAdjustableBudget`) | none |
| `InputSnapshot`, `asInputSnapshot` | same (+ new `PitchInputSnapshot` member) | none |
| `checkpointing` on type record | already on `InteractionTypeConfig` (13-07) | none — used real location |

`ResolvedSessionConfig` already carries `terminationPolicy`, `timeBudget`, `visibleContext`, `outcome`, and `instance` — no new resolved fields needed; new knobs arrive through those members.

## Decisions Made
See `key-decisions` in frontmatter — summarized: (1) all new config fields optional so Phase 13 registry records stay untouched; (2) `checkpointing` was already on the type record; (3) `firstTurnWindow` optional on the state object for Phase 13 verify-script literals; (4) no `package.json` script registration (no established pattern).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made `firstTurnWindow` optional on `TimeBudgetState`**
- **Found during:** Task 2
- **Issue:** Phase 13's `verify-engine-primitives.ts` constructs `TimeBudgetState` object literals without `firstTurnWindow`; a required field would break `tsc` while the plan forbids editing that script.
- **Fix:** Typed `firstTurnWindow?` optional; `buildTimeBudgetFragment` treats absent/null the same.
- **Files modified:** `lib/engine/time-budget.ts`
- **Committed in:** `99c942f`

**2. [Rule 3 - Blocking] Preserved concurrent Phase 15 `DifficultConversationInputSnapshot` in the union**
- **Found during:** Task 2
- **Issue:** Parallel Phase 15 had already added (and partially committed) a `difficult-conversation` union member on `lib/report/snapshot.ts` while this plan added `kind: "pitch"`.
- **Fix:** Kept both members in the `InputSnapshot` union and both narrowing branches so neither parallel plan loses its seam.
- **Files modified:** `lib/report/snapshot.ts`
- **Committed in:** `99c942f` (alongside pitch; Phase 15 also has its own commits for the DC member)

**3. [Rule 3 - Blocking] Floor gate already present from parallel Phase 15-01**
- **Found during:** Task 2
- **Issue:** Commit `3cdc551` (`feat(15-01): enforce avatarEndFloor in resolveTermination`) landed the same floor gate this plan specifies, after Task 1 introduced the config field.
- **Fix:** Retained the shared implementation (matches this plan's gate order and fail-closed behavior); Task 2's net new surface was time-budget + pitch snapshot. Verified by `verify-pitch-engine-extensions.ts` sections 1–5.
- **Files modified:** `lib/engine/termination.ts` (reconcile only)
- **Committed in:** `99c942f`

## Issues Encountered
None blocking. REQ-67 shared-DB Part 1 remains a Phase 13 close blocker only — not in this plan's scope.

## User Setup Required
None — no external service configuration required.

## Verification results
- `npx tsc --noEmit` — no errors in this plan's files (`lib/engine/{types,termination,time-budget}.ts`, `lib/report/snapshot.ts`). Unrelated parallel `lib/deck/pdf-extract.ts` error is out of scope.
- `npx tsx scripts/verify-pitch-engine-extensions.ts` — ALL PASS
- `npx tsx scripts/verify-engine-primitives.ts` — ALL PASS (unedited)
- `npx tsx scripts/verify-engine-config.ts` — ALL PASS
- `git diff --stat lib/engine/registry.ts prisma/schema.prisma` — empty for this plan's work
- `grep -in "slide\|deck" lib/engine/visible-context.ts lib/engine/termination.ts lib/engine/time-budget.ts` — nothing

## Next Phase Readiness
- Plans 14-08 / 14-09 can add `pitch-elevator` and `pitch-deck` registry records using `avatarEndFloor`, `firstTurnWindowSeconds`, `adjustableRangeSeconds`, and the new InstanceConfig members.
- Call sites that honor the floor should pass `assistantTurnCount` into `resolveTermination` (optional today for Phase 13 back-compat; omit → fail closed when a floor is set).
- First-turn window: pass `firstTurn: { startedAt, deliveredAt? }` into `computeTimeBudgetState`; fragment is already consumed wherever `buildTimeBudgetFragment` is wired (tail block only).

---
*Phase: 14-practice-pitches*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/engine/types.ts
- FOUND: lib/engine/termination.ts
- FOUND: lib/engine/time-budget.ts
- FOUND: lib/report/snapshot.ts
- FOUND: scripts/verify-pitch-engine-extensions.ts
- FOUND: .planning/phases/14-practice-pitches/14-02-SUMMARY.md
- FOUND commit: da26f83 (feat(14-02): extend engine config types for pitch primitives)
- FOUND commit: 99c942f (feat(14-02): enforce avatar-end floor and soft first-turn window)
- FOUND commit: 74a1fca (test(14-02): prove pitch engine extensions including negative cases)
- `npx tsx scripts/verify-pitch-engine-extensions.ts` exits 0
- `npx tsx scripts/verify-engine-primitives.ts` exits 0
- `npx tsx scripts/verify-engine-config.ts` exits 0
