---
phase: 09-student-authored-scenarios
plan: 01
subsystem: database
tags: [prisma, postgres, types, ownership, migration]

# Dependency graph
requires:
  - phase: 08-interview-customization
    provides: InterviewReport model pattern (nullable snapshot columns, InterviewReportStatus enum) that ScenarioReport mirrors
provides:
  - "CaseStudy.ownerId — optional, server-set, immutable field discriminating student-authored scenarios from admin cases"
  - "ScenarioReport Prisma model — reuses InterviewReportStatus, snapshots case name/background/avatars/criteria at run time, bare-String caseId survives S3 case deletion"
  - "User.scenarioReports back-relation"
  - "Migration 20260921201213_add_scenario_report (local dev DB only)"
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership discriminator as a plain optional field on an S3 JSON object, not a Prisma relation — matches Phase 7's published?: boolean precedent for adding access semantics to the S3 CaseStudy shape without a schema migration"
    - "Postgres report models that reference S3-resident entities use a bare String id (no FK), so the report row is immune to deletion of the thing it reports on"

key-files:
  created:
    - prisma/migrations/20260921201213_add_scenario_report/migration.sql
  modified:
    - types/index.ts
    - prisma/schema.prisma

key-decisions:
  - "CaseAvatar was deliberately left unchanged — the scenario builder sources characters from the existing admin-curated VideoAudioProfile catalog via profileId, so no new avatarId field is needed and /case-play's loadAvatarConfig needs no new branch (see 09-05 for the fuller LiveAvatar-selection rationale)"
  - "ScenarioReport.caseId is a bare String, not a Prisma relation, specifically so a report survives deletion of its S3 CaseStudy (REQ-34)"
  - "Reused InterviewReportStatus instead of declaring a second, duplicate enum for ScenarioReport.status"

requirements-completed: [REQ-29, REQ-33, REQ-34]

duration: 15min
completed: 2026-09-21
---

# Phase 9 Plan 01: Data Foundation Summary

**Added `CaseStudy.ownerId` for real per-user scenario ownership and a `ScenarioReport` Postgres model that snapshots a scenario at run time and survives its deletion.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-21T20:05:00Z
- **Completed:** 2026-09-21T20:20:00Z
- **Tasks:** 2
- **Files modified:** 2 modified, 1 created (migration SQL)

## Accomplishments
- `CaseStudy` gained an optional, documented `ownerId` field — the sole discriminator `/case-play` will use to split admin cases from student-authored scenarios, set server-side only, and structured so a future fork action needs no schema change (REQ-30 satisfied by construction, though REQ-30 itself is not this plan's requirement)
- New `ScenarioReport` Prisma model, structurally parallel to `InterviewReport`: reuses `InterviewReportStatus`, snapshots `caseName`/`backgroundSnapshot`/`avatarsSnapshot`/`criteriaSnapshot` once at run time (REQ-33), and uses a bare-String `caseId` (no FK) so the report outlives deletion of its S3 case (REQ-34)
- `User.scenarioReports` back-relation added
- Migration `20260921201213_add_scenario_report` generated and applied to `leadership_avatar_dev` only

## Task Commits

Each task was committed atomically:

1. **Task 1: Add real ownership to the CaseStudy shape** - `06efb43` (feat)
2. **Task 2: Add the ScenarioReport model and apply the migration to the local dev DB only** - `e7e4d57` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `types/index.ts` - Added optional, documented `CaseStudy.ownerId` field; `CaseAvatar` untouched
- `prisma/schema.prisma` - Added `ScenarioReport` model and `User.scenarioReports` back-relation
- `prisma/migrations/20260921201213_add_scenario_report/migration.sql` - Creates the `ScenarioReport` table; zero changes to any existing table

## Decisions Made
- `CaseAvatar` left unchanged rather than adding a raw LiveAvatar `avatarId`, per the plan's explicit instruction (deviates from an earlier research draft; rationale deferred to 09-05)
- `caseId` on `ScenarioReport` is a bare `String`, deliberately not a Prisma relation, so REQ-34 ("survives deletion of its S3 case") holds structurally rather than by convention
- `InterviewReportStatus` reused rather than a parallel `ScenarioReportStatus` enum, keeping the IN_PROGRESS/PENDING/READY/FAILED state machine in one place across both report families

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Migration Handoff Note (style of 06-01-SUMMARY.md / 08-02-SUMMARY.md)

This is the **third** migration in the unapplied handoff queue documented in `.planning/HANDOFF.md` §3:

| Migration | Phase | Applied to shared DB? |
|---|---|---|
| `20260920034855_add_interview_report` | 6 | NO — needs team review |
| `20260921141342_add_interview_customization` | 8 | NO — needs team review |
| `20260921201213_add_scenario_report` | 9 | **NO — needs team review** |

`20260921201213_add_scenario_report` was generated and applied with
`DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"` inline
via `npx prisma migrate dev --name add_scenario_report`, never via `npm run setup`
and never with a bare `prisma migrate` against the shared `DATABASE_URL` in
`.env`/`.env.local`. The SQL is purely additive: one `CREATE TABLE "ScenarioReport"`,
two `CREATE INDEX` statements, and one `ALTER TABLE ... ADD CONSTRAINT` foreign key
from `ScenarioReport.userId` to `User.id`. It touches zero columns on any
pre-existing table. When the team is ready, the intended path is the same as the
prior two: a deliberate `prisma migrate deploy` against the shared DB, decided by
a human.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`CaseStudy.ownerId` and `ScenarioReport` are now available for every remaining
Phase 9 plan (09-02 through 09-09) to build ownership-enforced routes, the
scenario builder, and the run/report pipeline on top of. No blockers.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: prisma/migrations/20260921201213_add_scenario_report/migration.sql
- FOUND: types/index.ts
- FOUND: prisma/schema.prisma
- FOUND: commit 06efb43
- FOUND: commit e7e4d57
