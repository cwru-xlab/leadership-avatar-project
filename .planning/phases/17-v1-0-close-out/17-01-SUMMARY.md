---
phase: 17-v1-0-close-out
plan: 01
status: complete
requirements: [REQ-74]
completed: 2026-10-04
---

# 17-01 Summary — Migration deployment governance

## Delivered

Commit [`a6e8eec`](../../../..//commit/a6e8eec) changes the Vercel build path and adds
its replacement operating procedure in the same commit.

| Item | Before | After |
| --- | --- | --- |
| `vercel.json` `buildCommand` | `touch .env && prisma generate && prisma migrate deploy && next build` | `touch .env && prisma generate && next build` |

The resulting command is `touch .env` plus the repository build sequence
(`prisma generate && next build`). It generates the Prisma client and builds
Next.js, but cannot apply a migration to any database.

## Human decision

- **Verdict (verbatim):** `approved`
- **Pending-migration confirmation:** The approval was given in response to the
  required confirmation that no migration is currently pending for a target
  this change could affect. It is recorded as no known pending migration.

## `docs/MIGRATIONS.md` procedure

| Required section | What it records |
| --- | --- |
| Status and why this exists | Deployments no longer self-migrate; a target must receive its migration before dependent code deploys. |
| Connection authority | Local development work is allowed; shared Lightsail, Vercel Preview, and Production are human-only. |
| Human procedure | Check target status, back up destructive changes, deliberately deploy, recheck, deploy dependent code, and record the run. |
| Apply-ahead versus expand/contract | Additive changes are safe to apply ahead; destructive or narrowing changes require two deploys around the migration. |
| Recovery | An unknown-column or relation 500 means the deploy beat its migration; the human applies the migration rather than restoring automatic deployment migration. |
| Phase 18 | The first upcoming consumer must include a human migration checkpoint before a deployment that reads a new schema field. |

## Verification

- `vercel.json` parsed successfully and its `buildCommand` exactly matches the
  approved replacement.
- `grep` found no `migrate deploy` in `vercel.json`.
- The Vercel change was one insertion and one deletion; `git diff --check`
  passed before commit.
- `docs/MIGRATIONS.md` is 86 lines and includes `migrate status`, `pg_dump`,
  expand/contract guidance, the before-deploy rule, and the Phase 18 checkpoint.
- `npx prisma generate` passed using the local project schema. It generated the
  Prisma client only.

## Database boundary assertion

No shared Lightsail, Preview, or Production database connection was opened.
No `prisma migrate`, `prisma db`, `psql`, `pg_dump`,
`verify-interaction-report-backfill.ts`, or non-localhost `DATABASE_URL`
command was run. The complete list of Prisma commands run for this plan is:

```text
npx prisma generate
```
