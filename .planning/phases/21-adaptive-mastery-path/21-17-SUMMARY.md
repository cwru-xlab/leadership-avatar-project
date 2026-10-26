---
phase: 21-adaptive-mastery-path
plan: 17
subsystem: lib
tags: [typescript, mastery-model, duolingo-mechanics, negative-guard]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path (plan 13)
    provides: "EvidenceTier, evidenceTierFor(), weight-sum thresholds — levelFor() consumes EvidenceTier directly rather than redefining it"
  - phase: 21-adaptive-mastery-path (plan 14)
    provides: "selectPathSteps(), nextStepFor(), TIE_BREAK_ORDER — nextStepFor's signature is asserted by the no-unlocking guard"
  - phase: 21-adaptive-mastery-path (plan 08)
    provides: "markStepComplete(userId, stepId), PathWithSteps — markStepComplete's signature is asserted by the no-unlocking guard"
  - phase: 21-adaptive-mastery-path (plan 09)
    provides: "MasteryContributionRow, the null-not-zero convention goalProgress() follows"
provides:
  - "lib/mastery/levels.ts — LEVELS, LEVEL_THRESHOLDS (PROVISIONAL), levelFor(), Level"
  - "lib/study-plan/goals.ts — GOAL_DEFAULTS (PROVISIONAL), goalProgress(), GoalProgress"
  - "scripts/verify-levels-goals.ts — 43-check boundary/window/grouping/absence battery"
affects: [21-18, 21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inclusive lower-bound threshold tables (LEVEL_THRESHOLDS), same shape as 21-13's THINNESS_THRESHOLDS, tagged PROVISIONAL UNTIL CALIBRATED with derivation recorded for 21-20's calibration table"
    - "null-not-zero extended to levels: a never-measured competency gets a null level and the label 'Not yet measured', never level 1 — level 1 means measured-and-starting-out, a materially different claim"
    - "THIN evidence tier flags a level as provisional rather than withholding or asserting it bare — the same resolution 21-13 chose for percentages, applied one layer up at the level"
    - "Timezone-correct local-day/local-ISO-week boundaries via Intl.DateTimeFormat offset correction (no date library): the zone's UTC offset is derived from a naive guess instant and used to correct local midnight, verified correct across the EDT boundary"
    - "Activity != contribution row: goalProgress groups by sourceReportId ?? sourceAttemptId (falling back to the row's own id when both are null) so one coached session's multiple per-competency contributions count as one activity"
    - "Negative-guard proof pattern: comment-AND-string-literal-stripped source scan over a non-vacuous file walk, paired with behavioural API-shape assertions (signature arity, no levelFor+.filter chaining) — and the guard is proven to bite with a planted violation, not just asserted to work"

key-files:
  created:
    - lib/mastery/levels.ts
    - lib/study-plan/goals.ts
    - scripts/verify-levels-goals.ts
  modified: []

key-decisions:
  - "LEVEL_THRESHOLDS (0/40/55/70/85, inclusive lower bounds) derived from the rubric's own (score-1)/4 normalization: a consistent 3 (50%) lands at level 2 'Building', a consistent 4 (75%) lands at level 4 'Strong', and level 5 'Mastered' requires beating a straight 4. Tagged PROVISIONAL UNTIL CALIBRATED, same convention as lib/mastery/weights.ts and lib/mastery/thinness.ts."
  - "GOAL_DEFAULTS (dailyActivities: 1, weeklyActivities: 4) deliberately asymmetric — 4 is less than 7, so a student missing days can still hit the weekly goal. Recorded as the design answer to 'why no streaks': the weekly goal absorbs the slack a streak would otherwise demand be perfect about, without the punishment of a broken chain."
  - "The timezone-offset-correction algorithm in goals.ts's first draft had a real bug (one correction pass using date-only parts produced a wrong instant, off by a full day in one direction) — caught by running goalProgress against the plan's own stated test values before writing the verifier, not by the verifier itself. Rewritten to derive the zone's UTC offset from a full date+time wall-clock reading at a naive guess instant, which is correct across the actual EDT boundary tested (2026-10-16, America/New_York)."
  - "The negative guard (Section 4/5) strips string literals in addition to comments before matching, because a pre-existing, unrelated error-message string in lib/study-plan/path.ts ('(locked by 21-CONTEXT.md)', describing a numeric bound fixed by a product decision) would otherwise trip the 'locked' term every run. One further, narrowly-scoped and documented exclusion (the literal substring 'locked_by', an unrelated governance field name on lib/mastery/weights.ts's WEIGHT_ORDERING_CONSTRAINTS) was added rather than switching to word-boundary matching, because word-boundary matching would have stopped the guard from catching a term embedded in a camelCase identifier (e.g. a hypothetical dailyStreak) — which is exactly the shape of violation the guard exists to catch. Neither exclusion removes the guard's ability to catch an actual isUnlocked/locked:/streak-shaped addition anywhere in the walked set."
  - "The guard-bite requirement was executed literally, not merely asserted: a temporary export (dailyStreak) was planted in lib/mastery/levels.ts, the verifier was run and confirmed to fail (exit 1, naming the exact file/term), the plant was removed, and the file was restored byte-identical via git checkout before the Task 3 commit."

requirements-completed: []

# Metrics
duration: ~50min
completed: 2026-10-21
---

# Phase 21 Plan 17: Levels and Daily/Weekly Goals (with Streaks/Unlocking Proven Absent) Summary

**`levelFor()` and `goalProgress()` ship the two Duolingo mechanics 21-CONTEXT.md selected — per-competency levels with PROVISIONAL inclusive thresholds, and timezone-correct daily/weekly activity goals counted from the ledger — while a 43-check battery proves the two it rejected, streaks and unlocking, exist nowhere in the walked `lib/`/`components/` surface, with the guard proven to bite via a planted violation**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-10-21 (approx)
- **Tasks:** 3 (all auto)
- **Files modified:** 3 (all created)

## Accomplishments

- `lib/mastery/levels.ts` exports `LEVELS`/`Level` (1-5: Starting out, Building, Competent, Strong, Mastered) and `LEVEL_THRESHOLDS` (inclusive lower bounds 0/40/55/70/85, tagged PROVISIONAL UNTIL CALIBRATED with the rubric-normalization derivation recorded). `levelFor({ percent, tier })` returns a null level (never level 1) for `percent === null`, flags `provisional: true` for a THIN tier without withholding the level, exposes `nextLevelAtPercent` as the progression target (null only at level 5), and throws on an out-of-range percent. A block comment names what deliberately does not exist: no level is a prerequisite, no level grants access, no function here takes a "current level" to gate anything.
- `lib/study-plan/goals.ts` exports `GOAL_DEFAULTS` (`dailyActivities: 1`, `weeklyActivities: 4`, PROVISIONAL, with the weekly-less-than-seven asymmetry recorded as the design answer to "why no streaks") and `goalProgress({ contributions, now, timeZone, targets? })`. `now`/`timeZone` are required parameters; local day and ISO-Monday-week boundaries are computed via `Intl.DateTimeFormat`-derived UTC-offset correction with no date library. An "activity" is grouped by `sourceReportId ?? sourceAttemptId` (falling back to the row's own `id` when both are null) so one coached session's several per-competency contributions count as one activity, not several. `met` is strict `completed >= target`. A comment lists what is deliberately not computed: consecutive days, longest run, "don't break your chain," day-over-day comparison, missed days.
- `scripts/verify-levels-goals.ts` runs 43 checks across 5 sections, entirely database-free: both sides of all four level thresholds plus null/throw/THIN-provisional/`nextLevelAtPercent` cases (Section 1); the timezone-sensitive daily-vs-weekly window pair plus the ISO-Monday week boundary (Section 2); one-coached-session-is-one-activity grouping, multi-source grouping, the both-null-sourceless-row case, and the `met` boundary (Section 3); the no-streaks negative guard over a 29-file, comment-and-string-stripped walk of `lib/mastery`, `lib/study-plan`, `components/mastery`, `components/study-plan` (Section 4); and the no-unlocking negative guard plus behavioural API-shape assertions — `markStepComplete`/`nextStepFor`'s real signatures accept no level/prior-step/precondition argument, `levelFor` accepts no `unlockedLevels`/catalog, and a crude `levelFor(` + `.filter(` proximity smell detector finds nothing (Section 5).
- The guard was proven to bite, not just asserted to work: a temporary `export const dailyStreak = 0;` was planted in `lib/mastery/levels.ts`, the verifier was run and confirmed to fail (exit 1, naming `lib/mastery/levels.ts` / term `streak`), the plant was removed via `git checkout --`, and the verifier was re-run and confirmed `ALL PASS` before the Task 3 commit.

## Task Commits

1. **Task 1: Per-competency levels with declared thresholds** - `55b9f05` (feat) — `lib/mastery/levels.ts`
2. **Task 2: Daily and weekly goals computed from the ledger** - `80a73be` (feat) — `lib/study-plan/goals.ts`
3. **Task 3: Threshold boundaries, activity grouping, and the two absence guards** - `5faa4c7` (test) — `scripts/verify-levels-goals.ts`

## Files Created/Modified

- `lib/mastery/levels.ts` - `LEVELS`, `Level`, `LEVEL_THRESHOLDS`, `levelFor()`, `LevelResult`
- `lib/study-plan/goals.ts` - `GOAL_DEFAULTS`, `goalProgress()`, `GoalProgress`
- `scripts/verify-levels-goals.ts` - 43-check, 5-section battery; no `DATABASE_URL`/`OPENAI_API_KEY` required

## Decisions Made

See `key-decisions` in frontmatter: threshold derivation from the rubric's own normalization (tagged PROVISIONAL for 21-20); the weekly-goal asymmetry as the deliberate non-punitive answer to "why no streaks"; the timezone-offset-correction bug caught and fixed before writing the verifier; the comment-and-string-stripping approach (plus one narrow documented exclusion) chosen over word-boundary matching so the guard still catches a term embedded in a camelCase identifier; and the literal guard-bite proof via a planted-then-removed violation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Timezone-offset-correction algorithm in `goals.ts` produced a wrong local-midnight instant**
- **Found during:** Task 2, manually exercising `goalProgress` against the plan's own stated test values (a Friday 23:30 UTC `now` in `America/New_York`) before writing the verifier
- **Issue:** The first draft derived the zone's UTC offset using only date-level `Intl.DateTimeFormat` parts (no hour/minute/second), which under-constrained the correction and produced a `daily.windowStart` a full day ahead of `now` (`2026-10-17T00:00:00Z` instead of the correct `2026-10-16T04:00:00Z`) — the daily window would have excluded everything.
- **Fix:** Rewrote the correction to read a full date+time wall-clock reading (`localWallClockAsUtcMs`) at a naive guess instant, derive the actual UTC offset from that reading, and apply the correction once (`localMidnightUtc`). Verified against the plan's exact Friday/Thursday/Monday/Sunday test instants.
- **Files modified:** `lib/study-plan/goals.ts`
- **Verification:** Re-ran the manual exercise (correct instants for all four labelled cases) and the full Section 2/3 battery after Task 3 was written (all pass).
- **Committed in:** `80a73be` (caught before the Task 2 commit, not a separate fix commit)

**2. [Rule 1 - Bug] `/* */` literal inside a doc-comment prematurely closed that comment**
- **Found during:** Task 3, first `tsc --noEmit` after writing `stripComments`'s own documentation
- **Issue:** The doc comment describing what the function strips literally wrote `` /* */ `` as an example, which closed the enclosing `/** ... */` block early and left the rest of the comment's lines as invalid top-level syntax (multiple `TS1005`/`TS1434` errors).
- **Fix:** Reworded the comment to say "slash-star block comments" instead of using the literal delimiter sequence.
- **Files modified:** `scripts/verify-levels-goals.ts`
- **Verification:** `npx tsc --noEmit` clean afterward.
- **Committed in:** `5faa4c7` (caught before the Task 3 commit, not a separate fix commit)

**3. [Rule 1 - Bug] Plain substring matching on the no-unlocking guard false-positived on a pre-existing, unrelated field name and string**
- **Found during:** Task 3, first run of the Section 5 guard
- **Issue:** `lib/study-plan/path.ts`'s existing error message `` `(locked by 21-CONTEXT.md)` `` (a string literal describing a numeric step-count bound being fixed by a product decision) and `lib/mastery/weights.ts`'s existing `locked_by` field name (recording which decision fixed a weight ordering) both contain the substring "locked" and both predate this plan, outside its `files_modified` and the shared-working-tree protocol's ownership boundary — they could not be reworded.
- **Fix:** Extended the stripper to also strip string literals (fixing the `path.ts` case entirely, since that occurrence was inside a template string) and added one narrow, documented exclusion of the literal substring `locked_by` before matching (fixing the `weights.ts` case). Both exclusions are scoped to the exact pre-existing collision and do not weaken the guard's ability to catch a real `isUnlocked`/`locked:`/`streak`-shaped addition — confirmed by the guard-bite proof (see Accomplishments).
- **Files modified:** `scripts/verify-levels-goals.ts`
- **Verification:** Re-ran the full battery (`ALL PASS`, 43/43) and the guard-bite proof (planted violation correctly failed; removal correctly passed).
- **Committed in:** `5faa4c7` (caught before the Task 3 commit, not a separate fix commit)

---

**Total deviations:** 3 auto-fixed (2 bugs caught before their respective task commits landed, 1 bug — the timezone offset — caught during manual exercise before the verifier was even written).
**Impact on plan:** No scope creep; all three are correctness fixes within the plan's own three files. No behavior outside `levels.ts`/`goals.ts`/`verify-levels-goals.ts` was touched.

## Issues Encountered

None beyond the three auto-fixed items above. `npx tsc --noEmit` is clean project-wide (ignoring a pre-existing, unrelated `.next/types/validator.ts` build-artifact error that was not reproducible on a clean re-run and is outside this plan's scope). `scripts/verify-mastery-thinness.ts` and `scripts/verify-next-step.ts` were both re-run after this plan's changes and remain `ALL PASS`, unchanged.

## User Setup Required

None - no external service configuration required. This plan is pure TypeScript with no database read, no model call, and no new dependency. `scripts/verify-levels-goals.ts` was run and confirmed to pass with no `DATABASE_URL`/`OPENAI_API_KEY` set.

## Requirement Status

REQ-119 reads: "Per-competency levels with declared thresholds and daily/weekly
goals with declared defaults exist. Streaks and unlocking exist NOWHERE in the
surface, proven by a negative guard."

The mechanical half is now genuinely true: `lib/mastery/levels.ts` and
`lib/study-plan/goals.ts` exist with declared, PROVISIONAL-tagged thresholds
and defaults, and `scripts/verify-levels-goals.ts` proves streaks and unlocking
exist nowhere across the walked `lib/mastery`, `lib/study-plan`,
`components/mastery`, `components/study-plan` surface — with the guard
additionally proven to bite via a planted-then-removed violation, not merely
asserted to work.

But REQ-119's text says these mechanics "exist" and that the rejected two
"exist NOWHERE IN THE SURFACE" — and no student can see a level or a goal
anywhere yet. This plan ships no `app/` or `components/` files (by its own
frontmatter `files_modified` scope); nothing calls `levelFor` or
`goalProgress` from a route or a component. That student-visible half is
21-18's job (wave 7), the same deferral 21-13 made for REQ-105's "SHOWN"/
"flagged" language.

Per this plan's explicit instruction, REQ-119 is left **Pending** in
`.planning/REQUIREMENTS.md` — both the definition checkbox (line 867) and the
Traceability row (line 975) already agree at Pending, so no edit was made to
that file. It should be marked Complete only once 21-18 (or whichever plan
ships the rendering surface) proves a level and a goal actually render where
a student can see them.

## Next Phase Readiness

`levelFor`, `LEVELS`, `LEVEL_THRESHOLDS`, `Level`, `LevelResult` and
`goalProgress`, `GOAL_DEFAULTS`, `GoalProgress` are ready for 21-18 (the
surface that will close REQ-105, REQ-119, and REQ-120 together by rendering
mastery, level, and goal progress to a student) and 21-20 (the calibration
table that collects every PROVISIONAL-tagged figure across the phase,
including this plan's `LEVEL_THRESHOLDS` and `GOAL_DEFAULTS`). Only
`lib/mastery/levels.ts`, `lib/study-plan/goals.ts` and
`scripts/verify-levels-goals.ts` were touched; confirmed via `git status
--short` and explicit pathspecs on every commit, alongside a concurrent
sibling executor on 21-24.
`.planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` was not
touched. `npx tsc --noEmit` is clean project-wide; `scripts/verify-mastery-
thinness.ts` and `scripts/verify-next-step.ts` are unchanged at `ALL PASS`.
No blockers.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: `lib/mastery/levels.ts`
- FOUND: `lib/study-plan/goals.ts`
- FOUND: `scripts/verify-levels-goals.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-17-SUMMARY.md`
- FOUND: commit `55b9f05` (Task 1)
- FOUND: commit `80a73be` (Task 2)
- FOUND: commit `5faa4c7` (Task 3)
