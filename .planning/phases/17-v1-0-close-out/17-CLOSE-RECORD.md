# Phase 17 Close Record — v1.0 Close-Out

**Closed:** 2026-10-05
**Requirements:** REQ-74, REQ-75, REQ-76, REQ-77 (Pass 1)
**Scope:** Evidence, migration-deployment governance, fixture ownership, and the
bounded Phase 15/16 keyboard pass. Phase 18 implementation is not part of this
record.

## 1. What Phase 17 closed

- **REQ-74:** `a6e8eec` removes `prisma migrate deploy` from Vercel's
  `buildCommand`; `docs/MIGRATIONS.md` defines the human-before-dependent-deploy
  procedure. `17-02-SUMMARY.md` reconciles the stale records and records the
  human confirmation that Production `DATABASE_URL` points to shared Lightsail.
- **REQ-75 / REQ-63:** `scripts/verify-deck-visible-context.ts` passes the
  real deck turn-assembly boundary. The proof is recorded in
  `13-VISIBLE-CONTEXT-PROOF.md` and `17-03-SUMMARY.md`.
- **REQ-76:** `scripts/verify-deck-intake.ts` passes all eleven sections after
  canonical two-slide fixture ownership was separated from the spike artifact;
  see `17-04-SUMMARY.md`.
- **REQ-77 Pass 1:** thirteen human checks were reported PASS with no defects.
  `17-KEYBOARD-PASS-1.md` and `17-06-SUMMARY.md` retain the partial-evidence
  limitation and zero-defect repair ledger.

## 2. REQ-66 and REQ-67 caveat

The shared Lightsail database was reported EMPTY when a human applied all
fourteen migrations on 2026-10-04: zero users, attempts, audit rows, and reports
of either kind. There were no reports to backfill or re-render; the backfill was
a no-op and was never run against shared. `scripts/verify-interaction-report-backfill.ts`
cannot pass there because it requires a legacy `cameraMode IS NULL` row, and none
exists. Its acceptance test passed locally against seventy backfilled rows, the
only environment where that test could have a subject.

REQ-66 and REQ-67 close on evidence that the shared acceptance test is
unsatisfiable, not on any assertion that an agent ran it. REQ-67 also records the
human-reported fourteen-of-fourteen migration status. No future phase should try
to make the shared backfill verifier pass. The detailed Phase 13 caveat remains
the authority: `13-CLOSE-RECORD.md` §3.

## 3. Why there is no split-out

The earlier split-out policy assumed a pending human migration operation. It was
already complete; `13-MIGRATION-HANDOFF.md`'s stale open status created the false
impression otherwise. That history is now marked `SUPERSEDED`, and
`HANDOFF.md` §3 is the migration-state authority. Phase 17 therefore completed
the governance reconciliation rather than scheduling a nonexistent migration.

## 4. Phase 13 remains closed

Phase 13 closed outright on 2026-10-04 with all fifteen plans complete. This
record verifies and cites that close; it does not reopen, reword, or retick
REQ-66 or REQ-67. Lesson: do not tie phase closure to a human action with no
known date or a test whose premise has disappeared.

## 5. Standing items

Production `DATABASE_URL` is **CONFIRMED** by the human statement recorded in
`17-02-SUMMARY.md`: it points to shared Lightsail. Preview's target was not
confirmed by that checkpoint. There is no migration or backfill standing work
from Phase 17. Pass 2 UAT is future Phase 19 work, not a Phase 17 dependency.

## 6. Where the evidence lives

- `docs/MIGRATIONS.md` — the human migration/deployment procedure.
- `.planning/HANDOFF.md` §3 — the recorded migration-state authority.
- `13-MIGRATION-HANDOFF.md` — superseded historical runbook.
- `13-CLOSE-RECORD.md` §3 — the Phase 13 REQ-66/REQ-67 caveat.
- `13-VISIBLE-CONTEXT-PROOF.md` and `scripts/verify-deck-visible-context.ts` —
  the REQ-63/75 proof.
- `17-KEYBOARD-PASS-1.md` — the human-reported Pass 1 result.

## Boundary assertion

No agent connected to shared Lightsail, Preview, Production, or a deployed app
while Phase 17 was closed. No shared migration, status check, SQL command,
backfill verifier, secret inspection, or database operation was run by the agent.
