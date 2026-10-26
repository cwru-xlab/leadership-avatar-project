# Deploy note — Phases 21–23 (study plans, paths, mastery)

These three migrations **are on `origin/dev`**. They are **not** on `origin/main`.
Nothing here has been run against production. Local teammates: apply them with
the commands in `.planning/HANDOFF.md` §0.1. Shared/prod: human only, this note.

## 1. Migrations (in order)

These are the only migrations on `origin/dev` that are not on `origin/main`
from this expansion:

1. `20261116000000_add_adaptive_mastery_path`: mastery ledger, knowledge checks, paths and steps.
2. `20261123000000_add_coached_mode`: coached sessions.
3. `20261124000000_add_voice_drills_and_prove_it`: VoiceDrill and VoiceDrillAttempt, plus nullable columns.

All three only add tables or nullable columns, with no destructive change. Apply them with:

```bash
DATABASE_URL=<prod> npx prisma migrate status   # confirm exactly these 3 are pending
DATABASE_URL=<prod> npx prisma migrate deploy
```

## 2. Backfill live-session mastery (once)

Reports that went READY before the Phase 21 ingestion hook existed have no
mastery rows. The script is idempotent and does a dry run by default:

```bash
DATABASE_URL=<prod> npx tsx scripts/backfill-live-mastery.ts           # read the totals
DATABASE_URL=<prod> npx tsx scripts/backfill-live-mastery.ts --apply
```

## 3. Optional

`scripts/reset-untouched-legacy-paths.ts` (dry run by default) does in bulk what
the student-facing "Rebuild this path" button does. It is usually unnecessary in
production, because no pre-Phase-23 paths exist there unless Phase 21 was
deployed earlier.

## 4. Smoke after deploy

Log in as a student and open Study Plans, then Paths (generate a path), then
Mastery. Every page should load. Mastery should show live-practice evidence
after the backfill.
