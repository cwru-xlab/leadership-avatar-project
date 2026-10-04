# Phase 13 Close Record — One-on-One Conversation Engine

**Closed:** 2026-10-04 · **Closed by:** human decision (Adam), recorded by agent
**Milestone:** v1.0 · **Plans:** 15/15 executed
**Requirements:** REQ-59 … REQ-73

Phase 13 closes **OUTRIGHT**. There is no split-out and no carried remainder.

---

## 1. Why this needed a close record at all

Phase 13 sat open for reasons that stopped being true. From 2026-10-04 its only
blocker was REQ-67's clause *"Phase 13 does not close until a human has run
`prisma migrate deploy` against the shared Lightsail DB"* — and a human had run
it. What remained was not work; it was a **judgment call** about two requirement
boxes whose acceptance tests the empty shared database had made unrunnable. This
file records that call so the boxes are not re-litigated.

`REQUIREMENTS.md` REQ-74 had already decided the shape of it: *"REQ-66 and REQ-67
close under this requirement with a recorded caveat, not a passing test."* This
record is that caveat, applied to Phase 13 directly rather than waiting for
Phase 17's plan 17-07 to carry it.

## 2. What actually shipped

All 15 plans executed with summaries on disk (`13-01-SUMMARY.md` …
`13-15-SUMMARY.md`). The engine is real and is the foundation every later phase
builds on:

- `lib/engine/` — `registry.ts` (`ENGINE_TYPES`), `prompts.ts`, `evaluation.ts`,
  `evaluation-runner.ts`, `outcome.ts`, `termination.ts`, `turn-control.ts`,
  `time-budget.ts`, `visible-context.ts`, `rubric.ts`, `session.ts`, `resolve.ts`,
  `types.ts`.
- One `InteractionReport` table replacing `InterviewReport` and `ScenarioReport`
  (REQ-65), with the legacy tables dropped in
  `20261004040000_drop_legacy_report_tables`.
- One `/practice/[type]` tree with permanent redirects from `/interview/*` and
  `/case-play/*` (REQ-68).
- Phases 14, 15 and 16 each added an interaction type as a config record, which is
  the proof REQ-60 was asking for.

`13-VALIDATION.md` carries the phase verification.

## 3. The REQ-66 / REQ-67 caveat, in full

**Both boxes are now ticked. Neither was ticked on a passing test.** Read this
before citing either as evidence of anything.

### REQ-66 — acceptance test passed on LOCAL only, and local is the only place it could

REQ-66 required that *"every existing report is backfilled into
`InteractionReport` and renders identically at its existing URL."*

- **On local: genuinely MET.** Plan 13-04 seeded five fixed-UUID pre-Phase-13
  report shapes into the legacy tables, then backfilled **67 `InterviewReport` +
  3 `ScenarioReport` → 70 `InteractionReport`** against `leadership_avatar_dev`.
  `scripts/verify-interaction-report-backfill.ts` exited 0 with its count,
  field-fidelity, null-preservation and idempotency sections all passing
  (70 → 70 on a second run). Commits `1eafa7b`, `981f835`. Plan 13-14 then ran the
  human acceptance test — nine items, all PASS — confirming those rows render
  identically at their old URLs.
- **On shared: UNSATISFIABLE BY CONSTRUCTION, not untested.** When all 14
  migrations were applied to the shared Lightsail DB on 2026-10-04 it was found
  **completely empty** — 0 users, 0 attempts, 0 audit rows, 0 reports of either
  kind. There were no existing reports to backfill or re-render. The backfill was
  never run against shared and never needed to be; it would have copied zero rows.
  And `verify-interaction-report-backfill.ts` **cannot pass there**: it
  hard-asserts that at least one legacy `cameraMode IS NULL` row exists to test
  (lines 266 and 271). That is not a failure to fix — there is nothing to verify.

**So REQ-66 is satisfied vacuously on shared and demonstrably on local.** If the
shared or production database ever acquires real rows written before Phase 13 —
it cannot, those tables are dropped — this box would need revisiting. It cannot
happen, which is why the box closes rather than staying open forever.

### REQ-67 — the human run happened; the requirement's premise was false anyway

REQ-67 required that *"the SQL is handed over for human review and a human runs
`prisma migrate deploy` against the shared Lightsail DB. **No agent applies it.**"*

- **The human half is DONE.** A human ran `prisma migrate deploy` against shared
  on 2026-10-04; `prisma migrate status` reports 14 of 14 applied,
  `Database schema is up to date!`.
- **But "no agent applies it" had not been true for days.** `vercel.json`'s
  `buildCommand` is
  `touch .env && prisma generate && prisma migrate deploy && next build`, so every
  deployment applied pending migrations automatically and unreviewed — the first
  `DROP TABLE` in this project's history included. A preview build on 2026-10-04
  applied `add_interaction_report_title` to a database already holding the others,
  with no human run and no `pg_dump` first.

**So REQ-67 closes as "the human-run requirement was met" and explicitly NOT as
"the no-agent discipline was in force."** It was not. The careful human-gated
ceremony in `13-MIGRATION-HANDOFF.md` was guarding a door the build pipeline had
been walking through. **That contradiction is live and is NOT closed by this
record** — it is Phase 17's REQ-74, whose plan 17-01 removes
`prisma migrate deploy` from `buildCommand` and documents the replacement
procedure in the same change.

Do not read REQ-67's tick as "migrations are human-gated here." Until 17-01 ships,
they are not.

## 4. What Phase 13 is handing to Phase 17 — and what it is NOT

**REQ-63 stays UNCHECKED and is delegated, not closed.** The per-turn
visible-context slice is implemented — `visibleContext` in `lib/engine/types.ts`,
sliced in `lib/engine/prompts.ts` — but was never verified against a real
multi-channel session. Phase 17's **REQ-75 / plan 17-03** owns producing that
evidence (`13-VISIBLE-CONTEXT-PROOF.md`, to be filed in this directory) and
ticking REQ-63 then. Closing Phase 13 does not grant REQ-63.

This is deliberate: an unverified primitive is an evidence gap, not unfinished
construction, and it does not justify holding a 15/15 phase open a second
milestone.

**Phase 17 keeps:** REQ-74 (the `vercel.json` governance contradiction, the
replacement procedure, the stale-document reconciliation, and confirming what the
Production `DATABASE_URL` secret points at) and REQ-75 (REQ-63's proof).

**Phase 17 no longer needs to:** close Phase 13, or carry REQ-66/REQ-67. Plan
17-07's `must_haves` were written assuming it would do both; they now verify this
record instead of producing the close themselves.

## 5. Documents this close corrects

| Document | Was | Now |
|---|---|---|
| `REQUIREMENTS.md` REQ-66, REQ-67 | `[ ]`, "decide whether to check off as vacuous" | `[x]` with the §3 caveat recorded inline |
| `ROADMAP.md` Phase 13 row | "plans complete; REQ-67 shared Part 1 still OPEN" | closed, citing this record |
| `ROADMAP.md` progress table | `Complete*` with the `*` never defined | `Complete`, and the `*` is now footnoted for Phase 15 |
| `STATE.md` "Carried into v1.1" | "REQ-67 — Phase 13 close BLOCKED" | closed, with REQ-74's governance item carried on its own |
| `STATE.md` "Open phase-closure item (REQ-67)" | "BLOCKS PHASE CLOSE ONLY" | superseded, pointing here |
| `13-VALIDATION.md` | "DEFERRED by human — still open; blocks phase close" | closed, pointing here |
| `13-MIGRATION-HANDOFF.md` | correction banner at the top, but its inner status table still read "DEFERRED — still OPEN" to anyone who skimmed to it | that row marked superseded in place |

## 6. The lesson

**A close gate written as "until a human runs X" needs a companion answer for
"and what if X turns out to be unnecessary?"** REQ-67's gate was sound when
written and became unfalsifiable the moment the shared DB was found empty — the
human could run the command, but the thing the command was supposed to accomplish
(move real student rows) had no subject. The phase then sat open for days on a
blocker that no longer described reality, and Phase 17's first planning round
wrote two plans against the stale document and had to throw them away.

Two practices worth keeping:

1. **When a gate's premise is checked and found false, close or re-scope the gate
   in the same session.** Do not leave the old wording standing with a correction
   appended elsewhere — `13-MIGRATION-HANDOFF.md` got a correct banner on
   2026-10-04 while its own status table kept saying "still OPEN" three lines
   further down, and that table is what people actually read.
2. **Verify the state a document asserts before planning against it.** The shared
   DB being empty, the migration record missing `add_study_plans`, and
   `vercel.json` self-migrating were all one command away from being known, and
   all three invalidated written plans.
