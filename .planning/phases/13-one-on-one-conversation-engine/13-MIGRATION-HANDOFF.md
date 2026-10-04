# Phase 13 Migration Handoff — InteractionReport

**Written:** 2026-10-03 · **Extended:** 2026-10-04 (plan 13-15 Part 2) · **Requirement:** REQ-67

Read this before running anything. Part 1 covers ONE additive migration and
ONE backfill script (local already applied). Part 2 covers a SEPARATE
`DROP TABLE` migration. **No agent has touched, and may never touch, the
shared Lightsail database.**

This document has two independent parts:

| Part | What | Plan | Local status | Shared status |
|---|---|---|---|---|
| **1** | `CREATE TABLE "InteractionReport"` + backfill | 13-02 / 13-04 | Applied + verified | **DEFERRED by human** ("migrate later") — still OPEN |
| **2** | `DROP TABLE` legacy report tables | 13-15 | Applied + app still works | **Do not run until Part 1 is done and spot-checked on shared** |

You may accept, defer, or decline Part 2 independently of Part 1. Deferring
Part 2 indefinitely costs nothing but disk — after Phase 13 code ships, the
application no longer reads those legacy tables.

---

## 1. What this is and what it is NOT

This handoff covers the **ADDITIVE half only**:

1. The `CREATE TABLE "InteractionReport"` migration (plan 13-02,
   `prisma/migrations/20261004012908_add_interaction_report/migration.sql`).
2. The idempotent backfill script that copies every `InterviewReport` and
   `ScenarioReport` row into that new table
   (`scripts/backfill-interaction-reports.ts`).

It does **NOT** cover dropping `InterviewReport` or `ScenarioReport`. The
two `DROP TABLE` statements are a **SEPARATE, LATER handoff** — plan 13-15 —
that you can accept, defer, or decline **independently** of this one.
Nothing in this document asks you to delete anything. Both legacy tables
are left fully intact and fully readable after everything below runs.

---

## 2. The warning that matters — read this even if you skim the rest

Every one of the **seven prior migrations** in this project's history was
purely additive: zero `NOT NULL` added to a pre-existing table, zero
`DROP`, zero data rewritten. That is exactly why the review process that
has worked so far — *read the SQL, confirm no `NOT NULL`/`DROP`, run
`prisma migrate deploy`* — was sufficient. A human reading a short
`CREATE TABLE` statement could verify the whole risk surface in minutes.

**Phase 13 is the first migration in this project's history that also
rewrites data, and the plan that eventually drops two tables full of live
student report rows (13-15) is coming later in the same phase.** The old
one-line review bar — "no `NOT NULL`, no `DROP`" — is necessary but **not
sufficient** for this phase as a whole. For THIS handoff specifically the
SQL is still just a `CREATE TABLE` (see §6 for the one-command proof), but
treat this as the point where the review habit needs to widen, not the
point where it can be trusted to have already widened itself.

---

## 3. Exact commands, in order — FOR A HUMAN TO RUN

**No agent has run, or may run, any of the commands below against the
shared database.** These are commands for you to execute yourself from a
shell with the shared `DATABASE_URL` in scope (i.e. with `.env` /
`.env.local` unmodified, NOT with a local override prefix).

```bash
# Step 1 — apply the additive migration to the shared DB.
npx prisma migrate deploy

# Step 2 — run the SAME backfill script this plan proved locally, now
# against the shared DB. Omit --dry-run only once you're satisfied with
# the dry-run's printed plan.
npx tsx scripts/backfill-interaction-reports.ts --dry-run
npx tsx scripts/backfill-interaction-reports.ts
```

Step 2's script is read-only against `InterviewReport`/`ScenarioReport` —
it only ever upserts into the new `InteractionReport` table (see §6).
Running it twice is safe; it is idempotent (§4).

---

## 4. Evidence from LOCAL (what was actually run and observed)

Local dev DB: `leadership_avatar_dev` (Postgres 17, Homebrew), accessed only
via the inline override
`DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"`.

**Row counts before backfill** (after plan 13-04 Task 1 seeded five
additional fixed-id rows on top of whatever already existed from normal
local development):

| Table | Count |
|---|---|
| `InterviewReport` | 67 |
| `ScenarioReport` | 3 |
| `InteractionReport` | 0 |

**`--dry-run` output** (confirmed zero rows written — `InteractionReport`
count stayed 0 immediately after):

```
Backfill InteractionReport from InterviewReport + ScenarioReport (DRY RUN — no writes)
Never writes to or deletes from the legacy tables. Never touches the shared DB.

InterviewReport: 67 rows seen (14 IN_PROGRESS) -> would created 67, would updated 0
ScenarioReport:  3 rows seen (1 IN_PROGRESS) -> would created 3, would updated 0

DRY RUN complete. No rows were written.
```

**Real run output:**

```
Backfill InteractionReport from InterviewReport + ScenarioReport
Never writes to or deletes from the legacy tables. Never touches the shared DB.

InterviewReport: 67 rows seen (14 IN_PROGRESS) -> created 67, updated 0
ScenarioReport:  3 rows seen (1 IN_PROGRESS) -> created 3, updated 0

Backfill complete.
```

**Row counts after backfill:**

| Table | Count |
|---|---|
| `InterviewReport` | 67 (unchanged) |
| `ScenarioReport` | 3 (unchanged) |
| `InteractionReport` | 70 |

**Verifier output** (`npx tsx scripts/verify-interaction-report-backfill.ts`,
exit code 0):

```
=== 1. Count assertion ===
  ok   interactionReport.count() >= interviewReport.count() + scenarioReport.count()
  ok   every InterviewReport id has a matching InteractionReport id
  ok   every ScenarioReport id has a matching InteractionReport id

=== 2. Per-row field assertions (InterviewReport) ===
  [67 rows, every field check "ok" — status, turnCount, cameraMode,
   visualMetrics, vocalMetrics, both unscored-reason columns,
   reportStructured, reportMarkdown, failureReason, evalModel, all four
   timestamps, the four score-map keys, and all ten typed snapshot columns
   round-tripped through inputSnapshot]

=== 2. Per-row field assertions (ScenarioReport) ===
  [3 rows, every field check "ok" — same fields plus typeSlug === "case-study",
   interactionLogId, studentEmail, and caseId/caseName/background/avatars/
   criteria round-tripped through inputSnapshot]

=== 3. NULL-PRESERVATION assertion (pre-Phase-10 rows) ===
  ok   at least one legacy (cameraMode === null) interview row exists to test
  ok   at least one legacy (cameraMode === null) scenario row exists to test
  [every one of the 10 legacy InterviewReport rows and 2 legacy ScenarioReport
   rows: cameraMode stayed null, visualUnscoredReason stayed null,
   vocalUnscoredReason stayed null — ok on all three, every row]

=== 4. Idempotency assertion (second backfill run) ===
  ok   row count unchanged after second backfill run
  ok   sampled row content unchanged (updatedAt excluded)

=== Summary ===
ALL CHECKS PASSED
```

**Two idempotent-run counts** (the verifier's own Section 4 re-ran the
backfill a second time from inside itself): `InteractionReport` count was
70 before the second run and 70 after — unchanged, with a sampled row's
content (excluding `updatedAt`) byte-identical.

**Status distribution and null-camera counts observed locally** (for your
reference — the shared DB's real distribution is unknown to any agent; see
§5):

| | READY | PENDING | IN_PROGRESS | FAILED | `cameraMode IS NULL` |
|---|---|---|---|---|---|
| `InterviewReport` | 51 | 1 | 14 | 1 | 10 |
| `ScenarioReport` | 2 | 0 | 1 | 0 | 2 |

---

## 5. Two read-only queries to run against the shared DB BEFORE backfilling

No agent can see the shared database's real data. Before you run the
backfill against it, run these two READ-ONLY queries yourself (e.g. via
`psql` or Prisma Studio pointed at the shared `DATABASE_URL`) and sanity-check
the results against what §4 found locally:

```sql
-- Row counts and status distribution for both legacy tables.
SELECT 'InterviewReport' AS table, status, COUNT(*) FROM "InterviewReport" GROUP BY status
UNION ALL
SELECT 'ScenarioReport' AS table, status, COUNT(*) FROM "ScenarioReport" GROUP BY status
ORDER BY table, status;

-- How many rows of each are still cameraMode IS NULL (pre-Phase-10 legacy rows).
SELECT 'InterviewReport' AS table, COUNT(*) FROM "InterviewReport" WHERE "cameraMode" IS NULL
UNION ALL
SELECT 'ScenarioReport' AS table, COUNT(*) FROM "ScenarioReport" WHERE "cameraMode" IS NULL;
```

**Why this matters (Research Open Question 2):** the backfill's
`IN_PROGRESS`-row handling (it backfills them, it does not skip or drop
them — see §6) was only ever exercised against a SMALL local population (14
interview + 1 scenario `IN_PROGRESS` rows). If the shared DB's status
distribution query comes back with a materially larger abandoned
`IN_PROGRESS` population than that, it is worth understanding why before
backfilling, not after — an unexpectedly large number could mean either a
real UX issue (sessions that never finish) or something about production
traffic patterns nobody has reasoned about yet. Nothing in the script
behaves differently based on the answer; this is purely a "know before you
run it" check.

---

## 6. The locked `typeSlug` decision — flagged for review

Every backfilled `ScenarioReport` row becomes `typeSlug = "case-study"`,
written permanently and made queryable on `InteractionReport`. This is the
slug locked by plan 13-01's engine config registry — it is not invented by
this script, it already matches the engine's own `case-study` type record.

**If you want a different slug, it must be changed BEFORE the shared-DB
backfill runs, not after.** Once real shared rows carry `"case-study"`,
changing it later means a second data-rewrite against live student data —
exactly the kind of operation this handoff exists to flag rather than
quietly repeat.

---

## 7. Rollback posture

**The additive half (this handoff) is reversible right now, cheaply.**
`InteractionReport` is a brand-new table that nothing in the running
application reads from yet (that wiring is later Phase 13 plans). If
anything about this migration or backfill turns out to be wrong after you
run it against the shared DB, the honest rollback is:

```sql
DROP TABLE "InteractionReport";
```

followed by re-running the migration/backfill once the issue is fixed.
Nothing else references the table, so this is a clean, low-risk undo.

**This stops being true once a later Phase 13 plan wires the application
to read from `InteractionReport`.** From that point on, dropping the table
would break live traffic, and "just drop it and retry" is no longer a safe
answer. If you're reading this well after Phase 13 finished shipping,
assume that window has closed and treat this table like any other
production table before touching it.

---

## What to do next

1. Read this document end to end (you're doing that now).
2. Read `prisma/migrations/20261004012908_add_interaction_report/migration.sql`
   yourself and confirm it is exactly what §6... (see §2) — one `CREATE
   TABLE`, two `CREATE INDEX`, one `ADD CONSTRAINT` FK to `User`, zero
   `DROP`, zero `ALTER TABLE` on `InterviewReport`/`ScenarioReport`.
3. Skim `scripts/backfill-interaction-reports.ts` yourself and confirm it
   never writes to or deletes from `InterviewReport`/`ScenarioReport`, and
   that it preserves `cameraMode === null` verbatim.
4. Decide WHEN to run §3's two commands against the shared DB. You may
   defer this — the rest of Phase 13 continues to work against the local
   DB — but **per REQ-67, Phase 13 does not close until you have run
   them.**

**Resume signal:** reply "handoff received" to let the phase continue (you
can run the shared-DB commands later), or describe any changes you want to
the migration or backfill first.

---

# Part 2 — the destructive step (separable, declinable)

**Written:** 2026-10-04 · **Plan:** 13-15 · **Requirement:** REQ-65 / REQ-67

Part 1 (`CREATE TABLE` + backfill) and Part 2 (`DROP TABLE`) are **independent
actions**. Part 2 should only be run after Part 1's backfill has been run
against the shared DB **and** spot-checked there. Deferring Part 2
indefinitely costs nothing but disk — the application no longer reads
`InterviewReport` or `ScenarioReport`. You may decline Part 2 forever if you
prefer to keep the legacy tables as a cold backup.

**No agent has run or may run any of the commands below against the shared
Lightsail database.**

## P2-1. The warning this project has never needed before

All seven pre-Phase-13 migrations were purely additive — zero `NOT NULL` on a
pre-existing table, zero `DROP` (`HANDOFF.md` §3). **This is the first
`DROP TABLE` in the project's history**, and it removes tables holding live
student reports.

The existing review bar ("read the SQL, confirm no NOT NULL/DROP, apply")
**cannot** be applied to a migration whose whole content is a DROP. Treat
this as irreversible in a way Part 1 is not.

**Before Part 2 on shared:** take a backup, or at minimum:

```bash
pg_dump "$DATABASE_URL" \
  --table='"InterviewReport"' \
  --table='"ScenarioReport"' \
  --format=custom \
  --file=legacy-reports-pre-drop.dump
```

## P2-2. Exact shared-DB commands, in order — FOR A HUMAN

Do **not** skip ahead. Part 2's `migrate deploy` will apply the DROP if Part 1
is already applied; if Part 1 is not yet applied, the same `migrate deploy`
would apply both in order — still only do that after reading both SQLs and
taking a backup.

```bash
# --- Part 1 (if not already done on shared) ---
# 1. Review additive SQL:
#    prisma/migrations/20261004012908_add_interaction_report/migration.sql
npx prisma migrate deploy          # applies pending migrations (CREATE first)
npx tsx scripts/backfill-interaction-reports.ts --dry-run
npx tsx scripts/backfill-interaction-reports.ts
npx tsx scripts/verify-interaction-report-backfill.ts

# Spot-check a couple of real student reports in the app at their OLD URLs
# (they permanently redirect to /practice/.../report/{id}).

# --- Pre-drop verification queries (must hold) ---
# See P2-3 below. Do not proceed if any fail.

# --- Backup (required) ---
pg_dump "$DATABASE_URL" \
  --table='"InterviewReport"' \
  --table='"ScenarioReport"' \
  --format=custom \
  --file=legacy-reports-pre-drop.dump

# --- Part 2 ---
# 2. Review DROP SQL:
#    prisma/migrations/20261004040000_drop_legacy_report_tables/migration.sql
#    Confirm: exactly two DROP TABLE statements + FK constraint drops;
#    nothing touches InteractionReport or InterviewReportStatus.
npx prisma migrate deploy          # applies the DROP migration when pending
```

## P2-3. Pre-drop verification queries (SHARED DB)

Run these against the shared database **after** Part 1 backfill and **before**
Part 2. All three conditions must hold:

```sql
-- (a) InteractionReport row count >= sum of legacy counts
SELECT
  (SELECT COUNT(*) FROM "InteractionReport") AS interaction_count,
  (SELECT COUNT(*) FROM "InterviewReport")   AS interview_count,
  (SELECT COUNT(*) FROM "ScenarioReport")    AS scenario_count;
-- Require: interaction_count >= interview_count + scenario_count

-- (b) every legacy id present in InteractionReport
SELECT ir.id AS missing_interview_id
FROM "InterviewReport" ir
LEFT JOIN "InteractionReport" x ON x.id = ir.id
WHERE x.id IS NULL;
-- Require: 0 rows

SELECT sr.id AS missing_scenario_id
FROM "ScenarioReport" sr
LEFT JOIN "InteractionReport" x ON x.id = sr.id
WHERE x.id IS NULL;
-- Require: 0 rows

-- (c) cameraMode IS NULL count identical on both sides of the backfill
--     (null-preservation for pre-Phase-10 rows — REQ-48)
SELECT
  (SELECT COUNT(*) FROM "InterviewReport" WHERE "cameraMode" IS NULL)
    + (SELECT COUNT(*) FROM "ScenarioReport" WHERE "cameraMode" IS NULL)
    AS legacy_null_camera,
  (SELECT COUNT(*) FROM "InteractionReport" WHERE "cameraMode" IS NULL)
    AS interaction_null_camera;
-- After a correct backfill that copied every legacy row, every null-camera
-- legacy row has a twin — interaction_null_camera must be >= legacy_null_camera.
-- Prefer exact equality of the null-camera cohort that originated from legacy
-- ids; at minimum confirm no legacy null-camera id lost its null on the twin:
SELECT ir.id
FROM "InterviewReport" ir
JOIN "InteractionReport" x ON x.id = ir.id
WHERE ir."cameraMode" IS NULL AND x."cameraMode" IS NOT NULL
UNION ALL
SELECT sr.id
FROM "ScenarioReport" sr
JOIN "InteractionReport" x ON x.id = sr.id
WHERE sr."cameraMode" IS NULL AND x."cameraMode" IS NOT NULL;
-- Require: 0 rows
```

## P2-4. Local evidence (already done — do not re-run DROP locally)

- **13-VALIDATION.md:** Status **PASSED** — human reply `validation passed`
  (all nine REQ-66 items PASS on local DB). Item 7 fixture note: use
  `/case-play/testing` (agent-chosen UUID was absent from local S3).
- **DROP migration SQL** (`20261004040000_drop_legacy_report_tables`):
  exactly two `DROP TABLE` statements + FK drops; zero references to
  `InteractionReport` / `InterviewReportStatus`.
- **Local migrate status:** both Phase 13 migrations applied on
  `leadership_avatar_dev`; only `InteractionReport` remains among report
  tables.
- **Live app fix before DROP:** `app/api/study-plans/generate/route.ts` was
  still reading `prisma.interviewReport` — retargeted to `interactionReport`
  (interview typeSlugs only). That was the sole live application read found.
- **Verification scripts (post-DROP, local):** all exit 0 —
  `verify-engine-config`, `verify-engine-primitives`, `verify-engine-surface-count`,
  `verify-turn-control`, `verify-report-structure`. `npx tsc --noEmit` clean.
- **Schema:** `model InterviewReport` / `model ScenarioReport` removed;
  `enum InterviewReportStatus` retained (historical name on the unified model).

## P2-5. Status of `scripts/backfill-interaction-reports.ts`

**Still present** for your shared-DB Part 1 run. Prisma models for the legacy
tables were removed in 13-15; the script (and
`scripts/verify-interaction-report-backfill.ts`) now read legacy tables via
`$queryRaw` so they still compile and still work against a database that
still has those tables. After Part 2 DROP they will fail with "relation does
not exist" — expected.

`scripts/seed-legacy-reports.ts` was **deleted** (local-only seed; not needed
for shared).

Invoke backfill (shared, after CREATE migration is applied):

```bash
npx tsx scripts/backfill-interaction-reports.ts --dry-run
npx tsx scripts/backfill-interaction-reports.ts
npx tsx scripts/verify-interaction-report-backfill.ts
```

## P2-6. What to do next (Part 2)

1. Finish Part 1 on shared if you have not (`migrate deploy` + backfill +
   spot-check). **Per REQ-67, Phase 13 does not close until Part 1 is done.**
2. Run the P2-3 verification queries; confirm all three conditions hold.
3. Take the `pg_dump` backup of the two legacy tables.
4. Read `prisma/migrations/20261004040000_drop_legacy_report_tables/migration.sql`.
5. If satisfied, run Part 2's `prisma migrate deploy`. **Or decline / defer
   indefinitely** — nothing in the application reads those tables any more.

**Resume signal for plan 13-15:** reply **`drop handoff received`** to finish
the plan (whether or not you have run Part 1 or Part 2 yet), or describe
changes you want to the DROP migration first.
