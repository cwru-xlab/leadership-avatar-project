---
phase: 09-student-authored-scenarios
plan: 07
subsystem: web
tags: [nextjs, react, case-play, scenario]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios (09-01)
    provides: "CaseStudy.ownerId, the sole discriminator this plan branches on"
  - phase: 09-student-authored-scenarios (09-04)
    provides: "POST /api/scenario/session/start and POST /api/scenario/session/finish, the two routes this plan's player calls"
provides:
  - "Scenario-aware handleStart/handleFinish branches in app/case-play/[caseId]/page.tsx — a student-authored scenario is now playable start to finish through the existing player"
affects: [09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A page that must serve two structurally different backends off one URL branches every entry point on a single server-set discriminator field (caseData.ownerId) rather than a URL param or client flag, so the legacy branch can be proven byte-identical by diffing the else body against the pre-change function"

key-files:
  created: []
  modified:
    - "app/case-play/[caseId]/page.tsx"

key-decisions:
  - "isScenario is derived (Boolean(caseData?.ownerId)), never a separate piece of state, so it can never drift out of sync with the loaded case"
  - "A scenario is always mode: assessed — the Explore System button is hidden entirely when isScenario, since a scenario run without a report would be misleading"
  - "handleFinish falls back to the legacy /api/interaction/finish path when isScenario is true but scenarioReportId is null (the only way this happens: a scenario run resumed via the pre-existing handleResume path, which this plan does not touch and which never repopulates scenarioReportId) — documented as a known gap rather than silently dropping the session"
  - "A scenario finish's 409 (\"already submitted\") is treated as a successful navigation, not an error, so a double-submit never strands the student on a dead session"
  - "The cohort avatar-time-limit effect (already gated on a non-empty cohortId) needed no new guard for scenarios — a scenario's cohortId query param is always empty by construction, so the effect already never fires and no avatar-minutes messaging renders"

requirements-completed: []

# Metrics
duration: 45min
completed: 2026-09-21
---

# Phase 9 Plan 07: Scenario-Aware Start/Finish in the Case Player Summary

**`app/case-play/[caseId]/page.tsx`'s `handleStart`/`handleFinish` now branch on `caseData.ownerId` to run a student-authored scenario through the cohort-free `/api/scenario/session/*` pipeline and land on its report, while the admin-case body is preserved verbatim in the `else`.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-21T20:45:00Z
- **Completed:** 2026-09-21T21:30:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added a derived `isScenario` flag (`Boolean(caseData?.ownerId)`) and `scenarioReportId` state; `handleStart` branches at the top to POST `/api/scenario/session/start` with `{caseId, language}` (no `cohortId` anywhere in the request) when `isScenario`, storing the returned `reportId` and setting the exact same downstream state (`interactionLog`, `chatMessages`, `pageState`) the legacy branch sets — every existing feature (auto-save, role switching, avatar mode, push-to-talk) works unchanged for a scenario with zero further code
- The "Explore System" button is hidden for a scenario (a scenario run is always `assessed`); the legacy admin-case body of `handleStart`, including its literal `cohortId` field, is preserved unchanged in the `else`
- `handleFinish` branches on `isScenario && scenarioReportId`: POSTs `/api/scenario/session/finish` with `{reportId, log}`, treats a 409 as a successful navigation (the run is finished either way), and on success routes to `/case-play/{caseId}/report/{reportId}` with a toast that the report is being prepared; a genuine failure keeps the student in the live session (no navigation) and toasts the error
- A resumed scenario run (loaded through the pre-existing `handleResume`, which this plan does not touch and which never repopulates `scenarioReportId`) falls back to the legacy finish path rather than losing the session — documented as a known limitation, not silently swallowed
- The admin-case `handleFinish` body — `/api/interaction/finish`, the mode-dependent toast, `router.push("/case-play")` — is preserved verbatim in the `else`

## Task Commits

Each task was committed atomically:

1. **Task 1: Branch handleStart onto the cohort-free scenario start route** - `e763d36` (feat)
2. **Task 2: Branch handleFinish into the scenario evaluation pipeline and navigate to the report** - `95a5457` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `app/case-play/[caseId]/page.tsx` - Added `isScenario`/`scenarioReportId`, scenario branches in `handleStart`/`handleFinish`, hid Explore for scenarios

## Decisions Made
- `isScenario` is computed, never stored as separate React state, so it cannot desync from `caseData`
- A scenario run is unconditionally `assessed` — there is no cohort-free "explore" concept, since every scenario run produces a report
- `handleFinish`'s fallback-to-legacy-when-`scenarioReportId`-is-null branch is a deliberate defensive measure for the resume gap (see Deviations), not dead code
- The cohort-derived avatar-minutes messaging required no new guard: `avatarTimeLimitSeconds` is only ever set inside an effect gated on a non-empty `cohortId`, and a scenario page's `cohortId` query param is always empty by construction (no code path ever attaches one to a scenario URL), so the existing null-check already suppresses all avatar-minutes UI for scenarios with zero change

## Verification (real, end-to-end)

Ran against the local dev DB (temporary `next dev` server on port 3017, inline local `DATABASE_URL`; two earlier attempts on ports 3015/3016 hit `TurbopackInternalError`/manifest corruption from the shared `.next` directory under concurrent sibling agents and were abandoned rather than fought — see Issues Encountered) with the real seeded student `student@case.edu` and real OpenAI calls:

- **Scenario path:** created a real scenario (`scn-09-07-verification-scenario-20325cab`) via `/api/scenario/add`; `POST /api/scenario/session/start` returned 201 with `reportId` and a log whose `cohortId` field is the literal empty string `""` — no cohort anywhere in the request or response; a synthetic 3-message transcript was submitted via `POST /api/scenario/session/finish`, which returned 202 with the same `reportId`; polling `GET /api/scenario/report/{reportId}` resolved to `status: "READY"` with `visual: null, vocal: null, content: 4, behavioral: 4` and markdown that visibly quoted the actual conversation — this is exactly the response shape and navigation target (`/case-play/{caseId}/report/{reportId}`) `handleFinish`'s scenario branch consumes
- **Admin-case regression path:** started a real attempt against the existing admin case `adam-testing` via the untouched `/api/interaction/start` with an arbitrary `cohortId`, confirmed 200 with the cohort echoed back; finished it via the untouched `/api/interaction/finish`, confirmed the exact 200 message `handleFinish`'s `else` branch expects ("Session completed. Evaluation is being processed in the background."); polled the S3 log directly and confirmed the legacy evaluator had written `evalScore: 5` and a populated `evalResult` — proving the legacy pipeline is provably still running for admin cases, unmodified by this plan
- `npx tsc --noEmit` clean after `rm -rf .next`
- `git diff --name-only` across both of this plan's commits (`e763d36`, `95a5457`) lists exactly `app/case-play/[caseId]/page.tsx` in each; `git show --name-only` on each confirmed no cross-contamination with the concurrently-running 09-06/09-08 agents' files
- `grep -n "cohortId"` in the file shows the same 5 occurrences as before this plan (the query-param read, the avatar-time-limit effect's guard/fetch/dependency array, and the one literal field inside the preserved legacy `handleStart` body) plus zero new occurrences inside either scenario branch

The temporary scenario, its `ScenarioReport` row, and the temporary dev server were all cleaned up after verification; the pre-existing port-3000 session was never touched.

## Deviations from Plan

None - plan executed exactly as written. The `handleFinish` fallback-to-legacy-when-no-`scenarioReportId` behavior and the "no new avatar-minutes guard needed" observation were both explicitly anticipated by the plan's own hard constraints and task text, not discovered mid-execution.

## Issues Encountered

Two temporary dev server attempts (ports 3015 and 3016) hit Turbopack persistent-cache corruption (`TurbopackInternalError: Failed to write page endpoint /_app`, then a stale-manifest `ENOENT` on `/api/auth/login`) — the same class of shared-`.next`-directory hazard already logged in `09-04-SUMMARY.md`, aggravated here by two other executors (09-06, 09-08) running `next dev` instances concurrently in the same working directory during this plan's execution window. Resolved by killing the corrupted instances and starting a fresh one on port 3017, which self-healed ("Turbopack's filesystem cache has been deleted because we previously detected an internal error") and served the rest of verification without incident.

This plan ran concurrently with 09-06 and 09-08 in the same working directory (no worktree isolation, shared git index). Both of this plan's commits were staged with the literal quoted pathspec `app/case-play/[caseId]/page.tsx` and independently verified via `git show --name-only` to contain only that one file; no cross-contamination occurred in either direction. `.planning/REQUIREMENTS.md` and `.planning/STATE.md` were observed mid-edit by the concurrent 09-08 agent (an uncommitted diff flipping REQ-32/REQ-33 to `[x]`) while this plan was running; rather than commit over that in-flight state, this executor waited for 09-08 to commit its own docs update (`8706de0`) before touching either shared file, per the concurrency-hazard protocol.

## User Setup Required

None - no external service configuration required. A real `OPENAI_API_KEY` (already present in the shared `.env`) was used for the live scenario-evaluation verification call.

## Next Phase Readiness

`/case-play/[caseId]` now plays a student-authored scenario start to finish and lands on `/case-play/{caseId}/report/{reportId}`, which 09-08's report page (built concurrently with this plan) already serves. No blockers for 09-09. One known, documented gap for a future plan to pick up if desired: resuming an in-progress scenario run via the pre-existing "Unfinished Sessions" list falls back to the legacy finish pipeline rather than the scenario one, since `handleResume` (untouched by this plan, out of its one-file scope) never repopulates `scenarioReportId`.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/case-play/[caseId]/page.tsx
- FOUND: commit e763d36
- FOUND: commit 95a5457
