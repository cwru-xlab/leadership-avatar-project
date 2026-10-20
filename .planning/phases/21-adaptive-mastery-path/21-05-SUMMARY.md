---
phase: 21-adaptive-mastery-path
plan: 05
subsystem: lib
tags: [typescript, mastery-model, ledger, prisma, weights]

requires: ["21-02", "21-03"]
provides:
  - "lib/mastery/weights.ts — CONTRIBUTION_SOURCES, CONTRIBUTION_WEIGHTS, WEIGHT_ORDERING_CONSTRAINTS, weightForSource(), normalizeRubricScore(), MASTERY_WINDOW_DAYS, MASTERY_SCALE"
  - "lib/mastery/ledger.ts — recordContributions(), reverseContribution(), readContributions(), validateContributionInputs()"
  - "scripts/verify-mastery-weights.ts — ordering-constraint guard proven to bite against the real file, plus normalizer/validation round-trips"
affects: [adaptive-mastery-path, knowledge-checks, coached-practice, path-engine]

tech-stack:
  added: []
  patterns:
    - "Locked ORDERING expressed as checkable data (WEIGHT_ORDERING_CONSTRAINTS), not just prose — a verifier iterates the constraint list rather than hardcoding comparisons, so a reversed number fails mechanically"
    - "violations()-style shared helper so a verifier's real-data assertion and its synthetic inverted case run through identical logic (same pattern as 21-02's findUnmapped())"
    - "Validate-the-whole-batch-before-any-write, with validation factored into a standalone exported function so a verifier can prove it with no database"
    - "Weight SNAPSHOT at write time, never looked up at read time — retuning a weight must not rewrite a figure the student already saw"
    - "Single-source scale-conversion formula (normalizeRubricScore), enforced by a verifier that greps the rest of lib/ for the formula text"

key-files:
  created:
    - lib/mastery/weights.ts
    - lib/mastery/ledger.ts
    - scripts/verify-mastery-weights.ts
  modified: []

key-decisions:
  - "Weight numbers set as PROVISIONAL UNTIL CALIBRATED: LIVE_SESSION 1.00 (anchor), CHECK_DETERMINISTIC 0.45 (narrow recall, under half a session), COACHED_SESSION 0.40 (whole session but scaffolded, sits just below the check because the scaffolding is what's being tested without), CHECK_MODEL_GRADED 0.20 (floor — the grade is itself a judgement call). Ordering locked by 21-CONTEXT.md; numbers are discretion."
  - "WEIGHT_ORDERING_CONSTRAINTS is a data array (greater/lesser/locked_by), not inline comparisons, so the two locked orderings (CHECK_DETERMINISTIC > CHECK_MODEL_GRADED; LIVE_SESSION > COACHED_SESSION) are verifier-checkable and traceable to the exact 21-CONTEXT.md sentence that locks each."
  - "normalizeRubricScore placed in weights.ts (not ledger.ts, not a separate module) per the plan's own reasoning: it lives alongside every other number this phase introduces, and both 21-11 and 21-21 can import it without depending on each other or on this plan's ledger."
  - "validateContributionInputs extracted as its own exported function (not inlined in recordContributions) specifically so the verifier's round-trip assertions (bad rawScore, unknown competencyKey) run without any database connection reachable."

requirements-completed: []
requirements-partial: ["REQ-107"]

duration: ~20min
completed: 2026-10-20
---

# Phase 21 Plan 05: Mastery Weight Table and Contribution Ledger Summary

**Single append-only `MasteryContribution` ledger with a weight table whose two 21-CONTEXT.md-locked orderings are enforced as checkable data, proven to fail when reversed — plus the one `normalizeRubricScore` every later plan in this phase must import rather than restate**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-20T15:05Z (approx)
- **Completed:** 2026-10-20T15:25:37Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `lib/mastery/weights.ts` declares `CONTRIBUTION_SOURCES`/`ContributionSource` (the four strings `MasteryContribution.source` accepts, code-enforced per 21-03's schema comment, no Prisma import), `CONTRIBUTION_WEIGHTS` with a per-number rationale block and a `PROVISIONAL UNTIL CALIBRATED` marker (Phase 20 convention), `WEIGHT_ORDERING_CONSTRAINTS` as a data array carrying the exact 21-CONTEXT.md sentence that locks each ordering, `weightForSource()` which throws on an unknown source instead of defaulting, `MASTERY_WINDOW_DAYS`/`MASTERY_SCALE`, and the single `normalizeRubricScore()` every later competency-mapping consumer in this phase must import.
- `lib/mastery/ledger.ts` ships `recordContributions()` (validates the whole batch before any write via an exported `validateContributionInputs()`, snapshots `weightForSource(source)` into each row, one `createMany`), `reverseContribution()` (sets `reversedAt`/`reversedReason`, never deletes, throws on a double reversal), and `readContributions()` (excludes reversed rows by default, windows on `occurredAt` never `createdAt`, returns a narrow row interface rather than the raw Prisma model).
- `scripts/verify-mastery-weights.ts` runs 8 sections with no `DATABASE_URL` required: both locked orderings hold strictly; sources and weights are the same set in both directions; every weight is in `(0,1]`; `LIVE_SESSION` is the max; the ordering guard is proven non-vacuous via an inverted assertion (`CHECK_MODEL_GRADED: 0.9, CHECK_DETERMINISTIC: 0.2`) through a shared `violations()` helper; `validateContributionInputs` round-trips a bad `rawScore` and an unknown `competencyKey` with no database reachable; `normalizeRubricScore` endpoints (`1→0`, `5→1`, `3→0.5`, and `0`/`6`/`NaN`/`Infinity` all throw) plus a `lib/`-wide text scan confirming no other file restates `(score - 1) / 4`; and the `PROVISIONAL UNTIL CALIBRATED` string is present.
- The ordering guard was proven to bite against the real file, not just the inverted-table unit test inside the script: temporarily set `CHECK_DETERMINISTIC: 0.1` / `CHECK_MODEL_GRADED: 0.9` directly in `lib/mastery/weights.ts`, reran the verifier (sections 1 and 5's sanity re-check both FAIL, 2 failures, exit 1), restored the original file (confirmed byte-identical via `git diff`), reran (ALL PASS, exit 0).
- With `DATABASE_URL` set (the local dev DB, migrated per the plan-specific note), manually round-tripped `recordContributions` → `readContributions` → `reverseContribution` → `readContributions` against a real `User` row and the real `MasteryContribution` table: weight was snapshotted into the written row (`weight: 1` for `LIVE_SESSION`), the reversed row was excluded from the default read, and a second `reverseContribution` call on the same id threw. Test row cleaned up afterward via a direct `prisma.masteryContribution.delete` from the smoke script (not through the ledger, which never deletes).

## Task Commits

Each task was committed atomically, with an explicit pathspec per the shared-working-tree protocol:

1. **Task 1: Declare the weight table and its ordering constraints** - `91af45b` (feat)
2. **Task 2: Build the append-only contribution ledger** - `cd656ff` (feat)
3. **Task 3: Verify the ordering constraints, with an inverted assertion** - `94d1d6c` (test)

## Files Created/Modified

- `lib/mastery/weights.ts` - `CONTRIBUTION_SOURCES`, `ContributionSource`, `CONTRIBUTION_WEIGHTS`, `WEIGHT_ORDERING_CONSTRAINTS`, `weightForSource()`, `MASTERY_WINDOW_DAYS`, `MASTERY_SCALE`, `normalizeRubricScore()`
- `lib/mastery/ledger.ts` - `ContributionInput`, `MasteryContributionRow`, `validateContributionInputs()`, `recordContributions()`, `reverseContribution()`, `readContributions()`
- `scripts/verify-mastery-weights.ts` - 8-section verifier (`check()` counter pattern matching `verify-competency-catalog.ts`), `violations()` helper shared between the real-table and inverted-table assertions

## Decisions Made

- Weight numbers and their per-number rationale are recorded inline in `lib/mastery/weights.ts`'s block comment (see key-decisions above) — a future calibration pass can grep `PROVISIONAL UNTIL CALIBRATED` to find exactly what to revisit.
- Kept `validateContributionInputs` as a standalone exported function rather than inlining it in `recordContributions`, specifically so Task 3's no-database round-trip assertion is reachable — this mirrors the plan's own fallback instruction ("If validation cannot be reached without a client, extract it into an exported `validateContributionInputs()`").
- `normalizeRubricScore` lives in `weights.ts` per the plan's explicit placement decision, not in `ledger.ts` or a separate module — so 21-11 and 21-21 (both wave 3) can each import it without depending on each other.

## Deviations from Plan

None — plan executed exactly as written. All three artifacts, all exports, both ordering constraints, and the inverted-assertion proof match the plan's specification.

## REQ-107 Status (deliberately left open)

REQ-107 is claimed by four plans in this phase (21-05, 21-16, 21-20, 21-21) and
its full text requires a student-observable end-to-end behavior: "a completed
practice session whose report reaches READY writes `LIVE_SESSION`
contributions for every competency that report scored." This plan ships the
ledger and weight table that behavior depends on — the mechanism, not the
wiring into live-session report completion (21-20's job) or the
report-to-competency mapper (21-21's job) or the coached-session contribution
(21-16's job). `REQUIREMENTS.md`'s REQ-107 checkbox is intentionally left
unchecked by this plan; `requirements mark-complete REQ-107` was not run here.
The exact same "ships the mechanism, not the full wiring" boundary 20-01 drew
for REQ-96/hostility applies.

## Issues Encountered

None. `npx tsc --noEmit` was clean after every task. The one live-DB smoke test (not part of the plan's own verify steps, run to satisfy this execution's plan-specific note that DB-gated sections must actually run) required no code changes — `recordContributions`/`readContributions`/`reverseContribution` worked against the real schema on the first attempt.

## User Setup Required

None - no external service configuration required. The local dev database was already migrated per this execution's plan-specific context.

## Next Phase Readiness

`lib/mastery/weights.ts` and `lib/mastery/ledger.ts` are ready for 21-09 (mastery computation, consumes `readContributions`/`MASTERY_WINDOW_DAYS`/`MASTERY_SCALE`), 21-11 (model-graded rewrite grader, consumes `normalizeRubricScore` and writes `CHECK_MODEL_GRADED`/`CHECK_DETERMINISTIC` contributions), 21-16 (coached session contributions, `COACHED_SESSION`), and 21-21 (report-to-competency mapper, consumes `normalizeRubricScore`). `normalizeRubricScore` is exported by name and the verifier's text scan confirms it is not restated anywhere else in `lib/`. Only `lib/mastery/weights.ts`, `lib/mastery/ledger.ts`, and `scripts/verify-mastery-weights.ts` were touched — confirmed by each task's individual commit and the explicit-pathspec protocol observed throughout, alongside three concurrent sibling executors (21-06, 21-07, 21-08) working the same shared tree.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

All claimed files and commits verified present on disk / in git history.
