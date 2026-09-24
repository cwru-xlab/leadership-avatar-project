---
phase: 07-interaction-dashboard
plan: 01
subsystem: registry
tags: [typescript, data-registry, lucide-react]

# Dependency graph
requires: []
provides:
  - "lib/interactions/types.ts — InteractionAvailability union and InteractionType interface"
  - "lib/interactions/index.ts — INTERACTION_TYPES (5 records) plus listInteractionTypes()/getInteractionType() accessors"
affects: [07-interaction-dashboard (dashboard UI plans that render tiles from this registry)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf data-registry module with zero imports, mirroring lib/interview/types.ts's slug-lookup pattern"
    - "Icon stored as a lucide-react icon-name string, resolved through a local map at the render layer (not imported here)"

key-files:
  created:
    - lib/interactions/types.ts
    - lib/interactions/index.ts
  modified: []

key-decisions:
  - "Interviews tile copy/route hardcoded in lib/interactions, not derived from INTERVIEW_TYPES — keeps lib/interactions a leaf with zero cross-module imports"
  - "listInteractionTypes() sorts live before coming-soon at read time so declaration order in the array carries no semantic weight"
  - "Meeting-facilitation interaction intentionally left unregistered (parked by user as a possibly multi-party experience)"

patterns-established:
  - "Adding a sixth interaction type requires only a new record in lib/interactions/index.ts; no new page or route needed for a coming-soon entry"

requirements-completed: [REQ-11]

# Metrics
duration: 8min
completed: 2026-09-21
---

# Phase 07 Plan 01: Interaction Type Registry Summary

**Standalone `lib/interactions` registry (types.ts + index.ts) describing the five leadership interaction types — Practice Interviews and Case Studies live, Pitches/Difficult Conversations/Networking coming-soon — with zero imports from `lib/interview`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-21T03:09:00Z
- **Completed:** 2026-09-21T03:17:40Z
- **Tasks:** 2 completed
- **Files modified:** 2 created

## Accomplishments
- `InteractionType`/`InteractionAvailability` shape defined as a pure data leaf (zero imports)
- Five interaction types registered with live-first sorted listing and slug-based lookup, matching the `lib/interview/types.ts` accessor pattern

## Task Commits

1. **Task 1: Define the InteractionType shape** - `588a809` (feat)
2. **Task 2: Register the five interaction types with accessors** - `4231261` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `lib/interactions/types.ts` - `InteractionAvailability` union and `InteractionType` interface; zero imports
- `lib/interactions/index.ts` - `INTERACTION_TYPES` array (5 records), `listInteractionTypes()` (live-first sort), `getInteractionType(slug)` lookup

## Decisions Made
- Interviews tile's copy and route are hardcoded in `lib/interactions/index.ts` rather than derived from `lib/interview`'s `INTERVIEW_TYPES`, per the locked constraint that this module must never import from `lib/interview`.
- Icon field is a plain string (lucide-react icon name), not an imported component, keeping the module import-free; the dashboard will resolve it through its own icon map (same pattern as `components/auth-navbar.tsx`'s `iconMap`).
- `listInteractionTypes()` sorts by availability (`live` before `coming-soon`) at call time rather than relying on array declaration order, so the ordering rule lives in one place.

## Deviations from Plan

None - plan executed exactly as written. One incidental fix during verification: the file-header comment in `lib/interactions/index.ts` originally used the literal phrase "Leading a Meeting" to explain why that interaction type is absent; the plan's own verify step (`grep -ic "leading a meeting"` must return 0) would have failed against that comment, so the phrasing was reworded to "the meeting-facilitation interaction" before committing. No behavior change — Rule 3 (blocking issue for verification), fixed inline within Task 2, folded into that task's single commit.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
`lib/interactions` is ready to be consumed by the dashboard UI plans in this phase (icon-map resolution, tile rendering, live vs. coming-soon branching). No blockers.

---
*Phase: 07-interaction-dashboard*
*Completed: 2026-09-21*

## Self-Check: PASSED
- FOUND: lib/interactions/types.ts
- FOUND: lib/interactions/index.ts
- FOUND: 588a809
- FOUND: 4231261
