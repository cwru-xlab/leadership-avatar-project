---
phase: 17-v1-0-close-out
plan: 02
status: complete
requirements: [REQ-74]
completed: 2026-10-04
---

# 17-02 Summary — Migration record reconciliation

## Changes

| File | Changed lines | Result |
| --- | --- | --- |
| `.planning/phases/13-one-on-one-conversation-engine/13-MIGRATION-HANDOFF.md` | 3–27, 40–44, 474, 480 | Marked the document `SUPERSEDED`, named `.planning/HANDOFF.md` §3 as authority, directed future work to `docs/MIGRATIONS.md`, corrected both status rows, and retained the original runbook as history. |
| `.planning/HANDOFF.md` | 331, 334–357 | Resolved the CI self-migration fork through commit `a6e8eec`, linked the human procedure, and recorded a terminal status for Production's target. |
| `.planning/REQUIREMENTS.md` | 493–511 | Replaced REQ-67's obsolete migration-governance description without changing its checkbox, REQ-66, REQ-74, Out of Scope, or Traceability. |

## Superseded claim audit

The following preserved historical claims still match the stale-claim search and
are marked `SUPERSEDED` on the same line:

| Location | Historical claim | Supersession |
| --- | --- | --- |
| `13-MIGRATION-HANDOFF.md:43` | “DEFERRED by human” / “still OPEN” for Part 1 | Both parts applied 2026-10-04; this was the stale row that misled planning. |
| `13-MIGRATION-HANDOFF.md:44` | “Do not run until Part 1 is done and spot-checked on shared” for Part 2 | Both parts applied 2026-10-04. |
| `13-MIGRATION-HANDOFF.md:474` | “Phase 13 does not close until Part 1 is done” | Both parts applied 2026-10-04. |
| `13-MIGRATION-HANDOFF.md:480` | The historic option to defer Part 2 | Both parts applied 2026-10-04. |

The preserved document remains 484 lines long, so the historical runbook was not
deleted or rewritten into silence.

## REQ-67 correction

**Before:**

> The SQL is handed over for human review and a human runs `prisma migrate deploy`
> against the shared Lightsail DB (`HANDOFF.md §3` precedent). No agent applies it.
> Phase 13 does not close until a human has run it.

**After:**

> No agent connects to the shared Lightsail database, Vercel Preview, or Production
> — not for a migration and not even for a read-only `SELECT`. A human applies
> migrations to those targets. That rule bound agents throughout and continues to
> bind them.

The corrected body also records the historical interval in which Vercel deployed
pending migrations automatically, including the first `DROP TABLE`, and names
`docs/MIGRATIONS.md` as the current procedure following the removal in `a6e8eec`.

## Production target outcome

**CONFIRMED 2026-10-04:** Production `DATABASE_URL` points at the shared Lightsail
database.

**Human statement (verbatim):** “ok the DATABASE_URL var points to Lighstail for
sure”

Preview's target was not confirmed in this checkpoint. The handoff now identifies
shared Lightsail as the database the former Vercel build command had been
migrating and routes future schema work through `docs/MIGRATIONS.md`.

## Verification and database boundary

- The stale-claim audit found only the four preserved historical occurrences
  listed above; each carries an inline `SUPERSEDED` marker.
- The superseded handoff names both `HANDOFF.md` and `docs/MIGRATIONS.md` and is
  484 lines long (minimum required: 480).
- `HANDOFF.md` has no unresolved “Either remove” fork and contains both the
  replacement build command and the preserved `add_interaction_report_title`
  incident record.
- REQ-67 names the read-only prohibition, historical `buildCommand` behavior,
  and `docs/MIGRATIONS.md`; its checkbox was not changed.
- `git diff --check` passed. No product code, Prisma schema, migration, fixture,
  Vercel configuration, or `docs/` file was changed in this plan.

No database command was run during plan 17-02: no `prisma migrate`, `prisma db`,
`psql`, `pg_dump`, `DATABASE_URL`, or backfill-verifier command. No shared,
Preview, or Production database connection was opened.
