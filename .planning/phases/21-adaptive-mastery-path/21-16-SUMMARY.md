---
phase: 21-adaptive-mastery-path
plan: 16
subsystem: study-plan
tags: [coached-practice, mastery-ledger, tip-safety, prisma]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "CONTRIBUTION_WEIGHTS/WEIGHT_ORDERING_CONSTRAINTS and the append-only ledger (21-05); finishCoachedSession writing no mastery row by design (21-12); contributionsFromReport, the single report-to-competency mapper (21-21)"
provides:
  - "lib/study-plan/coached/tips.ts: TECHNIQUE_LIBRARY, techniquesForCompetency(), validateTip(), assertTipSafe(), TIP_REJECT_REASONS, SCRIPT_CUE_PHRASES, MAX_TIP_LENGTH"
  - "lib/study-plan/coached/contribution.ts: recordCoachedContribution() — the single writer of COACHED_SESSION mastery rows, delegating the report mapping to 21-21's contributionsFromReport"
  - "scripts/verify-coach-tips.ts: rejection battery, library-coverage proof, and the DB-gated coached-weight arithmetic proof"
affects: [21-18, 21-19, 21-20, 21-23, 21-24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-mechanism safety: a closed, human-authored library is the primary path (safe by construction), with a mechanical five-rule rejector as the fallback for free-text tips — proven to agree via a verifier assertion that every library entry also passes the rejector"
    - "A baseline contribution with a deliberately different score is required to make a weighted-mean comparison non-degenerate: two contributions carrying the SAME rawScore produce the same weighted mean regardless of their weights, so proving 'coached pulls less than unaided' requires measuring the DELTA a shared-value contribution produces against an existing, differently-valued baseline, not comparing two equal-valued figures directly"

key-files:
  created:
    - lib/study-plan/coached/tips.ts
    - lib/study-plan/coached/contribution.ts
    - scripts/verify-coach-tips.ts
  modified: []

key-decisions:
  - "Mechanism A (closed TECHNIQUE_LIBRARY, 3-4 entries per competency) is documented as the preferred path; Mechanism B (validateTip/assertTipSafe) exists for the rarer case where a tip must reference the student's specific moment and therefore cannot be a static library entry"
  - "The rejector's false-positive risk is accepted and documented in a block comment: a rejected good tip costs one regeneration, an accepted scripted tip invalidates the session's evidence — asymmetric costs that justify erring toward over-rejection"
  - "No second coached-session guard was added in contribution.ts. 21-21's recordLiveSessionContributions already carries the unconditional, earlier guard that suppresses a LIVE_SESSION row for any report joined to a CoachedSession. This plan's idempotence check (on sourceReportId + source='COACHED_SESSION') only prevents a retried finish from double-writing the COACHED_SESSION row itself — it cannot and does not suppress a LIVE_SESSION row, by design, matching the asymmetry documented in from-report.ts"
  - "Comments in contribution.ts deliberately avoid the literal string 'LIVE_SESSION' (paraphrased as 'the unaided-session source'/'an unaided session's rows') so the plan's own verify command (grep -c 'LIVE_SESSION' returns 0) holds even in prose, not just in code"

patterns-established:
  - "Pattern: proving a weight ordering in the computed figure (not just the weight table) requires a non-degenerate baseline — see the tech-stack pattern above"

requirements-completed: []

# Metrics
duration: ~55min
completed: 2026-10-20
---

# Phase 21 Plan 16: Coached Tip Safety and Coached Mastery Contribution Summary

**A closed, human-authored technique library plus a five-rule mechanical rejector make a coached tip's "never script the words" guarantee enforced in code rather than trusted to a prompt, and `recordCoachedContribution()` writes a completed coached session's mastery rows by delegating entirely to 21-21's shared report-to-competency mapper, at the 0.40 weight locked below unaided practice's 1.00.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-10-20
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- **`lib/study-plan/coached/tips.ts`** (432 lines) ships `TECHNIQUE_LIBRARY` — 25 hand-written, second-person, unquoted technique reminders spanning all seven `COMPETENCIES` keys (3-4 each) — plus `validateTip()`/`assertTipSafe()`, a mechanical rejector enforcing all five named rules: `CONTAINS_QUOTED_SPEECH` (a 4+ word quoted span), `CONTAINS_SCRIPT_CUE` (one of ten exported lead-in phrases, word-boundary and case-insensitive), `CONTAINS_FIRST_PERSON_LINE` (a 6+ word first-person declarative — the rule that catches an *unquoted* script, the form the other two miss), `TOO_LONG` (240 chars, `PROVISIONAL UNTIL CALIBRATED`), and `ECHOES_STUDENT_LINE` (a 6+ word span shared with the student's own line). The false-positive tradeoff is documented in a block comment as deliberate: a rejected good tip costs one regeneration, an accepted scripted tip invalidates the session's evidence.
- **`lib/study-plan/coached/contribution.ts`** (131 lines) ships `recordCoachedContribution()`, the single writer of `COACHED_SESSION`-sourced mastery rows. It loads the `CoachedSession` scoped by `userId`, requires `completedAt` and `reportId` non-null (throwing `CoachedSessionNotFinishedError` otherwise), checks idempotence on `sourceReportId` + `source: "COACHED_SESSION"` before any mapping work, and — critically — delegates the entire report-to-competency mapping to 21-21's `contributionsFromReport`, reimplementing none of it. The module header names 21-12's `finishCoachedSession` as the function that must NOT also write a contribution, and documents (without restating the function name) that 21-21's own unconditional, earlier guard is what prevents the same report from ALSO producing an unaided-session row.
- **`scripts/verify-coach-tips.ts`** (537 lines, 134 checks) proves: every competency has ≥3 techniques and every library reminder passes its own rejector (self-consistency between the two mechanisms); every named rejection reason fires on a realistic example AND a paired near-miss passes (a 3-word quoted term of art, a 4-word first-person coach-voice sentence, a 3-word echoed span); every one of the 10 `SCRIPT_CUE_PHRASES` is proven to actually fire, not dead config; `assertTipSafe` throws/does-not-throw correctly on both sides; the weight ordering holds; and (DB-gated, ran not SKIP) `recordCoachedContribution` writes one row per competency with ≥1 non-null dimension, skips the all-null competency entirely, is idempotent, throws on an unfinished or foreign-user session, and — the section's load-bearing proof — that adding a same-rawScore `LIVE_SESSION` contribution on top of an existing differently-valued baseline pulls the recomputed figure measurably closer to that raw score than the coached-only figure was, proving the 1.00 vs 0.40 weight difference is real in the arithmetic, not only in the table.

## Task Commits

Each task was committed atomically, with an explicit pathspec per the concurrency constraint:

1. **Task 1: Build the technique library and the scripted-line rejector** — `4f57fe2` (feat)
2. **Task 2: Record the coached contribution at the coached weight** — `da22a9a` (feat)
3. **Task 3: Battery for tip rejection, library coverage, and the coached weight** — `cbcbee6` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/study-plan/coached/tips.ts` — `TECHNIQUE_LIBRARY`, `techniquesForCompetency()`, `validateTip()`, `assertTipSafe()`, `TIP_REJECT_REASONS`, `SCRIPT_CUE_PHRASES`, `MAX_TIP_LENGTH`.
- `lib/study-plan/coached/contribution.ts` — `recordCoachedContribution()`, `CoachedSessionNotFoundError`, `CoachedSessionNotFinishedError`.
- `scripts/verify-coach-tips.ts` — the four-section verifier described above.

## Decisions Made

See `key-decisions` in the frontmatter above. The most consequential one: the verify script's quoted-term-of-art near-miss uses `"call it out"` (a genuine 3-word span) rather than the plan's literal illustrative example `"name it, claim it"`, which tokenizes to 4 words under a naive whitespace split and would have been (correctly) rejected rather than passed — the plan's own stated intent ("a 3-word quoted term of art, under the 4-word threshold") is honored by the word count, not the literal string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's literal echo/quote near-miss example did not match its own stated word count**
- **Found during:** Task 3, writing Section 2's quoted-speech near-miss case
- **Issue:** The plan's example text `Use the "name it, claim it" move.` contains a 4-word quoted span (`name`, `it,`, `claim`, `it`), which the rejector correctly rejects at the "4+ word" threshold — contradicting the plan's own framing of it as "a 3-word quoted term of art, under the 4-word threshold."
- **Fix:** Substituted a genuine 3-word quoted term of art (`"call it out"`) that satisfies the plan's actual intent (a short quoted term of art passes) rather than its literal (miscounted) example text.
- **Files modified:** `scripts/verify-coach-tips.ts`
- **Verification:** `validateTip('Use the "call it out" move.', ...)` returns `{ ok: true }`.
- **Committed in:** `cbcbee6` (Task 3)

**2. [Rule 1 - Bug] The weight-ordering arithmetic proof as literally specified was mathematically vacuous**
- **Found during:** Task 3, Section 4's final assertion
- **Issue:** The plan specifies writing a `LIVE_SESSION` contribution with the SAME `rawScore` as the just-written coached row, then comparing the recomputed figure to "the coached-only" figure. With only those two (equal-valued) contributions in existence, the weighted mean of two identical values is that value regardless of their weights — the comparison as literally described could never discriminate a 1.00 weight from a 0.40 one; both figures land on exactly the same number.
- **Fix:** Added a non-degenerate BASELINE contribution (a `LIVE_SESSION` row at `rawScore: 0.1`, deliberately far from the coached row's `0.625`) before the coached contribution is recorded. This makes "baseline+coached" and "baseline+coached+live" genuinely different figures, both pulled toward `0.625` from the `0.1` baseline, and lets the live row's higher weight be proven to pull harder — the concrete, non-vacuous version of what the plan's own success criterion asks for ("the coached weighting is actually below unaided in the arithmetic, not just in the table").
- **Files modified:** `scripts/verify-coach-tips.ts`
- **Verification:** `npx tsx scripts/verify-coach-tips.ts` (with `DATABASE_URL` set) — the final check passes with `baseline+coached=25` (distance 37.5 from the 62.5 raw-score-as-percent) vs. `baseline+coached+live=40.625` (distance 21.875) — strictly closer, as required.
- **Committed in:** `cbcbee6` (Task 3)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the plan's own illustrative text/design, caught while making the plan's own verify command pass as written, not scope changes)
**Impact on plan:** None on scope or on the shipped library/rejector/contribution logic — both fixes are confined to the verifier's own test fixtures, chosen to honor the plan's stated intent where its literal example was internally inconsistent.

## Issues Encountered

None beyond the two self-caught fixture issues above. `npx tsc --noEmit` was clean after every task (ignoring two pre-existing, uncommitted, in-progress sibling-plan files visible via `git status --short` — `scripts/verify-check-grading.ts` and `lib/mastery/mastery-dto.ts` — out of scope per this plan's concurrency constraint and not touched).

## REQ-115 / REQ-116 Status (deliberately left Pending)

Per this execution's `requirement_marking_discipline`, **neither requirement is marked Complete**, and the Traceability table rows for REQ-115 and REQ-116 remain `Pending`:

- **REQ-115** ("every tip actually rendered... A validator with no delivery path to guard does not satisfy this") requires the tip to actually reach the student in the UI. That rendering is **21-24**'s job (wave 6). This plan ships the mechanism the rendering path must call (`assertTipSafe`) but has no rendering surface itself.
- **REQ-116** ("moves the student's VISIBLE mastery figure") requires the figure to be shown to the student. That surface is **21-18**'s job (wave 7). This plan writes the ledger row and proves it moves the *computed* figure (`computeMastery`), but writes nothing a student can see.

REQ-124 (the single-mapper rule) IS satisfied by this plan's own files — `contribution.ts` delegates to `contributionsFromReport` with zero restated mapping logic — but REQ-124 is claimed across multiple plans in this phase and its own completion is left to whichever plan's scope explicitly owns marking it; this plan did not run `requirements mark-complete` for any of its three claimed IDs, consistent with 21-05/21-12's precedent of leaving a requirement open until its full student-observable text is true.

## User Setup Required

None. The local dev database is migrated (confirmed by Section 4 of `scripts/verify-coach-tips.ts` running, not SKIP, against the ambient `DATABASE_URL`).

## Next Phase Readiness

- `lib/study-plan/coached/tips.ts`'s `assertTipSafe`/`techniquesForCompetency` are ready for **21-23/21-24** (the coached-session runtime that generates and renders tips) to call before any tip reaches the student.
- `lib/study-plan/coached/contribution.ts`'s `recordCoachedContribution` is ready for whichever call site (likely **21-19**'s finish-session route, alongside `finishCoachedSession`) invokes it after a coached session completes.
- `lib/mastery/compute.ts`'s `computeMastery`/`lib/mastery/ledger.ts`'s `readContributions` are proven, via this plan's own verifier, to reflect a coached contribution — ready for **21-18**'s visible mastery surface.
- No blockers. `npx tsc --noEmit` is clean for every file this plan touches; `npx tsx scripts/verify-coach-tips.ts`, `npx tsx scripts/verify-coached-mode-isolation.ts`, `npx tsx scripts/verify-mastery-weights.ts`, and `npx tsx scripts/verify-live-session-ingestion.ts` all exit 0 with every DB-gated section run, not skipped.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/coached/tips.ts`
- FOUND: `lib/study-plan/coached/contribution.ts`
- FOUND: `scripts/verify-coach-tips.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-16-SUMMARY.md`
- FOUND: commit `4f57fe2` (Task 1)
- FOUND: commit `da22a9a` (Task 2)
- FOUND: commit `cbcbee6` (Task 3)
