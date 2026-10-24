# Shared Session Shell — Decision Record

**Gaps:** G2, G3, G4 (22-VALIDATION.md, UAT round 1)
**Status:** DECIDED (user, 2026-10-23 G4; 2026-10-24 grading)
**Supersedes:** `22-AVATAR-MOUNT-DECISION.md`

## DECISION

Coached sessions reuse the SAME voice + video session chrome as interview /
practice. The chrome was extracted, verbatim, out of `components/practice/`
into the neutral `components/session/`:

| Module | Moved from |
|---|---|
| `CameraConsentStep.tsx` (+ `sessionNoun`, default "interview") | `components/practice/steps/` |
| `MetricsConsentDialog.tsx`, `SelfViewThumbnail.tsx`, `FaceDetectionBanner.tsx` | `components/metrics/` |
| `usePushToTalkRecorder.ts` (mic, MediaRecorder, RMS guard, vocal capture, SSE transcription) | `PracticeSessionShell.tsx` |
| `useHoldToTalkKey.ts` (hold-Space listener) | `PracticeSessionShell.tsx` |
| `useVisualCapture.ts` (camera, face detection, `VisualMetrics`) | `PracticeSessionShell.tsx` |
| `SessionAvatar.tsx` (+ `useAvatarKeepAlive`) | `PracticeSessionShell.tsx` |
| `SessionRoom.tsx` (room frame, panes, LIVE badge, status, push-to-talk control) | `PracticeSessionShell.tsx` |

`PracticeSessionShell` and `CoachedSessionShell` both import from there. The
coach layer stays in `lib/study-plan/coached/`. `CoachAvatarStage.tsx` and
`useCoachedPushToTalk.ts` are retired.

## Behaviour preservation (practice)

Same props, state machine, payloads and copy. The recorder keeps practice's
closure semantics (`sending`/`isPaused` from the render that created
`startRecording`, the walk-out lock read live, `sendMessage` captured as
before). `useHoldToTalkKey` is called after the shell's unmount cleanup, so
`releaseMicrophone()` still detaches `recorder.onstop` before `releaseHold()`
(asserted by `verify-hold-space-push-to-talk`). `beginTurnRecording` stays
off for practice (`stampVocalTurnStart`), because practice never called it.
`CaseStudySessionView` changed only its two import paths.

## G2 — the coach is gated on CONNECTED

The opening turn starts from `handleStageReady` (CONNECTED), like practice.
Without video it starts only on a definitive vendor failure or the student's
explicit "continue without video" after a 15s slow-connect notice — never
from a timer. A coach turn that arrives while the stage is not connected is
queued and spoken on CONNECTED (`pendingSpeechRef`), not dropped.

Root cause found in the browser smoke test (2026-10-24): the PATCH turn route
returned `CoachTurnResult` unwrapped (`{ coachTurn: { coachTurn, legState } }`),
so the shell's `turn.speech` was `undefined` and EVERY coach turn — opening and
later turns — was sent to the avatar as `speak_text, text: undefined`;
demonstrations never rendered either. The route now sends the flat turn
(`eeac920`). After the fix the smoke test shows the opening dispatched as
`avatar.speak_text` with the coach's text, after CONNECTED.

## G3 — camera and capture

Brief (step 1) -> the shared `CameraConsentStep` (step 2) -> live room with
self-view, face-detection banner, visual capture (started on CONNECTED) and
vocal capture. Metrics are collected at completion and shown in the summary.
They are NOT persisted: `CoachedSession` has no metrics columns, and adding
them is a schema change (reported, not made).

## Grading (user, 2026-10-24)

Technique tips live; numeric grades only at the end. The runtime nulls every
per-turn `score` in a live leg view; a COMPLETE view carries `summary` (per
leg: original moment and score, attempts, graded score via `gradedLegScore`,
the same rule the mastery contribution writes). No streaks, no unlocking.

## Guards amended deliberately

- `verify-coached-mode-isolation` (21-12): section 3 unchanged (no coached
  identifiers/imports in `components/practice/`, `app/practice/`); new 3b
  permits both trees to import `components/session/` and keeps it neutral.
- `verify-coached-avatar-mount`: now guards this decision.
- `verify-coached-runtime-surface`: stage is `<SessionAvatar`; opening call
  sites exclude `handleConsent`/timers; new G2 queue and grades-at-end checks.
- `verify-hold-space-push-to-talk`, `verify-engine-surface-count`: follow the
  moved code.
