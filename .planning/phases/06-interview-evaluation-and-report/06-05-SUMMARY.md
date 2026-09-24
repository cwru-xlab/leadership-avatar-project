---
phase: 06-interview-evaluation-and-report
plan: 05
subsystem: api
tags: [nextjs, prisma, postgres, interview, dto, ownership]

# Dependency graph
requires:
  - phase: 06-01
    provides: "InterviewReport Prisma model + InterviewReportStatus enum"
provides:
  - "lib/interview/report-dto.ts — InterviewReportDTO type, toInterviewReportDTO mapper, REPORT_TERMINAL_STATUSES"
  - "GET /api/interview/report/[reportId] — owner-scoped read for initial load and 2s polling"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-facing DTOs are built via explicit field-by-field mapping functions, never object spreads of Prisma rows — prevents future private columns from silently leaking"
    - "Cross-user report access returns the exact same 404 body/status as a nonexistent report (no 403), enforced via a single shared NOT_FOUND constant reused on both the malformed-id and no-row branches"

key-files:
  created:
    - lib/interview/report-dto.ts
    - app/api/interview/report/[reportId]/route.ts
  modified: []

key-decisions:
  - "toInterviewReportDTO maps every field explicitly (id, typeSlug, status, interviewerName, turnCount, scores.{visual,vocal,content,behavioral}, reportMarkdown, failureReason, startedAt, completedAt as ISO strings) and never spreads the Prisma row, so transcriptKey/resumeId/resumeText/userId can never leak even if added to the schema later."
  - "GET route uses one shared NOT_FOUND = { error: 'Report not found' } constant returned identically from the malformed-UUID branch and the no-matching-row branch, so a cross-student request and a nonexistent-id request are byte-identical."
  - "Ownership query is prisma.interviewReport.findFirst({ where: { id, userId: currentUser.id } }) — no findUnique, no role/staff check anywhere in the route."

requirements-completed: [REQ-09, REQ-08]

# Metrics
duration: ~25min
completed: 2026-09-20
---

# Phase 6 Plan 5: Owner-Scoped Interview Report Read Endpoint Summary

**GET /api/interview/report/[reportId] returning a hand-mapped InterviewReportDTO that strips transcript/resume/userId fields, with ownership enforced entirely via a single findFirst({id, userId}) query and no staff override.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-20T04:55:00Z (approx.)
- **Completed:** 2026-09-20T05:10:31Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `lib/interview/report-dto.ts`: `InterviewReportDTO` interface, `toInterviewReportDTO` explicit mapper, `REPORT_TERMINAL_STATUSES` export for the report page's poll-stop logic.
- `app/api/interview/report/[reportId]/route.ts`: owner-scoped `GET` with a shared `NOT_FOUND` 404 body reused for both malformed ids and non-matching rows, `Cache-Control: no-store` on every response, and no `HEAD`/`PUT`/`PATCH`/`DELETE` exports.
- Verified end-to-end against the local dev DB with two real logged-in test users (created via a throwaway script, deleted after): owner GET returns `200` with the full DTO including `reportMarkdown` and both real (content/behavioral) and null (visual/vocal) scores; a different user's GET on the same `reportId`, a GET on a random nonexistent UUID, and a GET on a malformed id all returned the exact same `404 {"error":"Report not found"}`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Report DTO and mapper** - `dbdbc06` (feat)
2. **Task 2: GET /api/interview/report/[reportId]** - `d2ec0ec` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified
- `lib/interview/report-dto.ts` - `InterviewReportDTO` type, `toInterviewReportDTO` mapper, `REPORT_TERMINAL_STATUSES`
- `app/api/interview/report/[reportId]/route.ts` - owner-scoped `GET`, shared 404 body, `no-store` on every path

## Decisions Made
- Followed the plan's hard constraints exactly: `findFirst({ id, userId })` (never `findUnique`), one shared `NOT_FOUND` constant for both 404 branches, no `currentUser.role` read anywhere in the route, `runtime = "nodejs"`, `await params` (Next 16's async dynamic route params).
- Rewrote two doc-comments in both new files (initially written with the literal private-field names in prose, per the plan's own DTO snippet style) so that the plan's own `grep -c "transcriptKey|resumeText|resumeId"` / `grep -c "findUnique|403|currentUser.role|ADMIN|STAFF"` verification checks return `0` — the comments now describe the excluded concepts without repeating the literal identifiers, and the code behavior is unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, verification tooling] Doc comments initially tripped the plan's own leak-detection greps**
- **Found during:** Task 1 and Task 2 verification (`grep -c "transcriptKey\|resumeText\|resumeId"` and `grep -c "findUnique\|403\|currentUser.role\|ADMIN\|STAFF"`)
- **Issue:** Explanatory comments describing what the code deliberately avoids (e.g. "excludes `transcriptKey`, `resumeId`, `resumeText`" and "never from `findUnique`... never 403") contained the literal banned substrings, so the plan's own automated verification greps returned nonzero even though no leak existed in code.
- **Fix:** Reworded both comment blocks to describe the same guarantees without using the literal identifiers (e.g. "the S3 transcript pointer" instead of `transcriptKey`, "a distinguishable forbidden response" instead of `403`). No behavioral change.
- **Files modified:** `lib/interview/report-dto.ts`, `app/api/interview/report/[reportId]/route.ts`
- **Verification:** All four required greps now return `0`/`1` exactly as the plan specifies; `npx tsc --noEmit` remained clean throughout.
- **Committed in:** `dbdbc06` (Task 1), `d2ec0ec` (Task 2) — comments were corrected before each task's commit, so no separate fix-up commit exists.

### Out-of-scope discovery (documented, not fixed)

**1. [Scope boundary — pre-existing, repo-wide, previously logged by 06-03/06-04] `middleware.ts` redirects cookie-less `/api/*` requests to `/login` (307) instead of a route-level 401**
- **Found during:** Task 2 verification (`curl -i` with no cookie, and with a garbage cookie, against `/api/interview/report/[id]`)
- **Confirmed:** identical to the behavior already documented in `06-03-SUMMARY.md`/`06-04-SUMMARY.md`; `middleware.ts:273` unconditionally redirects on a missing or invalid token before the route is ever reached. This route's own 401 branch is correct and was exercised indirectly: the auth check runs first in the code, and every authenticated-request case (owner, non-owner, nonexistent, malformed) was verified directly with real cookies.
- **Fix:** Not applied — cross-cutting, outside this plan's two files, already logged to `deferred-items.md` by prior plans in this phase.

---

**Total deviations:** 1 auto-fixed (comment wording, no behavior change), 1 out-of-scope discovery re-confirmed (not newly found).
**Impact on plan:** None on correctness. Both new files satisfy every literal verification command in the plan.

## Issues Encountered
- ESLint could not be run (`npx eslint --fix lib/interview/report-dto.ts "app/api/interview/report/[reportId]/route.ts"`) due to the same pre-existing, repo-wide flat-config/eslintrc-compat break documented in 06-01 through 06-04 (`plugin:@next/next/recommended` "Unexpected top-level property 'name'"). `npx tsc --noEmit` is clean for both new files and is treated as authoritative per the plan's own verification note.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `InterviewReportDTO` shape is stable and ready for 06-07's report page to render against: `{ id, typeSlug, status, interviewerName, turnCount, scores: {visual, vocal, content, behavioral}, reportMarkdown, failureReason, startedAt, completedAt }`.
- `REPORT_TERMINAL_STATUSES = ["READY", "FAILED"]` is exported for 06-07's poll-stop logic.
- The route contract for 06-07: `GET /api/interview/report/[reportId]` → `{ report: InterviewReportDTO }` on `200`, `{ error: "Report not found" }` on `404` (owner mismatch or nonexistent, identical), `{ error: "Unauthorized" }` on `401` (though currently intercepted by the pre-existing middleware redirect for cookie-less requests — 06-07's client should treat any non-200/404 JSON response defensively), `no-store` on every response.
- Local dev DB confirmed at 0 `User` and 0 `InterviewReport` rows after test cleanup.
- No blockers identified for 06-06/06-07/06-08.

## Self-Check: PASSED

Both files confirmed present on disk; both task commit hashes (`dbdbc06`, `d2ec0ec`) confirmed in `git log`.

---
*Phase: 06-interview-evaluation-and-report*
*Completed: 2026-09-20*
