---
phase: 09-student-authored-scenarios
plan: 04
subsystem: api
tags: [nextjs, prisma, s3, openai, waitUntil, ownership]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios (09-01)
    provides: ScenarioReport Prisma model with run-time snapshot columns, InterviewReportStatus reuse
  - phase: 09-student-authored-scenarios (09-02)
    provides: "CaseStudy.ownerId discriminator and the /api/scenario/* CRUD family this plan's start route reads scenarios through"
  - phase: 09-student-authored-scenarios (09-03)
    provides: "runScenarioEvaluation, toScenarioReportDTO — pure library modules this plan wires into real routes"
  - phase: 08-interview-customization
    provides: "The session start/finish/report route structure this plan copies (never imports)"
provides:
  - "POST /api/scenario/session/start — cohort-free run start, playability-checked, writes the REQ-33 immutable snapshot onto a new ScenarioReport row"
  - "POST /api/scenario/session/finish — completes the S3 InteractionLog, backgrounds grading via waitUntil, 409 on double-submit"
  - "lib/scenario/evaluation-runner.ts — runAndPersistScenarioEvaluation, grades strictly from the report row's snapshot, always terminates READY or FAILED"
  - "GET /api/scenario/report/[reportId] — owner-scoped DTO read, byte-identical 404 for every non-owned miss"
affects: [09-06, 09-07, 09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A feature that needs the legacy /api/interaction/* pipeline's shape but not its cohort requirement builds its own request/response objects inline (copied, not imported, not called over HTTP) rather than relaxing the legacy route's validation for a second caller"
    - "A background evaluation runner reads every grading input from its own Postgres report row (the run-time snapshot), never re-fetching the live source-of-truth object, so edits/deletes to that live object can never retroactively change a past grade"

key-files:
  created:
    - app/api/scenario/session/start/route.ts
    - app/api/scenario/session/finish/route.ts
    - lib/scenario/evaluation-runner.ts
    - app/api/scenario/report/[reportId]/route.ts
  modified: []

key-decisions:
  - "The scenario start route never calls /api/interaction/start over HTTP and never relaxes its cohortId requirement — it constructs its own InteractionLog inline with the literal cohortId: \"\" as the file's single occurrence of that field, since a scenario genuinely has no cohort and none should be invented"
  - "runAndPersistScenarioEvaluation reads caseName/backgroundSnapshot/avatarsSnapshot/criteriaSnapshot exclusively from the ScenarioReport row, never calling s3Storage.getCase — proven by a code-level grep, not just documented — so an evaluation can never grade against a scenario state that postdates the run"
  - "The ScenarioReport row create in start happens before the S3 InteractionLog write; if the S3 write throws, the row is deleted before returning 500, preserving the Phase 6 no-orphan-IN_PROGRESS-row discipline for this new pipeline"

requirements-completed: [REQ-32, REQ-33, REQ-34]

# Metrics
duration: 35min
completed: 2026-09-21
---

# Phase 9 Plan 04: Scenario Run/Report Pipeline Summary

**Cohort-free scenario start/finish routes plus a background evaluation runner that grades strictly from an immutable run-time snapshot, wired to an owner-scoped report GET — closing REQ-32/33/34.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-21T20:05:00Z
- **Completed:** 2026-09-21T20:40:00Z
- **Tasks:** 3
- **Files modified:** 4 created, 0 modified

## Accomplishments
- `POST /api/scenario/session/start` routes entirely around the legacy `/api/interaction/start` (which hard-requires a `cohortId` a scenario will never have): it enforces playable-scenario access server-side (own scenario, or another student's published scenario; an admin-authored case with no `ownerId` is never playable through this route), writes the REQ-33 immutable snapshot onto a new `ScenarioReport` row, and builds its own cohort-free S3 `InteractionLog`, deleting the report row if the S3 write fails so no orphan `IN_PROGRESS` row is left behind
- `lib/scenario/evaluation-runner.ts`'s `runAndPersistScenarioEvaluation` reads every grading input — case name, background, characters, author criteria — exclusively from the `ScenarioReport` row's snapshot, never re-fetching the live S3 scenario (proven by a `getCase` grep returning nothing in the file); it always terminates `READY` or `FAILED`, never `PENDING`, matching the interview runner's invariant
- `POST /api/scenario/session/finish` completes and persists the S3 log, returns 409 on a double-submit, backgrounds grading via `waitUntil`, and responds 202 in well under a second
- `GET /api/scenario/report/[reportId]` returns `toScenarioReportDTO` for the owner only; a nonexistent id, a malformed id, and another student's id all return the byte-identical 404 body and status

## Task Commits

Each task was committed atomically:

1. **Task 1: Scenario run start — snapshot the scenario onto a new report row** - `cb681bb` (feat)
2. **Task 2: Evaluation runner and finish route** - `d729210` (feat)
3. **Task 3: Owner-scoped scenario report GET** - `02d4925` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `app/api/scenario/session/start/route.ts` - Playability-checked, cohort-free run start; writes the REQ-33 snapshot and the S3 `InteractionLog`
- `app/api/scenario/session/finish/route.ts` - Completes the S3 log, 409-guards double-submit, backgrounds evaluation
- `lib/scenario/evaluation-runner.ts` - `runAndPersistScenarioEvaluation`, grades from the snapshot only, always terminal
- `app/api/scenario/report/[reportId]/route.ts` - Owner-scoped DTO read, uniform 404

## Decisions Made
- Kept `/api/interaction/start|save|finish|get` and `lib/interview/*` completely untouched (confirmed diff-empty after every commit) — the scenario pipeline duplicates the small pieces of logic it needs (log construction, transcript-flattening, end-session bookkeeping) rather than importing from or modifying those files, per the plan's hard constraint
- `cohortId: ""` is the file's one and only literal `cohortId` occurrence, verified by grep, so a scenario run's cohort-free nature is enforced by construction rather than convention
- The report row's `turnCount` is updated from the S3 log's `totalMessages` at evaluation time (not at finish time), keeping the finish route free of any S3 read

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Two `next dev` instances cannot coexist against the same `.next` directory in this project (Next's own dev lock, plus a real Turbopack persistent-cache corruption observed on a first attempt sharing the pre-existing port-3000 session's cache). Resolved by fully killing the stray/corrupted instance and starting a single fresh `next dev --turbopack -p 3012` (inline local `DATABASE_URL`) for all of this plan's runtime verification; the pre-existing port-3000 session (`STATE.md`'s "may be returning 500s, leave it untouched" server) was never interacted with beyond an initial unauthenticated `curl` health check. All test scenarios, reports, and the temporary dev server were cleaned up/stopped after verification.

This plan ran concurrently with 09-05 in the same working directory (no worktree isolation, shared git index — the hazard first logged in `08-08-SUMMARY.md`). Every commit in this plan staged only its own literal file paths, including the bracketed `app/api/scenario/report/[reportId]/route.ts` path quoted explicitly; `git show --name-only` after each commit confirmed exactly the intended file(s) and no cross-contamination with 09-05's `components/scenario/` or `app/case-play/` files.

## User Setup Required

None - no external service configuration required. A real `OPENAI_API_KEY` (already present in the shared `.env`) was used for the live evaluation verification call; nothing new needs to be added.

## Next Phase Readiness

The full scenario run lifecycle — start, finish, background grading, owner-scoped report read — is live end to end against the local dev DB with real OpenAI calls. Verified: an immutable snapshot proven unchanged after editing the live scenario; admin-case and non-owned-unpublished-scenario starts both 404, then 201 once published; a real roleplay transcript graded to `READY` with numeric content/behavioral and null visual/vocal in well under a second of request time; a re-finish 409s; deleting the underlying (unpublished) scenario left the `READY` report fully readable (REQ-34); a forced missing-transcript case resolved to `FAILED` with a readable reason, never `PENDING`; a second student's finish and report GET against the first's `reportId` both 404. No blockers for 09-06 (publish/list UI) or later plans — `reportId` from this plan's start route and the DTO from its report route are ready for the UI to consume.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/api/scenario/session/start/route.ts
- FOUND: app/api/scenario/session/finish/route.ts
- FOUND: lib/scenario/evaluation-runner.ts
- FOUND: app/api/scenario/report/[reportId]/route.ts
- FOUND: commit cb681bb
- FOUND: commit d729210
- FOUND: commit 02d4925
