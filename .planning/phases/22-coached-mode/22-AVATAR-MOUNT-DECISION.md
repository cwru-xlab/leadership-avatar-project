# Coach Avatar Mount — Decision Record

**Plan:** 22-01
**Status:** DECIDED
**Authority:** 22-CONTEXT.md ("Presentation": the planner must choose, in writing)

## Question

22-CONTEXT.md: edit `components/practice/` and amend 21-12's isolation guard
deliberately, OR build a second avatar mount.

## DECISION

**A second avatar mount, inside `components/study-plan/coached/`.**

- `CoachAvatarStage.tsx` mounts `InteractiveAvatarWrapper` from
  `components/HeyGenAvatar/InteractiveAvatar.tsx`, which lives OUTSIDE
  `components/practice/` and already exposes `speak`, `waitForSpeechEnd`,
  `interrupt`, `keepAlive`, `startSession`, `stopSession`.
- `useCoachedPushToTalk.ts` implements hold-Space / hold-mic recording using the
  existing pure helpers in `lib/practice/push-to-talk-key.ts`, the existing
  `createVocalCapture` from `lib/metrics/vocal-capture.ts`, and the existing
  `/api/audio/transcribe` endpoint.
- 21-12's isolation guard and 21-24's separation checks are NOT amended.
  `git diff --name-only 59f6166 -- components/practice/` stays empty for the
  whole phase.

## Why

With no counterpart, the part of `PracticeSessionShell.tsx` (1,866 lines) that a
coached session would share is exactly the counterpart loop it must not run:
engine turn parsing, walk-out, disengagement, interviewer progress. Sharing the
shell would put coached identifiers inside the tree the containment rule
protects. The avatar and capture primitives are already outside that tree, so
reuse costs no guard change. This matches the conclusion recorded in
`deferred-items.md` ("Decided for the new phase").

## Cost (disclosed)

Roughly 150-250 lines of MediaRecorder / RMS-metering / SSE-transcription
handling are duplicated from `PracticeSessionShell.tsx` rather than shared.

Mitigation: key-detection and abort rules come from
`lib/practice/push-to-talk-key.ts` (not re-implemented), and 22-06's
`scripts/verify-coached-avatar-mount.ts` asserts those helpers are imported.

Visual (camera) capture is NOT wired in coached mode in this phase.

## REJECTED

Editing `PracticeSessionShell.tsx`, or lifting its recorder into a shared
module, and amending the guard. Rejected because it modifies the practice tree
for a feature that must not exist there, voids the "components/practice/
unmodified" evidence 21-24 relies on, and gains only the de-duplication of a
recorder.
