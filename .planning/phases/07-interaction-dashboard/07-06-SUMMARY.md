---
phase: 07-interaction-dashboard
plan: 06
subsystem: ui
tags: [nextjs, middleware, routing, navigation]

# Dependency graph
requires:
  - phase: 07-interaction-dashboard
    provides: "07-03 owner-scoped /reports page, 07-04 dashboard at /, 07-05 /case-play index — the three real destinations this plan repoints links to"
provides:
  - "Top-level /settings route (moved out of the /student-cases subtree)"
  - "Three-item student sidebar: Practice, My Reports, Settings"
  - "STUDENT_ROUTES middleware gate covering /reports and /settings identically to other student surfaces"
  - "Zero remaining /student-cases references in application code"
affects: [07-07, phase-11-cohort-teardown]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - app/settings/layout.tsx
  modified:
    - app/settings/page.tsx (renamed from app/student-cases/settings/page.tsx)
    - config/site.ts
    - middleware.ts
    - app/login/page.tsx
    - app/join/[accessCode]/page.tsx
    - app/interview/[type]/page.tsx
    - app/interview/[type]/report/[reportId]/page.tsx
    - app/case-play/[caseId]/page.tsx

key-decisions:
  - "Interview report page's not-found button and onBack now go to /reports (not /) — a student leaving a report is more likely to want the report list than the dashboard."
  - "case-play's handleSaveAndExit dropped the cohortId query string entirely rather than preserving it — the new /case-play index takes no cohort param."
  - "All four case-play exit points (handleFinish, handleSaveAndExit, case-not-found card, intro back arrow) route to /case-play (the case index) rather than / — a student finishing one case most likely wants another."
  - "Deferred: the logged-out join-by-code flow (app/join/[accessCode]/page.tsx writing pendingCohortJoin to localStorage) no longer completes, since its only consumer (/student-cases) is deleted and app/login/page.tsx never read the returnTo param. Accepted as a Phase 11 cohort-teardown item, not fixed here."

patterns-established: []

requirements-completed: [REQ-14]

# Metrics
duration: 5min
completed: 2026-09-21
---

# Phase 7 Plan 06: Retire /student-cases Summary

**Moved settings to a top-level /settings, rebuilt the student sidebar to Practice/My Reports/Settings, re-gated both new routes in middleware, deleted the /student-cases tree outright, and repointed all 10 remaining in-app links so no /student-cases reference or dead link remains.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-21T03:30:19Z
- **Completed:** 2026-09-21T03:33:01Z (plus summary/state work)
- **Tasks:** 3 completed
- **Files modified:** 9 (1 renamed, 1 created, 2 deleted, 6 edited)

## Accomplishments
- `/settings` exists as a top-level route with its own layout reproducing the deleted `app/student-cases/layout.tsx` padding; `/student-cases` no longer exists at all.
- Student sidebar (`config/site.ts` `studentNavItems`) is now exactly Practice (`/`), My Reports (`/reports`), Settings (`/settings`), using icons already present in `components/auth-navbar.tsx`'s `iconMap`.
- `middleware.ts` `STUDENT_ROUTES` drops `/student-cases` and adds `/reports` and `/settings`, so both are gated exactly like every other student surface instead of falling through to the generic authenticated-role path.
- A fresh repo-wide grep (not the plan's stale 13-call-site estimate) found and fixed exactly 10 `/student-cases` occurrences across 5 files: `app/login/page.tsx`, `app/join/[accessCode]/page.tsx`, `app/interview/[type]/page.tsx`, `app/interview/[type]/report/[reportId]/page.tsx`, and `app/case-play/[caseId]/page.tsx`.
- Repo-wide grep for `student-cases` in `app/`, `components/`, `lib/`, `config/`, `middleware.ts` now returns nothing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move settings to /settings and delete the student-cases tree** - `47770bd` (feat) + `79e9a26` (feat, follow-up adding the layout file that was missed in the first `git add`)
2. **Task 2: Rebuild student nav and the middleware route lists** - `c454362` (feat)
3. **Task 3: Repoint every remaining /student-cases link** - `893e590` (fix)

**Plan metadata:** committed separately below (docs: complete plan)

## Files Created/Modified
- `app/settings/page.tsx` - Renamed from `app/student-cases/settings/page.tsx` via `git mv`; no import changes needed (all absolute `@/...`)
- `app/settings/layout.tsx` - New file reproducing the padding wrapper the deleted `app/student-cases/layout.tsx` provided
- `config/site.ts` - `studentNavItems` rebuilt to Practice/My Reports/Settings
- `middleware.ts` - `STUDENT_ROUTES` updated: `/student-cases` removed, `/reports` and `/settings` added
- `app/login/page.tsx` - Post-login student redirect changed from `/student-cases` to `/`
- `app/join/[accessCode]/page.tsx` - Post-cohort-join button changed from `/student-cases` to `/`
- `app/interview/[type]/page.tsx` - Unknown-type error card button and wizard back link both changed from `/student-cases` to `/`
- `app/interview/[type]/report/[reportId]/page.tsx` - Not-found button and `onBack` handler both changed from `/student-cases` to `/reports`
- `app/case-play/[caseId]/page.tsx` - `handleFinish`, `handleSaveAndExit` (dropping the `cohortId` query string), the case-not-found card, and the intro back arrow all changed from `/student-cases` (some with a `cohortId` query string) to `/case-play`

## Decisions Made
- Interview report page exits go to `/reports`, not `/` — closer match to user intent when leaving a report.
- case-play exits go to `/case-play` (case index), not `/` — closer match to user intent when leaving a case.
- `cohortId` query string in `handleSaveAndExit` dropped entirely rather than preserved on the new target, since `/case-play` takes no cohort param (07-05 decision).
- Did not attempt to fix the logged-out join-by-code flow; documented as a deferred consequence for Phase 11 (see below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missed staging `app/settings/layout.tsx` in the Task 1 commit**
- **Found during:** Task 1 commit step
- **Issue:** A single `git add` command listing multiple files (including one already deleted via `git rm`, which errored) silently skipped staging the new `app/settings/layout.tsx`. The first Task 1 commit landed without it.
- **Fix:** Staged and committed `app/settings/layout.tsx` separately as a follow-up commit before proceeding.
- **Files modified:** `app/settings/layout.tsx`
- **Verification:** `git status --short` confirmed the file was tracked and clean after the follow-up commit; `npx tsc --noEmit` remained clean throughout.
- **Committed in:** `79e9a26`

---

**Total deviations:** 1 auto-fixed (1 blocking — a staging mistake, not a plan/code defect)
**Impact on plan:** No scope creep; purely a commit-mechanics correction within Task 1.

## Issues Encountered
- The plan's own research estimate ("13 call sites across 7 files") did not match what a fresh grep found at execution time (10 call sites across 5 files). Per the plan's explicit instruction, the fresh grep was treated as authoritative rather than the plan's list, and all 10 real hits were repointed. No call sites were missed — the final verification grep confirms zero remaining occurrences.
- The plan offered an option to split Task 3 into `07-06b` if running low on context. That was not necessary here; all three tasks completed within this single execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`/student-cases` is fully retired: the route, its links, and its middleware gate are gone, and the student sidebar/middleware now match the dashboard-first, cohort-free model. 07-07 (the phase's static-sweep/validation plan) is unblocked and should specifically confirm:
- The logged-out join-by-code deferred consequence (`pendingCohortJoin` written by `app/join/[accessCode]/page.tsx` is now orphaned since its only consumer is deleted, and `app/login/page.tsx` never reads a `returnTo` param) — carry this into 07-07's deferred-items list, per this plan's explicit instruction. Phase 11 (cohort teardown) owns the actual fix.
- `app/api/student/cases/route.ts` still exists untouched (Phase 11's job, not this plan's).
- No blockers for 07-07.

---
*Phase: 07-interaction-dashboard*
*Completed: 2026-09-21*

## Self-Check: PASSED

All claimed files (`app/settings/page.tsx`, `app/settings/layout.tsx`) exist; `app/student-cases/` confirmed absent; all four commit hashes (`47770bd`, `79e9a26`, `c454362`, `893e590`) found in git history.
