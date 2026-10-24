---
phase: 22-coached-mode
plan: 02
subsystem: database
tags: [prisma, postgresql, migration, schema, coached-mode]

requires:
  - phase: 21-adaptive-mastery-path
    provides: CoachedSession, MasteryContribution models (21-03)
provides:
  - CoachedTurn and MomentCompetencyScore models
  - New CoachedSession, MasteryContribution and User columns for two-moment sessions, per-leg conversation, graded attempts, leg closure, and coach choice
  - Additive migration 20261123000000_add_coached_mode, applied to the local dev database by a human
affects: [22-03, 22-04, 22-05, 22-06, later Phase 22 plans]

key-files:
  created:
    - prisma/migrations/20261123000000_add_coached_mode/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/study-plan/coached/instance.ts

requirements-completed: [REQ-114, REQ-116]

duration: n/a
completed: 2026-10-23
---

# Phase 22 Plan 02: Coached Mode Schema Summary

**Additive Prisma schema and hand-authored migration for coached mode (2 new tables, nullable columns, one DROP NOT NULL relaxation), applied to the local dev database by a human under REQ-74.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Extend schema.prisma and hand-author the migration | caf0dc0 (see process deviation) |
| 2 | Human applies the Phase 22 migration (REQ-74) | human-action checkpoint, no commit |

## Task 2 outcome

The user replied "applied". `.env` and `.env.local` both point at `localhost:5432/leadership_avatar_dev`, so the local verifier DB and the dev-server DB are one database. The user ran `npx prisma migrate deploy`. Read-only re-check with `npx prisma migrate status` reported "17 migrations found in prisma/migrations ... Database schema is up to date!".

## Deviations from Plan

**1. [Rule 3 - Blocking] Edited `lib/study-plan/coached/instance.ts` (not in files_modified)**
- Making `freshScenarioPrompt` nullable broke `deriveViewFromRow`. Its row param became `string | null` and the view maps it with `?? ""`. `CoachedSessionView` is unchanged.

**2. [Process] Task 1 files landed in another plan's commit**
- The shared git index swept Task 1's three files into another plan's commit. They were first in 12a2465 (message from 22-03), which was later soft-reset out of history. They now live in caf0dc0, under the message "test(22-06): add coached avatar-mount guard battery". Content is intact and verified. History was deliberately not rewritten.

## Migration Handoff -- READ BEFORE ANY DEPLOY OF THIS BRANCH

**Migration directory:** `prisma/migrations/20261123000000_add_coached_mode/`

**Status:**
- **Local dev database (`leadership_avatar_dev`, localhost:5432): APPLIED** by a human via `npx prisma migrate deploy`; `migrate status` confirms up to date.
- **Production: NOT APPLIED.** No prod database was touched.

**A human must run `npx prisma migrate deploy` against prod after reviewing the SQL and before this branch is deployed.** The Vercel build script does not run migrations (REQ-74: `migrate deploy` was deliberately removed from `buildCommand` after a preview build auto-applied a migration to a shared database). Deploying code that reads the new tables or columns against an unmigrated database will fail at runtime. The migration is additive only (2 new tables, nullable columns, one DROP NOT NULL relaxation); no existing column or table is dropped.

## Next Phase Readiness
- Later plans can write two-moment sessions, per-leg conversations, graded attempts, session-pointed contributions, cached per-turn scores, and a user's coach choice; DB-gated verifiers can run against the local database.
- Blocker for any real deploy: prod migration above.

## Self-Check: PASSED
