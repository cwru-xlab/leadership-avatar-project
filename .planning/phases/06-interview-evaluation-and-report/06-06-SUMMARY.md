---
phase: 06-interview-evaluation-and-report
plan: 06
subsystem: ui
tags: [react, nextjs, heroui, interview, live-session]

# Dependency graph
requires:
  - phase: 06-03
    provides: "POST /api/interview/session/start and /api/interview/session/checkpoint"
  - phase: 06-04
    provides: "POST /api/interview/session/finish (returns {reportId, status} 202, background evaluation via waitUntil)"
provides:
  - "components/interview/InterviewSessionShell.tsx — reportId lifecycle (ensureReport/checkpoint), fire-and-forget checkpointing after every assistant turn, End/Leave confirm modals wired to the finish endpoint"
  - "app/interview/[type]/page.tsx — navigates onFinish(reportId) to /interview/{slug}/report/{reportId} instead of a local placeholder step"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The InterviewReport row is created lazily on the first real turn (inside checkpoint(), never on an exit path) via a ref-gated ensureReport() that also guards against a double-fire race with a startingRef flag"
    - "Checkpointing is deliberately fire-and-forget: an unawaited async IIFE inside a useCallback, swallowing all errors silently so a dropped request never surfaces to the student or blocks the avatar stream"
    - "Both interview exits share one Modal component keyed by a single exitIntent union state (null | 'end' | 'leave'), branching only the copy/handlers — guarantees the two confirms can never visually drift apart"

key-files:
  created: []
  modified:
    - components/interview/InterviewSessionShell.tsx
    - app/interview/[type]/page.tsx

key-decisions:
  - "handleEnd reads reportIdRef.current directly and never calls ensureReport(); a null reportId (no real turns happened) falls through to the same code path as Leave, so connecting and immediately pressing End creates zero database rows."
  - "The avatar session (releaseMicrophone / stopSession) is stopped only after a successful (or 409) finish response, so a network failure during End leaves the student in a live, retryable interview rather than a dead one."
  - "ChatMessage gained a `timestamp: number` field stamped in appendMessage; the chat-route request body still maps to {role, content} only at the call site, keeping the /api/interaction/chat contract unchanged while satisfying the checkpoint/finish endpoints' turn shape."
  - "No beforeunload or sendBeacon anywhere — confirmed by grep. A closed tab leaves the row IN_PROGRESS forever, per the phase's explicit decision."
  - "answeredCount counts only user turns minus the synthetic opening primer message ('I'm ready to begin the interview.'), floored at 0, and only warns (never blocks) below SHORT_INTERVIEW_ANSWERS = 3."

requirements-completed: [REQ-03, REQ-10]

# Metrics
duration: ~35min
completed: 2026-09-20
---

# Phase 6 Plan 6: Wire Live Session to Persistence and Report Navigation Summary

**InterviewSessionShell now creates the report row on the first real turn, checkpoints the transcript after every assistant turn without blocking the avatar stream, and gates both exits behind distinct confirm modals that route to /interview/{slug}/report/{reportId} on finish.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-20T (see task commit timestamps)
- **Completed:** 2026-09-20
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments
- `ensureReport()` creates exactly one `IN_PROGRESS` `InterviewReport` row, on the first assistant turn only, guarded against concurrent double-fires.
- `checkpoint()` fires a non-blocking POST to `/api/interview/session/checkpoint` after every assistant turn appended to the transcript, swallowing all errors silently.
- End and Leave are both behind a single shared `Modal`, with distinct headers/body copy/footer actions (`exitIntent: "end" | "leave"`), and End warns (without blocking) when fewer than 3 real answers have been given.
- `handleEnd` awaits `POST /api/interview/session/finish`, tolerates `409` (already-submitted) as a success path, and only tears down the avatar session after a successful response — a failure leaves the interview live with a retry toast.
- Connecting and immediately pressing End takes the Leave path (no row created) because `handleEnd` reads `reportIdRef.current` directly and never calls `ensureReport()`.
- `app/interview/[type]/page.tsx` passes `interviewerAvatarId`/`resumeId` through to the shell and navigates to `/interview/{interviewType.slug}/report/{reportId}` on finish, replacing the old "reporting is pending" placeholder `complete` step (and its `SetupStep` union member) entirely.

## Task Commits

Each task was committed atomically:

1. **Task 1: reportId lifecycle and fire-and-forget checkpointing** - `0ff813d` (feat)
2. **Task 2: End and Leave confirm modals wired to the finish endpoint** - `c8bc1e5` (feat)
3. **Task 3: Route the wizard to the report page** - `9f5f113` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified
- `components/interview/InterviewSessionShell.tsx` - `ChatMessage.timestamp`, `interviewerAvatarId`/`resumeId` props, `onFinish(reportId)`, `ensureReport()`, `checkpoint()`, `exitIntent`/`submitting` state, shared confirm `Modal`, `handleLeave`/`handleEnd` replacing the old `finish()`
- `app/interview/[type]/page.tsx` - passes new shell props, `onFinish` navigates via `router.push`, removed the `complete` step/`SetupStep` member and the now-unused `Sparkles` import

## Decisions Made
- Followed the plan's exact code shapes for `ensureReport`/`checkpoint`/`handleEnd`/`handleLeave` verbatim, including the comments explaining why `ensureReport()` must never be called from an exit path.
- Kept `setProgress`/`checkpoint` computed from a single local `nextProgress` (not a functional `setProgress` updater) per the plan's explicit snippet, since `progress` is already a `sendMessage` dependency and turns are sequential.
- Used `interviewType.slug` (not `params.type`) in the `router.push` template literal, per the plan's rationale that the report route canonicalizes on the stored slug and this avoids an unnecessary redirect.

## Deviations from Plan

None - plan executed exactly as written. `ChatMessage` and `InterviewSessionShellProps` changes (Task 1) and their sole caller in `app/interview/[type]/page.tsx` (Task 3) were both completed in the same execution pass as instructed, so the tree was never left in a broken intermediate state between the two edits.

## Issues Encountered
- `npx eslint --fix` on both files fails with the same pre-existing, repo-wide flat-config break documented in every prior Phase 6 summary (`plugin:@next/next/recommended` "Unexpected top-level property 'name'"). Not fixed, per the plan's explicit instruction that lint is broken repo-wide and `tsc --noEmit` is authoritative. `npx tsc --noEmit` is clean for both files touched by this plan (the only remaining repo-wide errors are the pre-existing stale `.next/types/validator.ts` references to nonexistent `app/plan`/`app/practice`/`app/progress` pages).
- `curl` against `/interview/general` without a session cookie returned `307` to `/login` — this is the same pre-existing `middleware.ts:273` behavior already logged by 06-03/06-04/06-05, not caused by this plan. `npm run dev` (with the inline local `DATABASE_URL`) confirmed the route compiles and serves without a Turbopack/module error.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `InterviewSessionShell` now returns a real `reportId` on finish; 06-07's report page at `/interview/[type]/report/[reportId]` is reachable end-to-end from the live session.
- 06-07 and 06-08 can proceed without further changes to this plan's two files. No blockers identified.
- Local dev DB was not touched by this plan (no server was exercised against a real authenticated session with real S3/DB writes) — verification here was limited to `tsc --noEmit` and an unauthenticated `npm run dev` compile/redirect check, since full live-avatar/S3/DB verification is the domain of the Step 3 validation checklist owned by later plans in this phase.

## Self-Check: PASSED

Both files confirmed present on disk; all three task commit hashes (`0ff813d`, `c8bc1e5`, `9f5f113`) confirmed in `git log`.

---
*Phase: 06-interview-evaluation-and-report*
*Completed: 2026-09-20*
