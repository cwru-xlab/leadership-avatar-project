---
phase: 21-adaptive-mastery-path
plan: 13
subsystem: lib
tags: [typescript, mastery-model, dto, server-exit]

requires:
  - phase: 21-adaptive-mastery-path (plan 09)
    provides: "computeMastery(), MasteryResult/CompetencyMastery interfaces carrying lifetimeWeightSum/currentWeightSum, the null-not-zero convention"
  - phase: 21-adaptive-mastery-path (plan 02)
    provides: "COMPETENCIES catalog (label, description, order) consumed for explicit mapping"
provides:
  - "lib/mastery/thinness.ts — EVIDENCE_TIERS, THINNESS_THRESHOLDS (PROVISIONAL), evidenceTierFor(), TIER_DISCLOSURE"
  - "lib/mastery/mastery-dto.ts — toMasteryDTO(), the single server exit for mastery, every figure carrying its tier"
  - "scripts/verify-mastery-thinness.ts — 21-check boundary/no-bare-figure/independence battery"
affects: [knowledge-checks, coached-practice, path-engine, mastery-surface]

tech-stack:
  added: []
  patterns:
    - "Weight-sum thresholding, not count thresholding: thinness is judged on the same weighted evidence the percentage itself is built from, so a count-based notion of 'enough evidence' can never disagree with the weight-based notion driving the figure"
    - "Disclosure copy co-located with the tier (TIER_DISCLOSURE keyed by EvidenceTier): a component cannot obtain a tier without also obtaining its matching disclosure string, mechanically preventing the bare-number failure"
    - "Single server exit (toMasteryDTO), following 20-06's precedent: a guarantee applied at render time has already shipped the unsafe payload, so tier attachment happens once, at the DTO boundary, with no flag or variant to skip it"
    - "Independent lifetime/current tiers: each window's tier is computed from its own count/weightSum pair, so a well-evidenced lifetime figure can never mask a thin current one"

key-files:
  created:
    - lib/mastery/thinness.ts
    - lib/mastery/mastery-dto.ts
    - scripts/verify-mastery-thinness.ts
  modified: []

key-decisions:
  - "Thresholds are weight-sum based (2.0 THIN boundary, 6.0 ESTABLISHED boundary), not raw-count based — a count threshold would equate four model-graded rewrites (0.8 weighted) with four live sessions (4.0 weighted), defeating 21-05's weight table. Tagged PROVISIONAL UNTIL CALIBRATED with derivation recorded, following the Phase 20 / 21-07 convention, for 21-20's calibration table to pick up."
  - "NONE is decided on evidenceCount === 0 first, never on weightSum === 0, so a weight-table bug (non-zero count, zero weight) surfaces as a data inconsistency rather than being silently absorbed into the legitimate 'no evidence' state."
  - "Reworded two doc comments in mastery-dto.ts during Task 2 (the same class of issue 21-09 hit) because the plan's own grep-based verification checks for the literal substrings `includeTiers`/`raw`, which appeared in prose explaining why no tier-skipping option and no client-side key map exist. Comment-only rewording; no behavior change."
  - "REQ-105 intentionally left Pending — see 'Requirement Status' below."

requirements-completed: []

duration: ~20min
completed: 2026-10-20
---

# Phase 21 Plan 13: Evidence Thinness at the Mastery Server Exit Summary

**`toMasteryDTO()` attaches an independently-computed evidence tier (NONE/THIN/EMERGING/ESTABLISHED) and co-located disclosure copy to every lifetime and current mastery figure, thresholded on weighted evidence rather than raw count, so a thin figure is always shown and never shown bare**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-10-20T21:44:00Z (approx)
- **Tasks:** 3 (all auto)
- **Files modified:** 3 (all created)

## Accomplishments

- `lib/mastery/thinness.ts` exports `EVIDENCE_TIERS`/`EvidenceTier` (four tiers: NONE, THIN, EMERGING, ESTABLISHED), `THINNESS_THRESHOLDS` (`thinBelowWeightSum: 2.0`, `establishedAtWeightSum: 6.0`, both tagged `PROVISIONAL UNTIL CALIBRATED` with their derivation recorded in a block comment), `evidenceTierFor()`, and `TIER_DISCLOSURE` — student-facing label/disclosure copy keyed by tier and co-located with the tier definitions so a component cannot reach a tier without its disclosure string.
- `evidenceTierFor()` checks `evidenceCount === 0` first (decided on count, never weight) and throws on any negative input rather than clamping.
- `lib/mastery/mastery-dto.ts` exports `toMasteryDTO()`, the single server exit for mastery: every competency emits an independently-tiered `lifetime` block and `current` block (each with `percent`, `evidenceCount`, `tier`, `tierLabel`, `disclosure`), labels/descriptions/order sourced from `COMPETENCIES` (never a client-side map), dates converted to ISO strings, and `unmappedRowCount` passed through from 21-09's `MasteryResult` unchanged. No tier-omitting variant exists; no re-rounding of `compute.ts`'s already-rounded percent.
- `scripts/verify-mastery-thinness.ts` runs 21 checks across 5 sections with no `DATABASE_URL`/`OPENAI_API_KEY`: both sides of both thresholds (including the count-first NONE rule and negative-input throws), the labelled 21-CONTEXT two-session case (percent non-null, disclosure non-null), the no-bare-figure guard (no competency dropped, every tierLabel non-empty, every non-null THIN figure has a disclosure, every null figure is tier NONE with a disclosure), lifetime/current tier independence on the same competency (ESTABLISHED lifetime, THIN current), and a shape guard (no `Date` survives JSON serialization, `unmappedRowCount` present even at zero).

## Task Commits

1. **Task 1: Declare the evidence tiers and the threshold** - `d39b64a` (feat) — `lib/mastery/thinness.ts`
2. **Task 2: Attach the tier at the single server exit** - `55c0390` (feat) — `lib/mastery/mastery-dto.ts`
3. **Task 3: Verify the tier boundaries and the no-bare-figure guarantee** - `23371ea` (test) — `scripts/verify-mastery-thinness.ts`

## Files Created/Modified

- `lib/mastery/thinness.ts` - `EVIDENCE_TIERS`, `EvidenceTier`, `THINNESS_THRESHOLDS`, `evidenceTierFor()`, `TIER_DISCLOSURE`
- `lib/mastery/mastery-dto.ts` - `MasteryFigureDTO`, `CompetencyMasteryDTO`, `MasteryDTO`, `toMasteryDTO()`
- `scripts/verify-mastery-thinness.ts` - 21-check boundary/no-bare-figure/independence/shape battery

## Decisions Made

See `key-decisions` in frontmatter: weight-sum thresholding over count thresholding (with derivation recorded and tagged provisional for 21-20); NONE decided on count first; the two comment rewordings needed to pass the plan's own grep checks (same class of self-referential grep issue 21-09 documented).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded doc comments in mastery-dto.ts that accidentally matched the plan's own grep checks**
- **Found during:** Task 2, running the plan's `<verify>` grep checks after writing the file
- **Issue:** Prose explaining why no `{ includeTiers: false }` option exists, and why labels aren't sourced from "the raw result", contained the literal substrings `includeTiers` and `raw` — exactly what `grep -c 'includeTiers\|skipTier\|raw' lib/mastery/mastery-dto.ts` checks for (required: 0; actual: 2).
- **Fix:** Reworded both comment lines to describe the same guarantees ("no boolean flag on the opts object to turn tier-attachment off", "the unmapped source result") without the checked substrings. No behavior change.
- **Files modified:** `lib/mastery/mastery-dto.ts`
- **Verification:** Re-ran the grep check (0), re-ran `npx tsc --noEmit` (clean), re-ran the verifier after Task 3 was written (21/21 pass).
- **Committed in:** `55c0390` (caught before the Task 2 commit, not a separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, comment-text-only, caught before committing)
**Impact on plan:** No scope creep; no behavior changed.

## Issues Encountered

None beyond the one auto-fixed item above. All three tasks' `<verify>` and `<done>` criteria passed on first real attempt after the comment reword.

## User Setup Required

None - no external service configuration required. This plan is pure TypeScript with no database read and no model call; `scripts/verify-mastery-thinness.ts` explicitly builds `MasteryResult` literals and runs with no `DATABASE_URL`/`OPENAI_API_KEY` set.

## Requirement Status

REQ-105 reads: "Every mastery figure carries its evidence count and an explicit
`thin` flag at a declared threshold. A thin figure is SHOWN with its thinness
flagged — never withheld, and never presented as if well-evidenced."

The server-side half is now genuinely true: `toMasteryDTO()` cannot emit a
figure without `evidenceCount`, `tier` and a co-located `disclosure`/`tierLabel`,
and the 21-CONTEXT two-session case is proven to display non-null with a
non-null disclosure. But REQ-105's text is a student-OBSERVABLE condition
("SHOWN", "flagged") and this plan ships no student-facing surface — no page
or component yet reads `MasteryDTO` and renders a figure. That consumption is
21-18's (wave 7) job, per `21-09-SUMMARY.md`'s "Next Phase Readiness" note and
this plan's own frontmatter (no `app/` or `components/` files in scope).

Per this plan's explicit instruction, REQ-105 is left **Pending** in
`.planning/REQUIREMENTS.md` — both the definition checkbox (line 778) and the
Traceability row (line 961) already agree at Pending, so no edit was made to
that file. It should be marked Complete only once 21-18 (or whichever plan
ships the rendering surface) proves a thin figure actually renders with its
disclosure visible to a student.

## Next Phase Readiness

`EvidenceTier`, `evidenceTierFor()`, `TIER_DISCLOSURE`, `toMasteryDTO()` and
`MasteryDTO`/`CompetencyMasteryDTO`/`MasteryFigureDTO` are ready for 21-14 and
21-17 (named consumers of `EvidenceTier` in later waves) and 21-18 (the surface
that will finally close REQ-105 and REQ-106 by rendering `MasteryDTO`,
including `unmappedRowCount`, to a student). Only `lib/mastery/thinness.ts`,
`lib/mastery/mastery-dto.ts` and `scripts/verify-mastery-thinness.ts` were
touched; confirmed via `git status --short` and explicit pathspecs on every
commit, alongside three concurrent sibling executors on 21-15, 21-16, 21-25.
`.planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` was not
touched.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

All claimed files and commits verified present on disk / in git history.
