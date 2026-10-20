---
phase: 21-adaptive-mastery-path
plan: 12
subsystem: study-plan
tags: [coached-practice, engine-decision, isolation-guard, prisma]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "CoachedSession/StudyPlanPathStep Prisma models and applied migration (21-03); lib/study-plan/path.ts's createPath/markStepComplete and the state-dependent COACHED_SESSION reference rule (21-08)"
provides:
  - "lib/study-plan/coached/instance.ts: createCoachedSession, readCoachedSession, finishCoachedSession, COACHED_PHASES, CoachedSessionView"
  - ".planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md: the written decision scripts/verify-knowledge-check-surface.ts's ENGINE_IMPORT_CARVE_OUTS already cites as its authority"
  - "scripts/verify-coached-mode-isolation.ts: signature/registry/practice-tree/entry-enforcement battery"
affects: [21-16, 21-19, 21-20, 21-23, 21-24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A function signature as the structural isolation guard: pathStepId required and non-nullable, no overload, no stand-alone route — the call-site half of REQ-113, parallel to the registry-absence half"
    - "Derived-not-stored status: CoachedSessionView.phase is computed from completedAt/reportId, never persisted as a fourth column"
    - "A named, single-entry engine-import carve-out, authorized by a dedicated decision document the carve-out itself cites in advance of this plan landing"

key-files:
  created:
    - lib/study-plan/coached/instance.ts
    - .planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md
    - scripts/verify-coached-mode-isolation.ts
  modified: []

key-decisions:
  - "Coached mode reuses the engine's live session machinery (it IS a live avatar session) but is never registered in ENGINE_TYPES — registration is exactly what REQ-113 forbids being reachable through"
  - "21-06's 'no engine involvement' was scoped to knowledge checks (static graded questions with no session shape); generalizing it to coached mode (a live conversation) would be a misreading — recorded explicitly so a later reader does not over-generalize it"
  - "Coached sessions enable NO disengagement threshold — a coach does not walk out — which is why REQ-85's amendment is a boundary clarification, not a behaviour change: coached mode never carried the indicator REQ-85 forbids"
  - "finishCoachedSession writes CoachedSession.reportId/completedAt and then calls markStepComplete sequentially, NOT inside one prisma.$transaction with it — path.ts's markStepComplete takes no transaction client and is outside this plan's files_modified, so wrapping it would assert an atomicity guarantee the two calls do not actually have"

patterns-established:
  - "Pattern: a P2002 unique-constraint collision on a child-of-one-parent row resumes by returning the existing row (idempotent re-entry) rather than erroring, matching 21-08's PathAlreadyExistsError precedent"

requirements-completed: []

# Metrics
duration: ~45min
completed: 2026-10-20
---

# Phase 21 Plan 12: Coached Practice Instance Summary

**`lib/study-plan/coached/instance.ts` makes coached mode creatable only from a user-owned `COACHED_SESSION` path step, mandatorily replay-then-fresh, with its relationship to the engine decided and justified in `21-COACHED-ENGINE-DECISION.md` and its absence from every normal-practice surface proven by a 40-file, non-vacuous walk in `scripts/verify-coached-mode-isolation.ts`.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-10-20
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- **`21-COACHED-ENGINE-DECISION.md`** records the DECISION (reuse the engine's live session machinery, never register as an `ENGINE_TYPES` entry), the investigation it rests on (what a registered type costs vs. what a coached session genuinely needs), three binding CONSEQUENCES (normal `InteractionReport` + COACHED_SESSION weight; NO disengagement threshold, tying directly to REQ-85's amendment; `CoachedSession.reportId` as the join 21-16 reads), and three named REJECTED alternatives (registering a `coached-practice` type, a coach flag on `ResolvedSessionConfig`, coaching inside normal practice sessions). It explicitly addresses the apparent contradiction with 21-06's "no engine involvement" by scoping that decision to knowledge checks only. This document is the authority `scripts/verify-knowledge-check-surface.ts`'s pre-existing `ENGINE_IMPORT_CARVE_OUTS` already cites — it was written second but was always this plan's dependency.
- **`lib/study-plan/coached/instance.ts`** (326 lines) implements that decision: `createCoachedSession` loads the target step by id joining path → studyPlan → userId, requires `kind === "COACHED_SESSION"` (throwing `NotReachableOutsideAPathError` otherwise — no overload, no optional `pathStepId`, no stand-alone route), then enforces REPLAY (an owned `InteractionReport` + an in-range `replayTurnIndex`) and FRESH (non-empty, length-bounded `freshScenarioPrompt`) as both mandatory before any row is written. A `P2002` collision on the `@unique pathStepId` resumes the existing session rather than erroring, writing `coachedSessionId` back onto the step in the same transaction as the create. `readCoachedSession` derives `phase` (`REPLAY` / `FRESH` / `COMPLETE`) from `completedAt`/`reportId` rather than storing it, and does no S3 I/O. `finishCoachedSession` sets `reportId`/`completedAt` then calls `markStepComplete` (21-08), and writes zero mastery-ledger rows — 21-16 owns that split.
- **`scripts/verify-coached-mode-isolation.ts`** proves, in order: (1) the required-`pathStepId` signature, the absence of any stand-alone route, and `COACHED_PHASES === ["REPLAY", "FRESH"]`; (2) no `ENGINE_TYPES` slug/label mentions coaching and the registry's length is unchanged at 13; (3) a 40-file walk of `components/practice/` + `app/practice/` (printed and count-asserted `> 5`, with `PracticeSessionShell.tsx` confirmed present by name) finds zero coached-mode imports or identifiers anywhere in that tree; (4), against a live database, every wrong entry route (wrong step kind, foreign step, out-of-range turn index, foreign report, empty fresh prompt) throws, a valid create resumes idempotently on a duplicate call, and `finishCoachedSession` completes the step while writing no `MasteryContribution` row.

## Task Commits

Each task was committed atomically, with an explicit pathspec per the concurrency constraint:

1. **Task 1: Write the coached-mode engine decision** — `e08d2c1` (docs)
2. **Task 2: Build path-step-only coached session creation** — `9168179` (feat)
3. **Task 3: Verify isolation from normal practice** — `1f03b81` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md` — the engine-relationship decision record.
- `lib/study-plan/coached/instance.ts` — `COACHED_PHASES`, `CoachedSessionView`, `createCoachedSession`, `readCoachedSession`, `finishCoachedSession`, plus `NotReachableOutsideAPathError` / `InvalidReplayTargetError` / `InvalidFreshScenarioError` / `CoachedSessionAlreadyCompleteError`.
- `scripts/verify-coached-mode-isolation.ts` — the four-section verifier described above.

## Decisions Made

- See `key-decisions` in the frontmatter above — the full reasoning for each lives in `21-COACHED-ENGINE-DECISION.md` and in `instance.ts`'s own module-header and `finishCoachedSession` comments.
- Used `prisma.$transaction` for the create-and-write-back pair inside `createCoachedSession` (both writes genuinely belong to one atomic unit, and both go through the same `tx` client), but deliberately did NOT attempt the same wrapping for `finishCoachedSession` + `markStepComplete`, because `markStepComplete` is not in this plan's `files_modified` and takes no transaction client — see the dedicated code comment and the `key-decisions` entry above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verifier's own target file contained the literal forbidden word it checked for**
- **Found during:** Task 3, first run of `scripts/verify-coached-mode-isolation.ts`
- **Issue:** Section 1 asserts `instance.ts` contains no `standalone` / `adHoc` / `withoutPath` identifier. `instance.ts`'s own doc comments explained the absence using the English word "standalone" in quotes, which the literal regex also matched — a self-inflicted failure against the very document explaining the guarantee, not an actual violation of the guarantee.
- **Fix:** Reworded the two comments to say "stand-alone (path-free)" instead of quoting the literal identifier, preserving the explanation without tripping the verifier's own string search.
- **Files modified:** `lib/study-plan/coached/instance.ts`
- **Verification:** `npx tsx scripts/verify-coached-mode-isolation.ts` — Section 1 passes; full battery exits 0.
- **Committed in:** `1f03b81` (bundled with Task 3, since it was caught by and fixed for that task's own verifier)

**2. [Rule 1 - Bug] `recordContributions` identifier appeared in a doc comment**
- **Found during:** Task 2's own verify step (`grep -c 'recordContributions' lib/study-plan/coached/instance.ts` must return 0)
- **Issue:** The module header explained the no-mastery-contribution guarantee by naming the function `recordContributions` directly, which the plan's own grep check (correctly) forbids appearing anywhere in the file, including comments — the check is proving the absence of a *call*, and a looser implementation would have let the identifier sneak in as prose.
- **Fix:** Reworded to describe the guarantee ("does NOT write a mastery ledger contribution") without naming the function.
- **Files modified:** `lib/study-plan/coached/instance.ts`
- **Verification:** `grep -c 'recordContributions' lib/study-plan/coached/instance.ts` returns `0`.
- **Committed in:** `9168179` (Task 2)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in my own draft text caught by the plan's own verification commands before the task was considered done)
**Impact on plan:** None on scope; both were wording-only fixes to documentation comments, required for the plan's own named verification commands to pass as written.

## Issues Encountered

None beyond the two self-caught wording issues above. `npx tsc --noEmit` surfaced pre-existing errors in `scripts/verify-check-grading.ts`, an uncommitted, in-progress file belonging to a concurrently running sibling plan (confirmed via `git status --short`, which shows it as untracked `??`) — out of scope per this plan's concurrency constraint, not touched, and not counted against this plan's own `tsc` cleanliness (`npx tsc --noEmit 2>&1 | grep -v verify-check-grading` is empty).

## User Setup Required

None. The local dev database already has 21-03's migration applied (per 21-08's summary and this plan's own DB-gated Section 4, which ran — not SKIP — using the ambient `DATABASE_URL`).

## Next Phase Readiness

- `lib/study-plan/coached/instance.ts` is ready for 21-16 (mastery contribution recording, keyed off `CoachedSession.reportId`), 21-19 (the API route creating path steps, including `COACHED_SESSION` ones), 21-20 (the no-gate reasoning for coached sessions, which depends on this plan's "NO disengagement threshold" record), and 21-23/21-24 (the coached-session runtime that calls `createCoachedSession`/`readCoachedSession`/`finishCoachedSession` and owns the S3 transcript read this module deliberately does not do).
- No blockers. `npx tsc --noEmit` is clean for every file this plan touches; `npx tsx scripts/verify-coached-mode-isolation.ts` and `npx tsx scripts/verify-path-model.ts` both exit 0 with their DB-gated sections run, not skipped.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/coached/instance.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md`
- FOUND: `scripts/verify-coached-mode-isolation.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-12-SUMMARY.md`
- FOUND: commit `e08d2c1` (Task 1)
- FOUND: commit `9168179` (Task 2)
- FOUND: commit `1f03b81` (Task 3)
