---
phase: 22-coached-mode
plan: 13
subsystem: study-plan/coached
tags: [coached-route, http, verification, thin-evidence]
requires: [22-12]
provides:
  - coached route PATCH actions turn, advance, complete
  - end-to-end coached battery driven through takeCoachTurn, with thin-evidence cases
affects: [22-14]
key-files:
  modified:
    - app/api/study-plans/path-steps/[stepId]/coached/route.ts
    - scripts/verify-coached-entry.ts
    - lib/study-plan/coached/runtime.ts
key-decisions:
  - "advance and complete take no body fields; the coach closes legs, the client never does"
  - "FRESH+complete is rejected for a thin-evidence session (nextLeg)"
requirements-completed: [REQ-113, REQ-114, REQ-115]
completed: 2026-10-23
---

# Phase 22 Plan 13: Coached Route and End-to-End Battery Summary

The single coached route now serves entry, resume, coach turns, advance and complete, and the entry battery proves a two-moment and a one-moment session end to end with stubbed scorer and coach.

## Tasks

1. Route: POST/GET/PATCH `turn | advance | complete`, `maxDuration = 60` - commit 57faf95
2. verify-coached-entry update - commit 3b3f37e

## Details

- PATCH `turn`: validates `utterance` (non-empty text up to 4000 chars, positive integer `spokenDurationMs`), calls `takeCoachTurn` with the step id from the URL. `UnspokenAttemptError` gives 400; `CoachTurnOrderError` and `CoachedLegOrderError` give 409 with `currentLeg`.
- `advance` / `complete`: `CoachedLegOrderError` and `CoachedLegNotDoneError` give 409 with `currentLeg` (plus `legReady: false` for not-done). Unknown action gives 400, checked before any lookup.
- POST maps `NoEligibleReplayTargetError` to the new "no moment shows this skill clearly enough" 409; `ReplayMomentUnavailableError` keeps the transcript message.
- Battery: Section 1 adds the takeCoachTurn route guard; Section 2 adds the thin-evidence table and the lenient-variant inverted check; Section 3 asserts each forbidden token individually; Section 4 drives OPEN, reply, invite, attempt, LEG_DONE through `takeCoachTurn` (stubbed generate/grade), asserts no new InteractionReport, and adds a thin-evidence user whose session completes after one leg and refuses advance. Check count: 131 before, 152 after.

## Verification

Full `npx tsc --noEmit`: clean. Exit 0, DB sections ran with no SKIP: verify-coached-entry, verify-coach-containment, verify-coached-mode-isolation, verify-coach-turn, verify-coached-runtime-surface, verify-live-session-ingestion.

## Deviations from Plan

**1. [Rule 1 - Bug] nextLeg allowed FRESH+complete on a thin-evidence session**
- **Found during:** Task 2 (the thin table in the plan requires FRESH+* REJECTED)
- **Fix:** `nextLeg` now needs `hasFreshMoment` for FRESH+complete. Unreachable in practice, but the pure rule now matches the documented table.
- **Files modified:** lib/study-plan/coached/runtime.ts
- **Commit:** 3b3f37e

Much of the Section 1-4 rewrite had already landed in 22-12; this plan added the remaining pieces rather than redoing them.

## Self-Check: PASSED

- FOUND: route.ts, scripts/verify-coached-entry.ts, lib/study-plan/coached/runtime.ts
- FOUND commits: 57faf95, 3b3f37e
