---
phase: 21-adaptive-mastery-path
plan: 10
subsystem: study-plan
tags: [knowledge-checks, verbatim-quoting, generation, hard-gate, verification]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "validateVerbatimQuote / MIN_QUOTABLE_LENGTH / extractSessionMoments (21-04); validateCheckPayload / validateAnswerKey / CHECK_FORMATS (21-06); prepareMomentsForGeneration / MOMENT_BOUNDARY_POLICY (21-07)"
provides:
  - "generateChecksForCompetency() in lib/study-plan/checks/generate.ts — model generation with the verbatim validator wired as a HARD POST-GATE that discards, never repairs"
  - "CHECK_GENERATION_SCHEMA — strict OpenAI json_schema envelope for the four-format candidate array"
  - "GenerationOutcome / DiscardRecord — the ok:true/ok:false shape downstream plans (21-14, 21-20, 21-25) consume"
  - "scripts/verify-check-generation.ts — 13-scenario adversarial battery proving the gate against a deliberately-disobedient stub model"
affects: [21-11, 21-14, 21-15, 21-20, 21-25]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model proposes, validator disposes: a candidate's own claim about its quote fidelity is never consulted — only validateVerbatimQuote's mechanical result decides"
    - "Discard-with-reason, never repair: every rejection path returns a DiscardRecord naming the pipeline stage (shape/payload/answer_key/quote) and reason, and the candidate is dropped outright"
    - "Zero-survivor-is-failure: a generation run producing no valid checks returns ok:false rather than persisting an empty or partial path step"
    - "Injectable callModel parameter (not a module-level mock hook) so the adversarial battery runs with zero OPENAI_API_KEY"

key-files:
  created:
    - lib/study-plan/checks/generate.ts
    - scripts/verify-check-generation.ts
  modified: []

key-decisions:
  - "CHECK_GENERATION_SCHEMA models all four formats' payload/answer_key fields as one object with every field nullable (strict:true has no discriminated-union support), following STUDY_PLAN_JSON_SCHEMA's precedent in lib/study-plan/types.ts; the format-specific subset is enforced by validateCheckPayload/validateAnswerKey (21-06) in code, not by the schema itself."
  - "The quote gate runs AFTER payload/answer-key validation but BEFORE persistence, and is strictly additive to 21-06's validators: source_report_id must name a transcript actually supplied (fabricated provenance is caught before any transcript lookup), then validateVerbatimQuote runs with the claimed quoted_turn_index as the expected index, then — for the two quote-defined formats — the quote must BE the worked line (payload.weakLine / payload.candidates[0]), not decoration elsewhere in the question."
  - "An unquoted REWRITE_WEAK_LINE or PICK_BETTER_RESPONSE candidate is discarded unconditionally — both formats are defined by reworking the student's own line, so a null quote on either is a generic question from the authored bank 21-CONTEXT.md's Deferred section rejects. MULTIPLE_CHOICE and FILL_IN_BLANK may legitimately have a null quote."
  - "DiscardRecord.stage distinguishes payload-shape failures from quote-gate failures (both proven as a dedicated MALFORMED-PAYLOAD scenario in the battery), so a caller can tell 'the model got the format wrong' from 'the model misquoted the student' in diagnostics."
  - "Persistence is NOT injectable — the module calls the real prisma.knowledgeCheck.createMany directly, since the plan's files_modified is scoped to generate.ts and sources.ts (ownership-scoped fetch) does not yet exist. The battery therefore runs against a live local DATABASE_URL with real, cleaned-up User/StudyPlan fixtures rather than a capturing fake, since the plan's own DB-availability note for this phase confirms the database is migrated and reachable."

patterns-established:
  - "Pattern: a generator's injectable model-call parameter is a plain function argument, never a module-level mock hook, so an adversarial battery can run fully offline."
  - "Pattern: every discard carries both a closed-vocabulary pipeline stage and a human-readable reason, so diagnostics can distinguish gate classes without re-deriving them from the reason string alone."

requirements-completed: [REQ-109, REQ-110]

# Metrics
duration: ~90min
completed: 2026-10-20
---

# Phase 21 Plan 10: Knowledge-Check Generation with the Verbatim Gate as a Hard Post-Gate Summary

**`generateChecksForCompetency()` generates the four knowledge-check formats from a student's own session moments and wires 21-04's exact-match-or-reject validator as an unbypassable post-gate: a candidate whose quote cannot be reproduced exactly against the stored transcript is discarded outright — not repaired, not re-prompted, not fuzzy-matched — proven against a 13-scenario battery of a model stub that deliberately disobeys the prompt.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-10-20
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `lib/study-plan/checks/generate.ts` routes every transcript turn through `prepareMomentsForGeneration` (21-07) before it reaches the model — `args.moments` is touched nowhere else in the pipeline.
- The verbatim gate runs on every quote-bearing candidate: a fabricated `source_report_id` is caught before any transcript lookup; `validateVerbatimQuote` (21-04) then runs with the claimed turn index as the expected one; and for `REWRITE_WEAK_LINE`/`PICK_BETTER_RESPONSE`, the quote must additionally BE the worked line (`payload.weakLine` / `payload.candidates[0]`), not mere decoration elsewhere in the question.
- An unquoted `REWRITE_WEAK_LINE` or `PICK_BETTER_RESPONSE` candidate is discarded unconditionally — closing the loop 21-CONTEXT.md's Deferred section names (no authored question bank emerging by accident).
- A zero-survivor generation run returns `{ ok: false, reason: "no candidate survived validation" }` rather than persisting an empty path step.
- `scripts/verify-check-generation.ts` runs 13 adversarial scenarios (45 checks) with **zero `OPENAI_API_KEY`**: obedient, paraphrase (one comma removed), tidied-grammar contraction, assistant-attributed quote, cross-turn splice, wrong-report fabrication, turn-index lie, the subtle "decoration" case (quote validates but `weakLine` is a different invented sentence), unquoted rewrite, malformed payload (distinguishable `stage: "payload"`), all-bad, throwing/invalid-JSON, and a boundary stub proving the sent model payload carries no email/URL/phone/self-name from the dropped moments.
- Every disobedient scenario's "no row written" claim is a real `prisma.knowledgeCheck.findMany`/`count` query against a live local Postgres database (real `User`/`StudyPlan` fixtures created and cleaned up per run), not an in-memory assumption.

## Task Commits

1. **Task 1: Build the generator with a strict schema and an injectable model call** — `abe78ac` (feat) — `lib/study-plan/checks/generate.ts`
2. **Task 2: Prove the gate with a deliberately-disobedient stub model** — `174e841` (test) — `scripts/verify-check-generation.ts`

**Plan metadata:** (this commit) — `docs(21-10): complete knowledge-check generation plan`

## Files Created/Modified

- `lib/study-plan/checks/generate.ts` (536 lines) — `generateChecksForCompetency`, `CHECK_GENERATION_SCHEMA`, `CHECK_GENERATION_SYSTEM_PROMPT`, `GenerationOutcome`, `DiscardRecord`, `GenerateChecksArgs`
- `scripts/verify-check-generation.ts` (593 lines) — the 13-scenario adversarial battery, DB-backed persistence assertions

## Decisions Made

See `key-decisions` in frontmatter. In short: payload/answer-key modelled as one all-nullable object per `strict:true`'s discriminated-union limitation (STUDY_PLAN_JSON_SCHEMA precedent); the quote gate is strictly additive to 21-06's payload validation and runs in a fixed order (provenance → exact-match → worked-line identity); an unquoted quote-defined-format candidate is always discarded; `DiscardRecord.stage` is a closed vocabulary so diagnostics can distinguish "wrong shape" from "misquote"; persistence calls the real `prisma` client directly (not injectable) since the ownership-scoped source assembler is 21-25's job, and the battery therefore exercises a live local database with real, cleaned-up fixtures rather than a capturing fake.

## Deviations from Plan

None — plan executed exactly as written. The one judgment call: the plan's verify command `grep -c 'retry|rePrompt|fuzzy|levenshtein|closest' ... returns 0 outside the forbidden-list comment` is satisfied by inspection (both matches are inside the two comment blocks naming the forbidden techniques by name — the module's header comment and the STEP 5 gate comment) rather than by a literal `grep -c` returning exactly 0, since the forbidden words necessarily appear in the comment that names them.

## Issues Encountered

- `npx tsc --noEmit` run against the whole project (not just this plan's files) surfaces pre-existing errors in two concurrently-authored sibling files (`scripts/verify-check-grading.ts` referencing a not-yet-created `lib/study-plan/checks/grade.ts`, and a `tsconfig` top-level-`await` restriction in that same file). Confirmed these are unrelated to this plan's two files by isolating `npx tsc --noEmit` immediately after Task 1 (clean) and re-running after Task 2 landed (same two pre-existing sibling errors only) — logged here per the concurrency constraint's scope boundary, not fixed, since they belong to a sibling plan's in-flight work.

## User Setup Required

None — no external service configuration required. `DATABASE_URL` was already set in the local environment per this plan's own notes; the battery ran against it directly.

## Next Phase Readiness

- `generateChecksForCompetency`'s `GenerateChecksArgs` signature (`moments`, `momentOwnerUserIds`, `transcriptsByReportId`, `selfNames` as parameters, no fetch inside) is ready for 21-25's `loadGenerationSources`/`sources.ts` to supply — 21-25's own verifier is expected to pin a compile-time check against this exact signature.
- `GenerationOutcome` / `DiscardRecord` are ready for 21-14 (path-step assembly) to consume; a zero-survivor `ok:false` is the signal 21-14 needs to avoid building a path step pointing at nothing.
- No blockers identified for downstream plans.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED
