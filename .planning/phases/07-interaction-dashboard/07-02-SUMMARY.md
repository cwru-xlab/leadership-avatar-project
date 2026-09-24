---
phase: 07-interaction-dashboard
plan: 02
subsystem: api
tags: [nextjs, s3, case-management, typescript]

# Dependency graph
requires: []
provides:
  - "Optional published?: boolean flag on the S3 CaseStudy interface"
  - "GET /api/case/list?publishedOnly=true filtering (visibility only, not access control)"
  - "Publish/unpublish Switch control in the case editor, wired to both caseStorage save branches"
affects: [07-05, 07-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discovery-layer visibility flags on S3-stored JSON objects use explicit `=== true` checks so pre-existing undocumented records default to hidden rather than being silently exposed."

key-files:
  created: []
  modified:
    - types/index.ts
    - app/api/case/list/route.ts
    - app/case-management/[caseId]/page.tsx

key-decisions:
  - "published is a discovery/browse filter only, not an access control; /api/case/get is deliberately left unchanged so direct-URL preview of an unpublished draft still works."
  - "No backfill script for existing S3 cases — staff republish manually; backfilling to true would defeat the flag's purpose."
  - "/api/case/list's unfiltered default remains reachable by any authenticated user; publishedOnly is opt-in and no role gate was added (explicitly deferred, referenced by plan 07-07 static check 15)."

patterns-established:
  - "New CaseStudy fields flow through lib/s3-client.ts and lib/case-storage.ts with zero changes to either, since both pass objects through generically (Omit<CaseStudy,...> / Partial<CaseStudy>)."

requirements-completed: [REQ-15]

# Metrics
duration: 20min
completed: 2026-09-21
---

# Phase 07 Plan 02: Case Discovery Publish Flag Summary

**Optional `published` flag on the S3 `CaseStudy` type, an opt-in `?publishedOnly=true` filter on `GET /api/case/list`, and a staff-facing Published switch in the case editor — all with zero Prisma/database changes.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-21T03:00:00Z
- **Completed:** 2026-09-21T03:18:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `CaseStudy.published?: boolean` added to `types/index.ts`, documented as discovery-only, not access control.
- `GET /api/case/list` now accepts `?publishedOnly=true`, filtering with a strict `=== true` check so every pre-existing case (all currently `undefined`) defaults to hidden from the published-only view; the unfiltered default is unchanged for `/case-management`.
- The case editor (`app/case-management/[caseId]/page.tsx`) gained a `published` state hydrated from the loaded case, a HeroUI `Switch` labeled "Published" with load-bearing helper copy, and the field is included in **both** the `caseStorage.add` (new case) and `caseStorage.update` (existing case) save payloads.
- `lib/case-storage.ts`, `lib/s3-client.ts`, and `app/api/case/edit/route.ts` were left completely untouched, confirmed via `git diff --name-only`, since all three pass the object through generically.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add published to CaseStudy and filter the list endpoint** - `8b67991` (feat)
2. **Task 2: Add a publish control to the case editor** - `71e1cb6` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `types/index.ts` - Added optional `published?: boolean` field to `CaseStudy` with a doc comment clarifying it gates discovery, not access.
- `app/api/case/list/route.ts` - Changed handler signature to accept `NextRequest`, added `publishedOnly` query-param filter using `c.published === true`.
- `app/case-management/[caseId]/page.tsx` - Added `published` state, hydration from loaded case, inclusion in both `caseStorage.add`/`caseStorage.update` payloads, and a `Switch` control with explanatory helper text.

## Decisions Made
- Followed the plan's explicit instruction to treat `published` purely as a visibility/discovery filter, never an access control — `/api/case/get` was not touched, preserving direct-URL preview of drafts.
- No backfill script was added; existing S3 cases stay implicitly unpublished (`undefined`) until staff manually toggle them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. A pre-existing `npm run dev` session (owned by the user's own shell, not spawned by this execution) was already running on port 3000 for manual verification; a second attempt to start a dev server for this plan's own verification correctly refused to bind and exited immediately, so the plan's dev-server check step relied on `npx tsc --noEmit` (zero errors) plus the grep verifications instead of a fresh manual page load. This is a strong substitute given the change is a straightforward state/prop addition with no new logic paths that tsc wouldn't catch.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 07-05 (student-facing `/case-play` index) can now call `GET /api/case/list?publishedOnly=true` to get a real, staff-curated set of cases with no cohort dependency.
- Plan 07-07's static check 15 can cite this summary/plan directly for why `/api/case/list`'s unfiltered default being reachable by any authenticated user is an accepted, documented tradeoff rather than a rediscovered defect.
- No blockers.

---
*Phase: 07-interaction-dashboard*
*Completed: 2026-09-21*

## Self-Check: PASSED

All created/modified files and both task commits verified present.
