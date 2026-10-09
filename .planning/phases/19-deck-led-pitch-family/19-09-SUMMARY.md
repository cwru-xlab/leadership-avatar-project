---
phase: 19-deck-led-pitch-family
plan: 09
subsystem: ui
tags: [react, report-rendering, deck-pitch, outcome-record]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "19-01's DECK_MODES table (getDeckMode/isDeckModeSlug/deckModeNegotiates); 19-04/19-05's four new TYPE records and their declared outcome field shapes (fundingPosition/fundedAmountUsd/fundingRationale, buyerPosition/blockingObjection, takeawayHeard/matchedDeclaredTakeaway)"
provides:
  - "components/practice/report/DeckVerdictPanel.tsx — one component with an internal mode switch rendering the funding/product/talk descriptive verdicts, self-nulling for pitch-deck and pitch-general"
  - "components/practice/ReportChrome.tsx — deckChromeFor(slug), a memoized mode-table-driven chrome factory covering all five deck modes, replacing the single pitch-deck if-branch"
  - "lib/report/title.ts — deck-mode report titles resolve from DECK_MODES.cardTitle via getDeckMode rather than a per-slug literal"
  - "app/reports/page.tsx — Pitches filter widened to isDeckModeSlug so all five deck modes land under the existing tab"
  - "scripts/verify-deck-verdict-panels.ts — ten mechanical assertions proving the extras-slot contract per mode, including the general mode's absent panel and the report page's missing slug literal"
affects: ["19-10", "19-11"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A sixth deck mode registers chrome, a title, and a filter-tab membership by adding one row to DECK_MODES — zero edits to ReportChrome.tsx, title.ts, or app/reports/page.tsx"
    - "Verdict panels follow asConversationOutcome's per-field defensive-narrowing discipline: malformed fields degrade to absent, nothing throws, a partial outcome still renders what it has"

key-files:
  created:
    - components/practice/report/DeckVerdictPanel.tsx
    - scripts/verify-deck-verdict-panels.ts
  modified:
    - components/practice/ReportChrome.tsx
    - lib/report/title.ts
    - app/reports/page.tsx

key-decisions:
  - "Routed pitch-deck's report title through the same DECK_MODES.cardTitle lookup as the four new modes (title.ts), rather than keeping its own 'Investor pitch' literal — the plan's own instruction to 'prefer a table-driven default for any deck-mode slug' extends to the investor deck too; no script or page asserts the old literal, so this is a pure title-text improvement, not a tracked regression."
  - "Below-slot panel order for all deck modes is DeckTimelinePanel, then NegotiationTriplePanel (investor-only), then DeckVerdictPanel (self-nulling) — a minor reorder from the investor deck's prior Nego-then-Timeline order, with no effect on rendered content or any check (order was never asserted)."
  - "Copied formatUsd locally into DeckVerdictPanel.tsx rather than editing NegotiationTriplePanel.tsx to export it — NegotiationTriplePanel.tsx is not in this plan's files_modified list."

patterns-established:
  - "Pattern: a deck-mode chrome factory (deckChromeFor) keyed by DeckModeSlug and memoized in a Map, so a sixth mode's chrome needs no new branch, only a new DECK_MODES row."

requirements-completed: [REQ-90, REQ-92, REQ-93, P19-SC3, P19-SC5]

# Metrics
duration: 50min
completed: 2026-10-09
---

# Phase 19 Plan 09: Deck Report Chrome & Verdict Panels Summary

**One mode-discriminated `DeckVerdictPanel` plus a mode-table-driven `ReportChrome` factory bring descriptive, unscored outcome verdicts to all four new deck modes through the existing extras slot — zero edits to the shared report page, clearing the four-mode gap `verify-report-chrome-coverage.ts` has carried since 19-04.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-10-09T00:25:00Z
- **Completed:** 2026-10-09T01:15:00Z
- **Tasks:** 3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `DeckVerdictPanel.tsx`: one component, internal mode switch, three rendered shapes — funding (requested vs. funded amount, position in words, rationale prose), product (buyer position headline + blocking objection, with an explicit "no objection was recorded" fallback), talk (declared vs. heard takeaway, stated as a plain sentence, never a score or checkmark). Returns `null` for `pitch-deck` (owned by `NegotiationTriplePanel`) and `pitch-general` (`hasOutcomePanel === false`). Every rendered card carries `OUTCOME_NOT_A_SCORE_CAPTION` (imported, not duplicated) so a student cannot read the verdict as a grade.
- `ReportChrome.tsx`: the single `if (slug === "pitch-deck") return PITCH_DECK_CHROME;` line is now `if (isDeckModeSlug(slug)) return deckChromeFor(slug);`, backed by a `Map`-memoized factory. `extras.above` is unchanged for all five modes (`PitchOutcomeBanner` + `DisengagementDeclinePanel`); `extras.below` is `DeckTimelinePanel` always, `NegotiationTriplePanel` only when `deckModeNegotiates(slug)`, `DeckVerdictPanel` always (self-nulling). Every other chrome constant in the file is byte-for-byte untouched.
- `lib/report/title.ts`: `typeLabelForReport` now checks `getDeckMode(typeSlug)` first and returns `cardTitle` for any deck-mode slug (all five), falling back to the pre-existing literal map, then the title-cased default, for everything else.
- `app/reports/page.tsx`: `matchesTypeFilter`'s `"pitch"` branch widened to `typeSlug === "pitch-elevator" || isDeckModeSlug(typeSlug)` — no new tab, no second report surface.
- `scripts/verify-deck-verdict-panels.ts`: ten assertions, modeled on `verify-pitch-report-panels.ts`'s synthetic-`ReportDTO`-plus-headless-render harness — chrome resolution for all five slugs, the READY-only extras guard, the three populated verdict shapes, the general mode's total absence of any verdict markers under an adversarial outcome payload, the investor report's unchanged negotiation triple with no duplicate verdict, malformed-outcome non-throwing across all five modes and three malformed shapes, `NegotiationTriplePanel` text appearing only for `pitch-deck`, and a source-text scan proving the shared report page carries no deck-mode slug literal and no `typeSlug ===` comparison.

## Task Commits

Each task was committed atomically:

1. **Task 1: One verdict panel covering the four new outcome shapes** - `2722ee1` (feat)
2. **Task 2: Register deck-mode chrome from the mode table; widen titles and the reports filter** - `4a29315` (feat)
3. **Task 3: Prove the extras-slot contract per mode** - `7a07175` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/practice/report/DeckVerdictPanel.tsx` - one mode-discriminated descriptive verdict panel for funding/product/talk
- `components/practice/ReportChrome.tsx` - `deckChromeFor(slug)` mode-table-driven chrome factory replacing the single `pitch-deck` branch
- `lib/report/title.ts` - deck-mode titles resolve from `DECK_MODES.cardTitle`
- `app/reports/page.tsx` - Pitches filter widened to `isDeckModeSlug`
- `scripts/verify-deck-verdict-panels.ts` - ten-assertion proof of the extras-slot contract per mode

## Decisions Made
- `pitch-deck`'s report title now also resolves through `DECK_MODES.cardTitle` ("Investor pitch deck") instead of its old hardcoded literal ("Investor pitch") — the plan's instruction to prefer a table-driven default for "any deck-mode slug" reads as including the investor deck; confirmed no script or page depends on the old literal string before making this change.
- Below-slot panel order changed from (Negotiation, Timeline) to (Timeline, Negotiation, Verdict) for the investor deck, to match the plan's explicitly stated extras.below order for all five modes. No check anywhere asserts panel order, only presence/absence and rendered text, so this is not a regression.
- `formatUsd` copied locally into `DeckVerdictPanel.tsx` rather than exported from `NegotiationTriplePanel.tsx`, per the plan's own fallback instruction and because that file is outside this plan's `files_modified` scope.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' own `<verify>`/`<done>` criteria were met without needing an architectural change or an out-of-scope fix.

## Issues Encountered
- Mid-task-3 verification, an unrelated `git checkout HEAD~3 -- .` (run to compare `verify-report-structure.ts` failures against an older commit) briefly reverted the three Task-2 files (`ReportChrome.tsx`, `title.ts`, `app/reports/page.tsx`) to their pre-plan content on disk. Caught immediately via `git status`; restored with `git checkout HEAD -- <files>` back to the already-committed Task 2 state, and the pre-existing unrelated stash (a `.planning/PROJECT.md` timestamp diff that predates this plan) was returned via `git stash pop`. Re-ran the full verification suite afterward to confirm no content was lost — `tsc`, all five verify scripts, and `npm run build` all matched their pre-incident results. No commit was affected; the three task commits were never at risk, only the working tree momentarily.
- `scripts/verify-report-structure.ts` shows 4 pre-existing failures (`resolve pitch-funding/pitch-product/pitch-talk/pitch-general: ... requires an instance`), confirmed via a disposable `git worktree` checked out at the commit immediately before this plan's Task 1 (`09ca791`) — the same 4 failures reproduce there. Out of this plan's scope (report-page JSON-schema validation fixtures, not report chrome); not fixed here.
- `scripts/verify-pitch-types.ts` shows exactly the one pre-existing, out-of-scope elevator failure documented in `18-PITCH-TYPES-REGRESSION.md`. Confirmed unchanged by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `scripts/verify-report-chrome-coverage.ts`: **BEFORE** this plan, 4 FAIL (`getReportChrome("pitch-funding"/"pitch-product"/"pitch-talk"/"pitch-general")`). **AFTER**: all 13 `ENGINE_TYPES` slugs resolve chrome and rubric dimensions — "All 13 engine types have report chrome + dimensions." The three-wave-deferred chrome gap is cleared.
- `scripts/verify-pitch-types.ts`: exactly 1 pre-existing ELEVATOR failure (Phase 18, `18-PITCH-TYPES-REGRESSION.md`), unchanged and not owned by this plan.
- `scripts/verify-deck-verdict-panels.ts`: ALL PASS (10/10 assertion groups).
- `scripts/verify-pitch-report-panels.ts`: still passes, unaffected by the chrome refactor.
- `npx tsc --noEmit` clean. `npm run build` succeeds. `git diff --stat` shows zero change under `app/practice/[type]/report/` across all three task commits (confirmed against the plan's pre-Task-1 commit).
- Plans 19-10/19-11 (keyboard UAT, human sign-off) now have a fully report-viewable deck family — no mode renders "Report not found," every mode has a readable title, and all five land under the Pitches filter on `/reports`.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-09*

## Self-Check: PASSED

All created/modified files and all three task commit hashes (`2722ee1`, `4a29315`, `7a07175`) verified present on disk and in git history.
