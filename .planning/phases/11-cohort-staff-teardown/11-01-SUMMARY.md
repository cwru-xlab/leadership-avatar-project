---
phase: 11-cohort-staff-teardown
plan: 01
subsystem: ui
tags: [nextjs, app-router, middleware, navigation]

# Dependency graph
requires: []
provides:
  - "All six staff/assignment PAGE trees deleted: app/cohort-management/, app/codes/, app/teacher/, app/student-history/, app/join/[accessCode]/, app/users-and-usages/"
  - "components/cohort-card.tsx (orphaned) deleted"
  - "config/site.ts navItems and app/page.tsx navigationCards no longer link to any deleted page"
  - "middleware.ts PUBLIC_ROUTES/ADMIN_ROUTES pruned of deleted-page prefixes (all /api/cohort/*, /api/codes, /api/student/cases entries untouched)"
affects: [11-02, 11-03, 11-04, 11-05, 11-06, 11-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deleting a page tree via `git rm -r` and pruning its middleware/nav references in a single follow-up task is sufficient for a plain-404 teardown — no redirect map or replacement page needed."

key-files:
  created: []
  modified:
    - config/site.ts
    - app/page.tsx
    - middleware.ts

key-decisions:
  - "app/join/ contained only the [accessCode] subtree, so the whole app/join/ directory was deleted (not just the dynamic segment)."
  - "middleware.ts doc comments referencing deleted routes (/users-and-usages in the ADMIN_ROUTES header) were also cleaned up for hygiene, in scope as part of the same file edit."

patterns-established: []

requirements-completed: []  # Plan frontmatter requirements: [] (Phase 11 has no REQ IDs; anchored on ROADMAP success criteria)

# Metrics
duration: 12min
completed: 2026-09-23
---

# Phase 11 Plan 01: Delete Staff/Assignment Pages Summary

**Deleted six staff/assignment page trees (cohort management, access codes, gradebook, teacher class views, student history, join-by-code, per-user usage) plus one orphaned component, and pruned every nav/dashboard/middleware reference to them — verified with a real authenticated admin session that all six now return plain 404s.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-23T18:16:00Z
- **Completed:** 2026-09-23T18:28:20Z
- **Tasks:** 2
- **Files modified:** 30 (27 deleted, 3 edited)

## Accomplishments
- Deleted `app/cohort-management/`, `app/codes/`, `app/teacher/`, `app/student-history/`, `app/join/`, `app/users-and-usages/` (27 files) plus `components/cohort-card.tsx` via `git rm -r`
- Removed the "Cohort Management" nav item from `config/site.ts` and the "Cohorts" dashboard card (plus its now-unused `GraduationCap` import) from `app/page.tsx`
- Pruned `/join` from `PUBLIC_ROUTES` and `/users-and-usages`, `/student-history`, `/cohort-management`, `/codes`, `/teacher` from `ADMIN_ROUTES` in `middleware.ts`, leaving every `/api/cohort/*`, `/api/codes`, and `/api/student/cases` entry fully untouched
- `npx tsc --noEmit` clean (after clearing a stale `.next/` cache that briefly reported deleted-route validator errors — a known pattern from prior phases, not a real defect)
- Live-verified via a real admin login (`admin@example.com`) against a local `next dev` server: `/codes`, `/cohort-management`, `/teacher`, `/student-history`, `/users-and-usages`, and `/join/ABC123` all return HTTP 404

## Task Commits

1. **Task 1: Delete the staff/assignment page trees and their orphaned component** - `8df5a75` (feat)
2. **Task 2: Prune nav entries, dashboard cards, and dead middleware PAGE routes** - `faf8025` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `config/site.ts` - removed the Cohort Management nav item
- `app/page.tsx` - removed the Cohorts dashboard card and unused `GraduationCap` import
- `middleware.ts` - removed deleted-page prefixes from `PUBLIC_ROUTES`/`ADMIN_ROUTES`; all `/api/*` entries and kiosk logic untouched
- 27 files deleted across `app/cohort-management/`, `app/codes/`, `app/teacher/`, `app/student-history/`, `app/join/`, `app/users-and-usages/`
- `components/cohort-card.tsx` deleted (orphaned after `app/codes/page.tsx` removal)

## Decisions Made
- `app/join/[accessCode]/` was the sole child of `app/join/`, so the entire `app/join/` directory was removed via `git rm -r app/join` rather than only the dynamic segment.
- Middleware doc-comment prose mentioning deleted routes was also cleaned up in Task 2, since it lives in the same file already being edited for the route-array pruning — not a separate scope violation.

## Deviations from Plan

None — plan executed exactly as written. The stale `.next/` validator errors seen immediately after Task 1's deletion were a build-cache artifact (same class already logged in `07-06-SUMMARY.md`), not a defect; clearing `.next/` and re-running `tsc --noEmit` confirmed zero real errors.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All six staff/assignment PAGE trees are gone and unlinked; `app/api/cohort/`, `app/api/codes/`, `app/api/student/cases/` are fully untouched and ready for the 11-03 checkpoint to decide their fate against this post-deletion tree.
- `types/cohort.ts`, `lib/cohort-storage.ts`, `lib/s3-client.ts`, `app/kiosk/`, `prisma/schema.prisma`, `prisma/seed.ts`, `scripts/sync-s3-to-db.ts` all confirmed untouched via `git status --short`.
- No blockers for 11-02 (which handles `app/api/student-history/**`) or subsequent Phase 11 plans.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 7 deleted paths confirmed absent from working tree; both task commits (`8df5a75`, `faf8025`) confirmed present in git log.
