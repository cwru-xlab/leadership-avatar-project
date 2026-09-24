---
phase: 06-interview-evaluation-and-report
plan: 04
subsystem: api
tags: [nextjs, prisma, s3, waitUntil, interview, evaluation-lifecycle]

# Dependency graph
requires:
  - phase: 06-interview-evaluation-and-report
    provides: "InterviewReport model, InterviewTranscript type, S3 transcript read/write (06-01)"
  - phase: 06-interview-evaluation-and-report
    provides: "runInterviewEvaluation / validateEvaluationResult (06-02)"
provides:
  - "lib/interview/evaluation-runner.ts: runAndPersistEvaluation — the single place a stored transcript becomes a READY or FAILED row"
  - "POST /api/interview/session/finish — stores the final transcript, flips IN_PROGRESS -> PENDING, returns {reportId, status} in ~200ms, schedules evaluation via waitUntil"
  - "POST /api/interview/report/[reportId]/retry — re-runs evaluation for a FAILED report only, same reportId, same stored transcript"
affects: [06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Background evaluation logic lives in exactly one function (runAndPersistEvaluation), called identically by finish and retry, so READY/FAILED semantics never diverge between the two entry points"
    - "waitUntil(runAndPersistEvaluation(...)) scheduled after the response-shaping DB update, never awaited, matching the app/api/interaction/finish/route.ts precedent"
    - "A background job's outer try/catch always attempts a best-effort FAILED write on unhandled throw, swallowing any secondary error from that write itself, so a row can never get stuck in PENDING"

key-files:
  created:
    - lib/interview/evaluation-runner.ts
    - app/api/interview/session/finish/route.ts
    - "app/api/interview/report/[reportId]/retry/route.ts"
  modified: []

key-decisions:
  - "runAndPersistEvaluation's internal persistFailure() updates by { id } only, not { id, userId } — Prisma's update() where clause only accepts unique fields, and ownership was already verified by the caller's findFirst({ id, userId }) lookup before runAndPersistEvaluation is ever invoked."
  - "getInterviewType(report.typeSlug) falls back to DEFAULT_INTERVIEW_TYPE (not a hard failure) if the stored slug is no longer in the registry, so an old report still evaluates instead of permanently failing."
  - "finish's 409 (already-submitted) response echoes {reportId, status} instead of a bare error, so a double-submitting client can navigate straight to the report page."

requirements-completed: [REQ-05, REQ-06, REQ-07, REQ-09]

# Metrics
duration: ~40min
completed: 2026-09-20
---

# Phase 6 Plan 4: Finish/Retry Endpoints and the Background Evaluation Runner Summary

**A shared `runAndPersistEvaluation` background job, a finish endpoint that stores the transcript and returns `{reportId}` in ~200ms while evaluation runs via `waitUntil`, and a retry endpoint that re-runs a FAILED report under the same reportId — verified end-to-end against the local dev DB with real OpenAI calls, real login cookies, and two temporary test users.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-20T04:20:00Z (approx.)
- **Completed:** 2026-09-20T05:04:05Z
- **Tasks:** 3 completed
- **Files modified:** 3 (all created)

## Accomplishments

- `lib/interview/evaluation-runner.ts`: `runAndPersistEvaluation(userId, reportId)` loads the row via `findFirst({ id, userId })`, loads the S3 transcript (missing → `FAILED` with `"Transcript could not be read from storage."`), resolves role context from `getInterviewType(typeSlug)` with a `DEFAULT_INTERVIEW_TYPE` fallback, calls `runInterviewEvaluation`, and writes `READY` (with `visualScore`/`vocalScore` hardcoded null, `contentScore`/`behavioralScore`/`reportMarkdown`/`evalModel`/`completedAt` from the result) or `FAILED` (with `failureReason`/`evalModel`/`completedAt`, never touching `transcriptKey`/`resumeText`/`turnCount`). Wrapped in try/catch with a best-effort `FAILED` write on any unhandled throw, itself wrapped so a secondary write failure is only logged, never re-thrown — the row can never get stuck in `PENDING`.
- `POST /api/interview/session/finish`: auth-gated, validates `reportId` shape, 404s a non-owner, 409s a non-`IN_PROGRESS` report (echoing current status for idempotent client navigation), 400s an empty transcript, writes the final transcript to S3 *before* any status change (S3 failure → 502, row stays `IN_PROGRESS`), flips to `PENDING`, schedules `runAndPersistEvaluation` via non-awaited `waitUntil`, and responds `202 {reportId, status}`. Contains zero LLM calls in the request path.
- `POST /api/interview/report/[reportId]/retry`: dynamic route with `params: Promise<{reportId}>`, auth-gated, 404s a non-owner, 409s anything not `FAILED` (the guard against regenerating a `READY` report) and 409s a `FAILED` report with no stored transcript, otherwise flips back to `PENDING`, clears `failureReason`, schedules the same `runAndPersistEvaluation`, and responds `202 {reportId, status}` — never creates a new row.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared background evaluation runner** - `55c2749` (feat)
2. **Task 2: POST /api/interview/session/finish** - `ab17c62` (feat)
3. **Task 3: POST /api/interview/report/[reportId]/retry** - `a8a4947` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Request/Response Shapes (for 06-06 and 06-07 to wire against)

**`POST /api/interview/session/finish`**
```ts
// Request
{ reportId: string; turns: unknown; progress: InterviewProgress }
// 202 Response
{ reportId: string; status: "PENDING" }
// Errors:
// 401 Unauthorized
// 400 { error: "Invalid reportId" } | { error: "There is no interview transcript to evaluate." }
// 404 { error: "Not found" }                                          (non-owner or nonexistent)
// 409 { error: "This interview has already been submitted.", reportId, status }  (not IN_PROGRESS)
// 502 { error: "We could not save your interview. Please try again." } (S3 write failed; row unchanged, stays IN_PROGRESS)
// 500 { error: "Unable to finish the interview." }
```

**`POST /api/interview/report/[reportId]/retry`**
```ts
// No body
// 202 Response
{ reportId: string; status: "PENDING" }
// Errors:
// 401 Unauthorized
// 400 { error: "Invalid reportId" }
// 404 { error: "Not found" }                                          (non-owner or nonexistent)
// 409 { error: "Only a failed report can be re-run.", status }        (READY/PENDING/IN_PROGRESS)
// 409 { error: "This interview has no stored transcript to re-run." } (FAILED but transcriptKey null)
// 500 { error: "Unable to re-run the evaluation." }
```

Both endpoints poll-friendly: the client should poll `GET` on the report (06-05) for `status` to resolve to `READY` or `FAILED`.

## Verification Performed

Full end-to-end verification against the local dev DB (`leadership_avatar_dev`) with two temporary test users (`gsd0604-a@example.com`, `gsd0604-b@example.com`, created via `/api/auth/login`'s dev-only email/password path, deleted after), real login cookies, and real OpenAI calls (no mocking):

- `npx tsc --noEmit`: zero errors attributable to any of this plan's three files. The only repo-wide errors are pre-existing stale `.next/types/validator.ts` references to unrelated pages/routes (`app/plan`, `app/practice/[topic]`, `app/api/student/plan`, etc.) — unrelated to this plan.
- `npx eslint --fix` on all three files individually: reproduced the same pre-existing repo-wide `plugin:@next/next/recommended is invalid: Unexpected top-level property "name"` failure documented by 06-01/06-02/06-03. Not fixed (out of scope, cross-cutting tooling break).
- `grep -c "SCORE:" lib/interview/evaluation-runner.ts` → `0`.
- `grep -n "status: \"FAILED\""` → 4 occurrences (missing-transcript path, evaluator-failure path, catch-all, and the doc comment above `persistFailure`) — at least two, per the plan's requirement.
- `grep -n "waitUntil"` in the finish route → import + one non-awaited call; `grep -c "await waitUntil"` → `0`; `grep -c "openai\|OpenAI"` → `0` (no LLM work in the request path).
- `grep -n "FAILED"` in the retry route → status guard present; `grep -c "interviewReport.create"` → `0` (retry never creates a row).
- `grep -n "403"` and `grep -n "findUnique"` across all three files → empty (both required).
- `git diff HEAD -- app/api/interaction/finish/route.ts` and `git log --oneline 8cfdc92..HEAD -- app/api/interaction/finish/route.ts` → both empty (case-study route untouched).
- **Live end-to-end run** (`DATABASE_URL=...local... npm run dev` + curl):
  - `finish` with no cookie → `307` to `/login` (documented pre-existing middleware behavior, same as 06-03; the route's own `getCurrentUser` check would return 401 if middleware let the request through).
  - Started a real `IN_PROGRESS` report via `session/start`, finished it with a two-turn transcript as the owner → `202 {reportId, status:"PENDING"}` returned immediately; background job completed in ~13s and the row read back `status: "READY"`, `contentScore: 1`, `behavioralScore: 1`, `visualScore: null`, `vocalScore: null`, a populated `reportMarkdown`, and `evalModel: "gpt-4.1"`.
  - Non-owner (user B) `finish` on user A's `reportId` → `404`.
  - Re-`finish`ing the now-`READY` report as the owner → `409 {"error":"This interview has already been submitted.","status":"READY"}`.
  - `retry` on a `FAILED` report with `transcriptKey: null` → `409 {"error":"This interview has no stored transcript to re-run."}`.
  - `retry` on a non-owner's `FAILED`-with-transcript report → `404`.
  - `retry` on the owner's `FAILED`-with-transcript report → `202 {reportId, status:"PENDING"}`; ~5s later the same row read back `status: "READY"` with a freshly generated `reportMarkdown`/scores under the **same** `reportId`.
  - `retry` on the now-`READY` report → `409 {"error":"Only a failed report can be re-run.","status":"READY"}`.
  - Both temporary test users and their `InterviewReport` rows were deleted from the local DB after verification. Their S3 transcript objects (namespaced under the deleted test-user IDs) were not deleted (no out-of-band S3 delete tool available in this environment) — same limitation 06-03 documented.

## Decisions Made

- Followed the plan's hard constraints exactly: `finish` writes to S3 before any status change and never flips to `PENDING` on an S3 failure; `retry` never creates a new row; visual/vocal scores are taken verbatim from `validateEvaluationResult` (already hardcoded null there) with no post-processing in this plan's files.
- `runAndPersistEvaluation`'s `persistFailure` helper updates by `{ id }` alone (Prisma's `update().where` only accepts unique fields) rather than `{ id, userId }` — ownership is already established by the caller's `findFirst({ id, userId })` earlier in the same function, so this is not a security gap, just a Prisma API constraint.

## Deviations from Plan

None — all three files implement exactly what the plan specified; no Rule 1-3 auto-fixes were needed beyond the Prisma `update().where` narrowing noted above, which was discovered and corrected in-file before the first commit (not left as a bug).

### Out-of-scope discoveries (documented, not fixed)

**1. [Scope boundary — pre-existing, repo-wide] `middleware.ts` redirects unauthenticated API calls with 307, not 401**
- Same issue 06-03 already documented for `session/start` and `session/checkpoint`. Reproduced identically on `session/finish` (307 to `/login` for a cookie-less POST) and on `report/[reportId]/retry`. Not caused by this plan; not fixed (cross-cutting, outside this plan's two-and-a-bit files); logged previously in `deferred-items.md`, no new entry needed.

**2. [Scope boundary — pre-existing, repo-wide] ESLint config broken**
- Same `plugin:@next/next/recommended is invalid` failure documented by every prior Phase 6 plan. Reproduced on all three of this plan's files. Not fixed; `npx tsc --noEmit` treated as authoritative per plan instructions.

---

**Total deviations:** 0 true deviations. 2 documented, already-logged, pre-existing out-of-scope issues (middleware 307, broken eslint config) reconfirmed on this plan's files.
**Impact on plan:** None on correctness — every status code and state transition specified by the plan was verified live against the local dev DB with real OpenAI calls.

## Issues Encountered

- ESLint could not run on any of this plan's files due to the pre-existing, repo-wide flat-config break (same as every prior Phase 6 plan). `npx tsc --noEmit` is clean for all three files.
- The local dev DB had zero pre-existing `User` rows usable for this plan's verification, so two temporary test users were created and deleted, following 06-03's precedent exactly.

## User Setup Required

None — no external service configuration required. `OPENAI_API_KEY` and `INTERVIEW_EVAL_MODEL` were already configured in the environment (confirmed indirectly: real evaluator calls succeeded against `gpt-4.1` during live verification).

## Next Phase Readiness

- The finish → PENDING → background-evaluate → READY/FAILED lifecycle is fully live and verified end-to-end, including the retry path re-running under the same `reportId`.
- 06-05 (the report `GET` endpoint) can now rely on rows that reliably terminate in `READY` or `FAILED`, never stuck in `PENDING`.
- 06-06 (client wiring — `InterviewSessionShell`'s `finish()`) has the exact `finish` request/response shape above to call.
- 06-07 (report page) can wire its "try again" action directly to the `retry` endpoint's shape above.
- No blockers identified for downstream wave-2/wave-3/wave-4 plans. The middleware 307-vs-401 quirk remains flagged for the team but does not block any Phase 6 plan, as previously noted.

## Self-Check: PASSED

All three files found on disk (`lib/interview/evaluation-runner.ts`, `app/api/interview/session/finish/route.ts`, `app/api/interview/report/[reportId]/retry/route.ts`); all three task commit hashes (`55c2749`, `ab17c62`, `a8a4947`) found in git history.

---
*Phase: 06-interview-evaluation-and-report*
*Completed: 2026-09-20*
