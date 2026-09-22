---
phase: 10-video-audio-metrics
plan: 05
subsystem: consent
tags: [nextjs, prisma, heroui, consent, camera-mode]

# Dependency graph
requires:
  - phase: 10-video-audio-metrics
    provides: "10-02's videoAnalysisConsentAt/cameraMode/metricsConsentAt columns and lib/metrics/types.ts's CameraMode union (10-01)"
provides:
  - "GET/POST /api/metrics/consent — owner-scoped account-level consent record"
  - "MetricsConsentDialog — one-time in-app explanation and accept action"
  - "cameraMode + metricsConsentAt written once at InterviewReport/ScenarioReport creation, server-enforced"
affects: [10-video-audio-metrics remaining plans (06-11), interview session shell, scenario session shell, both report pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent accept endpoint: POST returns the ORIGINAL timestamp on repeat calls, never a refreshed one, preserving 'first accepted' as an audit fact"
    - "Server independently re-derives and can downgrade a client-requested camera mode (never trusts a client-reported consent state), mirroring the resolveInterviewType hostile-value-falls-back-not-throws precedent"
    - "Write-once snapshot fields (cameraMode, metricsConsentAt) placed directly in the same prisma...Report.create() call as the existing Phase 8/9 snapshot blocks, with no update path anywhere in either route"

key-files:
  created:
    - app/api/metrics/consent/route.ts
    - components/metrics/MetricsConsentDialog.tsx
  modified:
    - middleware.ts
    - app/api/interview/session/start/route.ts
    - app/api/scenario/session/start/route.ts

key-decisions:
  - "POST /api/metrics/consent is idempotent by design: a repeat POST from an already-consented user returns their EXISTING timestamp untouched. Refreshing it would destroy the audit meaning of 'when they first accepted'."
  - "No revoke endpoint added — CONTEXT.md scopes this phase to acceptance only; a revoke flow needs its own decision about in-flight sessions, deferred."
  - "cameraMode validation uses a strict literal-equality check (=== 'ON' or === 'OFF') rather than a type-guard array, so a hostile/malformed value (including non-strings) falls back to 'OFF' the same way resolveInterviewType falls back on bad type slugs."
  - "The consent-gate check queries User.videoAnalysisConsentAt fresh inside the session-start request (not trusting any client claim of prior acceptance), so a client that skipped the dialog entirely is still forced to camera-off server-side."
  - "MetricsConsentDialog performs its own POST before calling onAccept, and shows a danger toast without calling onAccept on failure — an unrecorded acceptance must never let a measured session start."
  - "REQ-35, REQ-36, REQ-37 are intentionally left unchecked in REQUIREMENTS.md despite appearing in this plan's frontmatter, matching the established split-requirement precedent (10-01/10-02/10-03/10-04/10-06). This plan delivers the full server-side enforcement (consent record, idempotent accept, write-once locked cameraMode, forced-OFF-without-consent) but each requirement's full text also requires the pre-session UI: the camera-mode picker that lets a student actually CHOOSE the mode (REQ-35), the dialog being wired into the actual pre-session gating flow (REQ-36), and the permission-denied BLOCKING screen with its camera-off offramp (REQ-37) — all owned by 10-09/10-10's session shells, not yet built. REQ-45 was already marked complete by 10-08 (a different plan); this plan's frontmatter lists it as a dependency-adjacent requirement, not a new claim."

requirements-completed: []

# Metrics
duration: 55min
completed: 2026-09-22
---

# Phase 10 Plan 05: Consent, Camera-Mode Lock, and Report Snapshot Summary

**Account-level consent endpoint (idempotent accept, no revoke) plus a non-dismissable in-app dialog, and a server-enforced write-once `cameraMode`/`metricsConsentAt` snapshot on both `InterviewReport` and `ScenarioReport` at session-start — a client that skipped consent or sent a hostile camera-mode value is forced to `"OFF"` server-side, with no update path to mutate the mode afterward.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-22T13:58:00Z (approx)
- **Completed:** 2026-09-22T14:53:00Z (approx)
- **Tasks:** 3
- **Files modified:** 5 (2 new, 3 modified)

## Accomplishments
- `GET`/`POST /api/metrics/consent` gives the account a durable, owner-scoped record of first acceptance (`User.videoAnalysisConsentAt`), reachable by students via a one-line `STUDENT_ROUTES` addition to `middleware.ts`.
- `MetricsConsentDialog` states exactly what is measured (visual framing/gaze, vocal pace/fillers/pauses/volume) and that video/audio are analysed in-flight and discarded — never recorded, saved, or uploaded — with a real camera-off "Not now" path rather than a dead-end cancel, and records acceptance server-side before ever calling `onAccept`.
- Both `/session/start` routes now validate an optional `cameraMode` field against the `CameraMode` union (hostile/absent values fall back to `"OFF"`), independently force `"OFF"` when `"ON"` is requested without a consent record, and write `cameraMode` + a snapshot of `metricsConsentAt` once at row creation — with no code path anywhere that updates either field afterward.

## Task Commits

Each task was committed atomically:

1. **Task 1: Consent record and endpoint** - `d3d1531` (feat)
2. **Task 2: The consent dialog** - `4a69cfb` (feat)
3. **Task 3: Snapshot camera mode and consent onto both report rows at start** - `1e5b45d` (feat)

**Plan metadata:** (this commit, next) `docs(10-05): complete consent and camera-mode-lock plan`

## Files Created/Modified
- `app/api/metrics/consent/route.ts` (98 lines) - Owner-scoped `GET`/`POST`, idempotent accept, no revoke
- `components/metrics/MetricsConsentDialog.tsx` (103 lines) - Non-dismissable HeroUI modal, posts consent before `onAccept`
- `middleware.ts` - `"/api/metrics"` added to `STUDENT_ROUTES` (one code line plus its own comment, mirroring the 09-02 `/api/scenario` precedent exactly)
- `app/api/interview/session/start/route.ts` - `cameraMode` validation, consent lookup and enforcement, write-once snapshot into `prisma.interviewReport.create`
- `app/api/scenario/session/start/route.ts` - identical `cameraMode`/consent handling, write-once snapshot into `prisma.scenarioReport.create`

## Decisions Made
- See `key-decisions` in frontmatter for the idempotency, no-revoke, hostile-value, and fail-closed-toast decisions and their rationale.
- Used a real seeded S3 case (`phase10-05-verify-test-case`, owner=alice, temporarily published so bob could also reach it) to live-verify the scenario route's consent/camera-mode enforcement, since the local dev DB has no student-owned scenario case pre-seeded. Both the case and every `ScenarioReport`/`InteractionLog` byproduct row it produced were deleted; the case itself was confirmed removed from S3 afterward. The `InteractionLog` JSON objects the scenario route also writes to S3 on each start have no delete API in `lib/s3-client.ts` and were not cleaned up — they are inert throwaway JSON blobs under the same `caseId`, cost nothing, and match the precedent already set by prior phases' live verification against real S3 storage.

## Deviations from Plan

None — plan executed exactly as written for all three tasks. Two out-of-scope discoveries were logged (not fixed) per the deviation-rules scope boundary:

### Out-of-scope discoveries (not fixed, logged)

**1. Pre-existing `tsc --noEmit` errors in concurrent sibling WIP**
- **Found during:** Task 1 and Task 3 verification
- **Issue:** `lib/interview/evaluation-runner.ts:82` and `lib/interview/evaluation.ts:221` fail type-checking (missing `visualMetrics`/`vocalMetrics` on `EvaluationInput`, an arity mismatch) — these files belong to a concurrently-executing sibling plan (10-06 territory) widening the evaluator contract, not touched by 10-05.
- **Verification:** Confirmed via `git stash push -u -- middleware.ts app/api/metrics` that the identical errors are present with every one of 10-05's own changes fully removed.
- **Logged to:** `.planning/phases/10-video-audio-metrics/deferred-items.md`

**2. Plan's own `grep -n "update"` verification step does not account for a pre-existing, unrelated `.update()` call**
- **Found during:** Task 3 verification
- **Issue:** The plan's verification step expects `grep -n "update" app/api/interview/session/start/route.ts app/api/scenario/session/start/route.ts` to return nothing. The scenario route already contained a pre-existing `prisma.scenarioReport.update(...)` call (for `interactionLogId`/`studentEmail`, added before Phase 10) that this plan explicitly does not touch. Confirmed via a baseline `grep` against the file's state *before* any 10-05 edit that this hit already existed.
- **Resolution:** Not fixed — out of scope ("Change NOTHING else in either route"). Instead verified the load-bearing claim directly: `grep -rn "cameraMode" app/api/ | grep -v "session/start"` returns nothing, proving no second write path for `cameraMode` exists anywhere, which is what the verification step was actually protecting against.

**Total deviations:** 0 auto-fixed, 2 out-of-scope items logged (not fixed).
**Impact:** None on this plan's own deliverables. Both issues are either pre-existing/unrelated-file conditions or a verification-script imprecision; the actual load-bearing guarantee (no second `cameraMode` write path) was independently confirmed.

## Concurrency Notes

This plan ran concurrently with sibling plans (10-06/10-07/10-08) in the same working directory with a shared git index (no worktree isolation, per `08-08-SUMMARY.md`'s established hazard). Handling:
- Every commit was staged with literal, explicit file paths (never a glob or `-A`), and every commit was verified via `git show --name-only HEAD` to contain only this plan's own files.
- One near-miss: after `git add`-ing Task 1's two files, a sibling agent's commit landed on the shared index between the `add` and the `commit`, causing the first commit attempt to fail with a stale pathspec error. No files were lost — a fresh `git add` + `git commit -- <literal paths>` on the next attempt produced a clean, single-plan commit (`d3d1531`), confirmed via `git show --name-only HEAD`.
- A sibling agent later reported that its own cleanup process deleted this plan's untracked scratch file `__verify_consent.mjs` from disk after this plan had already deleted it itself; no tracked work was affected.

## Issues Encountered
None blocking. See "Deviations from Plan" and "Concurrency Notes" above for the two logged, non-blocking items and the one shared-index near-miss (self-recovered, no data loss).

## User Setup Required
None — no external service configuration required. No new migration (10-02 already owns every column this plan writes to); `npm run setup` was never run.

## Next Phase Readiness
- `/api/metrics/consent` and `MetricsConsentDialog` are ready for the interview and scenario session shells (10-09/10-10) to wire the pre-session consent/camera-mode-selection flow, including routing the dialog's "Not now" to camera-off mode as specified.
- Both `/session/start` routes now accept and enforce `cameraMode`; the capture pipeline plans (10-03/10-04, already complete) and the finish routes (owned by 10-07, untouched here — confirmed diff-empty) can rely on `InterviewReport.cameraMode`/`ScenarioReport.cameraMode` being trustworthy and immutable from the moment the row is created.
- No blockers for 10-06 through 10-11.

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*

## Self-Check: PASSED

All five key files (`app/api/metrics/consent/route.ts`, `components/metrics/MetricsConsentDialog.tsx`, `middleware.ts`, `app/api/interview/session/start/route.ts`, `app/api/scenario/session/start/route.ts`) confirmed present on disk. All three task commits (`d3d1531`, `4a69cfb`, `1e5b45d`) confirmed present in git log.
