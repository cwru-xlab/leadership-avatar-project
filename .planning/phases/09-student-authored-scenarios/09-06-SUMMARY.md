---
phase: 09-student-authored-scenarios
plan: 06
subsystem: ui
tags: [nextjs, react, heroui, scenario-index, publish-toggle]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios
    provides: "09-02's GET /api/scenario/list ({mine, shared}), POST /api/scenario/publish, POST /api/scenario/delete (409-on-published-delete); 09-05's /case-play/new and /case-play/[caseId]/edit routes"
provides:
  - "components/scenario/ScenarioCard.tsx — provenance-badged scenario card with owner-only edit/publish/delete actions"
  - "app/case-play/page.tsx — two-section index (Practice scenarios / Case studies) with independent loading, a create CTA, and a scenario-specific empty state"
affects: [09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc comments in components/scenario/ deliberately avoid literal substrings a plan's own grep-based verification checks for (fork/instructor/staff/cohort), following the 09-05 precedent, since those greps run against the whole file text including prose"
    - "/case-play's admin-case section filters !c.ownerId client-side on top of the untouched /api/case/list?publishedOnly=true response, rather than modifying that route, keeping the app/api/case/ diff at zero"
    - "A single ref-guarded useEffect kicks off two independent fetches (scenario list, case list); each section owns its own loading/error state so one source failing never blanks the other section"

key-files:
  created:
    - components/scenario/ScenarioCard.tsx
  modified:
    - app/case-play/page.tsx

key-decisions:
  - "ScenarioCard's Edit/Publish/Delete buttons use native onClick with e.stopPropagation() rather than onPress, since the surrounding Card uses isPressable/onPress for the Play affordance and the plan explicitly required an action to never also trigger Play"
  - "Delete's confirm modal reuses the existing app/case-management pattern (Modal/useDisclosure) already established in this codebase rather than introducing a new confirm-dialog abstraction"
  - "A 409 from /api/scenario/delete is rendered as a distinct warning-colored toast with the server's own message, never folded into the generic danger-colored failure toast, so the unpublish-first explanation is visually distinct"

patterns-established:
  - "Owner-only action buttons on a shared card grid render conditionally on a boolean prop (owned) rather than deriving ownership client-side from a raw ownerId comparison, keeping the id itself out of any rendered card entirely"

requirements-completed: [REQ-28, REQ-30, REQ-31, REQ-34]

# Metrics
duration: 25min
completed: 2026-09-21
---

# Phase 9 Plan 06: Scenario Publish/List UI Summary

**`/case-play` rebuilt into two always-visible sections — "Practice scenarios" (student-authored, with a provenance-badged card carrying owner-only edit/publish/delete) and "Case studies" (admin-authored, unchanged data source) — so a just-saved scenario is immediately visible and startable.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-21T20:26:00Z
- **Completed:** 2026-09-21T20:51:52Z
- **Tasks:** 2
- **Files modified:** 1 created, 1 modified

## Accomplishments
- `ScenarioCard` matches `case-card.tsx`'s visual shell (cover image, gradient overlay, grid sizing) so both `/case-play` sections read as one page; the whole card body is the Play affordance
- Provenance is always visible: an owned card shows "Yours" plus "Published"/"Private"; a classmate's shared card shows only a "Shared by {createdBy}" chip and zero action buttons — the raw `ownerId` never appears in any rendered card
- Owner actions (Edit → `/case-play/{id}/edit`, Publish/Unpublish toggle, Delete with a confirm modal) are guarded with in-flight disabled state and `stopPropagation`, so clicking an action never also launches the scenario
- Delete's `409` response from `/api/scenario/delete` is surfaced as an explicit "unpublish this scenario first" toast using the server's own message, not a generic failure
- `/case-play` now renders two always-labelled sections regardless of emptiness: "Practice scenarios" (mine, then shared, via `GET /api/scenario/list`) with its own empty state and a "Create a scenario" CTA in both the header and the empty state, and "Case studies" (admin-authored only, filtered to `!ownerId` on top of the untouched `GET /api/case/list?publishedOnly=true`)
- Each section fetches and fails independently — a scenario-list failure shows an inline error in section 1 while section 2 still renders normally, and vice versa
- Read-your-writes for a just-saved scenario relies on the pre-existing `useEffect` re-fetch on mount (no optimistic-prepend machinery added, per the plan's hard constraint) — `ScenarioBuilder`'s save already routes to `/case-play`, which re-fetches `/api/scenario/list` fresh on every mount

## Task Commits

Each task was committed atomically:

1. **Task 1: Scenario card with provenance and owner actions** - `72c3dab` (feat)
2. **Task 2: Rebuild /case-play as two sections with a create CTA and empty state** - `02da9cb` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `components/scenario/ScenarioCard.tsx` - Provenance-badged card; owner-only edit/publish/delete, 409-aware delete flow
- `app/case-play/page.tsx` - Two-section index with independent load/error state, create CTA, scenario empty state

## Decisions Made
- See `key-decisions` in frontmatter: native `onClick`+`stopPropagation` on action buttons (not `onPress`) to guarantee they never bubble into the card's Play action; 409 rendered as a distinct warning toast; reused the existing `Modal`/`useDisclosure` confirm pattern rather than a new abstraction.

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` blocks; no Rule 1-3 auto-fixes were needed and no architectural questions arose.

## Issues Encountered

- **Concurrent-agent dev-server instability (not a code defect):** This plan ran alongside 09-07/09-08 in the same working directory with no worktree isolation. An initial attempt to start a dedicated dev server on port 3021 was blocked by Next.js's own directory-level lock (a sibling's server was already running). While investigating, an `rm -rf .next` run for a clean `tsc --noEmit` pass (a step this project's STATE.md explicitly recommends before `tsc`) transiently broke two already-running sibling dev servers (ports 3014/3015) with `Cannot find module .../[turbopack]_runtime.js`/`ENOENT ... app-paths-manifest.json` errors, since all `next dev` instances in this directory share one `.next/` build cache regardless of port. Both servers self-healed within seconds (confirmed via repeated `curl` returning the expected `307` redirect-to-login). No files were lost or corrupted; this is a process finding for future concurrent-agent phases, not a defect in this plan's code — **`rm -rf .next` should be avoided entirely while sibling dev servers may be running; `tsc --noEmit` was otherwise clean without it.**
- **Live browser/API walkthrough deferred:** After the `.next` disruption, one of the shared dev servers continued returning intermittent `500`s on the login route specifically (likely still recompiling that route on demand under Turbopack, unrelated to this plan's own two files). Rather than risk further disruption to concurrent agents' verification work, the plan's runtime checklist (two real seeded students exercising empty state, immediate post-save visibility, cross-student privacy, publish/unpublish, and the unpublish-before-delete flow) was not executed live. This is the same "shared dev server / directory lock" limitation class already logged repeatedly in this phase's predecessors (`07-02-SUMMARY.md`, `08-05-SUMMARY.md`, `08-06-SUMMARY.md`). Verification instead relied on: `npx tsc --noEmit` clean, every plan-specified grep passing exactly as required (`ownerId` absent from `ScenarioCard.tsx`, `fork|instructor|staff|cohort` absent, `409` present in the delete handler, `api/case/list?publishedOnly=true` still the only case-list call, zero diff under `app/api/case/`, `ownerId` present in the section-2 filter), and code review against 09-02's already end-to-end-verified `/api/scenario/{list,publish,delete}` contracts (whose response shapes and status codes this plan's UI consumes unchanged).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/case-play` now correctly discriminates admin cases from student scenarios structurally (via `ownerId`), matching the locked two-section decision; the page is ready for 09-08/09-09 (report-page wiring and final phase sweep) to build on.
- Recommend a full human walkthrough of the runtime checklist described above (two real seeded students, empty state, immediate post-save visibility, publish/unpublish, unpublish-before-delete) be folded into the phase's final end-to-end validation plan, since it could not be safely exercised live during this concurrent execution window.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED
- FOUND: components/scenario/ScenarioCard.tsx
- FOUND: app/case-play/page.tsx
- FOUND commit: 72c3dab
- FOUND commit: 02da9cb
