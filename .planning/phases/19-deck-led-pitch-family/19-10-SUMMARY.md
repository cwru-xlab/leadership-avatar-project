---
phase: 19-deck-led-pitch-family
plan: 10
subsystem: testing
tags: [verify-script, surface-count, deck-pitch, engine-config, mechanical-guard]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "19-01's DECK_MODES table; 19-02's deliberate mode-agnostic widening of lib/engine/types.ts/session.ts/evaluation-runner.ts/registry.ts; 19-03's investor walk-out-off posture; 19-04/19-05's four registered TYPE records; 19-07/19-08's mode-table-reading wizard/picker pages; 19-09's report chrome/verdict panels"
provides:
  - "scripts/verify-deck-family-surface-count.ts — seven-section mechanical guard proving the four new deck modes added no engine module, route, evaluator or report page, that all five deck modes share one deck capability, and that the walk-out stays off for all five"
  - "scripts/verify-report-structure.ts — instance fixtures for the four new instance-required deck slugs added to the generic resolve-loop (Rule 3 blocking deviation; see below)"
affects: ["19-11"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A per-mode surface-count guard distinguishes a shared InstanceConfig `kind` discriminant literal (one value for all five deck modes) from a genuine per-mode slug branch — conflating the two would make Section 5's stronger claim unsatisfiable even though the wizard page already reads the mode table instead of naming any mode."
    - "registry.ts's sanctioned exception is checked NEGATIVELY (asserting the absence of any `===` comparison against a deck slug) rather than positively allow-listing the file, so a future branch slipped into registry.ts still fails even though the file is permitted to mention the slugs via its array entries."

key-files:
  created:
    - scripts/verify-deck-family-surface-count.ts
  modified:
    - scripts/verify-report-structure.ts

key-decisions:
  - "Section 5's scan for '.tsx files mentioning a deck-mode slug' strips `kind: \"pitch-deck\"` / `.kind === \"pitch-deck\"` occurrences before testing, because `pitch-deck` is simultaneously the investor mode's ENGINE_TYPES slug and the ONE shared InstanceConfig kind for all five modes (19-02). Without stripping it, app/practice/[type]/page.tsx would fail the plan's own explicit assertion that it is NO LONGER in the mode-slug-mentioning set, even though its branching is provably mode-agnostic (`isDeckMode`/`isDeckModeSlug`, never a per-slug check)."
  - "Absorbed the assigned Rule 3 deviation (19-UNOWNED-RED-SCRIPT.md) by extending scripts/verify-report-structure.ts's resolve-loop with one instance fixture per new deck slug, following the exact precedent 19-04/19-05 set in scripts/verify-pitch-types.ts. No assertion weakened; no instance.required changed."

requirements-completed: [REQ-93, REQ-87, REQ-88, REQ-91, REQ-92, P19-SC5]

# Metrics
duration: 48min
completed: 2026-10-08
---

# Phase 19 Plan 10: Deck Family Surface-Count Guard Summary

**A 724-line, seven-section mechanical script (`scripts/verify-deck-family-surface-count.ts`) proves adding four deck-led pitch modes touched no engine module, route, evaluator or report page, that all five deck modes share one deck capability rather than five copies, and that none of them can walk out — with a demonstrated negative test proving the guard actually bites.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-10-08T21:xx:xxZ (prior commit `bdbbbb7`)
- **Completed:** 2026-10-09T01:26:28Z
- **Tasks:** 2 (plan) + 1 assigned deviation
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `scripts/verify-deck-family-surface-count.ts` created: 7 sections, ALL PASS, 724 lines (plan's `min_lines: 200` artifact requirement met with margin).
  1. Registry membership, identity (`getEngineType(slug) === ENGINE_TYPES` entry), and universal `resolveSessionConfig` for all 13 registered types.
  2. One deck capability: shared `DECK_VISIBLE_CONTEXT` object identity across all five modes; exactly one `kind: "pitch-deck"` InstanceConfig member in `lib/engine/types.ts`; one slide-reveal ratchet; one visible-context gating primitive; exactly 3 deck API routes; one evaluator path (`evaluation-runner.ts` singular, each mode's `prompts.evaluatorPrompt` a string, no `pitch-evaluation*`/`deck-evaluation*` module); `buildEvaluationImages` function-identity reuse by all four new modes against the investor mode's.
  3. No per-mode surface: no per-mode wizard route, report page, API route, evaluator module, or session shell; exactly one `SetupWizard`, one `CameraConsentStep`, no mode+Consent component (REQ-91).
  4. No mode-specific branch in `lib/engine/`, `app/api/`, or the report page (REQ-93); `lib/engine/registry.ts` is the one sanctioned exception, asserted to contain no `===` comparison against any deck slug.
  5. The permitted `.tsx` surface list is exact — `app/practice/[type]/page.tsx` and `app/practice/pitches/page.tsx` are asserted OUT of the mode-slug-mentioning set (strictly stronger than Phase 14), after correctly distinguishing the shared `kind: "pitch-deck"` discriminant from a per-mode slug branch.
  6. Adding a mode is data: each new mode owns exactly `lib/pitch/<mode>-type.ts` + `lib/pitch/<mode>-prompts.ts`, nothing else under `lib/` bears the mode's name, and `DECK_MODES` has exactly 5 rows.
  7. Walk-out stays off for all five deck modes, reasserted independently of `verify-disengagement-termination.ts`; `pitch-elevator`'s threshold is confirmed still finite.
- Negative test performed and reverted (see below) — the guard is proven to actually fail, not merely untested.
- Absorbed the assigned Rule 3 deviation: fixed `scripts/verify-report-structure.ts`'s red resolve-loop (see Deviations).

## Task Commits

Each task was committed atomically:

1. **Rule 3 deviation: fix verify-report-structure.ts's resolve-loop** - `c1753c0` (fix)
2. **Task 1+2: write verify-deck-family-surface-count.ts (all 7 sections)** - `9ac3d4d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `scripts/verify-deck-family-surface-count.ts` - new 724-line surface-count guard, seven sections, ALL PASS
- `scripts/verify-report-structure.ts` - added instance fixtures for `pitch-funding`/`pitch-product`/`pitch-talk`/`pitch-general` to the generic resolve-loop (Rule 3 deviation)

## Decisions Made

1. **Stripped the shared `kind: "pitch-deck"` discriminant from Section 5's slug scan.** `"pitch-deck"` is double-duty: it is the investor mode's `ENGINE_TYPES` slug AND, per 19-02's deliberate widening, the ONE shared `InstanceConfig.kind` value for all five deck modes (a `pitch-funding` session still constructs `{ kind: "pitch-deck", ... }`). Scanning `.tsx` files naively for any of the five slug literals made `app/practice/[type]/page.tsx` fail the plan's own explicit assertion that it is no longer in the mode-slug-mentioning set — even though manual inspection confirmed its branching is entirely `isDeckMode`/`isDeckModeSlug`-driven (mode-agnostic), never a per-slug check. The script now strips `kind: "pitch-deck"` / `.kind === "pitch-deck"` patterns before testing for genuine slug mentions, with the rationale documented inline in the script.
2. **Checked `registry.ts`'s exception negatively, not via an allow-list.** Rather than exempting `registry.ts` from the literal scan entirely (which would blind the guard to a future branch added there), Section 4 excludes it only from the plain-literal scan (since it legitimately imports/arrays the TYPE records) but separately asserts it contains no `===` comparison against any deck slug — the narrow mechanism REQ-60 sanctions (an array entry) versus the one it forbids (a branch).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, assigned] Fixed `scripts/verify-report-structure.ts`'s red resolve-loop for the four new deck modes**
- **Found during:** Pre-execution review (assigned by orchestrator via `19-UNOWNED-RED-SCRIPT.md`)
- **Issue:** `verify-report-structure.ts`'s generic resolve-loop (section 6.1, iterating `ENGINE_TYPES`) lacked instance fixtures for `pitch-funding`/`pitch-product`/`pitch-talk`/`pitch-general`, all of which declare `instance: { required: true }`. 19-04/19-05 registered these four types and fixed the identical breakage in `scripts/verify-pitch-types.ts`'s resolve-loop, but no plan's `files_modified` listed `verify-report-structure.ts`, leaving it red.
- **Fix:** Added one instance fixture per new slug to the ternary chain, mirroring `verify-pitch-types.ts`'s `instanceFor()` shapes exactly (same `deckId`/`slideCount`/`slideTexts`/`proposedSeconds`/`modeInputs` values). No assertion weakened or skipped; no type record's `instance.required` changed.
- **Before:** `4 check(s) FAILED` — `resolve pitch-funding`, `resolve pitch-product`, `resolve pitch-talk`, `resolve pitch-general`, each "requires an instance".
- **After:** `All checks passed.` (0 failures)
- **Files modified:** `scripts/verify-report-structure.ts`
- **Verification:** `npx tsx scripts/verify-report-structure.ts` — before/after run, both captured.
- **Committed in:** `c1753c0` (separate commit, preceding the plan's own task commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 3, assigned by orchestrator)
**Impact on plan:** Necessary to leave the phase's verifier suite fully green; no scope creep — scoped exactly to the four new fixtures, following established precedent.

## Negative Test (mandatory, REQ-93 proof-of-bite)

Planted a literal into `lib/engine/session.ts` (not `registry.ts`):

```ts
// TEMPORARY NEGATIVE TEST PLANT — 19-10 — must be reverted immediately.
export const __NEGATIVE_TEST_PLANT__ = "pitch-funding";
```

**Observed failure (exit code 1):**
```
4. No mode-specific branch in the engine, the routes, or the report page (REQ-93)
  ok   no typeSlug/slug === pitch-<deck-mode> comparison under lib/engine, app/api or the report page
  FAIL no NEW deck-mode slug literal anywhere under lib/engine, app/api or the report page (registry.ts exempted below)
         lib/engine/session.ts

verify-deck-family-surface-count: FAILED (1 failure(s))
```
`EXIT CODE: 1` confirmed via direct `echo "EXIT CODE: $?"` after a non-piped run.

**Reverted** `lib/engine/session.ts` to its pre-plant content (`git diff --stat lib/engine/session.ts` showed no diff after revert). Re-run:

```
verify-deck-family-surface-count: ALL CHECKS PASSED
```
`EXIT CODE: 0` confirmed the same way.

## Full Passing Output (final state, all 7 sections)

```
1. Every deck mode is a registered config record; nothing else broke
  ENGINE_TYPES count=13 slugs=[general, technical, consulting, early-career, case-study, networking, pitch-elevator, pitch-deck, pitch-funding, pitch-product, pitch-talk, pitch-general, difficult-conversation]
  ok   ENGINE_TYPES includes "pitch-deck" / "pitch-funding" / "pitch-product" / "pitch-talk" / "pitch-general" (each individually asserted)
  ok   getEngineType(slug) === the ENGINE_TYPES array entry (same identity), for all five
  ok   ENGINE_TYPES has at least 6 entries (found 13)
  ok   resolveSessionConfig(slug) with one synthetic pitch-deck instance succeeds, for all five
  ok   every one of the 13 registered types still resolves after the four deck modes were added

2. One deck capability, not five copies (REQ-88)
  ok   all five resolved configs share DECK_VISIBLE_CONTEXT identity
  ok   lib/engine/types.ts declares exactly one `kind: "pitch-deck"` InstanceConfig member
  ok   lib/engine/types.ts declares no second deck-ish kind literal
  ok   ratchet Math.max(stored ?? -1) only in slide-reveal.ts
  ok   no slides-channel filter outside visible-context.ts
  ok   exactly 3 deck API routes, unchanged by adding four modes (found 3)
  ok   each mode's prompts.evaluatorPrompt is a string on its own type record
  ok   no lib/*/pitch-evaluation* or lib/*/deck-evaluation* module file exists
  ok   exactly 1 evaluation-runner.ts under lib/ (found 1)
  ok   pitch-deck declares buildEvaluationImages
  ok   each new mode's buildEvaluationImages is the SAME function identity as pitch-deck's

3. No per-mode surface exists (REQ-91, REQ-93)
  ok   no per-mode wizard route / report page / API route / evaluator module / session shell
  ok   exactly 1 SetupWizard (found 1)
  ok   exactly 1 CameraConsentStep (found 1)
  ok   no component name contains both a mode name and Consent

4. No mode-specific branch in the engine, the routes, or the report page (REQ-93)
  ok   no typeSlug/slug === pitch-<deck-mode> comparison under lib/engine, app/api or the report page
  ok   no NEW deck-mode slug literal anywhere under lib/engine, app/api or the report page (registry.ts exempted below)
  ok   lib/engine/registry.ts contains no === comparison against any deck slug (array entry only, REQ-60)

5. The permitted .tsx surface list is exact
  ok   only the permitted .tsx files mention a deck-mode slug (components/practice/ReportChrome.tsx, app/reports/page.tsx, components/practice/report/DeckVerdictPanel.tsx)
  ok   app/practice/[type]/page.tsx is NO LONGER in the mode-slug-mentioning set
  ok   app/practice/pitches/page.tsx is NO LONGER in the mode-slug-mentioning set
  ok   both files still exist

6. Adding a mode is data
  -> pitch-funding owns: lib/pitch/funding-type.ts, lib/pitch/funding-prompts.ts (card: "Funding request")
  -> pitch-product owns: lib/pitch/product-type.ts, lib/pitch/product-prompts.ts (card: "Product pitch")
  -> pitch-talk owns: lib/pitch/talk-type.ts, lib/pitch/talk-prompts.ts (card: "Deck-led talk")
  -> pitch-general owns: lib/pitch/general-deck-type.ts, lib/pitch/general-deck-prompts.ts (card: "General deck pitch")
  ok   lib/pitch/deck-modes.ts's DECK_MODES has exactly 5 rows
  ok   listDeckModes() returns exactly 5 modes

7. Walk-out stays off for every deck mode (independent of verify-disengagement-termination.ts)
  ok   all five modes: disengagementThreshold == null, avatarMayEnd === false
  ok   pitch-elevator's disengagementThreshold is still a finite number

verify-deck-family-surface-count: ALL CHECKS PASSED
```

## Issues Encountered

None beyond the Section 5 double-duty-literal issue resolved above (not a bug in production code — a design clarification needed in the guard's own scan logic).

## Cross-Verification: Other Phase Verifiers

Ran all verifiers named in the plan's `<verification>` block plus `verify-pitch-types.ts` and `verify-report-structure.ts` (the two touched by the assigned deviation / known defect):

| Script | Result |
|---|---|
| `verify-deck-mode-table.ts` | ALL PASS |
| `verify-deck-family-plumbing.ts` | ALL PASS |
| `verify-deck-family-types.ts` | ALL PASS |
| `verify-deck-wizard-generic.ts` | ALL PASS |
| `verify-pitch-picker-cards.ts` | ALL PASS |
| `verify-deck-verdict-panels.ts` | ALL PASS |
| `verify-disengagement-termination.ts` | ALL PASS |
| `verify-pitch-surface-count.ts` | ALL PASS |
| `verify-report-structure.ts` | All checks passed (fixed by this plan's deviation) |
| `verify-pitch-types.ts` | 1 FAILURE — pre-existing, Phase-18-owned (`18-PITCH-TYPES-REGRESSION.md`), NOT caused by this plan. Not fixed, as instructed by `<known_state>`. |

`npx tsc --noEmit` — clean, no errors.
`git diff --stat` against the plan's own `files_modified` (`scripts/verify-deck-family-surface-count.ts`) — touches only that file; the deviation's file (`scripts/verify-report-structure.ts`) is a separate, disclosed commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19's mechanical surface-count proof for the deck-led pitch family is complete and green, alongside every other Phase 19 verifier.
- The one remaining red script in the suite is `scripts/verify-pitch-types.ts`'s single Phase-18-owned failure (`18-PITCH-TYPES-REGRESSION.md`), explicitly out of this plan's scope and unresolved — 19-11 should carry it forward as a stated open defect in `19-VALIDATION.md`, not silently drop it.
- 19-11 (validation markdown) can cite this plan's full passing output and negative-test evidence directly from this SUMMARY.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*

## Self-Check: PASSED

All claimed files and commits verified present:
- `scripts/verify-deck-family-surface-count.ts` — FOUND
- `scripts/verify-report-structure.ts` — FOUND
- `.planning/phases/19-deck-led-pitch-family/19-10-SUMMARY.md` — FOUND
- commit `c1753c0` — FOUND
- commit `9ac3d4d` — FOUND
