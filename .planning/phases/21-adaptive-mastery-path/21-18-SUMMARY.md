---
phase: 21-adaptive-mastery-path
plan: 18
subsystem: ui
tags: [nextjs, react, mastery-surface, api-route, navigation]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path (plan 13)
    provides: "toMasteryDTO(), MasteryDTO/CompetencyMasteryDTO/MasteryFigureDTO, TIER_DISCLOSURE — the single server exit this route calls exactly once and this component renders without re-deriving"
  - phase: 21-adaptive-mastery-path (plan 17)
    provides: "levelFor(), goalProgress() — consumed as-is, with the CURRENT figure (not lifetime) levelled, per this plan's own explicit instruction"
  - phase: 21-adaptive-mastery-path (plan 09)
    provides: "readContributions(), computeMastery(), the null-not-zero convention this surface must preserve all the way to the screen"
provides:
  - "app/api/mastery/route.ts — GET-only authenticated mastery endpoint (mastery + per-competency levels + goal progress + declared timezone)"
  - "components/mastery/MasteryPanel.tsx — overall + per-competency mastery rendering with zero computation"
  - "app/mastery/page.tsx — authenticated mastery page with loading/needs-login/error-with-retry states"
  - "config/site.ts — Mastery nav entry (additive) in studentNavItems"
  - "scripts/verify-mastery-surface.ts — 33-check, 7-section battery proving label presence, no-computation, reachability, and the empty-student payload"
affects: [21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clock read at the edge: the one `new Date()` call in the whole mastery chain happens inside the route handler, never inside computeMastery/goalProgress, matching 21-09's required-now-parameter design"
    - "Declared-default timezone over silent UTC fallback: `x-timezone` header or a named 'America/New_York' default — never the server process's own (UTC) zone — because a UTC day boundary is wrong for every student in this cohort"
    - "Level the CURRENT figure, not lifetime, as the primary per-competency level — a level is a claim about where a student stands now, and levelling the (usually more established) lifetime figure would show a level the student may no longer hold"
    - "Dual-figure labelling in words, not layout: every figure is paired with a literal <dt> text label ('All time' / 'Recent') so the lifetime/current distinction survives a screenshot, a colourblind reader, or a narrow viewport — 21-CONTEXT.md's named confusion risk"
    - "Null renders as 'Not yet measured', never 0% or a dash — a single formatPercent() function is the only place a percent becomes display text, so a null-to-string or NaN-to-string bug has exactly one place to hide"
    - "Independent-tier disclosure rendering: lifetime and current disclosures are both shown, each inline with its own figure, when they differ (an ESTABLISHED lifetime next to a THIN current); shown once when they match or only one exists"

key-files:
  created:
    - app/api/mastery/route.ts
    - components/mastery/MasteryPanel.tsx
    - app/mastery/page.tsx
    - scripts/verify-mastery-surface.ts
  modified:
    - config/site.ts

key-decisions:
  - "Levels were computed in the route for BOTH lifetime and current (keyed per competency as { current, lifetime }), but only the current level is rendered — the lifetime level is carried in the payload for a future surface rather than discarded, since 21-18's own files_modified did not forbid shipping it on the DTO even though the panel only displays current."
  - "The loaded-but-empty (brand-new student) state is handled inside MasteryPanel's own header branch (bothOverallNull), not as a fourth top-level page state — the page's three states (loading / needs-login / error-with-retry) plus the panel's internal empty branch together satisfy the plan's 'three states explicitly, empty reads as a starting point' requirement without a redundant second empty-check at the page level."
  - "Reused 21-17's forbidden-term negative-guard implementation (stripCommentsAndStrings/walkFiles/findForbiddenMatches) verbatim inside scripts/verify-mastery-surface.ts rather than importing it, since components/mastery/ and app/mastery/ did not exist when 21-17's own script ran its walk and could not have covered them — the duplication is deliberate and commented as such, matching the plan's explicit instruction."

requirements-completed: [REQ-105, REQ-106, REQ-116, REQ-119]

# Metrics
duration: ~45min
completed: 2026-10-21
---

# Phase 21 Plan 18: The Mastery Surface Summary

**A GET /api/mastery route, a zero-computation MasteryPanel with dual lifetime/current figures labelled in words (never layout alone), inline tier disclosure, levels and goals, and a reachable /mastery nav entry — closing REQ-105, REQ-106, REQ-116 and REQ-119 together**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-10-21
- **Tasks:** 3 (all auto)
- **Files modified:** 5 (4 created, 1 additively modified)

## Accomplishments

- `app/api/mastery/route.ts`: GET-only (no POST/PUT/PATCH/DELETE — mastery is derived, nothing to write), `no-store`, `readContributions` → `computeMastery` → `toMasteryDTO` (the DTO is the only serialization; the raw `MasteryResult` never reaches the response body), the clock read once at the edge, per-competency `levelFor` run on both the current and lifetime figures (current is the one the panel renders), and `goalProgress` with a declared `America/New_York` default — read from `x-timezone` when the client sends one, never silently defaulted to UTC.
- `components/mastery/MasteryPanel.tsx` (219 lines): an overall-figure header labelled "Recent form (last N days)" / "All time" (both words, not position/colour), a goals row ("Today: X of Y" / "This week: X of Y" with a met indicator, no streak/chain copy), and a per-competency `<ul>` breakdown — every competency, in order, each a `<dl>` with `<dt>`/`<dd>`-paired "All time" and "Recent" figures, the current level with a provisional marker and "Next level at N%", inline tier disclosure (both lifetime and current shown when they differ, once when they match), a literal "Not yet measured" for any null percent, and an `unmappedRowCount` note. The file imports no computation module and performs no threshold comparison — every value arrives pre-computed from the DTO.
- `app/mastery/page.tsx`: fetches `/api/mastery` with the browser's own `Intl` timezone in `x-timezone`, and renders loading / needs-login / error-with-retry / loaded states explicitly; the brand-new-student (all-null) case is handled inside the panel's own header so it reads as a starting point, not a failure.
- `config/site.ts`: one additive `{ label: "Mastery", href: "/mastery", icon: "ChartColumnBig" }` entry in `studentNavItems`, between `My Reports` and `Settings` — `ChartColumnBig` was already in `auth-navbar.tsx`'s `iconMap`, so no navbar change was needed. `git diff config/site.ts` shows exactly that one block added.
- `scripts/verify-mastery-surface.ts`: 33 checks across 7 sections, all passing with no `DATABASE_URL`/`OPENAI_API_KEY` — DTO completeness across all four tiers and seven competencies (incl. one all-null competency, zero `NaN` anywhere, clean JSON round-trip); the three required labels plus `<dt`/`<dl` proven present in the panel source; the panel proven to import none of `lib/mastery/compute`/`thinness`/`weights`/`ledger` and to contain no percent-threshold literal; the streak/unlock negative guard re-run over the two new directories 21-17's own walk could not have covered; REQ-106 reachability asserted with the guard proven to bite against a synthetic nav list with the `/mastery` entry removed; the route proven GET-only with no UTC fallback; and the empty-student payload proven all-null, never all-zero.

## Task Commits

1. **Task 1: Add the GET /api/mastery route** - `a6c83ae` (feat) — `app/api/mastery/route.ts`
2. **Task 2: Build the mastery panel and page** - `1c5222b` (feat) — `components/mastery/MasteryPanel.tsx`, `app/mastery/page.tsx`, `config/site.ts`
3. **Task 3: Verify the surface shows what it must and computes nothing** - `3dab7f8` (test) — `scripts/verify-mastery-surface.ts`

## Files Created/Modified

- `app/api/mastery/route.ts` - GET-only route: contributions → computeMastery → toMasteryDTO, plus per-competency levels and goal progress
- `components/mastery/MasteryPanel.tsx` - overall + per-competency mastery rendering, zero computation
- `app/mastery/page.tsx` - authenticated mastery page with explicit loading/error/empty handling
- `config/site.ts` - one additive `studentNavItems` entry (`Mastery`, `/mastery`, `ChartColumnBig`)
- `scripts/verify-mastery-surface.ts` - 33-check, 7-section surface verifier

## Decisions Made

See `key-decisions` in frontmatter: levels computed for both windows but only current rendered; the empty-student state handled inside the panel rather than as a redundant fourth page-level state; 21-17's negative-guard implementation deliberately duplicated (not imported) to cover the two directories that did not exist at 21-17's execution time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comments in the route handler accidentally inflated literal `toMasteryDTO`/`MasteryResult` match counts against the plan's own grep checks**
- **Found during:** Task 1, running the plan's `<verify>` grep checks after writing the route
- **Issue:** Explanatory comments restating "the ONLY serialization path for a MasteryResult" literally repeated both checked identifiers, pushing `grep -c 'toMasteryDTO'` and `grep -c 'MasteryResult'` above the values the plan's verify step expected (the same class of self-referential-grep issue 21-09 and 21-13 both hit).
- **Fix:** Reworded the comment to describe the same guarantee ("the ONLY serialization call in this route", "the raw arithmetic output") without repeating the literal identifier names. No behavior change.
- **Files modified:** `app/api/mastery/route.ts`
- **Verification:** Re-ran the grep checks (`toMasteryDTO` count 2 — import + call; `MasteryResult` count 0, confirming it is never returned directly), re-ran `npx tsc --noEmit` (clean), re-ran `npm run build` (`/api/mastery` in the manifest).
- **Committed in:** `a6c83ae` (caught before the Task 1 commit, not a separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, comment-text-only, caught before committing).
**Impact on plan:** No scope creep; no behavior changed.

## Issues Encountered

One transient, non-blocking `tsc`/build failure was observed mid-execution (`app/api/study-plans/[planId]/path/route.ts` referencing an export `lib/study-plan/coached/runtime.ts` did not yet have), caused by a concurrent sibling executor's (21-19's) in-progress, untracked working-tree state — not this plan's files, and not something this plan's `files_modified` scope covers. It resolved on its own (the sibling completed its edit) within the same session; `npx tsc --noEmit` and `npm run build` both ran clean on re-check before and after, and this plan's own three commits only ever touched its five owned paths (confirmed via explicit pathspecs on every commit).

## User Setup Required

None - no external service configuration required. The route reads the already-configured `DATABASE_URL` (local dev database, migrated, confirmed by `plan_specific_notes`); the verifier itself (`scripts/verify-mastery-surface.ts`) is database-free by design, matching the 21-13/21-17 precedent.

## Requirement Status

**REQ-105** ("Every mastery figure carries its evidence count and an explicit `thin` flag... SHOWN with its thinness flagged — never withheld, and never presented as if well-evidenced") — now genuinely Complete. 21-13 built the server-side guarantee; this plan renders it: every figure's disclosure text is shown inline next to the figure it qualifies whenever non-null, and a null figure reads "Not yet measured" rather than being withheld or shown bare.

**REQ-106** ("The student sees an overall mastery percentage plus a per-competency breakdown, with the lifetime and current-window figures labelled so the distinction is unmistakable, and thinness visible. The surface is REACHABLE from the authenticated student navigation") — now genuinely Complete. The overall figure, the per-competency `<dl>` breakdown with literal "All time"/"Recent" labels, and the `Mastery` nav entry (proven reachable and icon-mapped by the verifier, with the guard proven to bite) are all shipped.

**REQ-116** ("Completing a coached session produces a scored contribution that moves the student's VISIBLE mastery figure... the student can complete a coached session and then see the figure change on the mastery surface") — now genuinely Complete. 21-16 already wrote the coached-weight contribution to the ledger; this plan is what makes the figure VISIBLE — the route reads fresh from the ledger on every `no-store` GET, so a coached session's contribution is reflected the next time a student loads `/mastery`.

**REQ-119** ("Per-competency levels with declared thresholds and daily/weekly goals with declared defaults exist. Streaks and unlocking exist NOWHERE in the surface") — now genuinely Complete. 21-17 built `levelFor`/`goalProgress`; this plan renders both (level name, provisional marker, next target; daily/weekly completed-of-target with a met indicator) and re-proves the streak/unlock absence specifically over the two new directories this plan introduced.

All four checkboxes and Traceability rows in `.planning/REQUIREMENTS.md` were verified in agreement (both flipped `[x]` / `Complete`) via `git diff`, which touched exactly those eight lines and nothing else.

## Next Phase Readiness

The mastery surface (`app/api/mastery/route.ts`, `components/mastery/MasteryPanel.tsx`, `app/mastery/page.tsx`) and its nav entry are ready for 21-20's calibration/sign-off pass, which collects every PROVISIONAL-tagged figure across the phase (including 21-13's `THINNESS_THRESHOLDS` and 21-17's `LEVEL_THRESHOLDS`/`GOAL_DEFAULTS`, both consumed unmodified here) and the phase's human UAT. Only `app/api/mastery/route.ts`, `components/mastery/MasteryPanel.tsx`, `app/mastery/page.tsx`, `config/site.ts` and `scripts/verify-mastery-surface.ts` were touched; confirmed via `git status --short` and explicit pathspecs on every commit, alongside a concurrent sibling executor on 21-19 (`app/reports/page.tsx` was not touched by this plan). `.planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` was not touched. No blockers.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: `app/api/mastery/route.ts`
- FOUND: `components/mastery/MasteryPanel.tsx`
- FOUND: `app/mastery/page.tsx`
- FOUND: `scripts/verify-mastery-surface.ts`
- FOUND: `config/site.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-18-SUMMARY.md`
- FOUND: commit `a6c83ae` (Task 1)
- FOUND: commit `1c5222b` (Task 2)
- FOUND: commit `3dab7f8` (Task 3)
