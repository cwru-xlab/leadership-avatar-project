---
phase: 21-adaptive-mastery-path
plan: 04
subsystem: study-plan
tags: [tdd, verbatim-quoting, transcript-validation, pure-function]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "InterviewTranscript (lib/interview/transcript.ts) and StructuredReport/ReportGrowthArea (lib/report/structured.ts), both pre-existing"
provides:
  - "validateVerbatimQuote() — exact-match-or-reject quote validation against a stored InterviewTranscript, with a closed VERBATIM_REJECT_REASONS vocabulary"
  - "MIN_QUOTABLE_LENGTH — the shared 12-character quotability threshold, exported by name"
  - "extractSessionMoments() — student turns paired with the report growth areas whose timecode matches them"
  - "An adversarial battery (scripts/verify-verbatim-quote.ts) covering every ACCEPT/REJECT case, runnable with zero credentials"
affects: [study-plan-knowledge-checks, study-plan-coached-practice, 21-06, 21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collect-all-matches-before-deciding: a validator gathers every substring match across every turn before classifying the result, so ambiguity/role checks can't be short-circuited by the first hit"
    - "Closed vocabulary as `as const` array + derived type (matches FEEDBACK_SOURCES precedent in lib/report/structured.ts)"
    - "Named, shared threshold constant (MIN_QUOTABLE_LENGTH) imported rather than restated across two modules that must never drift apart"

key-files:
  created:
    - lib/study-plan/verbatim.ts
    - lib/study-plan/moments.ts
    - scripts/verify-verbatim-quote.ts
  modified: []

key-decisions:
  - "Normalization policy is NFC-only, documented as a block comment naming every rejected normalization (case folding, trimming, whitespace collapsing, smart-quote folding) by name, so none of them get quietly reintroduced as a 'fix'"
  - "SPANS_MULTIPLE_TURNS is detected only after confirming no single turn contains the whole quote, by checking every split point for a user-turn suffix matching a later user-turn prefix"
  - "Ambiguity is decided by distinct user TURN INDEX, not by raw match count, so a quote appearing twice within the same turn is not treated as ambiguous"
  - "extractSessionMoments does not import lib/mastery/ at all — competencyKeys is left empty for the caller to populate, keeping this module decoupled from the competency catalog"

patterns-established:
  - "Pure validators take all their inputs as arguments (no fetch, no model call) so adversarial batteries can run with zero environment variables"

requirements-completed: [REQ-110]

# Metrics
duration: ~25min
completed: 2026-10-20
---

# Phase 21 Plan 04: Verbatim Quote Validation & Session-Moment Extraction Summary

**A pure exact-match-or-reject validator (`validateVerbatimQuote`) and session-moment extractor (`extractSessionMoments`) that make "never misquote the student" mechanically enforceable, not just prompted.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-20T14:53:08Z
- **Tasks:** 1 (TDD: RED → GREEN → GREEN)
- **Files created:** 3

## Accomplishments
- `validateVerbatimQuote(quote, transcript, opts?)` rejects every near-miss class named in the plan — one character removed, case difference, trailing period, grammatically tidied contraction — with `NOT_FOUND_IN_ANY_TURN`, never a fuzzy/repaired match
- Role and ambiguity violations are distinguished: `FOUND_ONLY_IN_ASSISTANT_TURN` when the avatar (not the student) said it, `AMBIGUOUS_MULTIPLE_MATCHES` when two different student turns say the same thing, `SPANS_MULTIPLE_TURNS` when a quote is the concatenation of two separate moments
- `MIN_QUOTABLE_LENGTH` (12) is exported once from `verbatim.ts` and imported — never restated — by `moments.ts`
- `extractSessionMoments` only ever emits turns that independently pass `validateVerbatimQuote`, closing the loop between extraction and validation
- A growth area whose timecode matches no turn is proven, by test, to link to nothing — not to the nearest turn
- The full 22-check battery runs via `npx tsx scripts/verify-verbatim-quote.ts` with zero environment variables and no network/S3 access

## Task Commits

Genuine RED → GREEN → GREEN cycle, each committed individually:

1. **Task 1 (RED): add failing verbatim-quote battery** - `380a947` (test) — confirmed to fail (`MODULE_NOT_FOUND`, exit 1) before `lib/study-plan/verbatim.ts` existed
2. **Task 1 (GREEN, part 1): exact-match-or-reject verbatim quote validation** - `9bdc6dd` (feat) — `lib/study-plan/verbatim.ts`
3. **Task 1 (GREEN, part 2): session-moment extraction linked to report growth areas** - `32e6524` (feat) — `lib/study-plan/moments.ts`, battery now passes (22/22, exit 0)

**Plan metadata:** (this commit) — `docs(21-04): complete verbatim-quote validation plan`

## Files Created/Modified
- `lib/study-plan/verbatim.ts` — `validateVerbatimQuote`, `VerbatimQuoteResult`, `VERBATIM_REJECT_REASONS`, `MIN_QUOTABLE_LENGTH` (237 lines)
- `lib/study-plan/moments.ts` — `extractSessionMoments`, `SessionMoment` (89 lines)
- `scripts/verify-verbatim-quote.ts` — adversarial battery, two hand-built `InterviewTranscript` fixtures (442 lines)

## Decisions Made
- Kept the EMPTY_QUOTE emptiness check as a regex test (`/^\s*$/.test(quote)`) rather than `String.prototype.trim`, both to avoid literally weakening the match path and to satisfy the plan's own grep gate forbidding the literal substring `trim()` anywhere in the file
- Used two separate transcript fixtures in the battery: one carrying the duplicate-content pair and assistant-only phrase needed for the `validateVerbatimQuote` REJECT cases, and a second, duplicate-free transcript for `extractSessionMoments` tests — reusing one fixture for both would have made the extraction-side "every moment validates" assertion fail on the deliberately-ambiguous duplicate pair
- Rephrased one doc comment in `moments.ts` to avoid the literal substring `competencies` (while still describing why the mastery catalog module is not imported), since the plan's verification grep requires that substring's count to be exactly zero

## Deviations from Plan

None — plan executed exactly as written, including the RED→GREEN task-splitting it specified (RED commit for the battery, then two GREEN commits — `verbatim.ts` then `moments.ts`).

## Issues Encountered
- First GREEN pass left the literal substring `competencies` in a `moments.ts` doc comment (referencing `lib/mastery/competencies.ts` by path), which the verification grep `grep -c 'competencies' lib/study-plan/moments.ts` requires to be 0. Rephrased to reference "the mastery catalog module under `lib/mastery/`" instead, re-verified grep returns 0, re-ran the full battery and `tsc --noEmit` clean before the GREEN commit landed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `validateVerbatimQuote` and `MIN_QUOTABLE_LENGTH` are ready for 21-06 (knowledge-check generation) to import directly, as instructed in this plan's notes
- `MIN_QUOTABLE_LENGTH`'s name is stable for 21-20's calibration table to reference
- `extractSessionMoments` is ready for a caller to populate `competencyKeys` once the competency catalog (21-02) is wired in
- No blockers identified for downstream plans

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
