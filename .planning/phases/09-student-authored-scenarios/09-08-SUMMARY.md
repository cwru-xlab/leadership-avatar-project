---
phase: 09-student-authored-scenarios
plan: 08
subsystem: ui
tags: [nextjs, react, polling, report-page]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios (09-03)
    provides: "ScenarioReportDTO shape, SCENARIO_REPORT_TERMINAL_STATUSES this page polls against"
  - phase: 09-student-authored-scenarios (09-04)
    provides: "GET /api/scenario/report/[reportId] — owner-scoped DTO read this page fetches and polls"
  - phase: 06-interview-evaluation-and-report
    provides: "The interview report page's shell/polling/terminal-state structure this page mirrors (never imports); ReportScoreCards and ReportMarkdown components reused unchanged"
provides:
  - "app/case-play/[caseId]/report/[reportId]/page.tsx — scenario report page: polling, four score cards (Visual/Vocal always 'Not yet measured'), markdown body, and a run-time scenario snapshot strip"
affects: [09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The scenario report page follows the interview report page's exact terminal-state branch structure (404/error, PENDING-or-IN_PROGRESS polling, FAILED, READY) but is a wholly separate file — no shared abstraction was introduced, matching the plan's reuse-not-import instruction for ReportScoreCards/ReportMarkdown"
    - "A 404 sets a dedicated `notFound` boolean (not the generic `error` string) so the polling effect can check it directly and the initial fetch is provably the only request ever made for a bad or non-owned id"

key-files:
  created:
    - app/case-play/[caseId]/report/[reportId]/page.tsx
  modified: []

key-decisions:
  - "The scenario snapshot strip renders criteria only as a presence dot + label ('Criteria applied' / 'No author criteria'), never the criteria text itself, keeping the strip compact and never exposing the author's rubric to the runner reading their own report"
  - "The FAILED branch offers no retry control (unlike the interview side's /api/interview/report/[reportId]/retry), matching the plan's explicit instruction that no scenario retry endpoint exists yet — it states plainly that the transcript was kept and offers only a route back to /case-play"
  - "The top-level back control is a single 'Back to practice' link/button pointing at /case-play in every branch (404, error, and normal), avoiding the label/destination mismatch bug '07-07-SUMMARY.md' found on the interview side"

requirements-completed: [REQ-32, REQ-33, REQ-34]

# Metrics
duration: 45min
completed: 2026-09-21
---

# Phase 9 Plan 08: Scenario Report Page Summary

**New `app/case-play/[caseId]/report/[reportId]/page.tsx` polls `GET /api/scenario/report/[reportId]`, reuses `ReportScoreCards`/`ReportMarkdown` unchanged, and renders a run-time-only scenario snapshot strip — making REQ-32/33/34's backend guarantees visible to the student for the first time.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-21T20:35:00Z
- **Completed:** 2026-09-21T21:20:00Z
- **Tasks:** 1
- **Files modified:** 1 created, 0 modified

## Accomplishments
- Built the scenario report page closely following `app/interview/[type]/report/[reportId]/page.tsx`'s shell/polling/terminal-state structure: fetches on mount with `credentials: "include"`, polls every 3s while `PENDING`/`IN_PROGRESS`, stops on `SCENARIO_REPORT_TERMINAL_STATUSES`, and gives up after 3 minutes with a "this is taking longer than expected" message plus a manual "Check again" button.
- A 404 (bad id or non-owner — the API returns the byte-identical body/status for both) sets a dedicated `notFound` state and never triggers the poll effect, so exactly one request is made; verified live in the Network sense via direct curl (single GET, 404, no loop possible since polling only runs on `PENDING`/`IN_PROGRESS`).
- READY renders `<ReportScoreCards scores={...} />` (Visual/Vocal always "Not yet measured", Content/Behavioral numeric or "Not scored") followed by `<ReportMarkdown markdown={...} />`; FAILED renders the `failureReason` in a danger-styled card, still shows the score cards and snapshot strip, states the transcript was kept, and offers no retry control (none exists for scenarios).
- A compact `ScenarioSnapshotStrip` above the score cards (READY and FAILED only) reads exclusively from `report.scenario` (the DTO's run-time snapshot) — scenario name, character `{name, role}` chips, and a criteria-presence dot — labelled "This scenario as it was when you practised."
- `components/interview/ReportScoreCards.tsx` and `ReportMarkdown.tsx` are imported and used completely unchanged; `git diff --stat components/interview/` is empty.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scenario report page with polling and terminal-state branches** - `265f1bb` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `app/case-play/[caseId]/report/[reportId]/page.tsx` - Scenario report page: polling, four score cards, markdown body, run-time snapshot strip

## Decisions Made
- Criteria in the snapshot strip is a presence indicator only (dot + "Criteria applied"/"No author criteria"), never the criteria text — the plan explicitly required a "presence chip or collapsed disclosure," and a presence chip was the simpler compliant choice.
- No shared component was extracted between the interview and scenario report pages despite structural similarity — the plan's hard constraint was to model the new page closely on the existing one, not to refactor a shared abstraction, and `ReportScoreCards`/`ReportMarkdown` (the only pieces both pages truly need to share) were already generic and reused unchanged.
- The scenario page's back control is a single "Back to practice" button/link that always points at `/case-play`, in every branch, deliberately avoiding a repeat of the interview page's `07-07`-discovered label/destination mismatch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

During live verification, a real scenario run's transcript (sent via the `finish` route's `roleInteractions` payload) was graded by `runScenarioEvaluation` as if no transcript existed, even though messages were present in the request body — the evaluator's markdown explicitly said "there is no substantive transcript available." This is a pre-existing behavior in `lib/scenario/evaluation-runner.ts`/`lib/scenario/evaluation.ts` (09-03/09-04, both already complete and out of scope for this UI-only plan) and does not affect this plan's own correctness: the report still resolved to `READY` with `visual: null`, `vocal: null`, numeric `content`/`behavioral` scores, and a rendered markdown body, which is exactly the DTO shape this page is built to display. Logged to `deferred-items.md` in the phase directory rather than fixed here, since the plan's scope is the report page, not the evaluation runner's transcript-flattening logic.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The scenario report page is live and verified end-to-end against the local dev DB with real seeded students (`alice.johnson@case.edu`, `bob.williams@case.edu`) and a real OpenAI evaluation call: a READY report showed numeric Content/Behavioral scores and "Not yet measured" Visual/Vocal, with markdown rendering and the snapshot strip showing the scenario's name and character; editing the live scenario's name/background/characters and reloading left the snapshot strip byte-for-byte unchanged (REQ-33); unpublishing and deleting the underlying scenario left the report fully readable, page still 200 (REQ-34); a second student's direct hit on the same report id, and a nonexistent report id, both produced the identical 404 API body with no poll loop. All test scenario/report fixtures were cleaned up and the temporary dev server (port 3014) was stopped. No blockers for 09-09.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/case-play/[caseId]/report/[reportId]/page.tsx
- FOUND: commit 265f1bb
