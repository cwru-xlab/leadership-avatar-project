---
phase: 06-interview-evaluation-and-report
verified: 2026-09-20T00:00:00Z
status: passed
score: 6/6 success criteria verified, 10/10 requirements satisfied
---

# Phase 6: Interview Evaluation & Student Report Verification Report

**Phase Goal:** Persist the interview transcript server-side, evaluate it with INTERVIEW_EVALUATOR_PROMPT, store a validated report, and give the authenticated student an owner-only page to read it.
**Verified:** 2026-09-20
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A student who finishes an interview lands on a report page and sees a rubric-aligned report appear without reloading | VERIFIED | `app/interview/[type]/page.tsx:182-184` routes `onFinish(reportId)` → `router.push`; `app/interview/[type]/report/[reportId]/page.tsx` polls `/api/interview/report/[reportId]` every 2s (`POLL_MS=2000`) via `setInterval`/`load()`, updating `report` state in place — no reload. Human-verified 06-08 step 6: "skeleton rendered ... then polled to READY (5 polls) with no manual reload and no layout jump." |
| 2 | The transcript survives a browser close — stored server-side, not only in React state | VERIFIED | `app/api/interview/session/checkpoint/route.ts` writes `s3Storage.saveInterviewTranscript` after every assistant turn (called fire-and-forget from `InterviewSessionShell.tsx:226-250`'s `checkpoint()`), independent of client lifetime. Human-verified 06-08 step 4/8: mid-interview S3 writes observed, and abandoned rows (`IN_PROGRESS`) retained their transcript. |
| 3 | Visual and Vocal render as "Not yet measured" rather than as invented scores | VERIFIED | `lib/interview/evaluation.ts:validateEvaluationResult` unconditionally sets `visualScore`/`vocalScore` to `null` regardless of model output (typed as literal `null` in `ValidatedEvaluation`). `components/interview/ReportScoreCards.tsx`'s `UnmeasuredCard` unconditionally renders "Not yet measured" for those two categories, never branching on a score value. DB confirmed NULL (not 0) per 06-08 step 7. |
| 4 | A student requesting another student's report gets a 404 | VERIFIED | `app/api/interview/report/[reportId]/route.ts` uses `prisma.interviewReport.findFirst({ where: { id: reportId, userId: currentUser.id } })` and returns a single shared `NOT_FOUND` constant/404 for both malformed-id and no-matching-row cases — no `findUnique`, no distinguishable 403 path anywhere in `app/api/interview/`. Human-verified 06-08 step 9 with two real seeded accounts: non-owner request returned byte-identical 404 JSON. |
| 5 | A failed evaluation is visible and retryable, and never loses the transcript | VERIFIED | `lib/interview/evaluation-runner.ts` never deletes/overwrites `transcriptKey` on failure; `runInterviewEvaluation` retries once (`RETRIES=1`) then returns a readable `reason`; `app/api/interview/report/[reportId]/retry/route.ts` allows retry only when `status === "FAILED"` (409 otherwise) and requires a non-null `transcriptKey`. Report page shows failure reason + "Try again" button. Human-verified 06-08 step 11 end to end (forced-failure model, retry succeeded on same reportId, row count unchanged). |
| 6 | The migration SQL exists for team review and has not been applied to the shared database | VERIFIED | `prisma/migrations/20260920034855_add_interview_report/migration.sql` exists on disk with the full `InterviewReport` table + enum + indexes + FK. No `prisma migrate deploy`/`db push` against the shared `DATABASE_URL` appears in any Phase 6 commit; 06-08-SUMMARY.md documents the handoff explicitly. (Not independently re-verified against the live shared DB per task instructions — relying on documented evidence and absence of any deploy command in the phase's history.) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` (`InterviewReport` model) | Model + enum + User relation, nullable visual/vocal | VERIFIED | Model at line 284-321; enum at 277-282; `User.interviewReports InterviewReport[]` at line 73; no `cohortId`/`CaseAssignment`/`attemptNumber` on this model. |
| `prisma/migrations/20260920034855_add_interview_report/migration.sql` | Generated SQL | VERIFIED | Present, matches schema, no cohort/assignment fields. |
| `lib/interview/transcript.ts` | `InterviewTranscript` type + builder | VERIFIED | Exports `InterviewTranscript`, `InterviewTranscriptTurn`, `buildInterviewTranscript`, `normalizeTurns`, `formatTranscriptForEvaluator`; does not reuse `InteractionLog`. |
| `lib/s3-client.ts` (`saveInterviewTranscript`/`getInterviewTranscript`) | S3 read/write keyed server-side | VERIFIED | Both methods use `sanitizePathSegment(userId, ...)` and `sanitizePathSegment(reportId, ...)`, never client-supplied path fragments. |
| `lib/interview/evaluation.ts` | JSON-schema evaluator + validation | VERIFIED | `EVALUATION_JSON_SCHEMA`, `validateEvaluationResult`, `runInterviewEvaluation` all present; imports `INTERVIEW_EVALUATOR_PROMPT` verbatim; ~230 lines, well over `min_lines: 120`. |
| `app/api/interview/session/start/route.ts` | Creates row on first real turn | VERIFIED | `prisma.interviewReport.create` scoped to `currentUser.id`; called only from `ensureReport()`, itself only called from `checkpoint()` (never an exit path). |
| `app/api/interview/session/checkpoint/route.ts` | Persists transcript to S3 | VERIFIED | Ownership via `findFirst({id, userId})`; writes via `saveInterviewTranscript`; rejects non-`IN_PROGRESS` with 409. |
| `lib/interview/evaluation-runner.ts` | Shared background job | VERIFIED | `runAndPersistEvaluation` exported, used identically by both finish and retry routes; never throws, always terminates READY or FAILED. |
| `app/api/interview/session/finish/route.ts` | Flips to PENDING, schedules `waitUntil` | VERIFIED | `waitUntil(runAndPersistEvaluation(...))` called after `prisma.interviewReport.update({status: "PENDING", ...})`; returns 202 with `{reportId}`. |
| `app/api/interview/report/[reportId]/retry/route.ts` | FAILED-only retry | VERIFIED | Explicit `report.status !== "FAILED"` guard returns 409; requires `transcriptKey !== null`. |
| `lib/interview/report-dto.ts` | Private-field-stripping DTO | VERIFIED | `toInterviewReportDTO` maps fields explicitly (no spread); DTO type has no `resumeText`/`transcriptKey`/`resumeId`/`userId` fields. |
| `app/api/interview/report/[reportId]/route.ts` | Owner-scoped GET | VERIFIED | `findFirst({id, userId})`; shared `NOT_FOUND` constant for both malformed-id and no-row cases. |
| `components/interview/InterviewSessionShell.tsx` | reportId lifecycle, checkpointing, End/Leave modals | VERIFIED | `ensureReport`, `checkpoint`, `handleEnd`, `handleLeave`, `exitIntent` all present; `handleEnd` creates the row only when real assistant turns exist, never for an empty session. |
| `app/interview/[type]/page.tsx` | Navigation to report page | VERIFIED | `onFinish={(reportId) => router.push(...report/${reportId})}`. |
| `components/interview/ReportScoreCards.tsx` | 4 rubric cards, Visual/Vocal greyed | VERIFIED | `UnmeasuredCard` (Visual, Vocal) vs `ScoredCard` (Content, Behavioral); no computed overall score anywhere in the file. |
| `components/interview/ReportMarkdown.tsx` | `react-markdown` + `remark-gfm`, no raw HTML | VERIFIED | `remarkPlugins={[remarkGfm]}`; no `rehypeRaw`/`rehype-raw` import; explicit component overrides. |
| `app/interview/[type]/report/[reportId]/page.tsx` | Polling, skeleton, 2-min give-up, FAILED retry | VERIFIED | `POLL_MS=2000`, `POLL_GIVE_UP_MS=120000`, skeleton block, `handleRetry` calling the retry endpoint. 220 lines, over `min_lines: 120`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/s3-client.ts` | `sanitizePathSegment` | server-derived key for userId/reportId | WIRED | `saveInterviewTranscript`/`getInterviewTranscript` both call `sanitizePathSegment` on `userId` and `reportId`. |
| `prisma/schema.prisma` | `model User` | `interviewReports` relation | WIRED | Present at line 73. |
| `lib/interview/evaluation.ts` | `lib/interview/prompts.ts` | imports `INTERVIEW_EVALUATOR_PROMPT` | WIRED | Imported and used verbatim as system message; `prompts.ts` itself unmodified (`git diff HEAD` empty). |
| `lib/interview/evaluation.ts` | openai chat.completions | `response_format: json_schema` | WIRED | Present in `attemptEvaluation`. |
| `app/api/interview/session/start/route.ts` | `prisma.interviewReport.create` | scoped to authenticated user | WIRED | `userId: currentUser.id` in create data. |
| `app/api/interview/session/checkpoint/route.ts` | `s3Storage.saveInterviewTranscript` | server-derived key | WIRED | Called with `currentUser.id`, `report.id` (post-ownership-check). |
| `app/api/interview/session/finish/route.ts` | `waitUntil` | background scheduling | WIRED | Called after response data prepared, before return. |
| `lib/interview/evaluation-runner.ts` | `runInterviewEvaluation` | evaluation call persisted | WIRED | Result written to `prisma.interviewReport.update` in the same function. |
| `app/api/interview/report/[reportId]/route.ts` | `prisma.interviewReport.findFirst` | where scoped by id AND userId | WIRED | Confirmed. |
| `app/api/interview/report/[reportId]/route.ts` | `toInterviewReportDTO` | strips private fields | WIRED | Confirmed, and DTO shape verified to omit `transcriptKey`/`resumeId`/`resumeText`. |
| `components/interview/InterviewSessionShell.tsx` | `/api/interview/session/checkpoint` | fire-and-forget post-turn | WIRED | In `checkpoint()`, fired after every `appendMessage`/`sendMessage` assistant turn via `advanceProgress` → `checkpoint(nextProgress)`. |
| `components/interview/InterviewSessionShell.tsx` | `/api/interview/session/finish` | awaited on confirmed End | WIRED | In `handleEnd`. |
| `app/interview/[type]/page.tsx` | `/interview/[type]/report/[reportId]` | `router.push` in `onFinish` | WIRED | Confirmed. |
| `components/interview/ReportMarkdown.tsx` | `remark-gfm` | `remarkPlugins` prop | WIRED | Confirmed. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REQ-01 | 06-01 | `InterviewReport` model, nullable visual/vocal, no cohort/assignment fields | SATISFIED | Schema verified above. |
| REQ-02 | 06-01 | Migration generated, applied only to local dev DB | SATISFIED | Migration file verified; not applied to shared DB per documented evidence (not independently re-checked against live DB, per task constraints). |
| REQ-03 | 06-03, 06-06 | Row created on first real turn; checkpoint after every assistant turn, non-blocking | SATISFIED | `ensureReport()`/`checkpoint()` verified fire-and-forget, never called from an exit path. |
| REQ-04 | 06-01 | Purpose-built `InterviewTranscript`, not `InteractionLog` | SATISFIED | `lib/interview/transcript.ts` confirmed standalone type. |
| REQ-05 | 06-04 | Finish endpoint: PENDING, immediate reportId, background evaluation | SATISFIED | `finish/route.ts` verified. |
| REQ-06 | 06-02, 06-04 | JSON-mode evaluator, `INTERVIEW_EVAL_MODEL` default `gpt-4.1`, coercion, null visual/vocal | SATISFIED | `evaluation.ts` verified. |
| REQ-07 | 06-04 | Retry-once, FAILED with reason, transcript survives, FAILED-only re-run | SATISFIED | `evaluation-runner.ts` + `retry/route.ts` verified. |
| REQ-08 | 06-05, 06-07 | Report page: poll 2s, 2-min give-up, skeleton, retry | SATISFIED | `page.tsx` verified. |
| REQ-09 | 06-03..06-07 | Ownership from JWT, 404 not 403, no staff override | SATISFIED | All ownership queries verified `findFirst({id, userId})`; zero 403s in scoped dirs. |
| REQ-10 | 06-06 | End/Leave confirm modals, wired to finish endpoint | SATISFIED | `exitIntent`, `handleEnd`, `handleLeave` verified; note the REQUIREMENTS.md inline annotation for REQ-10 ("`handleEnd` ... never `ensureReport()`") is now stale — commit `44793da` intentionally changed `handleEnd` to call `ensureReport()` when real assistant turns exist (fixing a data-loss bug where a completed interview with a failed early `ensureReport()` call was silently discarded). The current code is the correct, final behavior per the task's own invariant description ("must create the row when assistant turns exist") and is not a regression. |

No orphaned requirements found — all 10 REQ IDs declared across plans (06-01 through 06-08) match REQUIREMENTS.md's Phase 6 section exactly.

### Phase-wide Invariant Sweep

| Invariant | Result |
|-----------|--------|
| Zero `findUnique` under `app/api/interview/` | PASS — 0 matches |
| Zero `403` under `app/api/interview/session/` and `app/api/interview/report/` | PASS — 0 matches |
| 2 pre-existing `403` in `interviewers/route.ts:83,87` | Confirmed present, expected (Phase 2 upstream LiveAvatar status passthrough), not a violation |
| Zero `beforeunload`/`sendBeacon` in interview client | PASS — 0 matches in `components/interview/`, `app/interview/` |
| Zero `rehype-raw`; `remark-gfm` used, raw HTML disabled | PASS — no `rehype-raw` anywhere in repo source; `ReportMarkdown.tsx` uses `remarkGfm` only |
| No `cohortId`/`CaseAssignment`/attempt/gradebook/staff fields on `InterviewReport` or its migration | PASS — the only grep hits are on unrelated pre-existing models (`Cohort`, `CaseAssignment`, `Attempt`); `InterviewReport` itself and its migration SQL are clean |
| `lib/interview/prompts.ts` unmodified | PASS — `git diff HEAD -- lib/interview/prompts.ts` is empty |
| Visual/vocal scores forced null in code | PASS — `validateEvaluationResult` hardcodes `null`, typed as literal `null` in `ValidatedEvaluation` |
| DTO never exposes resumeText/transcriptKey/S3 key | PASS — `toInterviewReportDTO` is an explicit field mapper; `InterviewReportDTO` type has no such fields |
| Retry permitted ONLY from FAILED, never READY | PASS — explicit `!== "FAILED"` guard returns 409 |
| Report row created on first real turn, not on entering session step | PASS — `start/route.ts` only called via `ensureReport()`, which is only called from `checkpoint()` |
| `handleEnd` orphan-row behavior on both branches | PASS — no assistant turns → `handleLeave()` path, no row created; assistant turns exist but `reportId` null → `ensureReport()` called, row created, interview preserved (post-`44793da` state confirmed correct) |

### tsc / build checks

`npx tsc --noEmit` (after clearing stale `.next/types` cache) produced zero errors touching any Phase 6 file. The 6 errors present before clearing the cache referenced `app/plan`, `app/practice`, `app/progress`, `app/api/student/{plan,progress}` — none of which exist in this tree; confirmed stale build artifact, not a real type error (consistent with 06-08-SUMMARY.md's own finding).

### Anti-Patterns Found

None found in Phase 6 files. No TODO/FIXME/placeholder markers, no empty handlers, no stub returns in any of the reviewed files.

### Human Verification Required

None outstanding — the full 11-step end-to-end checklist was already human-verified on 2026-09-20/21 against a real authenticated LiveAvatar session with a real PDF and recorded verbatim in `06-08-SUMMARY.md`. Code-level inspection in this verification corroborates every claim made there (ownership scoping, null visual/vocal, retry-only-from-FAILED, DTO field list, migration file contents, prompts.ts non-modification).

### Known Deferred / Pre-existing Items (not phase failures)

- `middleware.ts:273` returns 307 (redirect to `/login`) instead of 401 for cookie-less `/api/*` requests — pre-existing, cross-cutting, out of scope for Phase 6 (route-level `getCurrentUser` → 401 logic is correct and is the real code path if middleware config changes).
- `ensureReport()` swallows a failed `session/start` call with no logging beyond a `catch { return null }` — genuine minor gap, explicitly deferred by decision (the caller, `handleEnd`, surfaces a retryable toast to the student instead).
- A missing/deleted user on a valid token would fall through to a 500 rather than a 401 in these routes' `getCurrentUser` calls (same pattern as `upload-resume`, pre-existing).
- ESLint is broken repo-wide (`plugin:@next/next/recommended is invalid`) — pre-existing, unrelated to Phase 6 files; confirmed identical failure on untouched files.
- A stray sibling `package-lock.json` misleads Next's workspace-root inference — pre-existing, unrelated.
- Minor doc inconsistency: `.planning/ROADMAP.md` line 103 still shows `06-08-PLAN.md` with an unchecked `[ ]` box while the phase's own "Plans: 8/8 complete" line and the Progress table both say complete — cosmetic, does not affect code verification.

### Gaps Summary

No gaps found. All 6 ROADMAP success criteria are verified against actual source code (not just SUMMARY claims), all 10 requirements are satisfied with code-level evidence, all phase-wide invariants (findUnique ban, 403 ban, beforeunload/sendBeacon ban, rehype-raw ban, no cohort/assignment schema creep, prompts.ts untouched, forced-null visual/vocal, DTO leak prevention, retry-only-from-FAILED, correct row-creation timing, and the corrected `handleEnd` orphan-row logic) hold in the current codebase. The already-completed human end-to-end validation (06-08) is corroborated, not merely trusted, by this code-level review.

---

*Verified: 2026-09-20*
*Verifier: Claude (gsd-verifier)*
