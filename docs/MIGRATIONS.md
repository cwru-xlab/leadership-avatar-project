# Schema migration procedure

## Status and why this exists

As of 2026-10-04, Phase 17 / REQ-74 removes `prisma migrate deploy` from
`vercel.json`'s `buildCommand`; the commit that lands this document records that
change. Deployments no longer apply migrations. **A migration must be applied to
a target database before the deploy that depends on it, or that deploy serves
500s on a missing column.** See `.planning/HANDOFF.md` §3 for the history,
including the 2026-10-04 preview build that applied a migration without review
to a database already holding the project's first `DROP TABLE`.

## Who may apply what, to which database

| Target | Who may connect and run Prisma migration commands? | Rule |
| --- | --- | --- |
| Local development (`leadership_avatar_dev` on localhost) | An agent or human | Local development work may use `prisma migrate dev`, `prisma migrate deploy`, and `prisma migrate status`. |
| Shared Lightsail database | Human only | No agent connection of any kind, including a read-only `SELECT`. See `.planning/HANDOFF.md` §3 and `.planning/phases/13-one-on-one-conversation-engine/13-MIGRATION-HANDOFF.md` §2. |
| Vercel Preview or Production `DATABASE_URL` | Human only | The same no-agent rule applies. The production target is recorded as a human-owned status in `.planning/HANDOFF.md` §3. |

The no-agent rule binds agents and humans acting through agents. It never bound
CI; removing the migration command means CI no longer migrates either.

## Human procedure

Use this process for a schema change. Replace `<target DATABASE_URL>` only in a
human-controlled shell; never put a real credential in a document, commit, or
chat transcript.

1. Merge the migration files in `prisma/migrations/` without deploying code that
   depends on them. Vercel deployment is main-only, so a feature branch is safe.
2. The human checks pending state against the intended target:

   ```bash
   DATABASE_URL="<target DATABASE_URL>" npx prisma migrate status
   ```

3. For a destructive or narrowing change described below, create a backup first:

   ```bash
   DATABASE_URL="<target DATABASE_URL>" pg_dump --format=custom --file="before-migration.dump"
   ```

4. The human applies the migration deliberately:

   ```bash
   DATABASE_URL="<target DATABASE_URL>" npx prisma migrate deploy
   ```

5. The human rechecks the target. It must report `Database schema is up to date!`:

   ```bash
   DATABASE_URL="<target DATABASE_URL>" npx prisma migrate status
   ```

6. Only then deploy the code that reads or writes the new schema.
7. Append the target, date, operator, and `migrate status` result to the table in
   `.planning/HANDOFF.md` §3.

## Apply-ahead versus expand/contract changes

**Additive changes** are safe to apply before the dependent deploy: a new table,
a new nullable column, a new index, or a new enum value. Existing code ignores
what it does not know about. Every project migration except one has used this
shape.

**Destructive or narrowing changes** need an expand → contract sequence across
two deploys: `DROP TABLE`, `DROP COLUMN`, a new `NOT NULL` constraint on an
existing table, a rename, or a type change. Deploy 1 must stop reading the old
shape; then the human applies the migration; then Deploy 2 may remove the old
shape. `20261004040000_drop_legacy_report_tables` is this project's precedent:
it was safe only because both tables were empty.

## Auth handoff migration (20261102000000_add_auth_handoffs)

`20261102000000_add_auth_handoffs` is an **additive** migration that creates the
short-lived `AuthHandoff` table used by the fixed-production CWRU CAS callback
and Vercel Preview redemption flow. It must be applied through the human
procedure above to every Preview or Production database before a deployment
that handles `/api/auth/cwru-sso-start`, `/api/auth/cwru-sso-callback`, or
`/api/auth/cwru-sso-redeem`. Do not add `prisma migrate deploy` back to
`vercel.json`; the table is a deliberate manual apply-ahead checkpoint.

## If deployment beats the migration

A 500 referring to an unknown column or relation immediately after deployment
means the code was deployed before its migration. The human applies the missing
migration to that target using step 4, then confirms status using step 5. A
redeploy is not needed; the running build uses the new schema on its next query.
Do not restore `prisma migrate deploy` to `buildCommand` as a workaround.

## Phase 18: first consumer

Phase 18 is the first upcoming consumer of this process. Its planner and
executor must include a `checkpoint:human-action` for the human migration apply
before any deployment that reads a new schema field; CI does not handle it.
