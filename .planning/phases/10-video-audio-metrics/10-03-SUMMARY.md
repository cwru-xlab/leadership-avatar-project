---
phase: 10-video-audio-metrics
plan: 03
subsystem: metrics
tags: [mediapipe, face-landmarker, webcam, live-affordance, visual-capture, browser-only]

# Dependency graph
requires:
  - phase: 10-video-audio-metrics
    provides: "lib/metrics/types.ts (VisualMetrics/VisualCoverage contract, METRICS_SAMPLE_HZ) from 10-01"
provides:
  - "lib/metrics/visual-capture.ts — createVisualCapture()/requestCameraStream(): the headless, browser-only, in-flight face-landmark analysis engine"
  - "components/metrics/SelfViewThumbnail.tsx — muted mirrored local video preview"
  - "components/metrics/FaceDetectionBanner.tsx — always-mounted, fold-away face-not-detected pill"
affects: [10-video-audio-metrics remaining plans (10-05..10-11, particularly 10-09/10-10 which wire this engine into the live session shell)]

# Tech tracking
tech-stack:
  added: ["@mediapipe/tasks-vision@1.0.1 (exact-pinned, self-hosted WASM + float16 face_landmarker.task model under public/mediapipe/)"]
  patterns:
    - "Engine owns its own detached <video> element rather than reusing a UI component's DOM node, so it survives any React remount of the self-view"
    - "MediaPipe runtime is dynamically imported inside start(), never at module scope, so its multi-MB payload never enters the initial bundle or loads for a camera-off session"
    - "setInterval (not requestAnimationFrame) drives the sample loop, deliberately decoupled from display refresh rate and immune to rAF's background-tab throttling, which would otherwise silently corrupt liveness counters"
    - "Every per-tick value (landmarks, transformation matrix, luma pixels) is reduced to a scalar accumulator on the same tick it is read; nothing survives past that tick"
    - "GPU delegate first, one CPU retry, then analyzer_error=true with onFaceStateChange(true) so a dead engine can never look like an absent face"

key-files:
  created:
    - lib/metrics/visual-capture.ts
    - components/metrics/SelfViewThumbnail.tsx
    - components/metrics/FaceDetectionBanner.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Self-hosted the MediaPipe WASM runtime (public/mediapipe/wasm/, copied from node_modules/@mediapipe/tasks-vision/wasm) and the pinned float16/1 face_landmarker.task model (public/mediapipe/face_landmarker.task, 3.6MB, verified as binary not HTML) rather than the jsDelivr @latest CDN path the research example used — no fallback was needed, the primary self-host path succeeded cleanly"
  - "Resolved @mediapipe/tasks-vision to the newest full (non-RC) release, 1.0.1, installed with --save-exact (no ^/~)"
  - "eye_contact_pct denominator is processed_samples (liveness), not face_detected_samples (detection) — an absent face scores down per REQ-41; camera_centered_pct denominator is face_detected_samples, since framing is only meaningful for a frame that has a face — the asymmetry is documented inline as deliberate"
  - "Face-state transitions (for the banner) require 3 consecutive same-direction samples (~0.5s at 6Hz) before firing onFaceStateChange, so a single blink never triggers the banner"
  - "poseUnavailableSamples > 50% of faceDetectedSamples flips analyzer_error rather than reporting a bogus 0% eye contact — protects REQ-42 against a landmarker that returns face boxes but never a usable transformation matrix"
  - "Runtime smoke test was done against the ALREADY-RUNNING port-3000 dev server (via a throwaway API route, deleted immediately after) rather than starting a second next dev instance, because Next.js's Turbopack dev server refuses a second instance sharing the same .next lock directory — confirmed by a clean 307 auth-middleware redirect (not a 500), proving the module resolved and compiled without a WASM/module-resolution error"
  - "Left REQ-38/39/41/42/43/49 unchecked in REQUIREMENTS.md despite appearing in this plan's frontmatter, matching the 10-01/10-02 precedent for split requirements — this plan delivers the capture engine and live affordances fully and unit-verified, but each requirement's full user-facing text also requires 10-09/10-10 to wire this engine into an actual session surface"

patterns-established:
  - "Pattern: any future in-browser analysis engine in this codebase should own its own detached media element rather than sharing one with a presentational component."
  - "Pattern: liveness debounce (N consecutive samples before firing a UI-facing callback) belongs in the engine, not the consuming component, so every consumer gets the same anti-flicker behavior for free."

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-09-22
---

# Phase 10 Plan 03: In-Browser Visual Capture Engine and Live Affordances Summary

**A 6Hz MediaPipe Face Landmarker engine that reduces the student's camera stream to scalar VisualMetrics with liveness counters tracked structurally separate from detection counts, plus a muted self-view thumbnail and a fold-away face-detection banner — zero frames retained, zero bytes uploaded.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-22T13:41:00Z (approx, following 10-01 completion)
- **Completed:** 2026-09-22T13:51:06Z
- **Tasks:** 3
- **Files modified:** 5 (3 new source files, package.json, package-lock.json; plus vendored public/mediapipe/ assets)

## Accomplishments
- `@mediapipe/tasks-vision@1.0.1` installed at an exact pin, with the WASM runtime and a pinned `float16/1` `face_landmarker.task` model (3.6MB, verified as a real binary, not an HTML 404 page) self-hosted under `public/mediapipe/` — no `@latest` anywhere in the dependency chain.
- `lib/metrics/visual-capture.ts` (530 lines): `requestCameraStream()` requests a video-only, modest-resolution stream with typed `DENIED`/`NOT_FOUND`/`UNAVAILABLE` failure reasons, entirely independent of the existing audio-only mic path. `createVisualCapture()` runs a 6Hz `setInterval` loop over MediaPipe's `FaceLandmarker` (GPU delegate, one CPU retry, then a structural `analyzer_error`), aggregating only scalars: forward-gaze proxy (yaw/pitch from the facial transformation matrix), framing (face bounding-box centering/out-of-frame), head-movement delta, and a luma sample every 2 seconds via one reused offscreen canvas — never a stored frame.
- `components/metrics/SelfViewThumbnail.tsx` and `components/metrics/FaceDetectionBanner.tsx`: two small presentational components. The thumbnail is muted, mirrored, `pointer-events-none`, and renders nothing when there is no stream. The banner is always mounted and animates between visible/hidden states via `max-h`/`opacity`/`translate` transitions (a true CSS fold, not a conditional unmount), confirmed by a throwaway `renderToStaticMarkup` script showing the `role="status"` element present with different classes in both states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add and self-host the MediaPipe vision runtime** - `9081d0d` (chore)
2. **Task 2: The visual capture engine** - `c649903` (feat)
3. **Task 3: Self-view thumbnail and fold-away banner** - `b5746d5` (feat)

**Plan metadata:** (this commit) `docs(10-03): complete visual capture engine plan`

## Files Created/Modified
- `lib/metrics/visual-capture.ts` (530 lines) - the headless capture engine: `requestCameraStream`, `createVisualCapture`
- `components/metrics/SelfViewThumbnail.tsx` (62 lines) - muted mirrored local preview
- `components/metrics/FaceDetectionBanner.tsx` (51 lines) - fold-away face-not-detected pill
- `package.json` / `package-lock.json` - `@mediapipe/tasks-vision@1.0.1` (exact)
- `public/mediapipe/wasm/*`, `public/mediapipe/face_landmarker.task` - vendored runtime + model assets (not tracked as "key files" but committed alongside Task 1)

## Decisions Made
- Self-hosting succeeded on the primary path (no CDN fallback needed); resolved version `1.0.1` recorded above and in `package.json`.
- Denominator asymmetry between `eye_contact_pct` (processed samples) and `camera_centered_pct` (detected samples) implemented exactly as specified and commented in-file as deliberate, not an oversight.
- Runtime smoke verification used the existing live port-3000 dev server via a throwaway, immediately-deleted API route rather than a second `next dev` instance, since Turbopack refuses to share its `.next` lock directory across two dev processes in the same working directory (matching the `08-08`/`09-06` shared-git-index/shared-`.next` hazard already logged for this repo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted runtime smoke-test method for the shared dev-server lock**
- **Found during:** Task 2 verification (runtime smoke test)
- **Issue:** The plan's verify step calls for starting a dev server on a free port to confirm module resolution; attempting this failed because Next.js Turbopack detects the already-running port-3000 dev server (shared `.next` directory in this working tree) and refuses to start a second instance, exiting immediately with "Another next dev server is already running."
- **Fix:** Added a throwaway API route (`app/api/_smoke-10-03/route.ts`) importing `createVisualCapture`/`requestCameraStream`, hit it against the already-running port-3000 server, confirmed a clean 307 auth-middleware redirect (not a 500/compile error), then deleted the route immediately. This is equivalent evidence that the module resolves and compiles without a WASM/module-resolution error, without starting a second dev process or touching the existing one.
- **Files modified:** none persisted (throwaway route created and deleted within the same task)
- **Verification:** `curl` returned `307` (middleware redirect to `/login`, the expected behavior for any unauthenticated API route) both before and after cleanup; `git status` confirmed no leftover file.
- **Committed in:** not committed (file existed only transiently, removed before any commit in this plan)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change — this is a verification-method substitution only, forced by the shared dev-server lock already documented as a known hazard in this repo (see `09-06-SUMMARY.md`). The engine's actual code and behavior are unaffected.

## Issues Encountered
None beyond the dev-server lock noted above, which was resolved without touching the live session on port 3000.

## User Setup Required
None - no external service configuration required. `@mediapipe/tasks-vision` and its model/runtime run entirely client-side with no API key or account.

## Next Phase Readiness
- `lib/metrics/visual-capture.ts`, `SelfViewThumbnail`, and `FaceDetectionBanner` are ready to be wired into a live session surface. This plan deliberately did NOT touch `components/interview/InterviewSessionShell.tsx` or `components/HeyGenAvatar/InteractiveAvatar.tsx` (both diff-empty, confirmed by `git diff` against this plan's commit range) — that wiring belongs to plans 10-09/10-10.
- The engine's `VisualMetrics` output shape matches `lib/metrics/types.ts` from 10-01 exactly; no further contract changes anticipated for this module.
- Ready for the next unexecuted plan in this phase.

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*

## Self-Check: PASSED

All three key files (`lib/metrics/visual-capture.ts`, `components/metrics/SelfViewThumbnail.tsx`, `components/metrics/FaceDetectionBanner.tsx`) plus `public/mediapipe/face_landmarker.task` confirmed present on disk. All three task commits (`9081d0d`, `c649903`, `b5746d5`) confirmed present in git log.
