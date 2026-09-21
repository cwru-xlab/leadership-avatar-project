---
phase: 07-interaction-dashboard
plan: 05
subsystem: ui
tags: [nextjs, react, s3, case-study]

# Dependency graph
requires:
  - phase: 07-interaction-dashboard
    provides: "published flag on CaseStudy + GET /api/case/list?publishedOnly=true filter (07-02)"
provides:
  - "Student-facing /case-play index page listing all published case studies with no cohort filtering"
affects: [07-06, 07-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reused CaseCard + grid classes from app/case-management/page.tsx for a second, student-facing surface"

key-files:
  created: [app/case-play/page.tsx]
  modified: []

key-decisions:
  - "Browsing published cases requires no auth check beyond the existing STUDENT_ROUTES middleware gate — no page-level role check added, consistent with the rest of the codebase's middleware-based auth model."
  - "No back-compat with /api/student/cases or cohort/assignment lookups — this page reads only from /api/case/list?publishedOnly=true."

requirements-completed: [REQ-15]

# Metrics
duration: 25min
completed: 2026-09-21
---

# Phase 7 Plan 05: Published-Case Index Summary

**New `/case-play` index page lists all published cases via `/api/case/list?publishedOnly=true` and routes into the existing `/case-play/[caseId]` player with no cohortId — removing cohort membership from the student case-browsing path.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-21T03:02:00Z
- **Completed:** 2026-09-21T03:27:47Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- `/case-play` is now a real route (previously only the `[caseId]` dynamic segment existed) that any authenticated student can browse with zero cohort membership.
- The Case Studies dashboard tile (already pointing at `/case-play` from plan 07-04) now has a working destination.
- Verified end-to-end against the local dev DB that unpublished cases stay hidden from the index while remaining playable by direct URL — preserving the staff draft-preview mechanism.

## Task Commits

Each task was committed atomically:

1. **Task 1: Published-case index page** - `f05b11e` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/case-play/page.tsx` - Client component; fetches `GET /api/case/list?publishedOnly=true` on mount, renders results via `CaseCard` in the same grid classes as `app/case-management/page.tsx`, handles loading/empty/error states, navigates to `/case-play/{caseId}` with no `cohortId` param, and includes a "Back to Dashboard" affordance to `/`.

## Decisions Made
- No page-level auth/role check added — middleware already gates `/case-play` under `STUDENT_ROUTES` and `/api/case/list` is reachable by any authenticated user, matching the existing codebase pattern.
- Left `app/api/case/get/route.ts` and `app/case-play/[caseId]/page.tsx` completely untouched, per plan constraints — `published` remains a discovery-only filter, not an access-control mechanism.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. One clarifying note: `app/case-play/page.tsx` had to be created as genuinely new (confirmed via `find app/case-play -type f` that only `[caseId]/page.tsx` and `[caseId]/layout.tsx` existed before this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/case-play` is live and ready for plan 07-06, which repoints the four hardcoded `/student-cases` links inside `app/case-play/[caseId]/page.tsx` (a file this plan deliberately did not touch).
- Verified end-to-end against the local dev DB (`DATABASE_URL` inline, never migrated) using real seeded users:
  - As `student@case.edu`: `/case-play` rendered the empty state while the one existing S3 case (`adam-testing`) was unpublished — `GET /api/case/list?publishedOnly=true` returned `cases: []`.
  - As `admin@example.com`: toggled `adam-testing` to `published: true` via `POST /api/case/edit` (the only role permitted — `/api/case/edit` enforces "Access denied: admin only").
  - Back as `student@case.edu`: `publishedOnly=true` returned exactly that one case; `GET /case-play/adam-testing` returned 200 with no `cohortId` in the URL; `GET /api/case/get?id=adam-testing` returned the full case data.
  - Reverted `adam-testing` to `published: false` and confirmed the index again returned `[]` while `GET /case-play/adam-testing` and `/api/case/get?id=adam-testing` still returned 200/success for the same student — confirming the unpublished-direct-URL draft-preview path is untouched and still works.
  - `npx tsc --noEmit`: zero errors.
  - `grep -n "cohort" app/case-play/page.tsx`: zero matches.
  - `grep -rn "student/cases\|listCohorts\|cohortIds" app/case-play/page.tsx`: zero matches.
  - `git status --short` on `app/api/case/get/route.ts`, `app/case-play/[caseId]/page.tsx`, and `prisma/`: no changes.

---
*Phase: 07-interaction-dashboard*
*Completed: 2026-09-21*

## Self-Check: PASSED
- FOUND: app/case-play/page.tsx
- FOUND: f05b11e
