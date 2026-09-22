---
phase: 10-video-audio-metrics
plan: 02
subsystem: data-layer
tags: [prisma, migration, dto, video-audio-metrics]

# Dependency graph
requires: ["lib/metrics/types.ts (10-01)"]
provides:
  - "InterviewReport/ScenarioReport columns: cameraMode, visualMetrics, vocalMetrics, visualUnscoredReason, vocalUnscoredReason, metricsConsentAt"
  - "User.videoAnalysisConsentAt"
  - "InterviewReportDTO.metrics / ScenarioReportDTO.metrics — typed metrics block on both report DTOs"
affects: [10-video-audio-metrics remaining plans (03-11), both report evaluators, both report pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Json? columns are narrowed through a local per-file discriminator helper (asVisualMetrics/asVocalMetrics keyed on a required field) rather than a bare cast, so a malformed or hand-edited row degrades to null instead of crashing the report page"
    - "Reason/mode string columns validated against a small readonly array of the union's own members before being cast, rather than a bare assertion"

key-files:
  created: []
  modified:
    - prisma/schema.prisma
    - lib/interview/report-dto.ts
    - lib/scenario/report-dto.ts

key-decisions:
  - "Six new nullable columns added identically to both InterviewReport and ScenarioReport (cameraMode, visualMetrics, vocalMetrics, visualUnscoredReason, vocalUnscoredReason, metricsConsentAt), plus one nullable column on User (videoAnalysisConsentAt); all plain String?/Json?/DateTime?, no Prisma enums, following the Phase 8 precedent of keeping lib/metrics/types.ts as the single source of truth for the closed vocabularies"
  - "Migration 20260922134512_add_video_audio_metrics generated and applied to leadership_avatar_dev only via an inline DATABASE_URL; npm run setup was never run. This is the fourth migration in the unapplied handoff queue after 20260920034855_add_interview_report, 20260921141342_add_interview_customization, and 20260921201213_add_scenario_report"
  - "Both DTOs' new metrics block imports CameraMode/VisualMetrics/VocalMetrics/VisualUnscoredReason/VocalUnscoredReason from lib/metrics/types.ts — neither file declares a private copy, resolving the research's Open Question 1 in favor of one shared contract"
  - "REPORT_TERMINAL_STATUSES and SCENARIO_REPORT_TERMINAL_STATUSES left untouched — the single-status polling model is preserved exactly as instructed"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-09-22
---

# Phase 10 Plan 02: Metrics Schema and DTO Extension Summary

**Adds six nullable Phase-10 columns to both report models (plus one consent column on User) via a local-only migration, and extends both report DTOs with an identically-shaped, shared-type `metrics` block that maps a legacy or malformed row to null without throwing.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-22T13:35:xx (approx, not separately timestamped)
- **Completed:** 2026-09-22T13:47:57Z
- **Tasks:** 2
- **Files modified:** 3 (`prisma/schema.prisma`, `lib/interview/report-dto.ts`, `lib/scenario/report-dto.ts`) plus 1 new migration directory

## Accomplishments
- `InterviewReport` and `ScenarioReport` each gained an identical Phase 10 block: `cameraMode`, `visualMetrics`, `vocalMetrics`, `visualUnscoredReason`, `vocalUnscoredReason`, `metricsConsentAt` — all nullable, all plain `String?`/`Json?`/`DateTime?`. `User` gained `videoAnalysisConsentAt`.
- Migration `20260922134512_add_video_audio_metrics` generated and applied to `leadership_avatar_dev` only (inline `DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"`); the shared `.env`/`.env.local` `DATABASE_URL` was never touched (`npm run setup` never run, confirmed via `git log -p -- .env .env.local` showing no recent history from this session).
- SQL contains exactly six `ALTER TABLE ... ADD COLUMN` statements across `InterviewReport`, `ScenarioReport`, and `User`, zero `NOT NULL`, zero `DROP`, zero `CREATE TABLE`.
- Both `InterviewReportDTO` and `ScenarioReportDTO` gained an identically-shaped `metrics: { cameraMode, visual, vocal, visualUnscored, vocalUnscored }` block, sourced from one shared `lib/metrics/types.ts` import in each file — no private duplicate shape.
- Both mappers stay field-by-field (no row spread); a `Json?` column is narrowed through a small local helper keyed on a required field (`eye_contact_pct`/`words_per_minute` + presence of `coverage`) so a garbage or hand-edited JSON value degrades to `null` instead of throwing; the string reason/mode columns are validated against a small readonly array of the union's own members before casting, never a bare assertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the Phase 10 columns and generate a local-only migration** - `ee5bf09` (feat)
2. **Task 2: Extend both report DTOs with a typed metrics block** - `a7e1685` (feat)

**Plan metadata:** (this commit, next) `docs(10-02): complete metrics schema and DTO extension plan`

## Files Created/Modified
- `prisma/schema.prisma` — six new nullable columns on `InterviewReport`, six on `ScenarioReport`, one on `User`
- `prisma/migrations/20260922134512_add_video_audio_metrics/migration.sql` — the handoff artifact (new file, not in `files_modified` but produced by Task 1)
- `lib/interview/report-dto.ts` — `metrics` block on `InterviewReportDTO`, `asVisualMetrics`/`asVocalMetrics`/`asCameraMode`/`asVisualUnscoredReason`/`asVocalUnscoredReason` helpers, mapper populates the new block
- `lib/scenario/report-dto.ts` — identical `metrics` block on `ScenarioReportDTO` and the same helper set

## Decisions Made
- Plain `String?`/`Json?` columns rather than Prisma enums, matching the explicit Phase 8 precedent (`difficulty` on `InterviewReport`) — `lib/metrics/types.ts`'s unions remain the single source of truth for `CameraMode`/`VisualUnscoredReason`/`VocalUnscoredReason`.
- No FK/relation added for any new column; all are scalar, matching every prior Phase 10 column style already in these two models.
- Kept the two DTOs' `metrics` block byte-identical in shape between interview and scenario reports, even though the two report pages will consume it differently, so a future shared rendering component (if ever extracted) has zero shape drift to reconcile.

## Deviations from Plan

### Auto-fixed Issues
None — plan executed exactly as written for both tasks.

### Out-of-scope discovery (not fixed, logged)
- `[Scope boundary]` `npx tsc --noEmit` fails on an untracked, in-progress sibling file `app/api/audio/word-metrics/route.ts:116` (`WordMetricsResponseBody` not assignable to `Record<string, unknown>`). Confirmed via `git stash -u` that this error is present/absent identically regardless of whether this plan's own changes are staged — it belongs to a concurrently-executing sibling plan's WIP file, not to 10-02. Not fixed here; logged to `.planning/phases/10-video-audio-metrics/deferred-items.md`.

**Total deviations:** 0 auto-fixed, 1 out-of-scope item logged (not fixed).
**Impact:** None on this plan's own deliverables — both files this plan owns compile clean in isolation (verified by removing the sibling's untracked file via `git stash -u` and re-running `tsc --noEmit` clean).

## Concurrency Notes

This plan ran concurrently with sibling plans (10-03/10-04 territory) in the same working directory with a shared git index (no worktree isolation — the hazard first logged in `08-08-SUMMARY.md`). Every commit was staged with literal, explicit file paths (`git add prisma/schema.prisma prisma/migrations/.../migration.sql` and `git add lib/interview/report-dto.ts lib/scenario/report-dto.ts`), and each commit was independently verified via `git show --name-only HEAD` to contain only this plan's own files. No cross-contamination occurred in either commit.

## Issues Encountered
None blocking. See "Out-of-scope discovery" above for the one logged, non-blocking sibling-file issue.

## User Setup Required
None — schema/DTO change only, migration already applied to the local dev DB. The shared/production database still has this migration (and the three before it) queued as a handoff item; see `.planning/HANDOFF.md`.

## Next Phase Readiness
- Both report DTOs now expose a real `metrics` block; the report pages and evaluators in later Phase 10 plans (03-11) can consume `InterviewReportDTO.metrics` / `ScenarioReportDTO.metrics` with no further schema or DTO change anticipated.
- The migration is queued for the shared database alongside the three prior unapplied migrations — the next `npm run setup` handoff (owned outside this plan) will need to apply all four in order.
- Ready for the next plan in wave 2/3 of Phase 10 (capture pipeline / evaluator wiring / report page rendering).

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*

## Self-Check: PASSED

All five key files (`prisma/schema.prisma`, `lib/interview/report-dto.ts`, `lib/scenario/report-dto.ts`, the migration SQL, this SUMMARY) confirmed present on disk. Both task commits (`ee5bf09`, `a7e1685`) confirmed present in git log.
