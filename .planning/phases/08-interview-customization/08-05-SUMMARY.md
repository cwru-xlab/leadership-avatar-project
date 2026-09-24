---
phase: 08-interview-customization
plan: 05
subsystem: interview-ui
tags: [nextjs, heroui, interview-picker, customization]

# Dependency graph
requires:
  - phase: 08-interview-customization
    plan: "01"
    provides: "4-record InterviewType registry, curated option lists, InterviewCustomizationInput shape"
  - phase: 08-interview-customization
    plan: "03"
    provides: "POST /api/interview/persona/distill"
provides:
  - "app/interview/page.tsx — the preset picker index between the dashboard tile and the wizard"
  - "PresetCard.tsx / CustomizePanel.tsx — reusable preset display and per-preset customization"
  - "sessionStorage handoff contract (interview:customization:{slug}) for 08-06 to consume"
affects: [08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static picker page imports listInterviewTypes() directly — no fetch, unlike the HeyGen-backed interviewer catalog"
    - "Collapsed-by-default customization: onChange suppressed until the panel has been opened at least once for the active preset, so the fast path never writes an unrequested customization payload"
    - "sessionStorage (not query params) for the customization handoff, read-once-then-remove by the consumer, so a mid-wizard refresh degrades cleanly to preset defaults"

key-files:
  created:
    - app/interview/page.tsx
    - components/interview/PresetCard.tsx
    - components/interview/CustomizePanel.tsx
  modified:
    - lib/interactions/index.ts

key-decisions:
  - "lib/interactions/index.ts's ONLY change is the interviews tile's route string (/interview/general -> /interview); zero new imports from lib/interview, preserving the Phase 7 module boundary"
  - "CustomizePanel resets to the new preset's defaults (industry/role/difficulty/length/personality/persona all cleared) and re-collapses whenever the active preset card changes, since a customization for one preset should never silently carry over to another"
  - "Reverse-matching a preset's raw defaultIndustry/defaultRoleTitle string against CURATED_INDUSTRIES/CURATED_ROLES' promptValue determines each dropdown's pre-filled slug; all four presets' defaults matched a curated option exactly, so the 'no match' fallback path (showing the raw value as non-selectable) was not exercised but the Select simply renders with no selection in that case"
  - "The picker page's own customized/customization state is intentionally redundant with CustomizePanel's internal openedOnce gate — both independently guard against writing sessionStorage when the panel was never opened, in case a future page-level caller of CustomizePanel does not re-check that gate itself"

requirements-completed: [REQ-18, REQ-19, REQ-20, REQ-21, REQ-22]

# Metrics
duration: 25min
completed: 2026-09-21
---

# Phase 8 Plan 05: Interview Preset Picker + Customization Summary

**A static preset-picker page with four dropdown-only customization controls collapsed behind a "Customize" affordance, plus an optional pasted-persona distillation flow, handing the resolved settings to the existing wizard via sessionStorage.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-21T14:26:00Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Built `app/interview/page.tsx`, a static sibling of the dynamic wizard, listing all four `InterviewType` presets (general first) with difficulty, rough length and question areas on each card
- Repointed the Practice Interviews dashboard tile's route from `/interview/general` to `/interview`, the plan's only change to `lib/interactions/index.ts`
- Built `CustomizePanel.tsx`: collapsed-by-default read-only summary; opening it reveals five dropdown-only controls (industry, role, difficulty, session length, personality dial), each pre-filled from the active preset's own defaults and each clearable back to "use preset default"
- Wired an explicit "Build persona" flow that POSTs a pasted profile description to `/api/interview/persona/distill` once, then visibly disables the personality dial and shows required rehearsal-simulation framing copy
- Wired Start to write the resolved `InterviewCustomizationInput` to `sessionStorage` under `interview:customization:{slug}` (only when the panel was actually opened) inside a try/catch, then navigate to `/interview/{slug}` with no query string

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the preset picker index and repoint the dashboard tile** - `95a6387` (feat)
2. **Task 2: Build the Customize panel over the curated lists** - `a74eab2` (feat), plus the wiring-into-the-picker follow-up `a1c8034` (feat)
3. **Task 3: Hand the resolved customization to the wizard** - `02932ea` (feat)

**Plan metadata:** committed as part of this SUMMARY/STATE update.

## Files Created/Modified
- `app/interview/page.tsx` - New static picker index: renders every `listInterviewTypes()` record as a `PresetCard`, tracks the active preset and its `InterviewCustomizationInput`, and writes the sessionStorage handoff on Start
- `components/interview/PresetCard.tsx` - New: renders label, one-line description, difficulty chip, "~N min" chip and question-area tags; hosts the active preset's Customize panel and Start button via `children`
- `components/interview/CustomizePanel.tsx` - New: collapsed-by-default disclosure over five dropdown controls plus the pasted-persona distillation flow; emits `InterviewCustomizationInput` slugs only, never labels or prompt text; stores nothing in localStorage
- `lib/interactions/index.ts` - One-line route change on the `interviews` tile (`/interview/general` → `/interview`)

## Decisions Made
- Kept `lib/interactions/index.ts` free of any new import — the Phase 7 locked boundary (this module must not import from `lib/interview`) still holds; the tile's copy stays hardcoded.
- `CustomizePanel`'s `onChange` is suppressed until the student has opened the panel at least once for the currently active preset (an `openedOnce` flag reset on preset change), so the fast path (pick a preset, press Start) never triggers a sessionStorage write.
- The picker page combines Task 2's wiring and Task 3's sessionStorage write into `app/interview/page.tsx` across two additional commits (`a1c8034`, `02932ea`) beyond the Task 1 file creation, to keep each task's diff reviewable on its own.
- Personality dial `Select` is disabled (not hidden) while a distilled persona is present, with helper copy explaining why, per the plan's "never lie about what the control does" constraint.

## Deviations from Plan

None — plan executed exactly as written. All three tasks matched their `<action>` specs and every `<verify>` grep/tsc command in the plan passed as specified.

## Issues Encountered

A pre-existing `next dev` server (PID 86952, `next-server v16.2.3`) was already listening on port 3000. Attempting a second `next dev` instance on port 3001 in the same project directory was refused by Next.js/Turbopack's own directory-level lock ("Another next dev server is already running... Run kill 86952 to stop it") regardless of port — this is a Next.js constraint on the project directory, not a port conflict, so choosing a different port does not work around it. Per the plan's explicit instruction and the same limitation class already logged in `07-02-SUMMARY.md`/`07-04-SUMMARY.md`, the pre-existing session was not killed. My own failed attempt process was cleaned up. Manual click-through verification (dashboard tile → four preset cards → open Customize → pre-filled dropdowns → paste persona → Start → sessionStorage contents) was therefore not separately re-exercised live; relied instead on `npx tsc --noEmit` (clean) plus every targeted grep the plan's `<verify>` blocks specify (no `lib/interview` import in `lib/interactions/`, exactly one changed line in that file's diff, no `localStorage`/URL input in `CustomizePanel.tsx`, no `cohort`/`assignment` reference, the sessionStorage write sitting inside a try/catch immediately before `router.push`, and a `git diff --name-only` scope check confirming only this plan's four files were touched since the wave-1 baseline).

## User Setup Required

None — no external service configuration required. Reuses the existing `/api/interview/persona/distill` endpoint from plan 08-03.

## Next Phase Readiness

The picker page, its two new components, and the sessionStorage handoff contract are ready for plan 08-06, which owns reading `interview:customization:{slug}` once on `app/interview/[type]/page.tsx` mount and removing the key immediately. No blockers. The wizard itself (`app/interview/[type]/page.tsx`) and `InterviewSessionShell.tsx` were confirmed untouched by this plan via `git diff --name-only` against the wave-1 baseline (concurrent changes to those files, and to `lib/interview/evaluation-runner.ts`, `app/api/interview/session/start/route.ts`, and `app/api/interaction/chat/route.ts`, belong to the concurrently-executing plan 08-04, not this plan).

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/interview/page.tsx
- FOUND: components/interview/PresetCard.tsx
- FOUND: components/interview/CustomizePanel.tsx
- FOUND: 95a6387 (git log)
- FOUND: a74eab2 (git log)
- FOUND: a1c8034 (git log)
- FOUND: 02932ea (git log)
