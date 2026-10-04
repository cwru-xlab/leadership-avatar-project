---
phase: 13-one-on-one-conversation-engine
plan: 12
subsystem: ui
tags: [typescript, nextjs, ReportChrome, practice-report, rubric-dimensions, REQ-59, REQ-66, REQ-69, REQ-71, REQ-72]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "Local backfilled InteractionReport rows + seeded fixed UUIDs from 13-04"
  - phase: 13-one-on-one-conversation-engine
    provides: "/api/practice/report/[reportId] unified GET + retry from 13-08"
  - phase: 13-one-on-one-conversation-engine
    provides: "Type registry + rubricDimensions from 13-01/13-05; /practice session pages from 13-10/13-11"
provides:
  - "app/practice/[type]/report/[reportId]/page.tsx — one report page for all types"
  - "components/practice/ReportChrome.tsx — per-type poll/give-up/retry/401/customization-strip chrome (REQ-69)"
  - "Finish navigation from /practice sessions → /practice/.../report/{id}"
affects: [13-13-delete-legacy-routes, 13-14-req66-acceptance, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Report chrome is a per-type descriptor (not a design) — converging cadences/401 is forbidden under REQ-69"
    - "Score cards receive scores built by iterating config rubric dimensions; no hardcoded dimension keys in the page"
    - "Interview customization strip is chrome-gated; scenario snapshot strip is input.kind === scenario only"

key-files:
  created:
    - components/practice/ReportChrome.tsx
    - app/practice/[type]/report/[reportId]/page.tsx
  modified:
    - lib/engine/resolve.ts
    - app/practice/[type]/page.tsx
    - app/practice/[type]/[instanceId]/page.tsx

key-decisions:
  - "Chrome values transcribed verbatim from legacy pages: interview 2000/120000/retry/401/no-404-guard/strip; case-study 3000/180000/check-again/no-401/404-guard/no-strip."
  - "listRubricDimensionsForSlug exports dimension list without requiring an instance so the report page can stay dimension-driven for case-study."
  - "Finish nav updated to /practice/{type}/report/{id} (and /practice/case-study/report/{id}); old report pages left intact for 13-13 deletion."

patterns-established:
  - "One /practice/[type]/report/[reportId] page; per-type divergences live in ReportChrome, not forked pages"
  - "ReportScoreCards and ReportBody stay untouched — page builds scores/props from config + unified ReportDTO"

requirements-completed: [REQ-59, REQ-66, REQ-69, REQ-71, REQ-72]
# Honesty: REQ-66 visual parity confirmed for the three seeded shapes at new URLs;
# full phase REQ-66 acceptance (redirects + delete legacy) remains 13-13/13-14.
# Shared-DB migrate still deferred (REQ-67).

# Metrics
duration: 8min
completed: 2026-10-04
---

# Phase 13 Plan 12: Unified Practice Report Page Summary

**One `/practice/[type]/report/[reportId]` page renders interview and case-study reports from config-declared rubric dimensions, with ReportChrome preserving every pre-Phase-13 poll/401/strip divergence; human verdict: reports identical.**

## Performance

- **Duration:** ~8 min (autonomous tasks) + human verify
- **Started:** 2026-10-04T03:21:25Z
- **Completed:** 2026-10-04T03:29:43Z
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 5

## Accomplishments

- Declared per-type report chrome with exact legacy cadences and semantics (REQ-69).
- Built the one report page polling `/api/practice/report/{id}`, dimension-driven scores via `listRubricDimensionsForSlug`, conditional customization strip vs scenario snapshot strip.
- Switched `/practice` finish navigation to the new report URLs.
- Human side-by-side confirmed old vs new parity for populated interview, legacy interview, and scenario.

## Chrome descriptor values (sourced from legacy pages)

| Field | Interview presets | case-study | Source |
|---|---|---|---|
| `pollIntervalMs` | 2000 | 3000 | `POLL_MS` in each legacy report page |
| `giveUpAfterMs` | 120000 | 180000 | `POLL_GIVE_UP_MS` |
| `stalledAffordance` | `"retry"` | `"check-again"` | FAILED → retry endpoint vs back-to-practice |
| `distinguishes401` | true | false | interview `needsLogin` branch; scenario has none |
| `guardsRepollAfter404` | false | true | scenario `hasLoadedOnceRef` + `notFound` poll stop |
| `showsCustomizationStrip` | true | false | `ReportCustomizationStrip` only on interview |

Nothing could not be preserved — no Rule 4 checkpoint raised.

## Human verification verdict

**Verbatim: `reports identical`**

Initial 404s on the seeded rows were because the browser session was logged in as a different user than the seed-row owner (`phase13-seed@case.edu`). Report APIs are owner-scoped (404-never-403), so a non-owner looks identical to a missing id. After logging in as the seed user, all three old/new pairs matched (including no customization strip on scenario; legacy Visual/Vocal “Not yet measured”).

## Task Commits

1. **Task 1: Per-type report chrome, divergences intact** - `86410f6` (feat)
2. **Task 2: The one report page, rendering declared dimensions** - `e71c127` (feat)
3. **Task 3: Side-by-side report comparison** - human-verify (no code commit); verdict recorded here

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `components/practice/ReportChrome.tsx` — per-type chrome descriptor + header forbidding convergence
- `app/practice/[type]/report/[reportId]/page.tsx` — unified report page
- `lib/engine/resolve.ts` — `listRubricDimensionsForSlug` for dimension-driven score maps
- `app/practice/[type]/page.tsx` — finish → `/practice/{slug}/report/{id}`
- `app/practice/[type]/[instanceId]/page.tsx` — finish → `/practice/case-study/report/{id}`

Untouched (verified): `ReportScoreCards.tsx`, `ReportBody.tsx`, `ReportCustomizationStrip.tsx`, both legacy report pages.

## Decisions Made

- Chrome is transcribed divergence data under REQ-69, not a redesign.
- Dimension list comes from engine config; `ReportScoreCards` still receives the same `{scores, pending, metrics}` prop shape without editing that shared leaf.
- `terminationReason` is recorded but not rendered (deferred to Phase 14 per CONTEXT.md).

## Deviations from Plan

None - plan executed exactly as written.

Finish-nav update was in wave context / 13-11 handoff and included in Task 2 with the new page (not an unplanned deviation).

## Issues Encountered

Human verify initially saw 404s until switching to `phase13-seed@case.edu` — expected owner-only scoping, not a page bug.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 13-13 can delete legacy report pages and add permanent redirects for old URLs.
- 13-14 can use this page + seeded ids for REQ-66 acceptance screenshots.
- Shared-DB migrate remains deferred (REQ-67); local only.

## Self-Check: PASSED

- FOUND: `app/practice/[type]/report/[reportId]/page.tsx`
- FOUND: `components/practice/ReportChrome.tsx`
- FOUND: `86410f6`
- FOUND: `e71c127`

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*
