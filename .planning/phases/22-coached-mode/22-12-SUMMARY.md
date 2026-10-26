---
phase: 22-coached-mode
plan: 12
subsystem: study-plan/coached
tags: [coached-runtime, instance, moments, coach-closed-legs]
requires: [22-02, 22-07, 22-08, 22-09, 22-10]
provides:
  - createCoachedSession (two real moments), markReplayLegComplete, retargetLegacyCoachedSession, InvalidFreshMomentError
  - enterCoachedStep, takeCoachTurn, advanceToFresh, completeCoachedSession, nextLeg(..., {hasFreshMoment}), CoachedLegNotDoneError, new CoachedLegView
affects: [22-13, 22-14]
key-files:
  modified:
    - lib/study-plan/coached/instance.ts
    - lib/study-plan/coached/runtime.ts
    - scripts/verify-coached-mode-isolation.ts
    - scripts/verify-coached-entry.ts
key-decisions:
  - "Phase derives from replayLegCompletedAt/completedAt; reportId no longer participates"
  - "A GET never creates or re-targets; a legacy unworked session is re-targeted only on POST"
  - "A stale legacy view (selectionBasis null) reports GROWTH_AREA_FALLBACK until a POST re-targets it"
requirements-completed: [REQ-113, REQ-114]
completed: 2026-10-23
---

# Phase 22 Plan 12: Coach-Only Runtime Summary

The coached runtime now runs on two real moments of the student's own, the coach closes each leg, and there is no engine session, generated scenario or InteractionReport.

## Tasks

1. instance.ts two-moment model and isolation battery Section 4 - commit 186d2d4
2. runtime.ts rebuild - commit cc47710
3. verify-coached-entry update (deviation, see below) - commit 62ae125

## Notes

- Removed `selectReplayTarget` (turn 0), `defaultGenerateFreshScenarioText`, `generateFreshScenarioPrompt`, `MAX_FRESH_SCENARIO_ATTEMPTS`, `InvalidFreshScenarioError`, `MAX_FRESH_SCENARIO_PROMPT_LENGTH`.
- `CoachedSessionView` still exposes `freshScenarioPrompt` (read-only, `string | null`) for pre-Phase-22 rows; it is never written.
- Thin-evidence sessions (`legCount` 1) complete after the REPLAY leg via `nextLeg(..., {hasFreshMoment:false})`.
- No new `competencyForDimension` importer (runtime.ts imports `rubricDimensionsForCompetency` from coach-prompt only).
- Section 1-3 of verify-coached-mode-isolation are byte-identical; the diff starts inside Section 4.

## Verification

`npx tsc --noEmit`: the only errors are the two expected ones in `app/api/study-plans/path-steps/[stepId]/coached/route.ts` (lines 172 `replayReportId`, 202 `reportId`), rewritten by 22-13.

Verifiers (local DB, DB sections RAN, no SKIP, no FAIL), each exit 0:
- verify-coached-mode-isolation, verify-coach-containment (Section 1 closure now lists coach.ts, runtime.ts and the coached route), verify-coach-turn, verify-coach-tips, verify-coached-moment-selection, verify-live-session-ingestion, verify-coached-runtime-surface, verify-next-step
- also verify-coached-entry and verify-coach-settings: exit 0

The runtime grep for `freshScenario|interaction/chat|practice/session|liveSystemPrompt|interactionReport.create|assembleSystemPrompt` prints nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] scripts/verify-coached-entry.ts asserted the removed Phase 21 behavior**
- **Found during:** Task 2 (tsc and a run failed: `replayMoment`, `reportId`, `replayReportId` no longer exist; first entry used turn 0 and a model-generated scenario)
- **Issue:** Section 4 drove the old flow (weak-report turn selection, `advanceToFresh({replayReportId})`, `completeCoachedSession({reportId})`, a COACHED_SESSION row keyed by sourceReportId, and the 21-21 coached-report skip guard through a FRESH report).
- **Fix:** Updated the assertions, not deleted. Section 4 now uses a stub scorer and two real transcripts and asserts: lowest-scored real moment, not turn 0, verbatim text and counterpart line, distinct fresh moment with `selectionBasis`, `freshScenarioPrompt` null, `CoachedLegNotDoneError` before the coach closes a leg, `CoachedLegOrderError` completing from REPLAY in a two-leg session, COACHED_SESSION rows keyed by `sourceCoachedSessionId` at the shared weight, no InteractionReport or LIVE_SESSION row produced, and GET-does-not/POST-does retarget of a legacy session. Section 2 gains the two thin-evidence `nextLeg` rows; Section 3 gains a no-engine-transport/no-freshScenario source assertion and reworded the report comment. Coach rows are seeded directly (the model path is covered by verify-coach-turn).
- **Dropped assertion:** the `recordLiveSessionContributions` skip-guard check through a coached FRESH report. A coached session no longer has a report, so that path cannot occur; the guard's own behavior is still covered by verify-live-session-ingestion.
- **Files modified:** scripts/verify-coached-entry.ts
- **Commit:** 62ae125

**2. [Rule 2 - Missing critical] Section 4 isolation cleanup** - added extra negative cases (fresh equals replay, foreign fresh report, half-set fresh) beyond the plan's list; part of 186d2d4.

## Deferred Issues

- The coached route and the `CoachedSessionShell` still use the Phase 21 shape; 22-13/22-14 own them. tsc errors listed above are those.

## Self-Check: PASSED

- FOUND: lib/study-plan/coached/instance.ts, lib/study-plan/coached/runtime.ts, scripts/verify-coached-mode-isolation.ts, scripts/verify-coached-entry.ts
- FOUND commits: 186d2d4, cc47710, 62ae125
