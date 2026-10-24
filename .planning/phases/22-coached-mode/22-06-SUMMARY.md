---
phase: 22-coached-mode
plan: 06
subsystem: coached-mode-presentation
tags: [avatar, push-to-talk, heygen, guard]
requires: [22-01 avatar mount decision]
provides: [CoachAvatarStage, useCoachedPushToTalk, verify-coached-avatar-mount]
affects: [22-14, 22-15]
tech-stack:
  patterns: [second avatar mount reusing shared primitives]
key-files:
  created:
    - components/study-plan/coached/CoachAvatarStage.tsx
    - components/study-plan/coached/useCoachedPushToTalk.ts
    - scripts/verify-coached-avatar-mount.ts
  modified: []
key-decisions:
  - "Second avatar mount; components/practice/ untouched and not imported"
  - "No typed fallback: mic denied sets micUnavailable and a plain error"
requirements-completed: [REQ-114]
duration: ~20min
completed: 2026-10-23
---

# Phase 22 Plan 06: Coach avatar stage and spoken-answer hook Summary

CoachAvatarStage (shared InteractiveAvatarWrapper, speak/waitForSpeechEnd/interrupt/stop/isReady handle, 30s keep-alive, stopSession on unmount) and useCoachedPushToTalk (hold-Space/mic recording, RMS metering, vocal capture, streaming transcription) plus a source-assertion guard battery.

## Tasks
1. CoachAvatarStage + useCoachedPushToTalk - c862041
2. verify-coached-avatar-mount.ts - caf0dc0 (see deviation)

## Decisions
- Hook exposes startRecording/stopRecording for the mic button; Space listener registered once with [] deps and ref-read state.
- Thresholds (400ms / 2048 bytes / 0.01 RMS) re-declared with a comment naming the practice shell as source.
- Vendor failure shows "The video coach couldn't connect." and calls onError (degraded captions mode, not a design alternative).

## Deviations from Plan

**1. [Process] Commit caf0dc0 swept in other agents' staged files**
- Concurrent agents had staged lib/study-plan/coached/instance.ts, prisma/schema.prisma and the add_coached_mode migration; my commit included them. My attempt to undo via soft reset raced with other agents' commits and was abandoned; history was not rewritten further. The content is committed and intact, just attributed to the 22-06 test commit message. The orchestrator may want to note this for plan-02 (schema/migration/instance.ts).
- Files modified outside plan: none by me; only the commit attribution is off.

Otherwise the plan executed as written.

## Verification
- verify-coached-avatar-mount.ts: all sections and bite-proof ok; verify-coached-runtime-surface.ts passes; scoped tsc grep for components/study-plan/coached/ is empty; no practice-tree diff vs 59f6166.

## Self-Check: PASSED
