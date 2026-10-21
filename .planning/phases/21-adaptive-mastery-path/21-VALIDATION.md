---
phase: 21-adaptive-mastery-path
status: awaiting-human-uat
requirements:
  - REQ-103
  - REQ-104
  - REQ-105
  - REQ-106
  - REQ-107
  - REQ-108
  - REQ-109
  - REQ-110
  - REQ-111
  - REQ-112
  - REQ-113
  - REQ-114
  - REQ-115
  - REQ-116
  - REQ-117
  - REQ-118
  - REQ-119
  - REQ-120
  - REQ-121
  - REQ-122
  - REQ-123
  - REQ-124
---

# Phase 21 Validation — Adaptive Mastery Path

## Automated script battery

Run locally on 2026-10-21 against `dev` HEAD, with `DATABASE_URL` set to a
local Postgres database (`leadership_avatar_dev`) so every database-gated
section ran for real — no section signed off from a SKIP. No agent connected
to a shared database, Lightsail, Preview, Production, Vercel, or a deployed
application; all queries ran against the local dev database over `localhost`.

### Phase 21's own verifiers

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-competency-catalog.ts` | 0 | PASS — totality over real `ENGINE_TYPES`, negative phantom-dimension case bites |
| `npx tsx scripts/verify-verbatim-quote.ts` | 0 | PASS — 22 checks, exact-match-or-reject, no near-miss tolerance |
| `npx tsx scripts/verify-mastery-weights.ts` | 0 | PASS — ordering constraints enforced |
| `npx tsx scripts/verify-knowledge-check-surface.ts` | 0 | PASS — 43 checks, no-engine-registry guard holds, no false positive |
| `npx tsx scripts/verify-moment-boundary.ts` | 0 | PASS — 22 checks, scope excludes study-plan synthesis |
| `npx tsx scripts/verify-path-model.ts` | 0 | PASS |
| `npx tsx scripts/verify-mastery-compute.ts` | 0 | PASS |
| `npx tsx scripts/verify-check-generation.ts` | 0 | PASS |
| `npx tsx scripts/verify-check-grading.ts` | 0 | PASS |
| `npx tsx scripts/verify-coached-mode-isolation.ts` | 0 | PASS — ran WITH database (section 4, entry enforcement) |
| `npx tsx scripts/verify-mastery-thinness.ts` | 0 | PASS — `unmappedRowCount` present even when zero |
| `npx tsx scripts/verify-next-step.ts` | 0 | PASS |
| `npx tsx scripts/verify-grading-contest.ts` | 0 | PASS — ran WITH database |
| `npx tsx scripts/verify-coach-tips.ts` | 0 | PASS — ran WITH database (Section 4, CONTRIBUTION); first run without `DATABASE_URL` exported in-shell printed `SKIP 4. CONTRIBUTION`, re-run with it exported passed in full — see note below |
| `npx tsx scripts/verify-levels-goals.ts` | 0 | PASS — 43 checks, Sections 4-5 (no-streaks, no-unlocking) are non-vacuous negative guards |
| `npx tsx scripts/verify-mastery-surface.ts` | 0 | PASS — no competency's percent is 0; every unmeasured one is `null` |
| `npx tsx scripts/verify-path-surface.ts` | 0 | PASS — 34 checks, includes the planted-and-removed placeholder bite-proof |
| `npx tsx scripts/verify-live-session-ingestion.ts` | 0 | PASS — ran WITH database; no-second-copy guard (REQ-124) holds |
| `npx tsx scripts/verify-check-taking-surface.ts` | 0 | PASS — ran WITH database (Section 4); 54 checks |
| `npx tsx scripts/verify-coached-entry.ts` | 0 | PASS — ran WITH database (Section 4); coached report skips LIVE_SESSION double-write |
| `npx tsx scripts/verify-coached-runtime-surface.ts` | 0 | PASS |
| `npx tsx scripts/verify-generation-sources.ts` | 0 | PASS — ran WITH database (Section 3, ownership end-to-end); 39 checks |
| `npx tsc --noEmit` | 0 | PASS — zero output |
| `npm run build` | 0 | PASS — production build succeeds, includes `/mastery`, `/study-plans/[planId]/checks/[checkId]`, `/study-plans/[planId]/coached/[stepId]` |

**On the SKIP note for `verify-coach-tips.ts`:** this script gates its DB
section on `process.env.DATABASE_URL` directly rather than on Prisma's own
(separately successful) `.env` resolution. The first pass of this battery ran
in a shell where `DATABASE_URL` was never explicitly exported, and every
*other* DB-touching script in this list still connected and wrote real rows —
meaning Prisma Client itself reads `.env` independently of the calling
shell's environment. `verify-coach-tips.ts`'s explicit `process.env` check
does not, so it printed `SKIP 4. CONTRIBUTION (no DATABASE_URL set)` on that
first pass even though the database was genuinely reachable. Re-run with
`DATABASE_URL` exported in the same shell invocation: Section 4 ran for real,
0 failures. No other script in the Phase 21 list skipped anything on either
pass. This is recorded as a gap closed by re-run, per the plan's own
instruction that a SKIP is a gap, not a pass, until re-run.

### Pre-existing verifiers this phase could have disturbed

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-engine-surface-count.ts` | 0 | PASS — allowlists the two `*SessionShell.tsx` files (fixed at `81af260` for 21-24's deliberate `CoachedSessionShell`) |
| `npx tsx scripts/verify-engine-config.ts` | 0 | PASS — unaffected |
| `npx tsx scripts/verify-report-chrome-coverage.ts` | 0 | PASS — unaffected |
| `npx tsx scripts/verify-dc-surface-count.ts` | 0 (after an in-flight fix — see below) | PASS |
| `npx tsx scripts/verify-pitch-types.ts` | 0 | PASS — see disposition below; this is NOT the "fail identically" outcome the plan predicted |
| `npx tsx scripts/verify-disengagement.ts` | 0 | PASS — unaffected (part of the 27-guard set the orchestrator verified at `81af260`) |
| `npx tsx scripts/verify-feedback-source-attribution.ts` | 0 | PASS — unaffected |
| `npx tsx scripts/verify-job-description-intake.ts` | 0 | PASS — unaffected |

**`verify-dc-surface-count.ts` — a genuine regression found and fixed by this
plan, not pre-disclosed.** This script carries its OWN copy of the identical
"exactly 1 SessionShell" assertion that `verify-engine-surface-count.ts` had
before `81af260` fixed it. `81af260`'s commit message and diff touch only
`scripts/verify-engine-surface-count.ts` — `verify-dc-surface-count.ts` was
never covered by that fix, and was not named in the orchestrator's "27 guards
green" list. Running it as this plan's own Task 1 instructs ("pre-existing
verifiers this phase could have disturbed") surfaced it failing: `FAIL
exactly 1 SessionShell (found 2)` naming `PracticeSessionShell.tsx` and
`CoachedSessionShell.tsx`. Fixed inline (Rule 1 — stale assertion, not an
architectural question; the two-shell decision was already made and approved
at `81af260`) by applying the identical allowlist pattern verbatim, naming
`21-COACHED-ENGINE-DECISION.md` as the authority. Proven to bite: planted
`components/tmpprobe/ProbeSessionShell.tsx` → `FAIL ... (found 3)` naming all
three; removed → exit 0. Committed separately at `ea62212`
(`fix(21-20): allowlist the two session shells in verify-dc-surface-count
too`), staged with an explicit pathspec.

**`verify-pitch-types.ts` — now ALL PASS, which is NOT what this plan
predicted.** `18-PITCH-TYPES-REGRESSION.md` and this plan's own Task 1 both
expected exactly one surviving ELEVATOR failure (`18-VALIDATION.md`'s
disposition: "must fail IDENTICALLY, with exactly that one failure"). It does
not — it is clean. Investigated per `18-PITCH-TYPES-REGRESSION.md`'s own
instruction ("If it drops to 0, something changed `elevator-type.ts` and that
violates Phase 19's read-only fence — investigate rather than celebrate"):
`git log` shows commit `05b94d0` ("feat(elevator): drop the turn floor so a
crossed threshold can end it at once"), dated 2026-10-15, which predates and
is OUTSIDE every Phase 21 plan (it touches `lib/pitch/elevator-type.ts` and
`scripts/verify-pitch-types.ts` only, and is not listed in any `21-NN-PLAN.md`
`files_modified`). Its own commit message records a deliberate, reasoned
decision: `pitch-elevator` gives up its `avatarEndFloor: { minAssistantTurns:
2 }` guarantee on purpose ("the listener walking away early IS the lesson"),
with gate 4 of `resolveTermination` (the engine-derived disengagement value)
left untouched — not a weakening of the engine's authority, a removal of one
type's turn-count minimum. This is a legitimate out-of-band fix to the
long-standing Phase 18 regression, made and committed before this phase's own
plans ran, not a Phase 21 side effect and not a fence violation (Phase 19's
elevator-type.ts fence applied only during Phase 19's own execution window).
Recorded here rather than silently accepted as a pass, per the regression
doc's own instruction to investigate before celebrating.

## Section 2 — Success Criteria

Transcribed from `ROADMAP.md`'s Phase 21 entry. All automated coverage below
is green (Section 1). Human verdicts are **PENDING** — none of the three
things that genuinely require a human (the lifetime/current labelling
reading unambiguously, a generated quote feeling accurate to the person who
said it, a coach tip helping without handing over the words) can be asserted
by a script.

| # | Success Criterion | Automated coverage | Human verdict |
|---|---|---|---|
| SC1 | Mastery is a deterministic cross-type figure with thinness shown. | `verify-mastery-compute`, `verify-mastery-thinness`, `verify-mastery-surface`, `verify-live-session-ingestion` | PENDING |
| SC2 | All four knowledge-check formats generate from the student's own moments and never misquote them. | `verify-verbatim-quote`, `verify-check-generation`, `verify-check-grading`, `verify-check-taking-surface`, `verify-grading-contest`, `verify-generation-sources` | PENDING |
| SC3 | Coached practice exists as its own path-only mode with technique-only tips. | `verify-coached-mode-isolation`, `verify-coached-entry`, `verify-coached-runtime-surface`, `verify-coach-tips` | PENDING |
| SC4 | A bounded 5-10 step path selects its next step deterministically from the weakest competency. | `verify-path-model`, `verify-next-step`, `verify-levels-goals`, `verify-path-surface` | PENDING |
| SC5 | The existing study-plan surface still works and the REQ-85 amendment is handed off. | `verify-report-chrome-coverage`, `verify-path-surface` Section 1, this document's Section 5 | PENDING |

## Section 3 — Requirement checklist

Honestly split: automatable rows carry a verdict now, from the named
verifier's actual assertions (not a substring scan mistaken for proof).
Human-only rows are left **PENDING** for Task 2/3. Marking REQ-106 from
`verify-mastery-surface.ts`'s substring check would be exactly the
false-confidence `20-07` warns against — it is left PENDING deliberately.

| Req | Delivered by | Evidence | Verdict |
|---|---|---|---|
| REQ-103 | 21-02 | `verify-competency-catalog.ts` — proves totality over the real `ENGINE_TYPES` registry (every real dimension maps, no orphans, totality guard bites on a deliberately-unmapped synthetic dimension). The "replaceable by a later faculty framework without reworking consumers" structural claim is documented in `lib/mastery/competencies.ts`'s own module comment (single exported surface) but not independently verified across every consumer file — noted, not blocking. | **Complete (automated)** |
| REQ-104 | 21-09 | `verify-mastery-compute.ts` — pure deterministic lifetime + current-window + overall computation, no model call. | **Complete (automated)** — already ticked in REQUIREMENTS.md |
| REQ-105 | 21-09/21-13 | `verify-mastery-thinness.ts` — evidence count + `thin` flag at a declared threshold, shown not withheld. | **Complete (automated)** — already ticked |
| REQ-106 | 21-18 | Requires a human to read a competency row and say which number is lifetime vs. recent without hesitating, AND find `/mastery` from navigation without typing the URL. Neither is substring-checkable. | **PENDING — human-only** |
| REQ-107 | 21-21 | `verify-live-session-ingestion.ts` proves the mechanism (a READY report writes `LIVE_SESSION` contributions for every competency it scored, ordering enforced). The student-observable half — "a session must move mastery with no check taken" on a REAL session — needs a live human session, per this plan's hard constraint. | **PENDING — human-only (mechanism proven, live-session observation required)** |
| REQ-108 | 21-06/21-22 | `verify-check-taking-surface.ts` (54 checks, ran WITH database) — all four formats renderable and answerable through an authenticated, ownership-scoped route. | **Complete (automated)** — already ticked |
| REQ-109 | 21-07 | `verify-moment-boundary.ts` — named, scoped widening proven; existing closed-vocabulary generator proven frozen. | **Complete (automated)** — already ticked |
| REQ-110 | 21-04 | `verify-verbatim-quote.ts` — exact-match-or-reject, carries report id + turn index, no near-miss tolerance. | **Complete (automated)** — already ticked |
| REQ-111 | 21-11 | `verify-check-grading.ts` — deterministic grading for the three closed formats, answer key never reaches the browser. | **Complete (automated)** — already ticked |
| REQ-112 | 21-22 | `verify-grading-contest.ts` (ran WITH database) — contest reverses the contribution pending review and flags the question; confirmed against the attempt id, not the check id. | **Complete (automated)** — already ticked |
| REQ-113 | 21-12/21-23/21-24 | `verify-coached-mode-isolation.ts` Section 3 (walked, non-vacuous) proves no coaching entry in normal practice; `verify-coached-entry.ts` Section 4 (ran WITH database) proves the path-step entry point starts a real session. **Known limitation, recorded honestly below rather than signed off clean**: a student CAN be routed by 21-14's weakest-competency selection to a coached step whose only evidence came from an `instance`-requiring type (case-study, difficult-conversation), which 21-24's `CoachedSessionShell` cannot start — it surfaces an error rather than papering over it. REQ-113 is satisfied for every competency whose weakest evidence is an instance-free type, not for all of them. | **Complete, with a named limitation (automated + disclosed)** |
| REQ-114 | 21-24 | `verify-coached-runtime-surface.ts` + `verify-coached-entry.ts` prove replay-then-fresh, both legs required to finish. Same instance-requiring-type limitation as REQ-113 applies — recorded there, not restated as a separate defect. | **Complete, with the same named limitation** |
| REQ-115 | 21-16 | `verify-coach-tips.ts` (ran WITH database, Section 4) — mechanical script-cue-phrase check runs on every tip actually rendered during a session, not only at authoring time. The qualitative "does this tip help without handing over the words" judgement is human-only. | **PENDING — human-only (mechanism proven, qualitative judgement required)** |
| REQ-116 | 21-16/21-21 | `verify-coach-tips.ts` Section 4 — coached contribution written at the coached weight, confirmed strictly below `LIVE_SESSION`. The student-visible "I can see my mastery figure move" half is Task 2's SC3 step 14. | **Complete (automated); visibility half folded into SC3 human verdict** |
| REQ-117 | 21-08 | `verify-path-model.ts` / `verify-path-surface.ts` — path is a child of study plan, 5-10 bound, old paths reachable not discarded. | **Complete (automated)** — already ticked |
| REQ-118 | 21-14 | `verify-next-step.ts` — deterministic weakest-competency selection with a stated reason. | **Complete (automated)** — already ticked |
| REQ-119 | 21-17 | `verify-levels-goals.ts` Sections 1-5 — declared thresholds, declared goal defaults, Sections 4-5 are non-vacuous negative guards for streaks/unlocking (comment-stripped source scan). | **Complete (automated)** — already ticked |
| REQ-120 | 21-18/21-19 | `verify-path-surface.ts` Section 1 + `verify-report-chrome-coverage.ts` — path surfaced with step state/reason, existing `app/reports/page.tsx` unchanged except a regression-guarded additive insertion. | **Complete (automated)** — already ticked |
| REQ-121 | This plan | Requires REQ-103..REQ-120 and REQ-122..REQ-124 to ALL be recorded first, and the REQ-85 amendment to exist as a Phase 18 revision handoff (Section 5 below) without editing `18-VALIDATION.md`. This document's Section 5 satisfies the handoff half now; the "all recorded" half completes only once Task 3 writes final verdicts. | **PENDING — depends on Task 3's closure of this document** |
| REQ-122 | 21-19/21-22/21-24 | `verify-path-surface.ts` — all three step kinds' action links proven to reach a real, on-disk destination (not a substring), including the `PLACEHOLDER_KNOWLEDGE_CHECK_ID` bite-proof (planted, observed firing, removed). | **Complete (automated)** — already ticked |
| REQ-123 | 21-25 | `verify-generation-sources.ts` (ran WITH database, Section 3) — single named, exported, ownership-scoped assembler, testable without a route. | **Complete (automated)** — already ticked |
| REQ-124 | 21-21 | `verify-live-session-ingestion.ts` Section 3's no-second-copy guard — `contributionsFromReport` in `lib/mastery/from-report.ts` is the ONE mapping module; `lib/study-plan/coached/contribution.ts`'s `recordCoachedContribution` imports and delegates to it rather than reimplementing. Confirmed by direct source read as well as the guard. | **Complete (automated)** |

## Section 4 — Locked-decision checklist

| Locked decision (21-CONTEXT.md) | Honored where | Guard |
|---|---|---|
| Separate cross-type competency model, derived mechanically from rubric dimensions | `lib/mastery/competencies.ts` | `verify-competency-catalog.ts` |
| Thin evidence shown with thinness flagged, never withheld | `lib/mastery/thinness.ts` | `verify-mastery-thinness.ts` |
| Both live sessions and knowledge checks move mastery | `lib/mastery/ledger.ts`, `lib/mastery/from-report.ts` | `verify-live-session-ingestion.ts` |
| Mastery is BOTH lifetime and current-window | `lib/mastery/compute.ts` | `verify-mastery-compute.ts` |
| All four check formats ship; checks live INSIDE study-plan surface, not a registered engine type | `lib/study-plan/checks/` | `verify-knowledge-check-surface.ts` (no-engine-registry guard) |
| Content generated from the student's own moments, never a generic bank | `lib/study-plan/moments.ts`, `lib/study-plan/checks/sources.ts` | `verify-generation-sources.ts` |
| Never misquote the student — exact match or reject | `lib/study-plan/verbatim.ts` | `verify-verbatim-quote.ts` |
| Model-graded rewrites count for less than deterministic formats | `lib/mastery/weights.ts` `CONTRIBUTION_WEIGHTS` + `WEIGHT_ORDERING_CONSTRAINTS` | `verify-mastery-weights.ts` |
| Student can contest a grading | `app/api/study-plans/checks/[attemptId]/contest` | `verify-grading-contest.ts` |
| Coaching is its own instance, nested in study plans, never in normal practice | `lib/study-plan/coached/`, `components/study-plan/CoachedSessionShell.tsx` | `verify-coached-mode-isolation.ts` Section 3 |
| Replay first, then fresh | `lib/study-plan/coached/instance.ts` | `verify-coached-runtime-surface.ts` |
| Tips are technique reminders only, never scripted words | `lib/study-plan/coached/tips.ts` | `verify-coach-tips.ts` |
| Coached sessions move mastery, weighted below unaided | `lib/study-plan/coached/contribution.ts` | `verify-coach-tips.ts` Section 4 / `verify-coached-entry.ts` |
| Paths are a child of the study plan; new plan generates new path; old paths stay reachable | `lib/study-plan/path.ts` | `verify-path-model.ts` |
| Bounded 5-10 steps | `lib/study-plan/path.ts` | `verify-path-model.ts` |
| "What's next" targets weakest competency first, deterministic and explainable | `lib/study-plan/next-step.ts` | `verify-next-step.ts` |
| Levels and daily/weekly goals exist | `lib/mastery/levels.ts`, `lib/study-plan/goals.ts` | `verify-levels-goals.ts` Sections 1-3 |

**Deliberately absent** (Deferred items from `21-CONTEXT.md`), each proven
absent by a non-vacuous negative guard, not merely unmentioned:

| Deferred item | Guard proving its absence |
|---|---|
| Streaks | `verify-levels-goals.ts` Section 4 — comment-stripped source scan for streak/consecutive-day terms, zero matches outside comments |
| Unlocking | `verify-levels-goals.ts` Section 5 — comment-stripped scan for unlock/lock/prerequisite/gate terms, zero matches; `nextStepFor`/`levelFor` signatures proven to take no unlock-state argument |
| A faculty-authored competency framework | `lib/mastery/competencies.ts`'s own module comment documents the swap contract; no guard proves non-existence of something not yet written, by construction |
| An authored question bank | `verify-generation-sources.ts` / `verify-moment-boundary.ts` — generation inputs are session moments only, never a static bank |
| Coaching inside normal practice sessions | `verify-coached-mode-isolation.ts` Section 3 (walked, non-vacuous) — no coaching identifier anywhere under `components/practice/` or `app/practice/`; `git diff --name-only -- components/practice/` is empty across the whole phase |

## Section 5 — Phase 18 revision handoff

**REQ-85 amendment (Phase 21).** REQ-85 reads that no meter, indicator, or
warning appears anywhere in the session shell during a session. It is amended
to read that this applies to a **graded practice session** specifically.
REQ-85 forbids a DISENGAGEMENT indicator in a graded practice session; it does
**not** forbid in-session guidance in a separate, explicitly-coached mode.
The prohibition on a disengagement meter, indicator or warning in a normal
practice session is **UNCHANGED and unweakened** — Phase 21 adds nothing to
the session shell and `scripts/verify-coached-mode-isolation.ts` section 3
proves no coaching identifier appears anywhere under `components/practice/` or
`app/practice/`. Coached mode is reachable only through a study plan's path
step (REQ-113), carries no disengagement threshold at all (see
`21-COACHED-ENGINE-DECISION.md`), and its guidance is technique reminders only,
mechanically enforced (REQ-115).

- This amendment was declared in `21-CONTEXT.md` before execution began, per
  the Phases 14/15/16 precedent for Phase 13 extensions, and in this plan's
  own frontmatter `not_gated_on` reasoning.
- `18-VALIDATION.md` was **NOT edited** by this plan or any plan in this
  phase. It still carries `status: awaiting-human-uat` with all five Success
  Criteria `PENDING`, and Phase 18's human UAT (18-05) has not run. Editing
  its verdicts, frontmatter, or requirement checklist mid-flight would
  corrupt a record still in progress. `git log -1 --format=%h --
  .planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` returns
  `2b16677`, a commit that predates this phase's first commit. Phase 18's
  closer collects this section when 18-05 runs.
- Phase 21 was **NOT gated** on 18-05, for the reason recorded in this plan's
  own `not_gated_on` frontmatter: Phase 21 touches exactly one file under
  `lib/engine/` — `evaluation-runner.ts` — and the touch is a single awaited,
  try/catch-wrapped call to `recordLiveSessionContributions` at the point a
  report flips to READY. That is post-session evaluation persistence, not
  disengagement scoring, termination policy, or the session shell — the three
  things 18-05 exercises. 21-23/21-24 reuse engine session machinery as
  CALLERS and modify nothing under `lib/engine/`. The claim is NOT that
  `lib/engine/` is untouched — it is that exactly one file changed, and the
  change is additive. Verified directly, both commands and outputs recorded
  verbatim:

  ```
  $ git diff --name-only 122b22b..HEAD -- lib/engine/
  lib/engine/evaluation-runner.ts

  $ git diff 122b22b..HEAD -- lib/engine/evaluation-runner.ts | grep -c '^-[^-]'
  0
  ```

  (`122b22b` is Phase 21's phase-base commit, the last commit before 21-01's
  plans began landing. The second command confirming `0` proves the change is
  purely additive — no existing engine line was removed.) Neither command's
  result voids the no-gate reasoning; both match exactly what the plan
  required for sign-off without escalation.
- Adding coaching to normal practice sessions remains a **genuine REQ-85
  conflict requiring its own decision**, per `21-CONTEXT.md`'s Deferred list.
  This amendment does **not** pre-authorize it.

## Known limitations (recorded, not papered over)

**1. Coached mode cannot start an `instance`-requiring type (case-study,
difficult-conversation).** Disclosed by 21-24, left unfixed by design — the
fix belongs either in the engine (outside this phase's scope: widening
`lib/engine/` beyond `evaluation-runner.ts` would void the Section 5 no-gate
reasoning) or in a dedicated plan deciding how a coached session supplies an
instance. 21-24's `CoachedSessionShell` surfaces the rejection as an error
rather than papering over it. Because 21-14 selects the weakest competency
first without filtering by type, **a student can be routed to a coached step
that cannot start.** REQ-113/REQ-114 are legitimately Complete — a student
CAN start and complete a coached session — but **not for every competency**.
Reproduction: pick a student whose weakest-scoring competency's only evidence
comes from a case-study or difficult-conversation session, generate a path,
and attempt the resulting `COACHED_SESSION` step.

**2. The `PLACEHOLDER_KNOWLEDGE_CHECK_ID` hazard is CLOSED, verified still
holding.** `deferred-items.md` records three independent closures from 21-19:
the path route replaces every placeholder with a real `KnowledgeCheck.id`
before persisting (degrading to `UNAIDED_SESSION` on generation failure), a
pre-persist assertion throws if one somehow survives, and `PathPanel.tsx`
renders no action link for a step whose `knowledgeCheckId` is still the
placeholder as a third, independent backstop. `scripts/verify-path-surface.ts`
Section 7 proves this with a plant/observe/remove bite-proof against a real
database. Re-run in this battery (`verify-path-surface.ts`, exit 0, 34
checks) — the closure still holds.

**3. Growth-area-to-competency attribution has a coarse fallback for
pre-`dc0becf` reports.** `lib/study-plan/checks/sources.ts`'s
`momentsByCompetency` originally derived attribution by intersecting a
report's scored dimensions with growth-area-linked moments — coarse, because
every scored competency inherited every moment. A standalone task
(quick-004, commits `dc0becf`…`cbc5acb`, summary at
`.planning/quick/004-growth-area-dimension/004-SUMMARY.md`) added an
evaluator-declared `dimension` field to `growth_areas`, validated against
`allRubricDimensionKeys()` with unrecognized values degrading to `null`, and
`sources.ts` now prefers the stated dimension, falling back to the original
derivation only for rows written before that field existed. **The fallback
path remains coarse for any report written before `dc0becf`** — this is a
known, accepted limitation of pre-existing data, not a regression this phase
introduced or can retroactively fix.

## Section 6 — Calibration record

Every provisional number this phase introduced, with the evidence it rests
on. **None has been validated against real student data.** This phase did
not retune any Phase 18/19/20 number.

Cross-check: `grep -rc 'PROVISIONAL UNTIL CALIBRATED' lib/mastery/
lib/study-plan/` (excluding non-zero matches only) returns 7 files carrying
the literal tag — `lib/mastery/levels.ts` (1), `lib/mastery/weights.ts` (2,
one real tag + one self-referential mention of the phrase in prose),
`lib/mastery/thinness.ts` (2, same pattern), `lib/study-plan/moment-boundary.ts`
(2, two distinct tags), `lib/study-plan/checks/sources.ts` (2, two distinct
tags), `lib/study-plan/goals.ts` (1), `lib/study-plan/coached/tips.ts` (1).
That is **9 real tagged constant blocks** across those 7 files (excluding the
two self-referential prose mentions). The table below has 9 rows matching
those blocks, plus 2 additional rows the plan requires in this table by name
that do **not** carry the literal tag in their source file — flagged as a
documentation gap below rather than silently included as if tagged.

| Source | Value | Governs | Evidence | Risk if wrong |
|---|---|---|---|---|
| `lib/mastery/weights.ts` `CONTRIBUTION_WEIGHTS` | LIVE_SESSION 1.00, CHECK_DETERMINISTIC 0.45, COACHED_SESSION 0.40, CHECK_MODEL_GRADED 0.20 | Every mastery contribution's weight | Anchored at the unaided-session maximum; ordering locked by `21-CONTEXT.md`, numbers are discretion | **Lowest** of this table — the locked ORDERING (enforced by `verify-mastery-weights.ts`) is what actually matters; the exact numbers moving the mean by degree, not by direction |
| `lib/mastery/levels.ts` `LEVEL_THRESHOLDS` | minPercent 0, 40, 55, 70, 85 for levels 1-5 | Which of 5 levels a competency displays at | Placed against `normalizeRubricScore`'s 1-5 scale: straight-3 (50%) lands at level 2, straight-4 (75%) at level 4, level 5 requires beating straight-4 | Moderate — a student's displayed level label could read as too generous or too harsh, but the underlying percentage is unaffected |
| `lib/mastery/thinness.ts` `THINNESS_THRESHOLDS` | thinBelowWeightSum 2.0, establishedAtWeightSum 6.0 | Whether a figure reads THIN / EMERGING / ESTABLISHED | Weight-sum (not raw-count) based, anchored at "two unaided sessions" (21-CONTEXT.md's own example) and "~six sessions, mean stops swinging materially" | **Most consequential in this table** — directly controls what a student is told about the strength of their own evidence; too generous makes thin data look solid, too strict makes real progress look perpetually unready |
| `lib/study-plan/moment-boundary.ts` `MAX_MOMENTS` | 12 | Moments kept per generation request | "Enough slack for a 5-10 step path's worth of checks" | Low-moderate — a too-low cap could silently omit a strong moment |
| `lib/study-plan/moment-boundary.ts` `MAX_TOTAL_CHARACTERS` | 8,000 | Total characters per generation request | Keeps one completion call from truncating a quote mid-sentence | Low-moderate — too low risks truncation; too high risks cost/latency, not correctness |
| `lib/study-plan/checks/sources.ts` `SOURCE_LIMITS.maxReports` | 8 | Reports read per generation assembly | Not separately justified beyond "provisional" in-source | Moderate — too low starves generation of source material for a student with a long history |
| `lib/study-plan/checks/sources.ts` `SOURCE_LIMITS.maxMomentsPerCompetency` | 12 | Moments kept per competency during assembly | Mirrors `MAX_MOMENTS`'s reasoning | Low-moderate |
| `lib/study-plan/goals.ts` `GOAL_DEFAULTS` | dailyActivities 1, weeklyActivities 4 | Daily/weekly goal targets | Weekly deliberately < 7x daily so one missed day doesn't fail the week — named as the streak-free motivational substitute | Low — a goal display, not an evidence or grading figure |
| `lib/study-plan/coached/tips.ts` `MAX_TIP_LENGTH` | 240 | Max characters a rendered coach tip may contain | "A technique reminder is a sentence; a paragraph is either a script or a lecture" — length as the cheapest reliable proxy | Moderate — too generous could let a near-scripted tip through; too strict could truncate a legitimate technique name |
| `lib/mastery/weights.ts` `MASTERY_WINDOW_DAYS` **(gap: untagged)** | 30 | The rolling window for the current-window mastery figure | In-source comment states purpose but does **not** carry the literal `PROVISIONAL UNTIL CALIBRATED` string — this is a documentation gap, flagged rather than silently closed (fixing it is outside this plan's `files_modified`) | Moderate — directly shapes what "recent form" means to a student |
| `lib/study-plan/verbatim.ts` `MIN_QUOTABLE_LENGTH` **(gap: untagged, file not in the 7 tagged)** | 12 | Minimum character length for a transcript turn to be quotable at all | In-source comment explains the three-word-fragment risk but does **not** carry the literal tag | Low-moderate — too low risks a coincidental-match false quote; too high risks losing legitimate short quotable moments |

## Section 7 — Human UAT protocol

See Task 2 of `21-20-PLAN.md` for the full 22-step script handed to the human
verifier. Summarized by Success Criterion:

- **SC1** steps 1-5: an unmeasured student sees no crash and no 0%; a
  completed session with no check moves mastery; the lifetime/recent
  labelling reads unambiguously without hesitation; figures are stable across
  reloads.
- **SC2** steps 6-10: a generated knowledge check's quote is read and
  confirmed exact; multiple-choice and fill-in-the-blank checks are reached by
  clicking (not typing a URL) and graded immediately; a deliberate wrong
  answer is contested and the mastery figure reverses; a rewrite check's weak
  line is confirmed to be the student's own.
- **SC3** steps 11-14: no coaching option exists anywhere in normal practice;
  the coached step is reached by clicking the path panel's action link, opens
  with a real, labelled replay moment before any new situation; every tip
  names a technique and none hands over scripted words; the fresh leg exists,
  completes, and `/mastery`'s evidence list shows EXACTLY ONE contribution
  for the coached session (not two — two rows would mean the `coached-session`
  skip in `recordLiveSessionContributions` is not firing).
- **SC4** steps 15-18: 5-10 steps are visible with a reasoned next-step
  block naming the actual weakest competency; a later step can be completed
  before an earlier one with nothing locked or greyed out; no streak counter
  exists anywhere.
- **SC5** steps 19-22: the pre-existing study-plan flow (list/preview/save/
  open) is unchanged; a pre-phase-21 saved plan renders with no path rather
  than erroring; the REQ-85 amendment in Section 5 reads as intended; and
  `18-VALIDATION.md` is confirmed untouched by commit hash.

## Section 8 — Final verdict

**PENDING.** Do not mark Phase 21 complete, and do not tick any requirement
checkbox beyond what Section 3 already marks Complete from automation, until
Task 2's human UAT evidence is supplied and carried into Task 3 verbatim. A
partial result (some SCs passing, others failing) is a `status: partial`
outcome with named gaps, not a pass.
