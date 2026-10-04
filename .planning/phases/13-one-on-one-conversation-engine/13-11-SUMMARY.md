---
phase: 13-one-on-one-conversation-engine
plan: 11
subsystem: ui
tags: [typescript, nextjs, case-study, PracticeSessionShell, dispatcher, REQ-59, REQ-61, REQ-68, REQ-69]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "SetupWizard + InstanceIntroStep + CameraConsentStep from 13-09"
  - phase: 13-one-on-one-conversation-engine
    provides: "PracticeSessionShell + /practice/[type] from 13-10"
  - phase: 13-one-on-one-conversation-engine
    provides: "/api/practice/session/{start,finish} + case-study checkpointing:none from 13-07"
provides:
  - "app/practice/[type]/[instanceId]/page.tsx — case-study INSTANCE page (wizard → shell)"
  - "components/practice/CaseStudySessionView.tsx — multi-role scenario playing UI on the engine"
  - "app/case-play/[caseId]/page.tsx — runtime dispatcher (ownerId → /practice/case-study/{id}); legacy admin branch inline"
affects: [13-12-practice-report-URL, 13-13-delete-legacy-routes, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime dispatcher on ownerId — never a static next.config redirect for /case-play/{id}"
    - "PracticeSessionShell wraps PracticeInterviewRoom OR CaseStudySessionView by instance.kind"
    - "case-study transcript durability stays /api/interaction/save; ZERO checkpoint calls"

key-files:
  created:
    - app/practice/[type]/[instanceId]/page.tsx
    - components/practice/CaseStudySessionView.tsx
  modified:
    - app/case-play/[caseId]/page.tsx
    - components/practice/PracticeSessionShell.tsx
    - components/practice/SetupWizard.tsx
    - components/practice/steps/CameraConsentStep.tsx

key-decisions:
  - "Case-study live UI is CaseStudySessionView (ported playing branch), not the interview room — PracticeSessionShell delegates by instance.kind so REQ-69 multi-role/save behavior is preserved."
  - "SetupLaunchResult.log carries the InteractionLog from practice session start; case-study launch CTA label is Start (not Start interview)."
  - "Finish still navigates to /case-play/{caseId}/report/{reportId} until 13-12 builds /practice/.../report."

patterns-established:
  - "INSTANCE pages at /practice/[type]/[instanceId]; instance-less types stay at /practice/[type]"
  - "isScenario = Boolean(caseData?.ownerId) remains the sole dispatcher discriminator"

requirements-completed: [REQ-59, REQ-61, REQ-68, REQ-69]
# Honesty: REQ-59/68 advanced (case-study on engine + instance URL) but legacy
# interview/case-play route trees and InterviewSessionShell remain until 13-13.
# REQ-61 case-study-as-INSTANCE is MET for the client path. REQ-69 human-confirmed
# for both scenario-on-engine and legacy-admin-inline (verdict below).

# Metrics
duration: 14min
completed: 2026-10-04
---

# Phase 13 Plan 11: Case-Study on Engine + Case-Play Dispatcher Summary

**Student-authored scenarios run at `/practice/case-study/{caseId}` on SetupWizard + PracticeSessionShell (CaseStudySessionView); old `/case-play/{caseId}` links redirect at runtime when `ownerId` is set; the legacy admin-case pipeline stays inline and human-confirmed unchanged.**

## Performance

- **Duration:** ~14 min autonomous (+ human verify)
- **Started:** 2026-10-04T03:06:48Z
- **Completed:** 2026-10-04T03:20:32Z
- **Tasks:** 3/3 (Task 3 = human-verify checkpoint)
- **Files modified:** 6 code files

## Accomplishments

- Built `/practice/[type]/[instanceId]` for `case-study`: load via `/api/case/get`, SetupWizard (`intro` → camera), start via `/api/practice/session/start`, session on PracticeSessionShell.
- Extracted `CaseStudySessionView` (multi-role, text/avatar, `/api/interaction/save`, finish with `log` + metrics) so case-study issues ZERO checkpoints.
- Converted `app/case-play/[caseId]/page.tsx` into a runtime dispatcher + deleted the duplicate scenario session pipeline; legacy `isScenario === false` path kept.
- Human verified both the scenario experience and the legacy admin-case pipeline.

## isScenario use-site map (before editing)

Recorded before Task 2 edits. **Before count: 22.**

| Line (pre-edit) | Kind | Role |
| --- | --- | --- |
| 67 | comment | Points at discriminator |
| 119 | definition | `isScenario = Boolean(caseData?.ownerId)` |
| 132 | comment | Scenario camera-gate locality |
| 296–311 | effect | Metrics consent fetch — scenario-only (`if (!isScenario) return`) |
| 414–420 | effect | Vocal capture create — scenario-only |
| 459, 487, 541 | effect | Visual capture when `isScenario && cameraMode === "ON"` |
| 729 | handler | `handleStart` scenario branch → `/api/scenario/session/start` |
| 1150, 1167, 1338 | handler | Vocal typed/spoken attach — scenario-only |
| 1444 | handler | `handleFinish` scenario branch → `/api/scenario/session/finish` |
| 1533 | handler | `releaseScenarioCapture` on save&exit |
| 1702–1828 | JSX | Camera gate, Explore hide, Start loading, consent dialog, copy |
| 2309 | JSX | Self-view + FaceDetectionBanner (scenario capture affordances) |

**After count: 5** (definition, dispatcher effect + comments, render-time redirect spinner gate).

`grep -n "api/scenario/session" "app/case-play/[caseId]/page.tsx"` → nothing.

### Blocks LEFT (ownership unclear or legacy-required)

None left as “unclear.” Everything removed was scenario-only (gated on `isScenario` or only referenced by that branch). Kept deliberately:

- All `if (!isScenario) return` **bodies** that were legacy-only were not the deletion target; scenario-only effects whose first line was `if (!isScenario) return` were removed entirely.
- Legacy `/api/interaction/{start,finish,save,get}`, text/avatar toggle, multi-role UI, unfinished-session resume, and the dead-but-present `avatarTimeLimitSeconds` state/UI (never set — 11-04 precedent) remain.

## Per-commit `git show --name-only`

**ae97636** `feat(13-11): run case-study on /practice/[type]/[instanceId]`
- `app/practice/[type]/[instanceId]/page.tsx`
- `components/practice/CaseStudySessionView.tsx`
- `components/practice/PracticeSessionShell.tsx`
- `components/practice/SetupWizard.tsx`
- `components/practice/steps/CameraConsentStep.tsx`

**cc10a99** `feat(13-11): dispatch student scenarios to /practice/case-study`
- `app/case-play/[caseId]/page.tsx`

**81f1dbe** `refactor(13-11): delete duplicate scenario pipeline from case-play`
- `app/case-play/[caseId]/page.tsx`

Git-index hazard check: each commit listed only this plan’s files (bracketed path staged with `-- "app/case-play/[caseId]/page.tsx"`).

## Human checkpoint verdict (Task 3)

User completed parts A and B and replied:

> **both verified**

### Part A — scenario on engine

- **Verdict:** PASS (covered by “both verified”)
- Local student-authored caseId used for instructions: `scn-having-a-good-time-cb1713fd` (owner Alice Johnson / `alice.johnson@case.edu`)
- URLs: `/practice/case-study/{caseId}` and old `/case-play/{caseId}` → runtime redirect

### Part B — legacy admin-case pipeline

- **Verdict:** PASS (covered by “both verified”)
- Local admin published case available: `testing` (`ownerId: null`) — URL stays `/case-play/testing`, no redirect
- Gap avoided: an admin-authored case **did** exist locally, so part B was verifiable

## Task Commits

Each task was committed atomically:

1. **Task 1: Build /practice/[type]/[instanceId] for case-study** - `ae97636` (feat)
2. **Task 2A: Dispatcher** - `cc10a99` (feat)
3. **Task 2B: Delete duplicate scenario pipeline** - `81f1dbe` (refactor)
4. **Task 3: Human verify** - no code commit; verdict **both verified** recorded above

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/practice/[type]/[instanceId]/page.tsx` — INSTANCE session page
- `components/practice/CaseStudySessionView.tsx` — scenario playing UI + save/finish
- `components/practice/PracticeSessionShell.tsx` — delegates case-study → CaseStudySessionView
- `components/practice/SetupWizard.tsx` — passes `log` on launch; `launchLabel`
- `components/practice/steps/CameraConsentStep.tsx` — `launchLabel` prop
- `app/case-play/[caseId]/page.tsx` — dispatcher + scenario pipeline removed

## Decisions Made

See `key-decisions` in frontmatter. Notably: interview-shaped PracticeSessionShell cannot host multi-role case-play UI; CaseStudySessionView is the case-study branch behind the same shell entry point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Case-study needs multi-role save UI, not interview room**
- **Found during:** Task 1
- **Issue:** PracticeSessionShell (13-10) is interview-shaped and has no `/api/interaction/save`; case-study must look/behave like today’s case-play and issue zero checkpoints.
- **Fix:** Extracted `CaseStudySessionView` from the case-play playing branch; PracticeSessionShell wraps and delegates when `instance.kind === "case-study"`; SetupWizard forwards `log` from start.
- **Files modified:** `CaseStudySessionView.tsx`, `PracticeSessionShell.tsx`, `SetupWizard.tsx`, `CameraConsentStep.tsx`, instance page
- **Committed in:** `ae97636`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required for REQ-69 / save-path non-negotiable; files beyond plan `files_modified` were necessary client-path completion (same class of deviation as 13-10’s chat-route fix).

## Issues Encountered

None blocking. Bracketed git pathspec hazard avoided by staging with quoted literal paths.

## User Setup Required

None.

## Next Phase Readiness

- 13-12 should switch case-study (and practice interview) finish URLs to `/practice/.../report/{id}`.
- 13-13 can add unambiguous static redirects and delete remaining duplicate legacy session clients.
- REQ-67 shared-DB migrate remains deferred (local only).

## Self-Check: PASSED

- FOUND: `.planning/phases/13-one-on-one-conversation-engine/13-11-SUMMARY.md`
- FOUND: `app/practice/[type]/[instanceId]/page.tsx`
- FOUND: `components/practice/CaseStudySessionView.tsx`
- FOUND: commit `ae97636`
- FOUND: commit `cc10a99`
- FOUND: commit `81f1dbe`
- FOUND: human verdict **both verified** recorded above
- FOUND: `isScenario` before=22 after=5
