# Phase 13 Migration Handoff — InteractionReport (additive half)

**Written:** 2026-10-03 · **Plan:** 13-04 · **Requirement:** REQ-67

Read this before running anything. It covers ONE migration and ONE
backfill script, both already applied and proven against the LOCAL dev
database only. **No agent has touched, and may never touch, the shared
Lightsail database.**

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
