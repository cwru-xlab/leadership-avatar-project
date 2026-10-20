---
phase: 21-adaptive-mastery-path
plan: 03
subsystem: database
tags: [prisma, postgresql, migration, schema]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: competency catalog (21-02), requirements traceability (21-01)
provides:
  - MasteryContribution, KnowledgeCheck, KnowledgeCheckAttempt, GradingContest,
    StudyPlanPath, StudyPlanPathStep, CoachedSession Prisma models
  - A hand-authored, UNAPPLIED forward migration for the seven new tables
affects: [21-04, 21-05, 21-06, 21-07, all later Phase 21 wave-2 plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-only ledger with a reversal column (reversedAt/reversedReason) instead of delete"
    - "Snapshotted weight/score fields (not looked up at read time) to keep history stable under retuning"
    - "Child-of-parent via @unique + onDelete Cascade, no active flag, no delete (StudyPlanPath, CoachedSession)"

key-files:
  created:
    - prisma/migrations/20261116000000_add_adaptive_mastery_path/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "StudyPlanPath is a child of StudyPlan via @unique + Cascade — not a global queue, no active flag, never deleted independently"
  - "MasteryContribution is the single ledger for every mastery-moving event (live session, coached session, deterministic check, model-graded check), distinguished only by a `source` string column, not a Prisma enum"
  - "CoachedSession is reachable only through a path step (pathStepId @unique, Cascade) — the schema-level half of REQ-113's isolation from normal practice"
  - "Migration SQL was hand-authored, not generated via `prisma migrate diff`, because no SHADOW_DB_URL was available in this environment"
  - "Migration ships UNAPPLIED per REQ-74 — no migrate/push command was run against any database in this session"

patterns-established:
  - "Pattern: contest/reversal flows reverse a ledger row in place (reversedAt/reversedReason) rather than deleting it"
  - "Pattern: enum-like discriminator columns kept as plain String (not Prisma enum) when new values are expected to arrive without a migration"

requirements-completed: [REQ-107, REQ-108, REQ-112, REQ-117]

# Metrics
duration: ~25min
completed: 2026-10-20
---

# Phase 21 Plan 03: Adaptive Mastery Path Schema Summary

**Seven additive Prisma models (mastery ledger, four-format knowledge checks with attempts/contests, study-plan-owned path with steps, coached sessions) plus a hand-authored, deliberately unapplied Postgres migration.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-20T14:25:00Z (approx)
- **Completed:** 2026-10-20T14:50:33Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Added `MasteryContribution` as the single append-only ledger every mastery-moving event writes to, regardless of source (live session, coached session, deterministic check, model-graded check), with a snapshotted `weight` and a `reversedAt`/`reversedReason` reversal mechanism for REQ-112's contest flow.
- Added the four-format knowledge-check model (`KnowledgeCheck`, with `MULTIPLE_CHOICE` | `FILL_IN_BLANK` | `PICK_BETTER_RESPONSE` | `REWRITE_WEAK_LINE`), its attempts (`KnowledgeCheckAttempt`, one per student per check, deterministic or model graded), and its contest flow (`GradingContest`, one per attempt).
- Added `StudyPlanPath` as a structural child of `StudyPlan` (`@unique` studyPlanId, `onDelete: Cascade`) with `StudyPlanPathStep` (5-10 steps, bound enforced in code per the plan, not SQL) and `CoachedSession` (reachable only through a path step via `@unique` pathStepId).
- Hand-authored the forward migration (`prisma/migrations/20261116000000_add_adaptive_mastery_path/migration.sql`) with 7 `CREATE TABLE` statements, their indexes, and FK constraints — zero destructive statements.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the seven Phase 21 models to schema.prisma** — bundled into `b5f5cf7` (see "Commit attribution note" below; not a separate hash)
2. **Task 2: Hand-author the migration SQL without applying it** — `d5adf90` (feat)

**Plan metadata:** (this commit, docs: complete plan)

### Commit attribution note (concurrency)

Three sibling executors (21-01, 21-02, 21-04) ran in parallel in this same working tree, as described in this plan's concurrency constraints. I staged only `prisma/schema.prisma` myself (`git add prisma/schema.prisma`, never `git add .`), ran `npx prisma validate` to confirm it was correct, then attempted to commit it as a dedicated Task 1 commit. Between staging and committing, sibling 21-01 ran its own commit (`b5f5cf7`, "docs(21-01): add Requirements line and settle Phase 21 open questions in ROADMAP") without a pathspec, which swept up my already-staged `prisma/schema.prisma` changes alongside its own `.planning/ROADMAP.md` edit — `git commit` with no pathspec commits everything staged in the shared index, not only the committer's intended files. The schema content itself is exactly what Task 1 specifies (verified via `git diff -w` against the prior HEAD, which shows pure additions: the seven new models, the two inverse-relation lines on `User` and `StudyPlan`, no existing column/index/relation altered). I did not rewrite history to fix the attribution, since other agents were actively committing to the same branch and a history rewrite would have been destructive to concurrent work in progress. `b5f5cf7` is therefore the commit of record for Task 1's file, even though its message does not mention it.

## Files Created/Modified
- `prisma/schema.prisma` — added `MasteryContribution`, `KnowledgeCheck`, `KnowledgeCheckAttempt`, `GradingContest`, `StudyPlanPath`, `StudyPlanPathStep`, `CoachedSession`, plus inverse relation fields on `User` (`masteryContributions`, `knowledgeChecks`, `knowledgeCheckAttempts`, `gradingContests`, `studyPlanPaths`, `coachedSessions`) and `StudyPlan` (`path`, `knowledgeChecks`). No existing model's columns, indexes, or relations were changed.
- `prisma/migrations/20261116000000_add_adaptive_mastery_path/migration.sql` — new, hand-authored, forward-only migration for the seven tables above.

## Decisions Made
- **Hand-authored the migration SQL** rather than using `npx prisma migrate diff --shadow-database-url`, because no `SHADOW_DB_URL` was available in this environment (confirmed: reading `.env` for a shadow DB variable was denied by sandbox policy, and no `SHADOW_DB_URL` env var was set). The SQL was written directly from the finalized schema, following the exact column-type and naming conventions of the existing migrations in this repo (e.g. `20261102000000_add_auth_handoffs`): `TEXT` ids, `TIMESTAMP(3)` for DateTime, `JSONB` for Json, `DOUBLE PRECISION` for Float, matching `_pkey`/`_fkey`/`_key`/`_idx` constraint-naming conventions.
- **Discriminator columns kept as plain `String`, not Prisma `enum`**, for `source`, `format`, `gradedBy`, `status`, `kind` — per the plan, this means a new source/format/status value needs no migration, only an application-code change.
- **`occurredAt` on `MasteryContribution` is distinct from `createdAt`** — it is the session's or attempt's own time, which is what REQ-104's current-window figure must window on, not row-write time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing inverse `user` relation on StudyPlanPath**
- **Found during:** Task 1 (`npx prisma validate`)
- **Issue:** `StudyPlanPath.userId` was specified as a plain column per the plan's action text, but Prisma's validator requires an explicit relation field wherever a model has a foreign-key-shaped column referencing another model that already declares the inverse (`User.studyPlanPaths`). Without it, `prisma validate` failed with P1012.
- **Fix:** Added `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` to `StudyPlanPath`, matching the relation style already used on every other model with a `userId` column in this schema.
- **Files modified:** `prisma/schema.prisma`
- **Verification:** `npx prisma validate` passes; `npx prisma format` produces no further changes beyond whitespace alignment; `npx prisma generate && npx tsc --noEmit` both clean.
- **Committed in:** `b5f5cf7` (see commit attribution note above)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the schema to validate at all; no scope creep — this is the same relation pattern every sibling model in this schema already uses.

## Issues Encountered
- **Commit attribution collision** (see "Commit attribution note" above) — a concurrency side-effect, not a plan-execution problem. Documented in full there; no code or data was affected, only which commit hash carries the Task 1 diff.
- Reading `.env` for a `SHADOW_DB_URL` value was denied by sandbox policy; treated as "no shadow DB available" and the hand-authoring fallback route (explicitly permitted by the plan) was taken.

## Migration Handoff — READ BEFORE WAVE 2 DEPLOYS

**Migration directory:** `prisma/migrations/20261116000000_add_adaptive_mastery_path/`

**Status: UNAPPLIED everywhere.** No `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push` command was run against any database in this session or by this agent at any point. This is true by construction: no such command appears anywhere in this plan's actions, and the SQL file was written by hand with the `Write` tool, never generated by a command that contacts a database. (Per the plan's own verification note, this cannot be proven from `git log --stat`, which cannot observe database activity — it is stated here as a factual account of what commands were and were not run.)

**A human must apply this migration before the first deploy of any plan from wave 2 onward** — every wave-2 plan in this phase reads the seven tables it creates (`MasteryContribution`, `KnowledgeCheck`, `KnowledgeCheckAttempt`, `GradingContest`, `StudyPlanPath`, `StudyPlanPathStep`, `CoachedSession`). This is REQ-74's governance: `prisma migrate deploy` was deliberately removed from `vercel.json`'s `buildCommand` after a preview build once auto-applied a migration to a shared database with no human review. The exact command a human should run, after reviewing the SQL:

```
npx prisma migrate deploy
```

(or `npx prisma migrate resolve` / manual `psql` application if deploying to an environment where `migrate deploy` is not the chosen path — either way, a human reviews and applies it deliberately, before any dependent deploy.)

**`npx prisma generate` has been run locally** (as part of this plan's own verification), so TypeScript already sees the new models in `@prisma/client` even though no live database has the tables yet. Any code written against these models in wave-2 plans will type-check, but will fail at runtime against a database that hasn't had this migration applied.

## Next Phase Readiness
- Schema and migration are ready for every wave-2 plan that reads or writes mastery, knowledge-check, path, or coached-session data.
- **Blocker for wave 2 going to a real deploy:** the migration above must be applied by a human first. Development against the Prisma Client types can proceed immediately; actual database reads/writes cannot until it is applied.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `prisma/migrations/20261116000000_add_adaptive_mastery_path/migration.sql`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-03-SUMMARY.md`
- FOUND: commit `b5f5cf7` (Task 1 content, attributed per note above)
- FOUND: commit `d5adf90` (Task 2)
- Confirmed 7 model declarations present in `prisma/schema.prisma`
