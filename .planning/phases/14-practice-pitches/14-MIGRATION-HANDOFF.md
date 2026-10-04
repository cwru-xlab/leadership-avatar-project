# Phase 14 Migration Handoff — Pitch Session Columns

**Written:** 2026-10-04 · **Plan:** 14-05 · **Requirement:** REQ-67

Read this before running anything. This handoff covers ONE additive migration
that adds four nullable columns to `InteractionReport`. **No agent has touched,
and may never touch, the shared Lightsail database.**

| What | Plan | Local status | Shared status |
|---|---|---|---|
| `ALTER TABLE "InteractionReport" ADD COLUMN` × 4 | 14-05 | Applied | **NOT applied — human only** |

There is no backfill. Existing rows keep `NULL` in every new column, which is
exactly the correct meaning (no deck cursor, no budget, no avatar-end timecode).

---

## 1. What this is and what it is NOT

This handoff covers the **ADDITIVE** migration only:

1. `prisma/migrations/20261004043007_add_pitch_session_columns/migration.sql`

It does **NOT** cover:

- Any `DROP`, `NOT NULL`, or `ALTER COLUMN` on an existing column.
- Phase 13's `CREATE TABLE "InteractionReport"` or legacy-table `DROP`
  (see `.planning/phases/13-one-on-one-conversation-engine/13-MIGRATION-HANDOFF.md`).

---

## 2. Ordering — apply AFTER Phase 13

This migration must be applied **after** Phase 13's migrations on the shared
database:

1. `20261004012908_add_interaction_report` (CREATE TABLE)
2. `20261004040000_drop_legacy_report_tables` (optional / declinable DROP)
3. **then** `20261004043007_add_pitch_session_columns` (this handoff)

If Phase 13 Part 1 (`CREATE TABLE`) has not been applied to shared yet, apply
that first per `13-MIGRATION-HANDOFF.md`. Do not run this migration against a
database that does not yet have `InteractionReport`.

---

## 3. Exact command — FOR A HUMAN TO RUN

**No agent has run, or may run, the command below against the shared
database.** Execute it yourself from a shell with the shared `DATABASE_URL` in
scope (i.e. with `.env` / `.env.local` unmodified, NOT with a local override
prefix).

```bash
# Apply the additive pitch-session columns to the shared DB.
npx prisma migrate deploy
```

`prisma migrate deploy` is safe here: the SQL is purely additive (see §5).
There is no backfill step.

---

## 4. Evidence from LOCAL (what was actually run and observed)

Local dev DB: `leadership_avatar_dev` (Postgres), accessed only via the inline
override
`DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"`.

```bash
DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
  npx prisma migrate dev --name add_pitch_session_columns
```

`prisma migrate status` against the local URL reports the new migration applied
and the database schema in sync. No agent command used the shared
`DATABASE_URL`.

---

## 5. The SQL (verbatim)

```sql
-- AlterTable
ALTER TABLE "InteractionReport" ADD COLUMN     "slideHighWaterMark" INTEGER,
ADD COLUMN     "slideReveals" JSONB,
ADD COLUMN     "terminationAtSeconds" INTEGER,
ADD COLUMN     "timeBudgetSeconds" INTEGER;
```

Proof checks (all must hold):

- Zero `DROP`
- Zero `NOT NULL`
- Zero `ALTER COLUMN` on an existing column
- Four `ADD COLUMN` statements only, all nullable, no defaults

Safe to apply to the shared DB with no downtime and no backfill. Existing rows
retain `NULL` in every new column.

---

## 6. Column meanings (for reviewers)

| Column | Meaning when null |
|---|---|
| `slideHighWaterMark` | Type has no deck, OR deck session has revealed nothing yet |
| `slideReveals` | No reveal events recorded |
| `timeBudgetSeconds` | Type declares no session budget |
| `terminationAtSeconds` | Session ended normally (no accepted avatar-initiated end) |

The slide high-water mark is **server-written only** via the ratchet in
`lib/engine/session.ts`. A client value is never written through.
