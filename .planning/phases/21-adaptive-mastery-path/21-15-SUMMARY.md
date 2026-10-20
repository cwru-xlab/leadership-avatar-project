---
phase: 21-adaptive-mastery-path
plan: 15
subsystem: study-plan
tags: [grading-contest, mastery-ledger, prisma-transaction, knowledge-checks]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "reverseContribution/readContributions/recordContributions (21-05); submitAndGrade and the KnowledgeCheckAttempt/GradingContest schema (21-11)"
provides:
  - "lib/study-plan/checks/contest.ts — raiseContest(), resolveContest(), listFlaggedChecks(), CONTEST_STATUSES"
  - "app/api/study-plans/checks/[attemptId]/contest/route.ts — POST endpoint for a student to contest their own grading"
  - "scripts/verify-grading-contest.ts — reversal/idempotence/ownership/flag-propagation battery, 30/30 against a real database"
affects: [21-22, 21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Contest-then-reverse-then-flag as three distinct steps rather than one nested write: the idempotence-critical step (contest creation, guarded by GradingContest.attemptId's @unique constraint) runs in a Prisma interactive transaction; the reversal and flag steps that cannot join that same low-level transaction (reverseContribution hardcodes the module prisma singleton) run immediately after it commits, using the REAL shared function rather than a reimplementation"
    - "P2002 caught OUTSIDE the interactive transaction, never inside it — a Postgres transaction aborts on the first error and refuses any further query until it ends, so looking up the existing contest (the P2002 recovery path) has to happen after the transaction has rolled back, against the base client"
    - "Race-safe flag-set via a single updateMany guarded on flaggedAt: null, instead of read-then-write, so a concurrent second contest cannot overwrite the first contest's flag reference"
    - "REJECTED restores by appending a NEW ledger row carrying the ORIGINAL occurredAt, never by clearing the original row's reversedAt — preserves the ledger's append-only invariant and the audit trail a later-reviewed contest depends on"

key-files:
  created:
    - lib/study-plan/checks/contest.ts
    - app/api/study-plans/checks/[attemptId]/contest/route.ts
    - scripts/verify-grading-contest.ts

key-decisions:
  - "DISCLOSED DEVIATION from the plan's literal 'everything in ONE prisma.$transaction' instruction, following 21-11-SUMMARY.md's precedent for the identical constraint: 21-05's reverseContribution hardcodes the module-level prisma singleton with no injectable transaction-client parameter, so it structurally cannot join the same low-level transaction as the GradingContest create. This plan's instruction was explicit that reverseContribution itself must be reused rather than its invariants reimplemented inline (the opposite choice 21-11 made for recordContributions), so the ownership/idempotence-critical part (attempt lookup + contest creation, where a race between two concurrent calls must not create two contests) runs in one prisma.$transaction, and the reversal + flag steps run immediately after it commits, calling the real reverseContribution and a race-safe updateMany. The cost: a narrow window between contest-creation and reversal where, in a mid-flight crash, a contest could exist with its contribution not yet reversed. No crash was observed in 30 live runs of the battery."
  - "A P2002 raised by GradingContest.attemptId's unique constraint is caught OUTSIDE the prisma.$transaction call, not inside its callback — a first attempt at catching it inside the transaction caused the recovery query (looking up the existing contest) to run against an already-aborted Postgres transaction, surfacing a 'current transaction is aborted' error instead of AlreadyContestedError. This was caught by the battery's own idempotence assertion (section 5) failing, not inferred from reading the code — see Issues Encountered."
  - "resolveContest's REJECTED path writes a NEW MasteryContribution restoring the original score rather than clearing the original row's reversedAt — un-reversing is the obvious implementation and the wrong one, per the plan's own framing. Confirmed by direct code inspection (the plan's named review item, not grep-assertable): there is no masteryContribution.update call anywhere in the REJECTED branch; the original row's reversedAt is left exactly as raiseContest set it."
  - "listFlaggedChecks's contestCount is computed by loading each flagged check's attempts and counting those with a non-null contest relation, rather than a separate groupBy query — keeps the shape (checkId/format/competencyKey/flagReason/contestCount/generationModel) simple and lets the battery assert a genuine two-attempts-one-check case (one check, two different students' attempts, both contested) reports contestCount: 2."

requirements-completed: []
requirements-partial: ["REQ-112"]

# Metrics
duration: ~50min
completed: 2026-10-20
---

# Phase 21 Plan 15: Grading Contest (Reversal + Flagging) Summary

**A student can contest a grading via an auth'd, ownership-scoped POST route; the contest immediately reverses the attempt's mastery contribution through 21-05's own `reverseContribution` and flags the generated question behind it — proven by a 30-assertion battery against a real database that the computed mastery figure itself changes, not merely a column.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-10-20
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `lib/study-plan/checks/contest.ts` ships `raiseContest()` (ownership-scoped, graded-only, 10..2000-character reason validation, idempotent via `GradingContest.attemptId`'s `@unique` constraint, reverses every unreversed `MasteryContribution` sourced from the attempt via 21-05's `reverseContribution`, flags the `KnowledgeCheck` via a race-safe `updateMany` guarded on `flaggedAt: null`), `resolveContest()` (UPHELD keeps the reversal and appends to the question's flag reason; REJECTED restores by writing a NEW contribution carrying the original `occurredAt`, never by un-reversing the original row — not exposed through any route in this plan, deliberately, since there is no admin review UI yet), and `listFlaggedChecks()` (ranks flagged questions by contest count).
- `app/api/study-plans/checks/[attemptId]/contest/route.ts` is the student-facing POST endpoint: 201 with `{contestId, contributionsReversed, checkFlagged}`, 400 on validation failure, 404 on a missing-or-not-owned attempt (same message both ways, deliberately, to avoid an id oracle), 409 on a duplicate contest (carrying the existing contest id), 500 with a generic message (never a raw Prisma error body). No GET/DELETE/resolution endpoint — a withdrawal's effect on the reversal is an undecided product question.
- `scripts/verify-grading-contest.ts` ran against the local migrated `DATABASE_URL` (DB-gated sections RAN, not SKIP, per this execution's plan-specific note) — 30/30 assertions pass, exit 0. The load-bearing assertion (section 2) recomputes `computeMastery` over `readContributions` before and after the contest and asserts the figure CHANGED — proving the mark stopped counting, not merely that a `reversedAt` column was set.

## Task Commits

Each task was committed atomically, with an explicit pathspec per the shared-working-tree protocol (three siblings — 21-13, 21-16, 21-25 — ran in parallel on the same git index):

1. **Task 1: Build contest raising, reversal and resolution** — `4144cf2` (feat) — `lib/study-plan/checks/contest.ts`
2. **Task 2: Add the student-facing POST route** — `a17b685` (feat) — `app/api/study-plans/checks/[attemptId]/contest/route.ts`
3. **Task 3: Verify reversal, idempotence, ownership and flag propagation** — `9b336e0` (test) — `scripts/verify-grading-contest.ts`
4. **Fix: duplicate-contest P2002 caught outside the transaction** — `10004b7` (fix) — `lib/study-plan/checks/contest.ts` (found by Task 3's own battery; see Deviations below)

## Files Created/Modified

- `lib/study-plan/checks/contest.ts` (~340 lines) — `CONTEST_STATUSES`, `raiseContest()`, `resolveContest()`, `listFlaggedChecks()`, `NotFoundError`, `NotGradedError`, `InvalidReasonError`, `AlreadyContestedError`, `ContestNotOpenError`, `ContestNotFoundError`
- `app/api/study-plans/checks/[attemptId]/contest/route.ts` (~113 lines) — `POST`
- `scripts/verify-grading-contest.ts` (~470 lines) — 12 numbered sections, no pure section (every assertion needs a database), explicit SKIP banner when `DATABASE_URL` is unset

## Decisions Made

See `key-decisions` in frontmatter for the full reasoning. In short:

1. The plan's literal "everything in ONE `prisma.$transaction`" instruction collides with `reverseContribution`'s hardcoded module-level `prisma` singleton (no injectable tx client) — the same structural constraint 21-11-SUMMARY.md disclosed for `recordContributions`. Because THIS plan's instruction is explicit that `reverseContribution` must be reused rather than reimplemented, the transaction boundary was narrowed to the part where a race is actually dangerous (ownership check + idempotent contest creation), with the reversal and flag steps as real-function calls immediately after.
2. A P2002 from the duplicate-contest unique constraint must be caught OUTSIDE the `prisma.$transaction` callback, not inside it — caught inside, the recovery lookup ran against an aborted Postgres transaction and surfaced the wrong error. This was found by the battery itself (see Issues Encountered), not anticipated in advance.
3. `resolveContest`'s REJECTED path appends rather than un-reverses — confirmed by direct code inspection (the plan's named, non-grep-assertable review item) that no `masteryContribution.update` touches `reversedAt` anywhere in that branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] P2002 recovery query ran against an aborted transaction**
- **Found during:** Task 3, running `scripts/verify-grading-contest.ts`'s section 5 (idempotence) against the real database
- **Issue:** The first implementation caught the `GradingContest.attemptId` unique-constraint violation (P2002) INSIDE the `prisma.$transaction(async (tx) => ...)` callback and immediately issued a recovery query (`tx.gradingContest.findUnique`) on the SAME `tx` client to find the existing contest id. Postgres aborts a transaction on its first error and rejects any further query until the transaction ends, so that recovery query itself failed, and `raiseContest` threw something other than `AlreadyContestedError` — the battery's section-5 assertion caught this as a `FAIL` on first run.
- **Fix:** Moved the P2002 catch to OUTSIDE the `prisma.$transaction` call (after it has rolled back and returned control), and issued the recovery query against the base `prisma` client instead of the now-dead `tx`.
- **Files modified:** `lib/study-plan/checks/contest.ts`
- **Verification:** Re-ran the full battery — all 30 assertions pass, exit 0, including section 5's idempotence check (the existing contest id surfaces correctly on a duplicate contest).
- **Commit:** `10004b7` (separate fix commit, landed after Task 3's battery surfaced the bug).

**Total deviations:** 1 auto-fixed (1 bug). No architectural changes were needed; `reverseContribution`/`lib/mastery/ledger.ts` were not modified (outside this plan's `files_modified`).

## REQ-112 Status (deliberately left Pending)

REQ-112's text requires a contest reachable "from the surface that showed them the mark." This plan ships the mechanism and the endpoint — the contest-raising logic, the immediate reversal through 21-05's ledger, the question-flagging, and the POST route a client can call — but NOT the calling affordance itself. That affordance (a "Contest this grading" control folded into the post-submission result view) is explicitly 21-22's job, per this plan's own Task 2 instruction and the plan-specific context for this execution. `REQUIREMENTS.md`'s REQ-112 checkbox and traceability row are left exactly as found (`[ ]` / `Pending`); `requirements mark-complete REQ-112` was NOT run. 21-20's validation should check both halves — this plan's endpoint/mechanism, and 21-22's affordance — before considering REQ-112 satisfied.

## Issues Encountered

One bug, auto-fixed and disclosed above (the P2002-inside-transaction recovery-query failure). No other issues. `npx tsc --noEmit` was clean after every task; `npm run build` succeeded with the new route appearing in the manifest (`ƒ /api/study-plans/checks/[attemptId]/contest`).

## User Setup Required

None. The local dev database was already migrated (all seven Phase 21 tables exist, `DATABASE_URL` set) per this execution's plan-specific context, and the DB-gated sections of both this plan's new battery and the two pre-existing verify scripts (`verify-check-grading.ts`, `verify-mastery-compute.ts`) ran for real, not SKIP.

## Next Phase Readiness

- `raiseContest`, `resolveContest` and `listFlaggedChecks` are ready for 21-22 to call `raiseContest` from the check-taking component's post-submission result view (the one thing this plan deliberately did not build), and for any future admin-review surface to call `resolveContest` (currently reachable only from a script, by design — there is no admin review UI in this phase).
- 21-20's validation pass should confirm REQ-112 only after 21-22 lands the calling affordance; this plan alone does not close it.
- No blockers identified for downstream plans. Only `lib/study-plan/checks/contest.ts`, `app/api/study-plans/checks/[attemptId]/contest/route.ts`, and `scripts/verify-grading-contest.ts` were touched — confirmed via each task's individual commit and the explicit-pathspec protocol observed throughout, alongside three concurrent sibling executors (21-13, 21-16, 21-25) working the same shared tree.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/checks/contest.ts`
- FOUND: `app/api/study-plans/checks/[attemptId]/contest/route.ts`
- FOUND: `scripts/verify-grading-contest.ts`
- FOUND: commit `4144cf2` (Task 1)
- FOUND: commit `a17b685` (Task 2)
- FOUND: commit `9b336e0` (Task 3)
- FOUND: commit `10004b7` (fix)
- `npx tsc --noEmit` clean
- `npm run build` succeeded, route in manifest
- `npx tsx scripts/verify-grading-contest.ts` exit 0, 30/30 assertions pass (DB-gated, ran not SKIP)
- `npx tsx scripts/verify-check-grading.ts` and `npx tsx scripts/verify-mastery-compute.ts` still exit 0, ALL PASS
