# Phase 22 Validation (Coached Mode)

Run date: 2026-10-23, HEAD cb4dc57, branch feat/study-plan-expansion.
Database: local only (`leadership_avatar_dev`; migration 20261123000000_add_coached_mode applied locally). No migration was run by this plan.

## Battery

Command form: `npx tsx scripts/verify-<name>.ts`. "Checks" = count of `ok` lines (hold-space prints `PASS` lines instead).

The first pass of the whole battery ran with the tsx environment lacking DATABASE_URL: `verify-coach-settings` and `verify-coached-moment-selection` printed SKIP for their DB sections. Both were re-run with `DATABASE_URL=postgresql://ajabreu79@localhost:5432/leadership_avatar_dev` and the DB sections RAN (see rows). No other verifier printed a SKIP-style gap (grep of all logs). The other DB-using verifiers (live-session-ingestion, coached-entry, check-*, etc.) reached the database through Prisma and ran their DB sections in the first pass.

| Group | Verifier | Exit | Checks |
|---|---|---|---|
| Phase 22 | verify-coached-moment-ranking | 0 | 25 |
| Phase 22 | verify-coached-moment-selection | 0 | 26 (DB re-run; first pass SKIP) |
| Phase 22 | verify-coach-turn | 0 | 38 |
| Phase 22 | verify-coach-containment | 0 | 19 |
| Phase 22 | verify-coached-avatar-mount | 0 | 12 |
| Phase 22 | verify-coach-settings | 0 | 17 (DB re-run; first pass 14 + SKIP) |
| Extended | verify-coach-tips | 0 | 170 |
| Extended | verify-coached-entry | 0 | 152 |
| Extended | verify-coached-mode-isolation | 0 | 115 |
| Extended | verify-coached-runtime-surface | 0 | 36 |
| Extended | verify-next-step | 0 | 64 |
| Extended | verify-mastery-weights | 0 | 22 |
| Regression | verify-mastery-compute | 0 | 34 |
| Regression | verify-mastery-thinness | 0 | 19 |
| Regression | verify-mastery-surface | 0 | 38 |
| Regression | verify-live-session-ingestion | 0 | 43 |
| Regression | verify-path-model | 0 | 42 |
| Regression | verify-path-surface | 0 | 36 |
| Regression | verify-knowledge-check-surface | 0 | 43 |
| Regression | verify-engine-surface-count | 0 | 32 |
| Regression | verify-moment-boundary | 0 | 22 |
| Regression | verify-generation-sources | 0 | 39 |
| Regression | verify-check-generation | 0 | 45 |
| Regression | verify-check-grading | 0 | 56 |
| Regression | verify-check-taking-surface | 0 | 54 |
| Regression | verify-grading-contest | 0 | 29 |
| Regression | verify-levels-goals | 0 | 43 |
| Regression | verify-hold-space-push-to-talk | 0 | 78 PASS lines, "ALL PASS" |
| Regression | verify-competency-catalog | 0 | 14 |
| Static | `npx tsc --noEmit` | 0 | no output |
| Static | `npx next build` | NOT RUN | See below |

FAIL count across the battery: 0.

### next build: NOT RUN (gap)

A dev server is running on localhost:3000. `next build` into the default `.next` would corrupt it, so the build was not run. The human must run `npx next build` (with the dev server stopped, or with a separate distDir) before sign-off. tsc is clean, but tsc is not a build.

## Diff evidence

- `git diff --name-only 59f6166 -- lib/engine/ components/practice/` : EMPTY (recorded).
- `git diff --name-only 59f6166 -- lib/study-plan/generate.ts` : EMPTY (recorded).

The 18-05 no-gate reasoning and the avatar-mount decision stand.

## Locked-decision checklist

Verifier names are taken from the plan SUMMARYs and script names. Section numbers inside each script were not re-audited in this plan.

| # | Decision | Status | Evidence |
|---|---|---|---|
| 1 | Containment (coached code never reaches the practice engine) | AUTOMATED | verify-coach-containment, verify-coached-mode-isolation. Caveat: runtime-marker scan covers only 4 of 13 engine types; the other 9 by import closure only |
| 2 | Coach-only, no counterpart persona | AUTOMATED + HUMAN-ONLY | verify-coach-turn, verify-coached-entry (no engine session); UAT step 5 |
| 3 | Words-to-say gated | AUTOMATED + HUMAN-ONLY | verify-coach-tips, verify-coach-turn; UAT steps 6, 7 |
| 4 | Asks before telling | HUMAN-ONLY (prompt shape partly AUTOMATED in verify-coach-turn) | UAT steps 5, 6 |
| 5 | Second real moment | AUTOMATED + HUMAN-ONLY | verify-coached-moment-selection, verify-coached-entry; UAT step 8 |
| 6 | Thin evidence told plainly | AUTOMATED + HUMAN-ONLY | verify-coached-entry (thin-evidence cases); UAT step 3 |
| 7 | Coach decides done | AUTOMATED + HUMAN-ONLY | verify-coach-turn, verify-coached-entry (nextLeg table); UAT step 8 |
| 8 | Soft cap advisory | AUTOMATED | verify-coach-turn / verify-coach-tips (SOFT_CAP_* constants are advisory) |
| 9 | Coach-graded at model-graded weight (0.20) | AUTOMATED | verify-mastery-weights, verify-mastery-compute, verify-levels-goals; HUMAN-ONLY UAT step 9 for the visible move |
| 10 | System-picked lowest-scored non-pleasantry moment | AUTOMATED + HUMAN-ONLY | verify-coached-moment-ranking, verify-coached-moment-selection; UAT step 4 |
| 11 | Next-step contradiction fixed | AUTOMATED + HUMAN-ONLY | verify-next-step, verify-path-surface; UAT step 1 (needs a freshly generated path) |
| 12 | Real video avatar | AUTOMATED (mount wiring) + HUMAN-ONLY | verify-coached-avatar-mount; UAT step 5 |
| 13 | Settings coach with default | AUTOMATED + HUMAN-ONLY | verify-coach-settings; UAT step 11 |
| 14 | Push-to-talk | AUTOMATED (static) + HUMAN-ONLY | verify-hold-space-push-to-talk; UAT step 6 |
| 15 | On-screen verbatim moment | AUTOMATED + HUMAN-ONLY | verify-coached-runtime-surface; UAT step 3 |
| 16 | Brief + spoken objective + consent | AUTOMATED + HUMAN-ONLY | verify-coached-runtime-surface; UAT steps 3, 5 |
| 17 | Page scrolls | HUMAN-ONLY | UAT step 2 (class `h-dvh overflow-y-auto` is asserted statically only) |

## Deferred-absent

None of the Deferred Ideas were implemented. Evidence:

- Four PICK_BETTER options: `lib/study-plan/checks/types.ts` still the Phase 21 two-candidate shape; no Phase 22 plan touched it (PICK_BETTER references exist only in the pre-existing checks files).
- Rewrite context: not implemented; `precedingAvatarText` unused for REWRITE_WEAK_LINE.
- Plan-scoped practice entry, back-link/scroll restoration, sidebar tabs: not in any 22-0x SUMMARY.
- Mastery backfill: not implemented. `MasteryContribution` was empty for historical reports, so a ranking oddity in UAT may be an empty-data artifact.

This was established from the SUMMARYs, the file diff list and a PICK_BETTER grep, not by a dedicated verifier.

## PROVISIONAL constants

Grep of "PROVISIONAL UNTIL CALIBRATED" in files touched this phase:

| Constant | File | Value |
|---|---|---|
| MIN_SUBSTANTIVE_WORDS | lib/study-plan/coached/moment-ranking.ts | 8 |
| MIN_SUBSTANTIVE_WORDS_AT_EDGE | same | 15 |
| MAX_REWORKABLE_SCORE | same | 3 |
| COACHED_ACCEPTABLE_SCORE | lib/study-plan/coached/grade-attempt.ts | 4 |
| SOFT_CAP_ATTEMPTS_PER_LEG | lib/study-plan/coached/coach.ts | 4 (advisory) |
| SOFT_CAP_COACH_TURNS_PER_LEG | same | 12 (advisory) |
| MAX_TIP_LENGTH | lib/study-plan/coached/tips.ts | 240 |
| MAX_DEMONSTRATION_LENGTH | same | 400 |
| MAX_COACH_SPEECH_LENGTH | same | 700 |
| tips.ts false-positive-risk heuristic (~line 646) | same | documented in-file |
| COACHED_SESSION contribution weight | lib/mastery/weights.ts | bound to MODEL_GRADED_WEIGHT 0.20 |

(Pre-existing provisional constants in thinness, levels, goals, moment-boundary and checks/sources are unchanged by this phase.)

## Open items carried forward

1. verify-coach-containment's runtime-marker scan covers only 4 of 13 engine types; the other 9 are covered by import closure only.
2. Path-route placement latency with a real scoring model, against `maxDuration` 60s, has not been measured.
3. `/api/settings/coach` PUT has not been exercised over HTTP against the live roster (verified at the handler/battery level only).
4. Page scroll (`h-dvh overflow-y-auto`), video opening and the hold-Space round trip have not been browser-checked.
5. Prod has NOT received migration 20261123000000_add_coached_mode; the build does not run migrations. Prod deploy is blocked on this.
6. Shared-index commit mislabels: 22-02's files are in caf0dc0, and 22-03's SUMMARY is in 4d78f9d. History not rewritten.
7. The orchestrator's fix commit for verify-levels-goals and coach-prompt (fix(22-09)) resolved the two deferred failures listed in 22-09-SUMMARY; both verifiers pass now.
8. Stored path-step reasons are not recomputed, so UAT needs a freshly generated plan and path.
9. `next build` not run here (dev server on :3000).
10. No student-login browser smoke has been done at any point in the phase (22-15).

## UAT

(To be filled by Task 3 after the human verdict.)
