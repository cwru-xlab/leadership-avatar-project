---
phase: 22-coached-mode
plan: 07
subsystem: study-plan/coached
tags: [moment-selection, per-turn-scoring, placement-guard]
requires: [22-02, 22-03, 22-04]
provides: [moment-scoring, moment-selection, coached-placement-guard]
affects: [22-12]
tech-stack:
  added: []
  patterns: [model-graded scorer with DB cache, injectable scorer/readTranscript for credential-free tests]
key-files:
  created:
    - lib/study-plan/coached/moment-scoring.ts
    - lib/study-plan/coached/moment-selection.ts
    - scripts/verify-coached-moment-selection.ts
  modified:
    - app/api/study-plans/[planId]/path/route.ts
decisions:
  - "Fallback to growth-area ranking only when EVERY report's scoring fails; recorded as basis GROWTH_AREA_FALLBACK with a warn (class names only)."
  - "Scorer output is validated both inside defaultTurnScorer (with 2 retries) and again in scoreTurnsForCompetency, so an injected scorer can never persist invalid rows."
  - "Placement walk stays inline in the route (Next route files cannot export helpers); the battery mirrors the walk."
metrics:
  tasks: 3
  files: 4
completed: 2026-10-23
requirements: [REQ-114]
---

# Phase 22 Plan 07: Coached Moment Selection Summary

Per-turn model-graded competency scores (cached in MomentCompetencyScore) feed a deterministic selector that picks the lowest-scored real turn as the REPLAY moment and a distinct second as FRESH, with a recorded growth-area fallback, and the path route now places a coached step only where entry will find a qualifying turn.

## Commits
- 80d10a4 feat(22-07): per-turn competency scorer with cache
- c0688ae feat(22-07): selectCoachedMoments and DB-gated battery
- 2c5f48e feat(22-07): path route placement guard on the shared predicate

## Verification
- Full unfiltered `npx tsc --noEmit` at the wave-1 gate: clean (no errors in wave-1 files, no fixes needed). After Task 1 a single error appeared in `scripts/verify-levels-goals.ts` (`sourceCoachedSessionId` missing on `MasteryContributionRow`), from another concurrent plan's in-flight work; not mine, not touched. A later run was fully clean.
- `verify-coached-moment-selection.ts` against the local DB: DB section RUN (not SKIP), 26 checks ok including the bite-proof (Phase 21 first-user-turn selector is caught) and placement cases P2a-P2c.
- `verify-next-step`, `verify-path-surface`, `verify-generation-sources`, `verify-moment-boundary` all exit 0.
- Latency of the placement walk: not measured against a real model (all tests use a stub scorer). Design: normally one competency's reports are scored, in parallel, one model call per uncached report, inside the route's 60s maxDuration. Needs a real-model observation during UAT.

## Deviations from Plan
**[Process] Placement battery cases landed in the Task 2 commit.** I wrote the whole script (including the placement section P0-P3) before the route change, so those cases are in c0688ae rather than the Task 3 commit; at that commit the P0 route-grep checks would fail until 2c5f48e. Final tree passes.

**[Design note] Placement walk is mirrored, not shared.** The plan puts the walk inline in the route (grep requires the call there), and Next route files cannot export helpers, so the battery re-implements the same walk against the same selector rather than invoking the route. Static checks assert the route calls `selectCoachedMomentsFromReports(` and handles `NoQualifyingMomentError`.

**[Rule 2 - robustness] Non-NoQualifying errors in the placement walk are logged and skipped** (class name only) so a scoring outage cannot block path generation; that competency is simply not placed.

## Self-Check: PASSED
Files and commits (80d10a4, c0688ae, 2c5f48e) verified present.
