---
phase: 22-coached-mode
plan: 14
subsystem: study-plan/coached
tags: [coached-shell, consent, guarded-opening, vendor-degradation]
requires: [22-06, 22-13]
provides:
  - CoachedBriefCard, CoachedMomentPanel
  - CoachedSessionShell state machine (brief, consent, guarded opening, coach-closed legs, complete)
  - scrollable coached page
affects: [22-15]
key-files:
  created:
    - components/study-plan/coached/CoachedBriefCard.tsx
    - components/study-plan/coached/CoachedMomentPanel.tsx
  modified:
    - components/study-plan/CoachedSessionShell.tsx
    - app/study-plans/[planId]/coached/[stepId]/page.tsx
key-decisions:
  - "Page scroll fixed in the page (h-dvh overflow-y-auto), not in main-content.tsx"
  - "requestOpeningTurn is ref-guarded; triggers are stage onReady, stage onError, and a 15s timeout started at consent"
requirements-completed: [REQ-114, REQ-115]
completed: 2026-10-23
---

# Phase 22 Plan 14: Coached Session Flow Summary

The shell now runs brief, consent, a single guaranteed coach opening, legs that only the coach closes, and completion, and it keeps working as captions when the video vendor fails.

## Tasks

1. Brief card, moment panel, page scroll fix - commit (feat(22-14) brief card)
2. Shell state and flow - commit (feat(22-14) coached session shell flow)

## Details

- Avatar stage is mounted only after consent (the shell renders the brief first, `consented` is UI-only state).
- `requestOpeningTurn()` is ref-guarded; reset per leg and called again after advance. `OPENING_FALLBACK_MS = 15_000` is provisional. On stage error or timeout, `videoUnavailable` is set and a one-line notice appears; speech is voiced only when `stage.isReady()`.
- Forward controls render only when `legReady`: "Continue to your second moment" (REPLAY with legCount 2, PATCH advance) or "Finish session" (PATCH complete, then GET). Any 409 resyncs via GET.
- Thin-evidence notice sits in the session header. Complete screen states the coached weight as a percentage of an unaided session.
- Minimal push-to-talk wiring (`useCoachedPushToTalk.onTranscript` to `submitUtterance`) and single-column layout; 22-15 replaces the layout. Seams: `submitUtterance`, `stageRef`, `videoUnavailable`, `latestDemonstration`.
- 21-24 contracts preserved: leg set only from server responses, one advance and one complete action, `TipRail` kept verbatim in this file, client types mirrored, no practice-tree or tips imports.

## Verification

- Full `npx tsc --noEmit`: clean.
- verify-coached-runtime-surface: all sections passed. verify-coached-avatar-mount, verify-coach-containment, verify-coached-mode-isolation: exit 0.
- `git diff --name-only 59f6166 -- components/practice lib/engine components/main-content.tsx`: empty.
- `requestOpeningTurn(` count: 5.

## Deviations from Plan

**1. [Judgment] Page uses `h-dvh` instead of `h-full`.** No browser was available to confirm the `h-full` chain resolves through the flex ancestors, and the plan names `h-dvh` as the fallback. Not verified visually; 22-15's surface check should confirm scroll in a browser.

Otherwise the plan executed as written.

## Self-Check: PASSED

- FOUND: CoachedBriefCard.tsx, CoachedMomentPanel.tsx, CoachedSessionShell.tsx, page.tsx
- FOUND commits via git log
