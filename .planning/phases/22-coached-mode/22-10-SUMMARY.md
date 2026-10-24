---
phase: 22-coached-mode
plan: 10
subsystem: study-plan/coached
tags: [coach, grading, gates, persistence]
requires: [22-02, 22-05, 22-08]
provides:
  - gradeCoachedAttempt, COACHED_ACCEPTABLE_SCORE
  - coachTurn, legStateFromTurns, SOFT_CAP_ATTEMPTS_PER_LEG, SOFT_CAP_COACH_TURNS_PER_LEG, CoachTurnOrderError, UnspokenAttemptError
  - scripts/verify-coach-turn.ts
affects: [22-12]
key-files:
  created:
    - lib/study-plan/coached/grade-attempt.ts
    - lib/study-plan/coached/coach.ts
    - scripts/verify-coach-turn.ts
key-decisions:
  - "legReady means a LEG_DONE coach turn exists in the leg; any later turn throws CoachTurnOrderError"
  - "A DEMONSTRATE move without a demonstration, or a demonstration under another move, is rejected"
requirements-completed: [REQ-114, REQ-115]
duration: ~25min
completed: 2026-10-23
---

# Phase 22 Plan 10: Attempt Grader and Coach-Turn Orchestrator Summary

Every coach utterance is gated before persistence (speech gate, attempt-gated single demonstration, earned LEG_DONE, gated fallback) and every spoken rework is graded and parrot-checked, proven against stored data with stubbed models.

## Tasks

1. Attempt grader and coach-turn orchestrator - commit f2c84c2
2. Stubbed coach-turn battery - commit 7252399

## Notes

- The soft cap (4 attempts / 12 coach turns, both PROVISIONAL UNTIL CALIBRATED) is advisory: it is a prompt input; mechanically it only permits a flagged LEG_DONE with at least one attempt. Stated in the coach.ts header.
- Acceptable = model acceptable AND score >= 4 AND not parroted.
- Turn rows get the next seq with one retry on P2002.
- No new `competencyForDimension` importer. coach.ts imports only `coach-prompt` and `tips` from the coach layer.

## Verification

- `verify-coach-turn.ts` with the local DB: ALL PASS, DB section RAN (31 stored COACH rows re-validated).
- `verify-coach-tips.ts` ALL PASS (DB run). `verify-coach-containment.ts` exits 0; the non-empty-closure check now RUNS and passes (closure = coach.ts, 417 files walked).
- tsc clean for my files (checked scoped).

## Deviations from Plan

None - plan executed exactly as written. (Two battery cases were first written with wrong turn sequencing - a fallback leaves awaiting=REPLY - and were fixed in the test before commit.)

## Deferred Issues

None.

## Self-Check: PASSED

- FOUND: lib/study-plan/coached/grade-attempt.ts
- FOUND: lib/study-plan/coached/coach.ts
- FOUND: scripts/verify-coach-turn.ts
- FOUND commits: f2c84c2, 7252399
