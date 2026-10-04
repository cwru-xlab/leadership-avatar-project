---
phase: 14-practice-pitches
plan: 14
subsystem: report-ui
tags: [typescript, pitch, report, dto, chrome-extras, early-end, negotiation, overrun]

# Dependency graph
requires:
  - phase: 14-practice-pitches
    provides: "14-04 early-end cap + outcome schema; 14-09 ask/fair/settled; 14-13 live deck sessions for UAT"
  - phase: 13-one-on-one-conversation-engine
    provides: "13-02 toReportDto; 13-12 ReportChrome extras slot + one report page + ReportScoreCards"
provides:
  - "ReportDTO pitch fields: outcome record, terminationAtSeconds, slideHighWaterMark, slideReveals, timeBudgetSeconds, elapsedSeconds"
  - "PitchOutcomeBanner — named early-end outcome (not error styling)"
  - "NegotiationTriplePanel — ask vs settled vs fair from three distinct sources"
  - "DeckTimelinePanel — coverage, reveal timeline, noted overrun (no overrun score)"
  - "pitch-elevator / pitch-deck ReportChrome extras registration"
affects: [14-15-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pitch report panels declared only in ReportChrome extras — one report page never branches on typeSlug"
    - "Ask from inputSnapshot; settled from outcome; fair from inputSnapshot.fairValueBand — never derived from each other"
    - "Overrun is a noted fact from timeBudgetSeconds + elapsedSeconds; no rubric dimension"

key-files:
  created:
    - components/practice/report/PitchOutcomeBanner.tsx
    - components/practice/report/NegotiationTriplePanel.tsx
    - components/practice/report/DeckTimelinePanel.tsx
    - scripts/verify-pitch-report-panels.ts
  modified:
    - lib/report/dto.ts
    - components/practice/ReportChrome.tsx
    - scripts/verify-dc-report.ts
    - scripts/verify-networking-report-surfaces.ts

key-decisions:
  - "Split PITCH_ELEVATOR_CHROME (banner above) from PITCH_DECK_CHROME (nego + timeline below) rather than one shared chrome with empty slots"
  - "outcome typed as Record<string, unknown> | null via asOutcomeRecord — additive narrowing from unknown"
  - "One report page needed NO edit — extras slot + ReportScoreCards already dimension-driven (13-12)"
  - "13-02 did not cherry-pick interview fields; asInputSnapshot already passed the full union — confirmed, no defect"

patterns-established:
  - "New practice types contribute report panels only through ReportChrome.extras"
  - "Fixture script verify-pitch-report-panels.ts covers early-end / deal / no-deal / null trail / overrun cases"

requirements-completed: [P14-SC1, P14-SC4, P14-SC5]

# Metrics
duration: 8min
completed: 2026-10-04
---

# Phase 14 Plan 14: Pitch Report Surfaces Summary

**Early-end elevator and deck negotiation/timeline panels render through `ReportChrome` extras on the one report page — named outcomes, ask/settled/fair, and noted overrun with no page slug branch.**

## Performance

- **Duration:** ~8 min implementation + human-verify
- **Started:** 2026-10-04T15:48:55Z
- **Completed:** 2026-10-04T15:56:00Z
- **Tasks:** 3/3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Extended `ReportDTO` / `toReportDto` with pitch session fields and safe parsers (`asOutcomeRecord`, `asSlideReveals`, `computeElapsedSeconds`).
- Shipped three panels: early-end banner, negotiation triple, deck timeline/overrun.
- Registered elevator/deck extras in `ReportChrome`; interview/case-study chrome unchanged.
- Proved panel fixtures in `scripts/verify-pitch-report-panels.ts`; chrome coverage still green for all engine types.
- Human UAT **approved**.

## Human verify (Task 3) — verdict verbatim

> approved

## Task Commits

Each task was committed atomically:

1. **Task 1: Surface the pitch fields on the unified DTO and add the chrome extras slot** - `bd43829` (feat)
2. **Task 2: The three pitch report panels** - `990655b` (feat) — also wired elevator/deck extras registration
3. **Task 3: Read the reports from your real sessions** - human-verify — verdict `approved` (no code commit)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/report/dto.ts` — additive pitch fields + narrowing helpers; full `InputSnapshot` pass-through confirmed
- `components/practice/ReportChrome.tsx` — `PITCH_ELEVATOR_CHROME` / `PITCH_DECK_CHROME` with extras
- `components/practice/report/PitchOutcomeBanner.tsx` — named early-end banner (73 lines)
- `components/practice/report/NegotiationTriplePanel.tsx` — ask / settled / fair (223 lines)
- `components/practice/report/DeckTimelinePanel.tsx` — coverage, timeline, overrun (184 lines)
- `scripts/verify-pitch-report-panels.ts` — fixture render checks
- `scripts/verify-dc-report.ts` / `scripts/verify-networking-report-surfaces.ts` — fixture field sync

## Decisions Made

- One report page: **no edit required**. `renderReportExtras` + `ReportScoreCards` already consume declared dimensions and chrome extras (13-12).
- 13-02 cherry-picking: **none found** — `toReportDto` already passed `asInputSnapshot(row.inputSnapshot)` for the full union.
- Chrome registration lived with Task 2 panel files so each commit stayed typecheck-clean (Task 1 DTO-first).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sync ReportDTO fixture constructors after additive fields**
- **Found during:** Task 1
- **Issue:** `verify-dc-report.ts` and `verify-networking-report-surfaces.ts` constructed `ReportDTO` / `InteractionReport` without new null fields (`slideHighWaterMark`, `title`, etc.).
- **Fix:** Added the missing nulls so fixtures typecheck.
- **Files modified:** `scripts/verify-dc-report.ts`, `scripts/verify-networking-report-surfaces.ts`
- **Committed in:** `bd43829`

**2. [Rule 3 - Blocking] Parallel WIP `title` field already on DTO working tree**
- **Found during:** Task 1
- **Issue:** Uncommitted parallel work had already added `title` to `ReportDTO` / prisma client.
- **Fix:** Left `title` mapping in place so `toReportDto` stays aligned with the generated client; did not expand title UX in this plan.
- **Files modified:** `lib/report/dto.ts` (pre-existing title lines rode with Task 1)
- **Committed in:** `bd43829`

---

**Total deviations:** 2 auto-fixed (Rule 3)
**Impact on plan:** Necessary for compile cleanliness on a shared working tree. No scope creep; deferred broader deck modes untouched.

## Issues Encountered

None beyond the fixture/title sync above.

## User Setup Required

None.

## Next Phase Readiness

- Report halves of P14-SC1 / SC4 / SC5 are satisfied pending any 14-15 tuning.
- Do **not** implement deferred walk-out temperature auto-end or broader non-investor deck modes here.

## Self-Check: PASSED

- FOUND: `components/practice/report/PitchOutcomeBanner.tsx`
- FOUND: `components/practice/report/NegotiationTriplePanel.tsx`
- FOUND: `components/practice/report/DeckTimelinePanel.tsx`
- FOUND: `lib/report/dto.ts`
- FOUND: `components/practice/ReportChrome.tsx`
- FOUND: `bd43829`
- FOUND: `990655b`
