---
phase: 13-one-on-one-conversation-engine
plan: 15
subsystem: database
tags: [REQ-65, REQ-67, InteractionReport, DROP TABLE, migration-handoff]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "13-04 local CREATE+backfill; 13-14 REQ-66 validation passed; 13-MIGRATION-HANDOFF Part 1"
provides:
  - "prisma/migrations/20261004040000_drop_legacy_report_tables: separable two-statement DROP"
  - "schema without InterviewReport/ScenarioReport models; enum InterviewReportStatus retained"
  - "13-MIGRATION-HANDOFF.md Part 2: backup-advised, declinable destructive handoff"
affects: [phase-13-closure, REQ-65, REQ-67, shared-db-migrate]

tech-stack:
  added: []
  patterns:
    - "Destructive DROP is its own migration + handoff section, independent of CREATE+backfill"
    - "Pre-drop shared tooling reads legacy tables via $queryRaw after Prisma models are removed"

key-files:
  created:
    - prisma/migrations/20261004040000_drop_legacy_report_tables/migration.sql
  modified:
    - prisma/schema.prisma
    - app/api/study-plans/generate/route.ts
    - scripts/backfill-interaction-reports.ts
    - scripts/verify-interaction-report-backfill.ts
    - .planning/phases/13-one-on-one-conversation-engine/13-MIGRATION-HANDOFF.md
  deleted:
    - scripts/seed-legacy-reports.ts

key-decisions:
  - "Sole live app read of interviewReport was study-plans/generate — retargeted to interactionReport (interview typeSlugs) before DROP."
  - "Keep backfill+verifier for shared Part 1 via $queryRaw; delete local-only seed-legacy-reports.ts."
  - "Human ACK drop handoff received; shared Part 1 still deferred (REQ-67 OPEN). Part 2 declinable indefinitely."

patterns-established:
  - "First project DROP TABLE migration — handoff requires pg_dump + pre-drop verification queries, not the old no-DROP review bar"
  - "After local DROP, backfill dry-run failing with relation does not exist on leadership_avatar_dev is expected"

requirements-completed: [REQ-65]
# Honesty: REQ-65 MET for schema + local DB (legacy tables gone; only InteractionReport remains).
# Shared Lightsail still holds legacy tables until a human runs Part 1 then optional Part 2.
# REQ-67 remains OPEN — blocks phase close until shared Part 1 (CREATE+backfill) is run by a human.

duration: 40min
completed: 2026-10-04
---

# Phase 13 Plan 15: DROP Legacy Report Tables Summary

**InterviewReport and ScenarioReport are gone from the schema and local DB via a separable DROP migration; Part 2 handoff acknowledged (`drop handoff received`); shared DB untouched.**

## Performance

- **Duration:** ~40 min (incl. study-plans retarget + human ACK)
- **Completed:** 2026-10-04
- **Tasks:** 2/2
- **Commits:** `765b34a` (feat), this docs commit

## Accomplishments

- Proved the only live `prisma.interviewReport` reader was study-plans; fixed before DROP.
- Removed legacy models; applied `20261004040000_drop_legacy_report_tables` on `leadership_avatar_dev` only (2× `DROP TABLE` + FK drops).
- Retained backfill/verify as `$queryRaw` pre-drop tooling for shared Part 1; deleted seed script.
- Extended `13-MIGRATION-HANDOFF.md` with Part 2 (backup, commands, pre-drop queries, local evidence).
- Human resume signal: **`drop handoff received`**.

## Task Commits

1. **Task 1: Prove nothing reads legacy tables, remove models, DROP locally** — `765b34a` (feat)
2. **Task 2: Part 2 handoff + human ACK** — handoff in `765b34a`; ACK recorded here

## Files Created/Modified

- `prisma/migrations/20261004040000_drop_legacy_report_tables/migration.sql`
- `prisma/schema.prisma` — legacy models removed
- `app/api/study-plans/generate/route.ts` — reads `InteractionReport`
- `scripts/backfill-interaction-reports.ts` / `verify-interaction-report-backfill.ts` — `$queryRaw`
- `scripts/seed-legacy-reports.ts` — deleted
- `13-MIGRATION-HANDOFF.md` — Part 2

## Decisions

- Local backfill failure after DROP is expected; do not “fix” by recreating legacy tables.
- Shared Part 1 remains deferred; Part 2 may be declined forever without breaking the app.

## Self-Check: PASSED

- [x] DROP SQL has exactly two `DROP TABLE`s; no `InteractionReport` / enum touches
- [x] Local migrate status up to date; only `InteractionReport` among report tables
- [x] `tsc --noEmit` + five engine verify scripts exit 0
- [x] Human ACK `drop handoff received` recorded
- [x] Shared DB never touched by an agent; REQ-67 still OPEN for phase close
