---
phase: 08-interview-customization
plan: 02
subsystem: database
tags: [prisma, postgres, dto, interview-report]

requires:
  - phase: 06-interview-evaluation-and-report
    provides: "InterviewReport model and toInterviewReportDTO mapper"
provides:
  - "Six nullable customization columns on InterviewReport (industry, roleTitle, difficulty, targetMinutes, targetQuestionCount, interviewerPersona)"
  - "customization block on InterviewReportDTO, mapped field by field, null-safe"
affects: [08-04-evaluation-runner-customization, 08-06-session-length, 08-07-report-page-customization-display]

tech-stack:
  added: []
  patterns:
    - "Customization snapshot stored on the report row at session start, not derived from typeSlug at read time"

key-files:
  created:
    - prisma/migrations/20260921141342_add_interview_customization/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/interview/report-dto.ts

key-decisions:
  - "difficulty stored as a plain String? column, not a new Prisma enum, so InterviewDifficulty in lib/interview/types.ts remains the single source of truth"
  - "No column added for raw pasted profile text; only the bounded, derived interviewerPersona string is persisted, per 08-CONTEXT.md"
  - "customization is a nested block on the DTO (not flattened fields) so it reads as one unit on the report page"

requirements-completed: [REQ-24]

duration: 15min
completed: 2026-09-21
---

# Phase 8 Plan 02: InterviewReport Customization Columns Summary

**Six nullable customization columns added to `InterviewReport` via a local-dev-only migration, surfaced field-by-field on `InterviewReportDTO` as a nested `customization` block.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-21T14:00:00Z
- **Completed:** 2026-09-21T14:15:14Z
- **Tasks:** 2
- **Files modified:** 3 (1 created)

## Accomplishments
- `InterviewReport` can now record the resolved industry, role, difficulty, target length (minutes and question count), and interviewer persona that actually produced a session.
- Migration `20260921141342_add_interview_customization` applied to the local dev DB only; the shared AWS Lightsail database was never contacted (inline `DATABASE_URL` used for `migrate dev` and `generate`, `npm run setup` never invoked).
- `InterviewReportDTO` gained a `customization` block mapped field by field from the new columns; pre-Phase-8 rows produce a valid DTO with all six fields null.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add six nullable customization columns and migrate the local dev DB** - `e524439` (feat)
2. **Task 2: Extend InterviewReportDTO with the customization block** - `23acfa2` (feat)

**Plan metadata:** (this commit) `docs(08-02): complete InterviewReport customization plan`

## Files Created/Modified
- `prisma/schema.prisma` - Added `industry`, `roleTitle`, `difficulty`, `targetMinutes`, `targetQuestionCount`, `interviewerPersona` (all nullable) to `InterviewReport`, in a commented "Resolved customization snapshot" block.
- `prisma/migrations/20260921141342_add_interview_customization/migration.sql` - `ALTER TABLE "InterviewReport" ADD COLUMN` x6, zero `NOT NULL` constraints. Committed migration SQL is the handoff artifact for the team, exactly as Phase 6's 06-01 did — it is not applied to the shared database from this plan.
- `lib/interview/report-dto.ts` - Added the `customization` nested type to `InterviewReportDTO` and populated it field-by-field inside `toInterviewReportDTO`; updated the file's doc comment to document that the block is owner-safe derived data and that `interviewerPersona` is always the distilled summary, never raw pasted text.

## Decisions Made
- `difficulty` kept as `String?`, not a Prisma enum — matches the plan's explicit instruction to keep `lib/interview/types.ts`'s `InterviewDifficulty` union as the single source of truth and avoid a migration every time a difficulty level is added.
- No column for the raw pasted "who is interviewing you" profile text — only the derived, bounded `interviewerPersona` string is stored, consistent with 08-CONTEXT.md's requirement that third-party pasted text persist only as long as the session needs it.
- `customization` is a nested object on the DTO rather than six flat fields, so the report page (08-07) can render it as one visually distinct unit rather than mixing it with score fields.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `prisma migrate dev` with the inline local `DATABASE_URL` applied cleanly on the first attempt; `npx tsc --noEmit` was clean after the DTO change with no follow-up fixes needed.

## User Setup Required

None - no external service configuration required. The migration SQL is committed for the team to apply to the shared database via their own deploy step (not `npm run setup`, which targets the shared DB directly and was never run here).

## Next Phase Readiness

- 08-04 (evaluation runner) can now read the persisted customization off the report row instead of grading every session against the preset's static defaults.
- 08-06 (session length) and 08-07 (report page display) have real, nullable columns and a DTO block to build against.
- No blockers. The shared database still has no `InterviewReport` customization columns and needs the same migration applied through the team's normal deploy process before any of these columns are queried in production.

## Self-Check: PASSED

All claimed files and commits verified to exist on disk / in git history.

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*
