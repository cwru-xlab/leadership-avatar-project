# Phase 23 — Learning Paths Hub: Validation

**Updated:** 2026-10-25
**Branch:** feat/study-plan-expansion (not pushed)
**Status:** automated + agent-driven e2e evidence COMPLETE; human UAT PENDING (see bottom).

Phase 23 was run as an orchestrated multi-worktree effort (worktrees under
`../leadership-avatar-wt/`), not through GSD PLAN/SUMMARY files. Decisions are
in `23-CONTEXT.md`; the drill contract in `23-VOICE-DRILL-CONTRACT.md`.

## Automated battery

- `npx tsc --noEmit`: clean.
- `scripts/verify-*.ts`: **90/90 pass** (2026-10-25). Two stale verifiers were
  repaired this round, not weakened:
  - `verify-interaction-report-backfill` now SKIPs once the legacy report
    tables are dropped (migration `20261004040000`); it is pre-drop tooling.
  - `verify-deck-family-surface-count` no longer counts the shared
    `push-to-talk` control as a "talk" mode file.
- New: `verify-legacy-path-rebuild.ts` (rebuild rule + server re-check, bite-proof).
- `npx next build`: exits 0.

## In-scope items against evidence

| # | Item | Evidence |
|---|------|----------|
| 1 | Study Plans + Paths sidebar tabs; `/paths` picker with inline generation | `config/site.ts`; e2e: new plan created in UI (7s) → listed "no path yet" on `/paths` → generated in 11s from the picker |
| 2 | Mastery counts live + path growth; Recent movement; growth since plan | 215 LIVE_SESSION rows backfilled; e2e: check 100%, drill 75%, coached 87.5% appear on the plan's growth card ("Since this plan: 87.5% across 4 pieces"); Mastery lists "Coached sessions & voice drills" as a source; Recent movement shows ups and downs with linked drivers |
| 3 | Path loop in the shared voice + video shell | e2e on real HeyGen + OpenAI: drill (shared consent/self-view/PTT, graded 4/5 with quoted feedback + delivery bands); coached two-moment session (resumed mid-session, 1/5→5/5 and 2/5→4/5, off-topic audio rejected with an escalating technique ladder, delivery summary) |
| — | Prove-it | e2e: final step opens `/practice/general?fromPlan=&step=` with the "Prove it" brief; earlier round ran a full live interview from it |
| — | Practice features untouched | all 13 practice types load; `lib/engine/evaluation.ts` unchanged |

## Learning-loop iterations (e2e findings → fixes)

Earlier rounds (2026-10-24): diagnosis turns capped; techniques spoken before
every invite; on-topic + verbatim-recycle grading; escalation ladder; facts-only
demonstrations; 3–4-option checks with rationales; student-specific drill
prompts; deterministic graders with shared 1/3/5 anchors.

Round 3 (2026-10-25, commits `2cd38ca`, `0a1a690`, `699384d`, `18b6e66`):
- an unfinished prove-it launch no longer jumps "Next" past pending learning steps;
- growth card shows the since-plan score and each activity's result (the
  all-time delta alone read +0.5 after three good steps);
- repeated per-skill reasons collapse on the trail ("Why this skill" keeps the full text);
- goals read "Goal met · N done";
- grounded-check reason wording made accurate;
- untouched pre-Phase-23 paths can be rebuilt by the student (DELETE re-checks; 409 otherwise).

Screenshots: session scratchpad `e2e/shots/r3/` (not committed).

## Open

- **Human UAT** — not run. Steps: `22-VALIDATION.md` ## UAT round 2, plus
  `/paths` → pick a plan → generate → check → drill → coached → growth card → Mastery.
- **Production migration** `20261124000000_add_voice_drills_and_prove_it` (and
  Phase 21/22 migrations) applied locally only.
- Rebuilt path for a plan with no qualifying moments has no coached step
  (by design: coached steps require a scored moment).
