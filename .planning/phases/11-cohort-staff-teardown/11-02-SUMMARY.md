---
phase: 11-cohort-staff-teardown
plan: 02
subsystem: api
tags: [nextjs, api-routes, dead-code-removal, prisma]

# Dependency graph
requires:
  - phase: 11-cohort-staff-teardown
    provides: "11-01 deleted app/student-history/** and app/teacher/class/**, the only callers of this route tree"
provides:
  - "app/api/student-history/** (10 route files) deleted"
  - "lib/student-history-service.ts deleted"
  - "Confirmation that Attempt/CaseAssignment have zero live readers outside operator/seed scripts"
affects: [11-05, 11-06, 11-07]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/api/student-history/search-students/route.ts (deleted)
    - app/api/student-history/search-cases/route.ts (deleted)
    - app/api/student-history/search-sections/route.ts (deleted)
    - app/api/student-history/section/[sectionId]/route.ts (deleted)
    - app/api/student-history/section/[sectionId]/cases/route.ts (deleted)
    - app/api/student-history/section/[sectionId]/students/route.ts (deleted)
    - app/api/student-history/overview/[sectionId]/[studentId]/route.ts (deleted)
    - app/api/student-history/gradebook/[classId]/[caseId]/route.ts (deleted)
    - app/api/student-history/detail/[sectionId]/[studentId]/[caseId]/route.ts (deleted)
    - app/api/student-history/interaction-log/[sectionId]/[studentId]/[caseId]/route.ts (deleted)
    - lib/student-history-service.ts (deleted)

key-decisions:
  - "Deleted app/api/student-history/** and lib/student-history-service.ts as a discretion call: outside the three checkpoint-gated groups, sole callers already removed in 11-01, zero live Attempt/CaseAssignment readers confirmed by audit."
  - "middleware.ts left untouched: grep found no /api/student-history entry, so there is nothing for 11-05 to remove."

patterns-established: []

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-09-23
---

# Phase 11 Plan 02: Delete legacy student-history API tree Summary

**Deleted the 10-route `app/api/student-history/**` tree and its sole backing service `lib/student-history-service.ts`, confirmed by audit that no live code anywhere still reads `prisma.attempt`/`prisma.caseAssignment` outside seed/operator scripts, and left the Prisma schema and `middleware.ts` completely untouched.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-23T18:31:57Z
- **Tasks:** 2 (1 deletion, 1 read-only audit)
- **Files modified:** 11 deleted (10 route files + 1 service lib)

## Accomplishments
- Proved zero live callers of `app/api/student-history/**` and `student-history-service` outside the tree itself, then deleted both.
- Confirmed zero live readers of the `Attempt`/`CaseAssignment` Prisma models outside `prisma/seed.ts` and `scripts/sync-s3-to-db.ts` (both explicitly out of scope, left untouched).
- `prisma/schema.prisma` verified unchanged (`model Attempt` still present, `git diff --stat` empty).
- `middleware.ts` verified unchanged (`git diff --stat` empty; no `/api/student-history` entry ever existed to remove).
- `npx tsc --noEmit` exits clean with the tree removed.

## Task Commits

Each task was intended to be committed atomically, but a shared-git-index race with the concurrently-running 11-04 plan (the same hazard first documented in `08-08-SUMMARY.md` and `09-02-SUMMARY.md` — no worktree isolation between parallel agents in this working directory) absorbed Task 1's staged deletions into 11-04's own commit before this plan's `git commit` ran:

1. **Task 1: Delete `app/api/student-history/**` and `lib/student-history-service.ts`** — committed as part of `d3e3345` ("fix(11-04): drop cohortId from interaction start required fields"), NOT under an 11-02 commit message. Verified independently via `git show d3e3345 --name-only` (all 11 expected paths present) and `ls`/`git diff --stat` against the current tree (both files/dirs confirmed absent, zero outstanding diff). No content was lost; only the commit message/authorship of the deletion is misattributed to a sibling plan.
2. **Task 2: Confirm Attempt/CaseAssignment dead in live code** — read-only audit, no source files modified, nothing to commit. Findings recorded below.

**Plan metadata:** (this commit, docs: complete plan)

## Discretion call

Per the plan's explicit grant of discretion to remove `app/api/student-history/**`:
(a) This tree sits outside the three checkpoint-gated API groups named in `11-CONTEXT.md` (`/api/cohort/*`, `/api/codes/*`, `/api/student/cases`) — it is a wholly separate legacy API family.
(b) Its only callers anywhere in the app were `app/student-history/**` and `app/teacher/class/**`, both already deleted in 11-01.
(c) A repo-wide audit (`grep -rn "prisma\.attempt\|prisma\.caseAssignment" app lib components scripts prisma`) showed zero live readers of `Attempt`/`CaseAssignment` in `app/`, `lib/`, or `components/` — the only remaining hits are in `prisma/seed.ts` and `scripts/sync-s3-to-db.ts` (operator/seed tooling, deliberately left alone).
(d) The Prisma schema was left fully intact regardless: `git diff --stat prisma/schema.prisma` is empty and `grep -c "model Attempt" prisma/schema.prisma` returns `1`. Schema cleanup remains a deferred phase gated on the 11-03 checkpoint.

A secondary grep for the literal strings `Attempt\b|CaseAssignment` across `app`, `lib`, `components` turned up several matches, all confirmed to be unrelated English-word/variable-name false positives (e.g., `app/error.tsx`'s "Attempt to recover" comment, `session.attemptNumber` in `case-play`, `lastAttempt`/`attemptNumber` local variables in `app/api/codes/[codeId]/student/[studentEmail]/detail/route.ts` and `app/api/interaction/finish/route.ts`, and a retry-loop log line in `lib/rag/pinecone-client.ts`) — none reference the Prisma `Attempt`/`CaseAssignment` models. `app/api/codes/**` was not modified; this was an audit-only observation, not a change.

## middleware.ts finding (for 11-05)

`grep -n "student-history" middleware.ts` returned no output (exit code 1, no matches).

**No `/api/student-history` entry exists in `middleware.ts` — no cleanup needed.**

This matches `11-RESEARCH.md`'s expectation. `git diff --stat middleware.ts` is empty — this plan did not touch the file.

## Files Created/Modified
- `app/api/student-history/**` (10 route files) — deleted
- `lib/student-history-service.ts` — deleted

## Decisions Made
See "Discretion call" section above. In summary: the deletion is justified as outside checkpoint scope, its callers already gone, and audited to have zero remaining live Attempt/CaseAssignment readers; schema and middleware were deliberately left untouched.

## Deviations from Plan

### Auto-fixed Issues

None in the Rule 1-3 sense — no bugs, missing functionality, or blocking issues were found or fixed. The only deviation is procedural:

**1. [Process — shared git index] Task 1's deletion commit was absorbed into a concurrent sibling plan's commit**
- **Found during:** Task 1, at `git commit` time
- **Issue:** This working directory has no worktree isolation between parallel agents (documented hazard from `08-08-SUMMARY.md`/`09-02-SUMMARY.md`). Between staging (`git add`) and committing, the 11-04 agent (running concurrently, permitted to touch `app/api/interaction/start/route.ts`) ran its own `git commit`, which picked up this plan's already-staged deletions alongside its own change, producing `d3e3345`.
- **Fix:** No fix needed — the deletion content is correct and fully present at `HEAD`. Verified via `git show d3e3345 --name-only` (all 11 expected file paths listed as deleted) and re-confirmed via `ls app/api/student-history lib/student-history-service.ts` (both absent) and `git diff --stat` against the target paths (empty, i.e., no pending changes — because they're already committed).
- **Files modified:** None beyond the plan's own intended deletions.
- **Verification:** `npx tsc --noEmit` clean; `grep -rn "student-history" app lib components` empty; `git diff --stat middleware.ts` empty; `git diff --stat prisma/schema.prisma` empty.
- **Committed in:** `d3e3345` (not an 11-02-authored commit message, but contains 11-02's Task 1 content)

---

**Total deviations:** 1 (process-only, no code impact)
**Impact on plan:** None on correctness or scope. The commit message/authorship for the file deletions is misattributed to 11-04's commit rather than a dedicated 11-02 commit; the deletions themselves are complete, verified, and match the plan exactly.

## Issues Encountered
- The shared-git-index race above delayed discovering that Task 1 was already committed under a sibling plan's message — resolved by independently verifying file state and commit contents rather than re-committing (which would have produced an empty/no-op commit since nothing remained staged).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The legacy `app/api/student-history/**` API family and its service lib are fully gone; no dangling references remain in `app`, `lib`, or `components`.
- Confirmed dead surface for 11-06/11-07's eventual schema cleanup: `Attempt`/`CaseAssignment` have zero live (non-seed/operator) readers today, though the schema itself is deliberately untouched pending the 11-03 checkpoint decision.
- No `middleware.ts` cleanup item exists for 11-05 to pick up from this plan.
- `app/api/cohort/**`, `app/api/codes/**`, and `app/api/student/cases/**` remain fully untouched, as required, pending the 11-03 checkpoint.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED
- CONFIRMED MISSING: app/api/student-history
- CONFIRMED MISSING: lib/student-history-service.ts
- FOUND: d3e3345 (contains Task 1's deletions, verified via `git show --name-only`)
- FOUND: .planning/phases/11-cohort-staff-teardown/11-02-SUMMARY.md
