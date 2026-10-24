---
phase: 22-coached-mode
plan: 09
subsystem: mastery
tags: [mastery, weights, coached-mode, ledger]
requires: [22-02, 22-05]
provides:
  - COACHED_SESSION weight bound to the model-graded class
  - recordCoachedContribution from graded CoachedTurn attempts
affects: [22-12]
key-files:
  modified:
    - lib/mastery/weights.ts
    - lib/mastery/ledger.ts
    - lib/study-plan/coached/contribution.ts
    - scripts/verify-mastery-weights.ts
    - scripts/verify-coach-tips.ts
    - scripts/verify-live-session-ingestion.ts
    - scripts/verify-mastery-compute.ts
    - scripts/verify-levels-goals.ts
decisions:
  - COACHED_SESSION and CHECK_MODEL_GRADED share one MODEL_GRADED_WEIGHT constant (0.20)
  - One contribution per closed leg (LEG_DONE), best non-parroted attempt, acceptable preferred
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 22 Plan 09: Coached contribution at the model-graded weight

Coached sessions now move mastery from the coach's grade of the student's reworked lines, at the same weight as a rewrite knowledge check (0.20, one shared constant), with no InteractionReport involved.

## REQ-116: how it is satisfied now

REQ-116's wording still holds (coached weight, below unaided practice, visible mastery moves). The mechanism changed. The score source is the coach's per-attempt grade on `CoachedTurn` rows, not an evaluator report. The weight is the model-graded class, not 0.40. Rows are linked by `sourceCoachedSessionId`. Pre-Phase-22 rows keep their snapshotted 0.40.

## Tasks

1. `dc9bbd0` (+ `6110a7f` fixture fix): `MODEL_GRADED_WEIGHT`, `WEIGHT_CLASS_BINDINGS`, new `CHECK_DETERMINISTIC > COACHED_SESSION` ordering, ledger `sourceCoachedSessionId` passthrough (input, row, create; `readContributions` returns it because it returns the full row). Section 9 of verify-mastery-weights adds the `===` binding check and a bite-proof (COACHED_SESSION=0.45 violates both the binding and the new ordering).
2. Rewrite of `recordCoachedContribution` (see commit below), plus the pure `contributionInputsFromCoachedLegs`.

## Expectations moved by the weight change

- verify-mastery-weights: no literal 0.4 expectation existed; nothing changed beyond the new section.
- verify-mastery-compute, verify-mastery-thinness, verify-mastery-surface: pass unchanged.
- verify-levels-goals: no expectation moved because of the weight (see Deferred for its one failure, unrelated).
- verify-coach-tips Section 4: the old comment/expectations quoting a 0.40 coached weight were rewritten with the section (assertions compare against `CONTRIBUTION_WEIGHTS`, not literals).

None of the weight-sensitive batteries needed an expectation edit.

## verify-coach-tips.ts

`git diff` shows hunks only at Section 3 (one added binding check) and the Section 4 function (`runDatabaseSection`). Sections 1, 2, 5, 6, 7 are byte-identical. Section 4 now has a pure no-DB mapping check plus the DB section (ran, with DATABASE_URL set to the local dev DB): 2 rows written, source COACHED_SESSION, weight === COACHED === CHECK_MODEL_GRADED, rawScores 0.75/0.5 with a parroted 5 ignored, second call 0, foreign user throws, no-LEG_DONE writes 0, mastery figure moves, live row outweighs coached.

## Deviations from Plan

**1. [Rule 3 - Blocking] Row fixtures** - `scripts/verify-mastery-compute.ts` and `scripts/verify-levels-goals.ts` build `MasteryContributionRow` literals; the new required `sourceCoachedSessionId: string | null` broke their types. Added `sourceCoachedSessionId: null` to each.

**2. [Rule 3 - Blocking] verify-live-session-ingestion** - it asserted that contribution.ts contains `contributionsFromReport` (REQ-124 delegation). The plan removes that import, so the check was inverted: it now asserts contribution.ts does NOT import from-report. The "does not import competencyForDimension" check is kept.

## Deferred Issues (out of scope, caused by other plans)

1. `verify-live-session-ingestion` check "competencyForDimension is imported in at most TWO non-test files" FAILS. Importers: `lib/mastery/from-report.ts`, `lib/study-plan/checks/sources.ts`, `lib/study-plan/coached/coach-prompt.ts` (22-08, a75acfa). That third importer is 22-08's; all other checks in the file pass. 22-08 should either stop importing it or the cap should be revisited.
2. `verify-levels-goals` Section 5 "no unlock/lock/prerequisite/gate term" FAILS on the word "locked" in `components/study-plan/coached/useCoachedPushToTalk.ts` (22-06, c862041). Not weight related.

## tsc

`npx tsc --noEmit` filtered to this plan's files (contribution.ts, lib/mastery, verify-coach-tips, verify-live-session-ingestion, verify-mastery-*, verify-levels-goals) is clean. `runtime.ts` call sites of `recordCoachedContribution` were not reported as errors (the signature is unchanged).

## Self-Check: PASSED

- lib/study-plan/coached/contribution.ts, lib/mastery/weights.ts: present.
- Commits dc9bbd0, 6110a7f and the contribution commit exist; each `git show --stat` listed only this plan's files.
- Batteries exit 0: mastery-weights, mastery-compute, mastery-thinness, mastery-surface, coach-tips (DB section run). Exceptions are the two deferred failures above.
