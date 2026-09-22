---
phase: 10-video-audio-metrics
plan: 09
subsystem: interview-session
tags: [nextjs, react, mediapipe, webrtc, consent, camera-mode, live-affordances]

# Dependency graph
requires:
  - phase: 10-video-audio-metrics
    provides: "lib/metrics/visual-capture.ts + components/metrics/* (10-03), lib/metrics/vocal-capture.ts (10-04), consent/camera-mode-lock endpoints (10-05), finish-route metric ingestion (10-07)"
provides:
  - "app/interview/[type]/page.tsx — a locked camera step in the setup wizard: consent gate, permission probe, block/opt-out, cameraMode handed to the shell as an immutable value"
  - "components/interview/InterviewSessionShell.tsx — full capture lifecycle (visual started post-CONNECTED, vocal reusing the existing mic stream), live self-view/banner affordances, and a metrics payload on the finish POST"
affects: ["10-10 (scenario session shell, same wiring pattern)", "10-11 (phase-closing static sweep + end-to-end validation)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Camera-mode decision made once, in a dedicated wizard step, and handed to the session component as a plain (non-setter) prop — the lock is enforced by the prop's type, not by discipline"
    - "Visual capture is started only after the avatar's CONNECTED transition, never before, to keep MediaPipe's dynamic import off the WebRTC handshake's critical path"
    - "Vocal capture attaches to the SAME MediaStream the existing push-to-talk mic already owns, via one extra call inside the existing getMicrophone() — never a second getUserMedia"
    - "A single releaseVisualCapture() helper is called from every exit path (End success, Leave, unmount) so the camera track is guaranteed to stop exactly once per path with no duplicated stop-logic to keep in sync"

key-files:
  created: []
  modified:
    - app/interview/[type]/page.tsx
    - components/interview/InterviewSessionShell.tsx

key-decisions:
  - "A denied/failed camera probe in the wizard renders a BLOCK panel (Try again + Continue with my camera off); declining the consent dialog is treated as an equivalent camera-off outcome and proceeds straight to the session — both are real paths, never dead ends, matching REQ-37's block-vs-opt-out split"
  - "The resume step's two buttons ('Skip for now' / the primary CTA) now target the new camera step instead of session directly; the primary CTA's label was changed from 'Start interview' to 'Continue' since it no longer starts the session immediately — the smallest change that keeps the label truthful"
  - "A camera failure AFTER the avatar has connected (probe succeeded in the wizard, camera then seized by another app) does not block or interrupt the live session — it toasts a warning and leaves visual metrics null, which resolves to INSUFFICIENT_DATA server-side (10-01/10-07's discriminator), never CAMERA_OFF_OPTOUT and never a fabricated score"
  - "recordTypedTurn() is wired at exactly the two literal call sites that submit the textarea's content (the Enter-key handler and the Send button), never inside sendMessage() itself — sendMessage is also invoked by the push-to-talk path (via transcribeRecording) and by the synthetic opening turn, neither of which is a typed answer"
  - "REQ-35/36/37/38/40/43/44/49 are intentionally left unchecked in REQUIREMENTS.md despite appearing in this plan's frontmatter, extending the established split-requirement precedent (10-01 through 10-08): this plan delivers the full interview-session wiring end to end, but each requirement's text also covers the scenario session shell, which is 10-10's still-in-progress, concurrently-executing sibling plan — the checkbox is deferred to whichever plan (10-10 or 10-11) confirms both surfaces are wired"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-09-22
---

# Phase 10 Plan 09: Camera-Mode Wizard Step and Session-Shell Capture Wiring Summary

**A locked camera-on/camera-off decision gated by in-app consent and a stop-immediately permission probe in the interview setup wizard, plus a full visual/vocal capture lifecycle — self-view thumbnail, fold-away face banner, and a `metrics` field on the finish POST — wired into `InterviewSessionShell` without moving the avatar-connect critical path.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-22T14:33:00Z (approx.)
- **Completed:** 2026-09-22T15:08:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `app/interview/[type]/page.tsx` gained a fourth wizard step (`camera`, between `resume` and `session`): a consent-gated, permission-probed, locked camera-mode choice. Choosing camera-on triggers a `GET /api/metrics/consent` check, shows `MetricsConsentDialog` only when unaccepted, then probes with `requestCameraStream()` and immediately stops the probe's own tracks. A denied/unavailable/not-found camera renders a block panel with reason-specific copy, a retry, and a "Continue with my camera off" opt-out that is never a dead end. `cameraMode` reaches `InterviewSessionShell` as a plain value, never a setter.
- `components/interview/InterviewSessionShell.tsx` now runs the full Phase 10 capture lifecycle: visual capture starts only after `StreamingAvatarSessionState.CONNECTED` (never delaying the avatar handshake), vocal capture attaches to the existing push-to-talk microphone stream with no second `getUserMedia` call, `submitSpokenTurn`/`recordTypedTurn` are wired at the correct call sites, `SelfViewThumbnail`/`FaceDetectionBanner` render as fixed, `pointer-events-none` siblings, and `handleEnd` stops/drains both engines and adds `metrics: { cameraMode, visual, vocal }` to the existing finish request body. The camera track is released on every exit path (End success, Leave, unmount).

## Task Commits

Each task was committed atomically:

1. **Task 1: A camera step in the setup wizard** - `607f747` (feat)
2. **Task 2: Capture lifecycle and live affordances in the session shell** - `3854499` (feat)

**Plan metadata:** (this commit, next) `docs(10-09): complete camera-step and capture-lifecycle plan`

## Files Created/Modified

- `app/interview/[type]/page.tsx` - new `camera` `SetupStep`, consent/probe/block flow, `cameraMode` prop passed to the shell
- `components/interview/InterviewSessionShell.tsx` - `cameraMode` prop, visual/vocal capture refs and lifecycle, live affordances, `metrics` field on finish

## Decisions Made

See `key-decisions` in frontmatter for the block-vs-opt-out handling, the resume-step button relabeling, the mid-session camera-failure non-blocking behavior, the `recordTypedTurn()` call-site choice, and the requirement-checkbox deferral rationale.

## Deviations from Plan

None — plan executed exactly as written for both tasks. One minor, in-scope UI adjustment: the resume step's "Start interview" button was relabeled "Continue" since it now advances to the new camera step rather than starting the session directly; this is a direct, necessary consequence of Task 1's own instruction to repoint that transition, not a new deviation category.

**Total deviations:** 0

## Issues Encountered

- **Live browser/end-to-end verification could not be performed in this environment**, and is disclosed rather than claimed. This executor has no browser-automation tool, so the plan's camera-permission-prompt, self-view/banner visual confirmation, and real-HeyGen-avatar-session checks (Task 1 and Task 2's `<verify>` blocks) could not be exercised interactively. Additionally:
  - A second `next dev` instance on a free port (3037) was attempted per the plan's own suggestion and was refused by Turbopack's directory-level lock (`Another next dev server is already running`, PID of the existing port-3000 instance) — the same class of hazard logged in `09-06-SUMMARY.md`/`10-03-SUMMARY.md`/`10-08-SUMMARY.md`.
  - The already-running port-3000 dev server was confirmed to be pointed at the **shared** `DATABASE_URL` (not the local `leadership_avatar_dev` database): an authenticated `GET /api/metrics/consent` against it returned a 500, because the Phase 10 migration (10-02) was applied only to the local dev DB. This route is therefore untestable via that server at all, regardless of which student account is used.
  - What WAS verified: `npx tsc --noEmit` clean repeatedly through both tasks; every plan-specified grep (`SetupStep` union, `setStep("session")` call sites, absence of `setCameraMode` in the shell, single `getUserMedia` call, metering-logic diff-empty, unawaited `submitSpokenTurn`); `git diff --name-only` confirming `app/case-play/[caseId]/page.tsx` (a concurrently-in-progress sibling file, untouched by this plan), `components/HeyGenAvatar/InteractiveAvatar.tsx`, `app/api/audio/transcribe/route.ts`, and `prisma/` are all diff-empty against this plan's own commits; a real `tsx` query against the local dev DB confirming five real seeded students (including `alice.johnson@case.edu`) all have `videoAnalysisConsentAt: null`, the precondition the plan's consent-dialog verification step calls for.
  - This gap is logged here rather than fixed, since fixing it (adding browser automation, or restarting the shared dev server against the local DB) is out of this plan's scope and would risk disrupting whatever the existing port-3000 session is doing for concurrent sibling agents or a real user.

## User Setup Required

None — no external service configuration required. No new migration; `npm run setup` was never run.

## Next Phase Readiness

- Both interview-session artifacts (`app/interview/[type]/page.tsx`, `components/interview/InterviewSessionShell.tsx`) now fully implement REQ-35/36/37/40/43/44/49's user-facing behavior for the interview surface specifically. Plan 10-10 owns the equivalent wiring for the scenario session shell (`app/case-play/[caseId]/page.tsx`), confirmed untouched by this plan.
- Plan 10-11 (or whichever plan performs the phase-closing static sweep) should perform the real browser-based end-to-end walkthrough this plan could not: camera permission grant/deny, self-view thumbnail visibility, face-detection banner fold behavior, a real HeyGen avatar session with the camera on, and a REQ-49 side-by-side latency comparison against a camera-off run — none of that was exercised here.
- No blockers for 10-10; this plan's finish-route `metrics` field shape matches `lib/metrics/types.ts`'s `SessionMetricsPayload` exactly, already consumed end-to-end by 10-07's ingestion/scoring path.

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*

## Self-Check: PASSED

Both key files (`app/interview/[type]/page.tsx`, `components/interview/InterviewSessionShell.tsx`) confirmed present and modified on disk. Both task commits (`607f747`, `3854499`) confirmed present in git log, each touching exactly its own single file (`git show --name-only`).
