---
phase: 13-one-on-one-conversation-engine
plan: 09
subsystem: ui
tags: [typescript, nextjs, SetupWizard, CameraConsentStep, REQ-68, REQ-70, REQ-69]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "getEngineType / setupSteps on InteractionTypeConfig from 13-01"
  - phase: 13-one-on-one-conversation-engine
    provides: "/api/practice/session/start from 13-07"
provides:
  - "components/practice/SetupWizard.tsx — props-driven step machine + progress chrome + launch"
  - "components/practice/steps/CameraConsentStep.tsx — THE ONE CAMERA_BLOCK_COPY / consent gate (REQ-70)"
  - "InterviewerStep / ResumeStep / InstanceIntroStep step vocabulary for 13-11"
  - "app/practice/[type]/page.tsx — instance-less presets on the generic wizard (REQ-68 groundwork)"
affects: [13-10-session-shell, 13-11-case-study-dispatcher, 13-13-delete-legacy-routes, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type declares setupSteps; SetupWizard always appends CameraConsentStep before launch (REQ-70)"
    - "Step id → renderStep(nav) map — custom UI stays in step components, never in the wizard"
    - "createReportOnLaunch bridge until PracticeSessionShell consumes reportId (13-10)"

key-files:
  created:
    - components/practice/SetupWizard.tsx
    - components/practice/steps/CameraConsentStep.tsx
    - components/practice/steps/InterviewerStep.tsx
    - components/practice/steps/ResumeStep.tsx
    - components/practice/steps/InstanceIntroStep.tsx
    - app/practice/[type]/page.tsx
  modified:
    - lib/engine/types.ts
    - lib/engine/registry.ts

key-decisions:
  - "SetupWizard.createReportOnLaunch defaults true but /practice/[type] sets false so InterviewSessionShell's ensureReport does not orphan a second IN_PROGRESS row until 13-10."
  - "CustomizePanel stays on the preset picker — today's type-page wizard does not render it, so InterviewerStep does not either (REQ-69)."
  - "SetupStepDeclaration.optional added for resume skip; camera is never declared in setupSteps — the wizard appends it."

patterns-established:
  - "Wizard props contract + step-id vocabulary documented below for 13-11 case-study wiring"
  - "CAMERA_BLOCK_COPY has one new home; legacy copies deleted in 13-11/13-13"

requirements-completed: [REQ-70]
# REQ-68 groundwork MET (/practice/[type] for four presets) but the full tree
# (instance routes, redirects, legacy deletion) still belongs to 13-10..13-13.
# REQ-69 verified by human checkpoint verdict below.

# Metrics
duration: 8min
completed: 2026-10-04
---

# Phase 13 Plan 09: Generic Setup Wizard Summary

**One props-driven SetupWizard owns step machinery, progress chrome, and the single CameraConsentStep gate; `/practice/[type]` hosts it for the four interview presets with a human-confirmed identical flow to `/interview/[type]`.**

## Performance

- **Duration:** ~8 min active (+ human verify)
- **Started:** 2026-10-04T02:31:04Z
- **Completed:** 2026-10-04T02:38:20Z
- **Tasks:** 3/3 (Task 3 = human-verify checkpoint)
- **Files modified:** 8 created/modified

## Accomplishments

- Extracted `CameraBlockReason` / `CAMERA_BLOCK_COPY` into `CameraConsentStep` (REQ-70) — one new definition; the two legacy copies remain until 13-11/13-13 delete them.
- Built `SetupWizard` as a type-agnostic step machine: declared steps + progress + back/forward + camera gate + optional start POST.
- Populated interview `setupSteps` (`interviewer`, `resume`) and case-study (`intro`) on `InteractionTypeConfig`.
- `/practice/{general,technical,consulting,early-career}` renders the wizard and launches via existing `InterviewSessionShell`; unknown slugs show the handled not-found card.

## Wizard props contract (for 13-11)

`SetupWizard` (`components/practice/SetupWizard.tsx`):

| Prop | Role |
|---|---|
| `typeSlug` | Passed into the start POST body when `createReportOnLaunch` |
| `steps` | `SetupStepDeclaration[]` from `getEngineType(...).setupSteps` (camera NOT listed) |
| `renderStep(stepId, nav)` | Map step ids to components; `nav` has `goNext` / `goBack` / `stepNumber` / `totalSteps` / `optional` |
| `buildStartPayload?(cameraMode)` | Extra start-body fields (interviewer, resume, instanceId, …) |
| `onLaunch({ reportId, cameraMode })` | Page transitions to session |
| `createReportOnLaunch?` | Default `true` → POST `/api/practice/session/start`; `false` for InterviewSessionShell bridge |
| `initialStepId?` | Re-open on remount (e.g. `"resume"` after shell `onExit`) |
| `progressAriaLabel?` | Progress row a11y label |

Exported helpers: `SetupLaunchResult`, `SetupStepNav`, `PracticeStartPayload`.

## Step-id vocabulary

| Step id | Declared by | Component | Notes |
|---|---|---|---|
| `interviewer` | interview presets | `InterviewerStep` | Fetches `/api/interview/interviewers` |
| `resume` | interview presets (`optional: true`) | `ResumeStep` | Skip-for-now preserved |
| `intro` | `case-study` | `InstanceIntroStep` | Wired by 13-11 |
| `camera` | **always appended by SetupWizard** | `CameraConsentStep` | Never listed in `setupSteps` |

## Human checkpoint verdict (Task 3)

User compared `/interview/general` vs `/practice/general` side by side and replied verbatim:

> **identical**

## Task Commits

1. **Task 1: The generic wizard and the single camera consent gate** - `2aee0c2` (feat)
2. **Task 2: The /practice/[type] page for instance-less types** - `f95100f` (feat)
3. **Task 3: Confirm the new wizard is visually indistinguishable** - human-verify (no code commit); verdict recorded above

**Plan metadata:** (this commit)

## Files Created/Modified

- `components/practice/SetupWizard.tsx` — generic step machine
- `components/practice/steps/CameraConsentStep.tsx` — single consent gate + `CAMERA_BLOCK_COPY`
- `components/practice/steps/InterviewerStep.tsx` — interviewer catalog step
- `components/practice/steps/ResumeStep.tsx` — resume upload / skip
- `components/practice/steps/InstanceIntroStep.tsx` — instance intro for 13-11
- `app/practice/[type]/page.tsx` — instance-less engine session page
- `lib/engine/types.ts` — `SetupStepDeclaration.optional`
- `lib/engine/registry.ts` — populated `setupSteps` for interview + case-study

## Decisions Made

- Bridge `createReportOnLaunch={false}` on the practice page so the existing shell still creates the report on first turn (13-10 flips this when `PracticeSessionShell` takes `reportId`).
- Did not import `CustomizePanel` into `InterviewerStep` — it lives on the picker, not today's type-page wizard (REQ-69).
- Added `optional?: boolean` on `SetupStepDeclaration` for the resume skip affordance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Skip start POST while InterviewSessionShell owns ensureReport**
- **Found during:** Task 2
- **Issue:** Plan asked the wizard to POST `/api/practice/session/start` on launch, but the existing shell also POSTs `/api/interview/session/start` on first turn — double-create would orphan IN_PROGRESS rows (user-visible on `/reports`).
- **Fix:** `createReportOnLaunch` prop (default true); practice page sets `false` until 13-10.
- **Files modified:** `components/practice/SetupWizard.tsx`, `app/practice/[type]/page.tsx`
- **Verification:** skip-resume launch still starts a session via the shell path
- **Committed in:** `f95100f`

**2. [Rule 2 - Missing critical functionality] `optional` on SetupStepDeclaration**
- **Found during:** Task 1
- **Issue:** Plan requires optional resume; the 13-01 declaration type had no `optional` field.
- **Fix:** Added `optional?: boolean` and set it on the interview resume step.
- **Files modified:** `lib/engine/types.ts`, `lib/engine/registry.ts`
- **Committed in:** `2aee0c2`

---

**Total deviations:** 2 auto-fixed (Rule 3, Rule 2)
**Impact on plan:** Necessary for correctness / REQ-69; no scope creep. 13-10 moves launch POST to the default path.

## Issues Encountered

None beyond the documented bridge.

## User Setup Required

None.

## Next Phase Preview

Plan 13-10 builds `PracticeSessionShell`, switches `/practice/[type]` onto it, and should set `createReportOnLaunch={true}` so the wizard's `reportId` is consumed. Plan 13-11 wires `InstanceIntroStep` + case-study onto `/practice/case-study/[instanceId]`.

## Self-Check: PASSED

- FOUND: `components/practice/SetupWizard.tsx`
- FOUND: `components/practice/steps/CameraConsentStep.tsx`
- FOUND: `components/practice/steps/InterviewerStep.tsx`
- FOUND: `components/practice/steps/ResumeStep.tsx`
- FOUND: `components/practice/steps/InstanceIntroStep.tsx`
- FOUND: `app/practice/[type]/page.tsx`
- FOUND: commits `2aee0c2`, `f95100f`
- FOUND: human verdict recorded verbatim: identical
