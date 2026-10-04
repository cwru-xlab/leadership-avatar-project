---
phase: 13-one-on-one-conversation-engine
plan: 10
subsystem: ui
tags: [typescript, nextjs, PracticeSessionShell, HeyGen, visual-capture, REQ-59, REQ-62, REQ-63, REQ-69, REQ-72]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "engine chat descriptor + parseEngineTurn from 13-06"
  - phase: 13-one-on-one-conversation-engine
    provides: "/api/practice/session/{start,checkpoint,finish} from 13-07"
  - phase: 13-one-on-one-conversation-engine
    provides: "SetupWizard createReportOnLaunch + /practice/[type] from 13-09"
provides:
  - "components/practice/PracticeSessionShell.tsx — one config-driven live-session shell (REQ-59)"
  - "/practice/[type] session step on PracticeSessionShell with reportId from wizard start"
  - "Chat route engine.turnState / resumeText path for 13-10+ clients"
affects: [13-11-case-study-client, 13-12-practice-report-URL, 13-13-delete-InterviewSessionShell, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Port-not-rewrite: PracticeSessionShell is a parameterization of InterviewSessionShell (same hooks/JSX/class names)"
    - "Type-declared checkpointing: client-driven types checkpoint; checkpointing:\"none\" issues ZERO calls"
    - "createReportOnLaunch=true; shell seeds reportIdRef from wizard so ensureReport does not double-create"
    - "Metrics capture wired unconditionally; cameraMode remains a read-only prop (REQ-35/72)"

key-files:
  created:
    - components/practice/PracticeSessionShell.tsx
    - screenshots/13-10/interview-general-frame-budget.png
    - screenshots/13-10/practice-general-frame-budget.png
  modified:
    - app/practice/[type]/page.tsx
    - app/api/interaction/chat/route.ts

key-decisions:
  - "Practice finish still navigates to /interview/{slug}/report/{id} until 13-12 builds /practice/.../report — intentional, not a regression."
  - "Chat route prefers engine.turnState/resumeText and falls back to legacy interview payload so InterviewSessionShell stays live for comparison."
  - "Avatar termination opens the end-intent modal when parseEngineTurn returns non-null; built-ins always yield null (avatarMayEnd:false)."

patterns-established:
  - "PracticeSessionShell props contract for 13-11 (sessionConfig, reportId, cameraMode, avatar identity, resume*, customization)"
  - "Checkpoint gate reads getEngineType(typeSlug).checkpointing — never unconditional"

requirements-completed: []
# Advanced this plan, not fully closed in REQUIREMENTS.md (same honesty as 13-07/13-09):
# REQ-59 — practice path uses one shell + engine session routes; case-study client +
#   legacy tree deletion still 13-11/13-13.
# REQ-62 — already MET (13-03/13-07); shell honors parseEngineTurn termination (null today).
# REQ-63 — primitive already on sessionConfig; first restricting consumer is Phase 14.
# REQ-69 — human verdict **shell verified** for interview live room; case-study chrome
#   still 13-11/12; finish URL still legacy until 13-12 (intentional).
# REQ-72 — already MET (13-05); reinforced by unconditional capture + camera-off/typed-only runs.

# Metrics
duration: 26min
completed: 2026-10-04
---

# Phase 13 Plan 10: Generic Practice Session Shell Summary

**One config-driven `PracticeSessionShell` ports today's interview live room onto `/practice/[type]`, calling only engine session + chat endpoints, with human-confirmed parity (verdict: shell verified).**

## Performance

- **Duration:** ~26 min wall (Tasks 1–2 + human-verify)
- **Started:** 2026-10-04T02:39:19Z
- **Completed:** 2026-10-04T03:05:26Z
- **Tasks:** 3/3 (Task 3 = human-verify checkpoint)
- **Files modified:** 3 code + 2 screenshots

## Accomplishments

- Ported `InterviewSessionShell` → `PracticeSessionShell` without redesign: same capture re-entry guard (`visualStartingRef`), same teardown ordering (sync track stop then fire-and-forget `stop()`; end handler awaits `stop()` for the finish payload).
- Wired `/practice/[type]` onto the generic shell with `createReportOnLaunch` true; wizard `reportId` + locked `cameraMode` seed the session.
- Chat route accepts `engine.{typeSlug,instance,customization,resumeText,turnState}` so progress/timing reach `buildTailBlock` without the legacy `interview` key.
- Human live comparison: camera-on practice looks the same as interview; camera-off and typed-only runs succeeded with checkpoints.

## PracticeSessionShell props contract (for 13-11)

| Prop | Role |
|---|---|
| `sessionConfig` | `ResolvedSessionConfig` from page-owned `resolveSessionConfig` |
| `reportId` | Row from SetupWizard launch POST (seeded into `reportIdRef`) |
| `cameraMode` | Read-only `CameraMode` — shell cannot change it |
| `customization?` | Raw picker input resent verbatim every chat turn (REQ-23) |
| `interviewerName` / `interviewerAvatarId` / `avatarConfig` | Avatar identity |
| `resumeText` / `resumeFileName?` / `resumeId` | Resume context |
| `language` | Attempt language |
| `onExit` / `onFinish(reportId)` | Leave vs end-and-report |

## Diff vs InterviewSessionShell (parameterization only)

Every hunk is one of: props/config rename; `/api/practice/session/*` routes; `engine` chat descriptor + `parseEngineTurn`; checkpoint gate on `checkpointing === "client-driven"`; `targetQuestionCount` from `sessionConfig.limits`; termination honor stub (`setExitIntent("end")` when non-null). Removed unused `ArrowUp` import. No layout/control/copy redesign.

## Human checkpoint verdict (Task 3)

User completed the live-session comparison and replied:

> **shell verified**

### /interview/general (camera ON)

- **reportId:** `c9c9cfaa-2884-4878-984c-bd03182db1d6`
- **Checkpoint count:** **8** (measured)
- **Frame budget:** thread worker, delegate GPU, models 4, dispatchMeanMs 0.7, dispatchP95Ms 2.4, meanTickMs 34.7, p95TickMs 53.7, processedSamples 518, expectedSamples 518, droppedTicks 1, modelDroppedTicks {face:1, pose:0, hands:0, object:0}, modelTickCostMeanMs {face:32.4, pose:36.9, hands:29.8, object:56.4}, tickCostKind worker-roundtrip
- **Screenshot:** `screenshots/13-10/interview-general-frame-budget.png`

### /practice/general (camera ON)

- **reportId:** `0cc25c0b-b359-4408-bf23-0b36a0b4b55f`
- **Checkpoint count:** not measured; user assumed 8 (same as interview) — **not recorded as a measured count**
- **Frame budget:** thread worker, delegate GPU, models 4, dispatchMeanMs 0.7, dispatchP95Ms 2.2, meanTickMs 31.4, p95TickMs 44.5, processedSamples 570, expectedSamples 570, droppedTicks 2, modelDroppedTicks {face:1, pose:0, hands:1, object:0}, modelTickCostMeanMs {face:29.3, pose:35.8, hands:26.1, object:46.5}
- **Screenshot:** `screenshots/13-10/practice-general-frame-budget.png`
- User: "everything in general looks the same"
- Finish URL was `/interview/general/report/0cc25c0b-...` — **intentional for 13-10** (`app/practice/[type]/page.tsx` still pushes the legacy interview report URL until 13-12 builds `/practice/.../report`)

### /practice/general (camera OFF)

- User: "camera off, four checkpoints, works"

### /practice/general (typed-only)

- User: "did typing. can definitely observe much less latency since it doesn't have to handle the transcription before sending. so much more fluid. four more checkpoints, good overall"

## Task Commits

Each task was committed atomically:

1. **Task 1: Port InterviewSessionShell into a config-driven PracticeSessionShell** - `9e03aa2` (feat)
2. **Task 2: Switch /practice/[type] onto the generic shell** - `189552e` (feat)
3. **Task 3: Human live-session comparison** - human-verify (no code commit); verdict **shell verified** recorded above

**Plan metadata:** (this commit)

## Files Created/Modified

- `components/practice/PracticeSessionShell.tsx` — generic live-session shell
- `app/practice/[type]/page.tsx` — PracticeSessionShell + createReportOnLaunch
- `app/api/interaction/chat/route.ts` — engine turnState/resumeText resolution
- `screenshots/13-10/*.png` — frame-budget captures from both camera-ON runs

## Decisions Made

See `key-decisions` in frontmatter. Notably: legacy report URL after practice finish is sanctioned until 13-12; dual shells remain until 13-13 deletes `InterviewSessionShell`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Chat route must read engine turn state**
- **Found during:** Task 1
- **Issue:** 13-06 left `engine.turnState` reserved; progress/resume/startedAt still came only from the legacy `interview` payload. An engine-only client would get empty progress and a broken interview tail.
- **Fix:** Prefer `engine.resumeText` + `engine.turnState.{progress,startedAt}`; fall back to `interview.*` for the unmigrated shell. Also pass `startedAt`/`now` Dates into `buildTurnMessages` for non-interview time-budget types.
- **Files modified:** `app/api/interaction/chat/route.ts`
- **Committed in:** `9e03aa2`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required for Task 1 correctness; no scope creep. Plan `files_modified` listed only the shell + page — chat route was a necessary client-path completion.

## Issues Encountered

None blocking. Practice camera-ON checkpoint count was not measured in the Network tab; recorded as assumed-not-measured rather than inventing a number.

## User Setup Required

None.

## Next Phase Readiness

- 13-11 can pass the same props contract for case-study (`checkpointing: "none"` → zero checkpoint calls).
- 13-12 should switch `onFinish` to `/practice/[type]/report/[reportId]`.
- 13-13 can delete `InterviewSessionShell` and `/interview/[type]` once redirects land.
- REQ-67 shared-DB migrate remains deferred (local only).

## Self-Check: PASSED

- FOUND: `.planning/phases/13-one-on-one-conversation-engine/13-10-SUMMARY.md`
- FOUND: `components/practice/PracticeSessionShell.tsx`
- FOUND: `screenshots/13-10/interview-general-frame-budget.png`
- FOUND: `screenshots/13-10/practice-general-frame-budget.png`
- FOUND: commit `9e03aa2`
- FOUND: commit `189552e`
