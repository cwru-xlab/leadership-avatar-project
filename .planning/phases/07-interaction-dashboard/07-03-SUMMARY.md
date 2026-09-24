---
phase: 07-interaction-dashboard
plan: 03
subsystem: api
tags: [nextjs, prisma, heroui, interview-reports]

# Dependency graph
requires:
  - phase: 06-interview-evaluation-and-report
    provides: InterviewReport model, toInterviewReportDTO mapping, owner-scoped auth pattern (cookie -> getCurrentUser -> 401, 404-never-403)
provides:
  - "GET /api/interview/reports — owner-scoped, newest-first, IN_PROGRESS excluded server-side"
  - "/reports — the My Reports list page with loading/empty/list states"
affects: [07-06-student-sidebar, 07-07-walkthrough, phase-9-filtering-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "List endpoints reuse the single-resource DTO mapper verbatim (toInterviewReportDTO) instead of hand-rolling a second shape"
    - "IN_PROGRESS filtering happens in the Prisma where clause, never as a post-fetch client-side filter"

key-files:
  created:
    - app/api/interview/reports/route.ts
    - app/reports/page.tsx
  modified: []

key-decisions:
  - "reportMarkdown rides along on every list row (per plan's explicit allowance) rather than forking a second, stripped DTO shape — payload is not large enough in practice to justify the drift risk."
  - "Status chip map is written exhaustively over all four InterviewReportDTO statuses, including IN_PROGRESS, even though IN_PROGRESS never reaches the browser — keeps the map from silently going stale if the DTO's status union changes."

patterns-established:
  - "Local, page-scoped typeSlug -> label maps for list/summary views instead of importing lib/interview's internal type catalog or lib/interactions."

requirements-completed: [REQ-16]

# Metrics
duration: 12min
completed: 2026-09-21
---

# Phase 7 Plan 3: My Reports List Summary

**Owner-scoped `GET /api/interview/reports` plus the `/reports` page, giving students a persistent way to find a finished interview report without a saved URL.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-21T03:15:00Z
- **Completed:** 2026-09-21T03:19:31Z
- **Tasks:** 2
- **Files modified:** 2 (both new files)

## Accomplishments
- `GET /api/interview/reports` returns the caller's own reports, newest-first, with `IN_PROGRESS` rows excluded via the Prisma `where` clause (never fetched, never filtered client-side)
- `/reports` renders loading, empty, and list states; every row (including `FAILED`) is a full-row click-through to `/interview/{typeSlug}/report/{id}`
- Visual/Vocal render "Not yet measured" per the established Phase 6 treatment; Content/Behavioral render the score or "Not yet measured" if null — never a bare `0` or blank

## Task Commits

Each task was committed atomically:

1. **Task 1: Owner-scoped reports list endpoint** - `20941bd` (feat)
2. **Task 2: The /reports page** - `11abb80` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/api/interview/reports/route.ts` - `GET` handler; cookie -> `getCurrentUser` -> 401 sequence copied verbatim from `app/api/interview/report/[reportId]/route.ts`; query filters `status: { not: "IN_PROGRESS" }` in the `where` clause and orders `createdAt: "desc"`; responds `{ reports: rows.map(toInterviewReportDTO) }` with `Cache-Control: no-store`
- `app/reports/page.tsx` - client component; fetches `/api/interview/reports` on mount with `credentials: "include"`; local `TYPE_LABELS` map with a title-cased fallback; HeroUI `Card`/`Chip` rows carrying type, interviewer, date, status chip, and content/behavioral scores; page wrapper uses the `py-8 md:py-10 px-4 md:px-6 lg:px-8` / `max-w-7xl mx-auto` padding called for in the plan

## Decisions Made
- Reused `toInterviewReportDTO` verbatim as instructed — no second mapping was written, so the S3 transcript pointer and resume snapshot stay excluded automatically as they are for the single-report route.
- Did not touch `middleware.ts`. `/reports` is unauthenticated-redirected already (307 to `/login`) purely because the middleware's security model is "protected by default unless in `PUBLIC_ROUTES`" — no explicit `STUDENT_ROUTES` entry was needed for this plan to pass its own verification, confirming the plan's note that the page's `STUDENT_ROUTES` entry (for sidebar nav gating, presumably a different check) is 07-06's job, not this plan's.

## Deviations from Plan

None - plan executed exactly as written. No architectural changes, no schema changes, `lib/interview/report-dto.ts` untouched.

## Issues Encountered

- Confirmed (not introduced) that unauthenticated calls to `/api/interview/reports` return `307` redirect-to-`/login` rather than a JSON `401`, matching the exact same pre-existing behavior on the sibling `/api/interview/report/[reportId]` route. This is the middleware 307-vs-401 gap already logged as a deferred item in `06-08-SUMMARY.md` — not a regression introduced here, and out of this plan's scope to fix. The route handler itself does return a correct `401` JSON body when middleware is bypassed (verified by unit-level code inspection matching the copied auth pattern); only the middleware layer in front of it redirects first.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/reports` and its API are ready for the sidebar "My Reports" entry that plan 07-06 will add, including the `STUDENT_ROUTES` middleware entry that plan owns.
- The two-user cross-visibility check (`bob.williams@case.edu` never seeing `alice.johnson@case.edu`'s reports) is explicitly deferred to 07-07's human walkthrough, per this plan's `<verification>` section — not exercised here.
- No blockers.

---
*Phase: 07-interaction-dashboard*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/api/interview/reports/route.ts
- FOUND: app/reports/page.tsx
- FOUND: 20941bd
- FOUND: 11abb80
