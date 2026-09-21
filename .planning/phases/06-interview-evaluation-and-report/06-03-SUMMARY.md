---
phase: 06-interview-evaluation-and-report
plan: 03
subsystem: api
tags: [nextjs, prisma, s3, interview, session-lifecycle]

# Dependency graph
requires:
  - phase: 06-interview-evaluation-and-report
    provides: "InterviewReport Prisma model, InterviewTranscript type, s3Storage.saveInterviewTranscript (06-01)"
provides:
  - "POST /api/interview/session/start — creates the IN_PROGRESS InterviewReport row on the first real turn, returns {reportId}"
  - "POST /api/interview/session/checkpoint — persists the canonical InterviewTranscript to S3 after every assistant turn, updates turnCount/transcriptKey"
affects: [06-04, 06-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-lifecycle routes copy the upload-resume auth pattern verbatim: cookie -> getCurrentUser -> 401, no-store on every response"
    - "Ownership is always findFirst({ id, userId }) -> 404 on mismatch, never findUnique/403"
    - "Client-supplied timestamps/startedAt are never trusted; the server derives them from the DB row"

key-files:
  created:
    - app/api/interview/session/start/route.ts
    - app/api/interview/session/checkpoint/route.ts
  modified: []

key-decisions:
  - "resumeId is validated against a UUID v4 regex and silently dropped (set null) if malformed, rather than rejecting the request — it never shapes an S3 key downstream."
  - "checkpoint uses report.startedAt (DB) to build the transcript, never a client-supplied startedAt; the request body intentionally has no startedAt field."
  - "checkpoint returns 409 (not 200/400) when the report is no longer IN_PROGRESS, so a late fire-and-forget checkpoint can never overwrite a transcript a PENDING/READY evaluation is reading."

requirements-completed: [REQ-03, REQ-04, REQ-09]

# Metrics
duration: ~35min
completed: 2026-09-20
---

# Phase 6 Plan 3: Interview Session Start & Checkpoint Endpoints Summary

**Two lean session-lifecycle routes — `start` creates the IN_PROGRESS InterviewReport row on the first real turn and returns only `{reportId}`; `checkpoint` writes the canonical transcript to S3 after every assistant turn and updates `turnCount`/`transcriptKey` — both owner-scoped via `findFirst({ id, userId })` with 404 (never 403) on mismatch.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-20T04:20:00Z (approx.)
- **Completed:** 2026-09-20T04:55:14Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `POST /api/interview/session/start`: auth-gated, validates `typeSlug` against the registry (400 on unknown), sanitizes `resumeId` (UUID v4 or drop), truncates `resumeText` to 60000 chars and `interviewerName`/`interviewerAvatarId` to 200, creates one `IN_PROGRESS` row, and returns only `{reportId}` (201) — never echoes `resumeText` or a key.
- `POST /api/interview/session/checkpoint`: auth-gated, validates `reportId` as a UUID (400), fetches the report scoped by `{ id, userId }` (404 if not owned/found), rejects a checkpoint on a non-`IN_PROGRESS` report (409), normalizes turns via `normalizeTurns` (400 on empty), builds the transcript from the DB's `startedAt` (never the client's), writes it to S3 via `s3Storage.saveInterviewTranscript`, and updates `turnCount`/`transcriptKey` on the row before responding `{ok: true, turnCount}`.
- Both routes carry `Cache-Control: no-store` on every response path and contain zero `findUnique` / zero `403` occurrences.

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/interview/session/start** - `329cf77` (feat)
2. **Task 2: POST /api/interview/session/checkpoint** - `e0f96a2` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified
- `app/api/interview/session/start/route.ts` — creates the `IN_PROGRESS` row
- `app/api/interview/session/checkpoint/route.ts` — persists the transcript to S3, updates the row

## Request/Response Shapes (for 06-06 to wire against)

**`POST /api/interview/session/start`**
```ts
// Request
{
  typeSlug: string;
  interviewerAvatarId?: string | null;
  interviewerName?: string | null;
  resumeId?: string | null;
  resumeText?: string | null;
}
// 201 Response
{ reportId: string }
// Errors: 401 Unauthorized, 400 { error: "Unknown interview type" }, 500 on unexpected failure
```

**`POST /api/interview/session/checkpoint`**
```ts
// Request — deliberately NO startedAt; the server uses the DB row's startedAt
{
  reportId: string;
  turns: unknown;           // parsed defensively via normalizeTurns
  progress: InterviewProgress;
}
// 200 Response
{ ok: true, turnCount: number }
// Errors: 401 Unauthorized, 400 (bad reportId / empty turns), 404 Not found (not owned or doesn't exist),
//         409 { error: "This interview has already been submitted." } (not IN_PROGRESS), 502 on S3/DB failure
```

## Decisions Made
- Followed the plan's hard constraints exactly: auth pattern copied verbatim from `upload-resume/route.ts`, ownership always `{ id, userId }`, no `cohortId`/`caseId`/`assignmentId`/role fields, every DB command scoped to the inline local `DATABASE_URL`.
- `checkpoint`'s `progress` field is sanity-checked with a light shape guard (`isValidProgress`); a malformed value falls back to `initialProgress()` rather than rejecting the checkpoint, since the checkpoint's job (persisting turns) must not fail over a cosmetic client bug in progress tracking.

## Deviations from Plan

None — both routes implement exactly what the plan specified; no Rule 1-3 auto-fixes were needed.

### Out-of-scope discovery (documented, not fixed)

**1. [Scope boundary — pre-existing, repo-wide] `middleware.ts` redirects unauthenticated API calls to `/login` (307) instead of letting the route return 401**
- **Found during:** Task 1 verification (`curl -i` with no cookie against `/api/interview/session/start`)
- **Issue:** `middleware.ts` runs on every non-static path; for a missing auth cookie it unconditionally `NextResponse.redirect("/login")` without branching on `pathname.startsWith("/api/")` (it does branch that way for the role-mismatch case further down, but not for the missing/invalid-token case). An invalid/expired token hits the same redirect in the `catch` block.
- **Confirmed pre-existing and NOT caused by this plan:** `curl -i -X POST /api/interview/upload-resume` with no cookie — the exact route this plan was told to copy the auth pattern from verbatim — returns the identical `307` to `/login`, not `401`.
- **Fix:** Not applied. This is a cross-cutting middleware change affecting every existing `/api/*` route's unauthenticated-request contract, well outside this plan's two files. Logged to `deferred-items.md` for the team.
- **Verification performed instead:** created two temporary local-DB-only test users (`gsd-test-user-a@example.com`, `gsd-test-user-b@example.com`, deleted after testing), logged in via the real `/api/auth/login` dev-only endpoint to get real session cookies, and exercised the full authenticated matrix directly against both routes:
  - `start`: unauth → `307` (middleware, matches upload-resume); auth'd + unknown `typeSlug` → `400 {"error":"Unknown interview type"}`; auth'd + valid body → `201 {"reportId": ...}`.
  - `checkpoint`: unauth → `307` (middleware); owner + valid turns → `200 {"ok":true,"turnCount":2}` and the DB row's `turnCount`/`transcriptKey` updated, S3 key `interviews/{userId}/{reportId}.json` written; non-owner (user B) on user A's `reportId` → `404 {"error":"Not found"}`; malformed `reportId` → `400`; empty `turns` → `400`; report status flipped to `READY` then re-checkpointed → `409`.
  - All test rows (`InterviewReport`) and test users were deleted from the local DB after verification. One small test transcript object may remain under `interviews/{test-user-a-id}/{reportId}.json` in the shared S3 bucket (no AWS CLI available in this environment to delete it out-of-band); it is orphaned, namespaced under a deleted test user id, and contains only placeholder conversation text.

---

**Total deviations:** 0 auto-fixed. 1 out-of-scope discovery documented (pre-existing middleware behavior, not caused by this plan).
**Impact on plan:** None on correctness of the delivered routes — both routes' own 401/404/409/400/201/200 logic was verified directly with real authenticated requests.

## Issues Encountered
- ESLint could not be run on either file due to the pre-existing, repo-wide flat-config/eslintrc-compat break (same as 06-01/06-02; see `deferred-items.md`). `npx tsc --noEmit` shows zero errors attributable to either new file (the only repo errors are pre-existing stale `.next/types/validator.ts` references to unrelated pages, unrelated to this plan).
- The local dev DB had zero `User` rows, so full authenticated verification required creating and then deleting two temporary test users — see the deviation note above for the exact commands and cleanup.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `reportId` creation and transcript checkpointing are live; 06-04's `finish` route can rely on a report row that already exists and has an up-to-date `transcriptKey` by the time the student ends the interview.
- 06-06 (client wiring) has the exact request/response shapes above to build `InterviewSessionShell`'s calls against.
- No blockers identified for downstream wave-2/wave-3 plans. The middleware auth-redirect quirk is flagged for the team but does not block any Phase 6 plan (all of them, like `upload-resume` before them, rely on the route's own `getCurrentUser` check plus this pre-existing middleware layer together).

## Self-Check: PASSED

Both files found on disk; both task commit hashes (`329cf77`, `e0f96a2`) found in git history.

---
*Phase: 06-interview-evaluation-and-report*
*Completed: 2026-09-20*
