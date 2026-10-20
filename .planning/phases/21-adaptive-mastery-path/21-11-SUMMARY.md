---
phase: 21-adaptive-mastery-path
plan: 11
subsystem: study-plan
tags: [knowledge-checks, grading, mastery-ledger, tdd, prisma-transaction]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "CONTRIBUTION_SOURCES/CONTRIBUTION_WEIGHTS/normalizeRubricScore/weightForSource and recordContributions/validateContributionInputs (21-05); CHECK_FORMATS, validateCheckPayload/validateAnswerKey, isDeterministicFormat, CONTRIBUTION_SOURCE_FOR_FORMAT (21-06)"
provides:
  - "gradeDeterministic(), gradeRewriteWithModel(), submitAndGrade(), REWRITE_GRADING_SCHEMA, DeterministicGrade in lib/study-plan/checks/grade.ts"
  - "A per-format grading battery (scripts/verify-check-grading.ts) including a THROWING callModel-stub proof that a closed format never reaches a model"
affects: [21-15, 21-22, 21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable callModel parameter (same shape convention as lib/study-plan/generate.ts's attemptGeneration), so a grading battery needs no OPENAI_API_KEY"
    - "Negative routing proof: a model-call stub that THROWS if invoked, used to prove a closed format's submission path never reaches it — stronger than asserting only the happy path"
    - "Batch-form prisma.$transaction([...]) with pre-generated UUIDs, used instead of an interactive transaction, because the write needed to reuse lib/mastery/ledger.ts's own validation/weight-snapshot rules without breaking atomicity with the attempt write"

key-files:
  created:
    - lib/study-plan/checks/grade.ts
    - scripts/verify-check-grading.ts
  modified: []

key-decisions:
  - "recordContributions (lib/mastery/ledger.ts) hardcodes the module-level `prisma` singleton with no injectable client/tx parameter, so it cannot participate in the SAME Prisma transaction as the KnowledgeCheckAttempt write. Rather than edit ledger.ts (out of this plan's files_modified) or sacrifice the one-transaction invariant, submitAndGrade reuses recordContributions's own validation rule (validateContributionInputs, imported) and weight-snapshot rule (weightForSource, imported) directly, and writes both the attempt and the contribution via Prisma's BATCH $transaction([...]) array form — which only accepts direct PrismaPromise expressions, not a wrapped async function call, hence the two rows are constructed inline rather than via a call to recordContributions() itself."
  - "Pre-generated UUIDs (node:crypto randomUUID()) for both the attempt and contribution rows, created before the transaction, so the contribution's sourceAttemptId can reference the attempt's id without needing the attempt's auto-generated id back out of a nested write inside the SAME batch call."
  - "A failed model grade (gradeRewriteWithModel returning { ok: false, reason }) throws RewriteGradingFailedError from submitAndGrade BEFORE any database write — no attempt row, no contribution row — rather than persisting a pending/partial grading state. The plan's behavior spec did not require a pending state for this plan, and this keeps the invariant 'an attempt always has exactly one contribution' trivially true with no window for a half-graded row."
  - "gradeDeterministic's MULTIPLE_CHOICE/PICK_BETTER_RESPONSE throw-on-malformed-response path is driven by range/integer checks against the payload's own option/candidate count, not a hardcoded 0..3 or 0..1 literal, so it generalizes correctly if LIMITS.mcOptionCount ever changes."
  - "The CHECK_DETERMINISTIC > CHECK_MODEL_GRADED ordering guard is deliberately duplicated at module load in grade.ts (in addition to 21-05's own verifier) per the plan's explicit instruction — this is the file that would be edited if someone decided a rewrite should count the same as a deterministic answer."

patterns-established:
  - "Pattern: a model-graded check's grading function accepts an injectable callModel parameter with a default real-OpenAI implementation, matching lib/study-plan/generate.ts's attemptGeneration — so a battery never needs OPENAI_API_KEY, and a negative test can install a THROWING stub to prove a code path that must never call the model."
  - "Pattern: when a ledger-writing helper cannot accept a transaction-scoped client, reuse its pure validation/derivation helpers directly rather than either editing the helper out-of-scope or sacrificing atomicity — document the substitution in the caller's own doc comment."

requirements-completed: [REQ-111]

# Metrics
duration: ~35min
completed: 2026-10-20
---

# Phase 21 Plan 11: Knowledge-Check Grading (Deterministic + Model) Summary

**`lib/study-plan/checks/grade.ts` ships `gradeDeterministic` (pure, no model call, partial credit on fill-in-the-blank), `gradeRewriteWithModel` (injectable-model rubric grading normalized through 21-05's `normalizeRubricScore`), and `submitAndGrade` (ownership-scoped, routes on format, writes the attempt and exactly one `MasteryContribution` at the format's own weight class in one transaction) — proven by a battery whose strongest assertion installs a model-call stub that THROWS, confirming a closed-format answer never reaches it.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-10-20
- **Tasks:** 1 (TDD: RED then GREEN)
- **Files created:** 2

## Accomplishments

- `gradeDeterministic(format, payload, answerKey, response)` grades MULTIPLE_CHOICE and PICK_BETTER_RESPONSE as binary (0/1), and FILL_IN_BLANK with per-blank partial credit (`blanksCorrect / blankCount`), never calling a model. It throws (does not mark wrong) on an out-of-range, non-integer, or missing index — an unanswerable submission is treated as a client bug, not a graded failure — and throws if called with `REWRITE_WEAK_LINE`.
- FILL_IN_BLANK's normalization (NFC, trim, collapse internal whitespace, case-fold) is documented as a deliberate departure from `lib/study-plan/verbatim.ts`'s verbatim-only rule, with no stemming, no approximate-distance scoring, and no substring/superstring acceptance — proven by a negative case (a superstring of the correct answer is still graded incorrect).
- `gradeRewriteWithModel` takes an injectable `callModel`, asks for a `score` (1..5) plus a per-criterion boolean array via `REWRITE_GRADING_SCHEMA` (`strict: true`), rejects (never clamps) an out-of-range score or a `criteriaMet` length mismatch, and normalizes through the imported `normalizeRubricScore` — confirmed a floor score of 1 contributes exactly 0, not 20% credit.
- `submitAndGrade` loads the check scoped by `{ id, userId }` in the WHERE clause, routes on `isDeterministicFormat`, and writes the `KnowledgeCheckAttempt` plus exactly one `MasteryContribution` — at `CONTRIBUTION_SOURCE_FOR_FORMAT(format)`'s weight class — in a single Prisma transaction. A second submission for the same check throws a named `AlreadyAnsweredError` (P2002 caught, not surfaced raw); a cross-user attempt throws `CheckNotFoundError`.
- `scripts/verify-check-grading.ts`'s strongest assertion (Section 7b, inside the DB-gated Section 7): calling `submitAndGrade` on a `MULTIPLE_CHOICE` check with a `callModel` stub that **throws if invoked at all** — the submission succeeds and the stub never fires, mechanically proving a closed format cannot reach a model, rather than merely asserting the happy path.
- The DB-gated section (Section 7, 24 checks) **ran** against the local `DATABASE_URL`, not SKIP — round-tripping all four formats, the ownership gate, the already-answered gate, and a failed-model-grade case that confirmed NO attempt and NO contribution are written when grading fails.

## Task Commits

Each task was committed atomically, with an explicit pathspec on every `git commit` (four sibling executors shared this git index):

1. **Task 1 RED — failing grading battery** — `acabd78` (test) — `scripts/verify-check-grading.ts`
2. **Task 1 GREEN — deterministic + model grading** — `5149cc8` (feat) — `lib/study-plan/checks/grade.ts`

**Plan metadata:** (this commit) — `docs(21-11): complete knowledge-check grading plan`

## Files Created/Modified

- `lib/study-plan/checks/grade.ts` (~460 lines) — `gradeDeterministic`, `gradeRewriteWithModel`, `submitAndGrade`, `REWRITE_GRADING_SCHEMA`, `DeterministicGrade`, `AlreadyAnsweredError`, `CheckNotFoundError`, `RewriteGradingFailedError`. Zero Prisma import reachable from `gradeDeterministic`'s own call path.
- `scripts/verify-check-grading.ts` (~770 lines) — Sections 1-6 pure (no `DATABASE_URL`, no `OPENAI_API_KEY`); Section 7 database-gated, prints explicit `SKIP` lines when `DATABASE_URL` is absent, ran for real this execution.

## Decisions Made

See `key-decisions` in frontmatter. In short: `recordContributions`'s hardcoded `prisma` singleton cannot join the attempt write's transaction, so `submitAndGrade` reuses its validation/weight-snapshot rules directly and writes both rows via a batch `$transaction([...])` with pre-generated UUIDs; a failed model grade writes nothing at all rather than a pending row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comment tripped its own grep verification gate**
- **Found during:** Task 1 GREEN verification (`grep -c 'levenshtein\|fuzzy\|includes(' lib/study-plan/checks/grade.ts`)
- **Issue:** The module's own explanatory doc comment about FILL_IN_BLANK normalization used the literal words "fuzzy/Levenshtein distance" and "substring matching" while explaining what is NOT permitted — the verification grep matched those words in the comment itself, returning 1 instead of the required 0. Same shape of defect 21-06-SUMMARY.md disclosed for its own grep gate.
- **Fix:** Reworded to "approximate-distance scoring" and "a superstring/partial-text match", preserving the explanation without the literal grepped substrings.
- **Files modified:** `lib/study-plan/checks/grade.ts`
- **Verification:** Re-ran the grep (0 matches), re-ran the full battery (`ALL PASS`, exit 0), re-ran `npx tsc --noEmit` (clean).
- **Commit:** Folded into `5149cc8` (the GREEN commit landed after this fix).

---

**Total deviations:** 1 auto-fixed (1 bug, cosmetic — no behavioral code was affected).
**Impact on plan:** None on scope.

One additional disclosed **design substitution**, not a bug: the plan's `key_links` names `recordContributions` as the function `submitAndGrade` writes the contribution through. Because `recordContributions` has no injectable Prisma client and therefore cannot share a transaction with the attempt write, `submitAndGrade` instead calls `recordContributions`'s own exported validation helper (`validateContributionInputs`) and the same weight-snapshot rule (`weightForSource`) directly, and performs both writes via `prisma.$transaction([...])` (batch form). Every invariant `recordContributions` enforces (full-batch validation before any write, weight snapshotted at write time) is preserved; only the literal function call is not reused, because reusing it would have required either breaking the one-transaction requirement or editing `lib/mastery/ledger.ts`, which is outside this plan's `files_modified`. See `key-decisions` above.

## Issues Encountered

None beyond the disclosed items above.

## User Setup Required

None — `DATABASE_URL` was already configured for local dev and no new environment variable was introduced. `REWRITE_GRADING_MODEL` is read with a `gpt-4.1` fallback (matching `STUDY_PLAN_MODEL`'s convention in `lib/study-plan/generate.ts`); setting it is optional, not required for this plan's own verification, which never calls a real model.

## Requirements Note

`REQ-111` is included in `requirements: [REQ-111]` and marked complete by this plan — its full text ("the three closed formats are graded deterministically... the rewrite format reaches a model grader... recorded at the model-graded weight") is fully implemented and proven here, unlike 21-06's deliberate partial-completion of REQ-108.

## Next Phase Readiness

- `submitAndGrade` is ready for 21-22 (the student-facing answer route) to call directly; its `GradeOutcome` return shape carries only explanatory `detail` text, never the raw `AnswerKey`, which is what 21-22's "the key never reaches the browser" assertion depends on.
- 21-15 (grading contest) can read `KnowledgeCheckAttempt.gradedBy`/`graderModel` to distinguish a deterministic mark from a model judgement when deciding what a contest is challenging; this plan deliberately did not touch `GradingContest`.
- No blockers identified for downstream plans.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/checks/grade.ts`
- FOUND: `scripts/verify-check-grading.ts`
- FOUND: commit `acabd78` (RED)
- FOUND: commit `5149cc8` (GREEN)
- `npx tsc --noEmit` clean
- `npx tsx scripts/verify-check-grading.ts` exit 0, ALL PASS (DB-gated Section 7 ran, not SKIP)
- `npx tsx scripts/verify-mastery-weights.ts` exit 0, unchanged
- `grep -c 'levenshtein\|fuzzy\|includes(' lib/study-plan/checks/grade.ts` returns 0
