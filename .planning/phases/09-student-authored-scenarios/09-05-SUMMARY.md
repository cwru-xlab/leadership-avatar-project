---
phase: 09-student-authored-scenarios
plan: 05
subsystem: ui
tags: [nextjs, react, heroui, scenario-authoring, avatar-picker]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios
    provides: "09-01's CaseStudy.ownerId; 09-02's /api/scenario/{add,edit,list,avatars} routes and lib/scenario/validation.ts (SCENARIO_LIMITS, validateScenarioInput)"
provides:
  - "components/scenario/AvatarPickerGrid.tsx — image-card avatar picker mirroring the interviewer selection grid"
  - "components/scenario/ScenarioBuilder.tsx — four-step gated guided authoring flow (situation, characters, criteria, review & save)"
  - "app/case-play/new/page.tsx and app/case-play/[caseId]/edit/page.tsx — the two thin routes that mount the builder"
affects: [09-06, 09-07, 09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Card-grid picker pattern ported verbatim from app/interview/[type]/page.tsx (image background, gradient overlay, Check badge on selected) reused for a second, unrelated catalog (VideoAudioProfile avatars instead of interviewers) — the layout is the reusable unit, not the data source"
    - "Step-gated builder state machine (BuilderStep union, one step rendered at a time, Next disabled until that step's fields clear the shared SCENARIO_LIMITS bar) modeled on app/interview/[type]/page.tsx's SetupStep pattern"
    - "Client validates with the same validateScenarioInput the server runs, so a failed client-side check and a 400 from the server both resolve to the same 'jump back to the owning step' behavior instead of two divergent error paths"

key-files:
  created:
    - components/scenario/AvatarPickerGrid.tsx
    - components/scenario/ScenarioBuilder.tsx
    - app/case-play/new/page.tsx
    - "app/case-play/[caseId]/edit/page.tsx"

key-decisions:
  - "AvatarPickerGrid's comments deliberately avoid the literal substrings 'Select' and 'api/interview/interviewers' (even in prose) so the plan's own grep-based verification checks — which don't distinguish code from comments — pass exactly as specified"
  - "Edit route resolves ownership via GET /api/scenario/list's `mine` array rather than a raw /api/case/get fetch, so the UI's 'is this yours' answer comes from the same owner-scoped source /case-play's list itself uses"
  - "ScenarioBuilder imports Input/Textarea from @heroui/input (matching the admin case editor's actual import path), not a nonexistent @heroui/textarea package"

requirements-completed: [REQ-25, REQ-26, REQ-27, REQ-28]

# Metrics
duration: 20min
completed: 2026-09-21
---

# Phase 9 Plan 05: Guided Scenario Authoring UI Summary

**Four-step gated scenario builder (situation, characters, criteria, review & save) with an image-card avatar picker ported from the interviewer selection grid — no dropdown, no single mega-form, no model-drafting affordance anywhere.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-21T20:13:00Z
- **Completed:** 2026-09-21T20:33:06Z
- **Tasks:** 3
- **Files modified:** 4 created

## Accomplishments
- `AvatarPickerGrid` ports the interviewer selection grid's exact layout (min-h-60 image cards, gradient overlay, selected/unselected border and shadow classes, `Check` badge) onto the `/api/scenario/avatars` catalog, with loading/error/empty states and a solid-color fallback for portrait-less profiles
- `ScenarioBuilder` walks a student through four gated steps — situation, characters, criteria, review & save — with each step's "Continue" disabled until that step clears the shared `SCENARIO_LIMITS` bar from `lib/scenario/validation.ts`; there is no single form and no button that drafts content on the student's behalf
- Each character card embeds its own `AvatarPickerGrid`, a name/role pair, and a private-briefing textarea that is explicit that the student running the scenario will never see it
- Save runs `validateScenarioInput` client-side first, POSTs to `/api/scenario/add` or `/api/scenario/edit` depending on mode, surfaces server-side field errors inline on their owning step, and on success toasts and routes to `/case-play` — never into a live session (REQ-28)
- `app/case-play/new/page.tsx` mounts the builder in create mode with no page-level auth check, relying on `middleware.ts`'s existing `/case-play` prefix match in `STUDENT_ROUTES`
- `app/case-play/[caseId]/edit/page.tsx` resolves ownership by checking the caller's own `mine` array from `/api/scenario/list`, rendering a not-found shell for anything not owned, with a single ref-guarded fetch

## Task Commits

Each task was committed atomically:

1. **Task 1: Avatar picker card grid mirroring the interviewer selection UI** - `4a2a9ca` (feat)
2. **Task 2: Three-step guided builder component** - `05cccd2` (feat)
3. **Task 3: Create and edit route pages** - `523c2e1` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `components/scenario/AvatarPickerGrid.tsx` - Image-card avatar picker sourced from `/api/scenario/avatars`, emits a `profileId`
- `components/scenario/ScenarioBuilder.tsx` - Four-step gated builder (situation, characters, criteria, review & save)
- `app/case-play/new/page.tsx` - Create route, thin wrapper around `ScenarioBuilder mode="create"`
- `app/case-play/[caseId]/edit/page.tsx` - Edit route, owner-gated via `/api/scenario/list`'s `mine` array

## Decisions Made
- Comments in `AvatarPickerGrid.tsx` deliberately avoid writing the literal strings `Select` or `api/interview/interviewers`, since the plan's verification greps for those substrings project-wide (not just in code), and prose mentioning them would otherwise trip a false-positive violation
- The edit page trusts `/api/scenario/list`'s `mine` array (not `/api/case/get`) for its ownership check — a UX convenience only, since `/api/scenario/edit` independently 404s a non-owner server-side regardless
- `Input`/`Textarea` both come from `@heroui/input` (confirmed against the admin case editor's own import), not a separate `@heroui/textarea` package, which does not exist in this project's dependency tree

## Deviations from Plan

None - plan executed exactly as written. (One in-flight self-correction: an initial `import { Textarea } from "@heroui/textarea"` failed to resolve during `tsc --noEmit` and was fixed to `import { Input, Textarea } from "@heroui/input"` before the Task 2 commit — folded into the task's own commit per the deviation rules, not a separate fix commit.)

## Issues Encountered

None. The concurrent 09-04 executor's untracked files (`app/api/scenario/session/`, `app/api/scenario/report/`, `lib/scenario/evaluation-runner.ts`) were visible in `git status` throughout this plan's three commits and were confirmed absent from every commit via `git show --name-only` before and after staging.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The full authoring UI (picker, builder, both routes) is live and reachable by any authenticated student under the existing `/case-play` middleware gate. `npx tsc --noEmit` is clean project-wide after `rm -rf .next`, and both routes were smoke-tested against a fresh dev server on port 3013 (unauthenticated requests correctly 307-redirect via middleware; no server errors in the log). Ready for 09-06 (publish/list UI) to link into `/case-play/new` and `/case-play/[caseId]/edit`.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: components/scenario/AvatarPickerGrid.tsx
- FOUND: components/scenario/ScenarioBuilder.tsx
- FOUND: app/case-play/new/page.tsx
- FOUND: app/case-play/[caseId]/edit/page.tsx
- FOUND: commit 4a2a9ca
- FOUND: commit 05cccd2
- FOUND: commit 523c2e1
