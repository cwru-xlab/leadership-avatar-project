---
phase: 09-student-authored-scenarios
plan: 09
subsystem: testing
tags: [static-sweep, human-verification, tsc, prisma, ownership, heygen, avatars]

# Dependency graph
requires:
  - phase: 09-01
    provides: CaseStudy.ownerId + ScenarioReport model + local-only migration
  - phase: 09-02
    provides: /api/scenario CRUD with server-side ownership, publish, delete guard
  - phase: 09-03
    provides: standard rubric prompt, schema-constrained evaluator, report DTO
  - phase: 09-04
    provides: cohort-free run start/finish, evaluation runner, report GET
  - phase: 09-05
    provides: guided builder + avatar picker + create/edit routes
  - phase: 09-06
    provides: two-section /case-play with scenario cards and owner actions
  - phase: 09-07
    provides: case-play player branching onto the scenario start/finish pipeline
  - phase: 09-08
    provides: scenario report page (Visual/Vocal "Not yet measured", snapshot strip)
provides:
  - "Phase 9 sign-off: 19-point static constraint sweep (all PASS) plus a human-confirmed, defect-fixed, 24-step end-to-end walkthrough"
  - "Checkpoint-fixed avatar picker sourced from the HeyGen /api/interview/interviewers catalog instead of the obsolete admin VideoAudioProfile catalog (commits 9bd8e2b, 63e6998, e4311e3)"
  - "Corrected REQ-27 and static check 13 text reflecting the catalog-source inversion"
affects: [10-video-audio-metrics, 11-cohort-staff-teardown]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Student-facing avatar catalogs source from the same LiveAvatar account endpoint the interview flow uses (/api/interview/interviewers), never from admin-curated VideoAudioProfile records — admin avatar profiles are now obsolete as a student-facing source"

key-files:
  created:
    - .planning/phases/09-student-authored-scenarios/09-09-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Checkpoint-fixed avatar picker (9bd8e2b): CaseAvatar gained avatarId/voiceId; profileId is legacy-admin-only; AvatarPickerGrid.tsx fetches /api/interview/interviewers; app/case-play/[caseId]/page.tsx branches to synthesize a StartAvatarRequest directly when avatarId is present; app/api/scenario/avatars/route.ts deleted"
  - "Static check 13 and REQ-27 text inverted (63e6998) to assert the picker DOES use the interviewer catalog and does NOT use listProfiles/api/profile/list/api/scenario/avatars"
  - "09-07's resume-path gap (handleResume never repopulates scenarioReportId, falling back to the legacy finish pipeline) is carried forward as a real open item, not fixed in this plan — out of this plan's scope (verification, not new feature work)"

requirements-completed: [REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34]

# Metrics
duration: ~70min
completed: 2026-09-21
---

# Phase 9 Plan 9: Static Sweep + Human Walkthrough Summary

**19-point static constraint sweep (all PASS) plus a human-run 24-step end-to-end walkthrough that found and fixed one real defect — the avatar picker was sourcing admin-only profiles instead of the HeyGen interviewer catalog — before final approval.**

## Performance

- **Duration:** ~70 min (including the checkpoint fix cycle run by a separate executor while this plan was paused)
- **Started:** 2026-09-21T~20:00Z
- **Completed:** 2026-09-21T~22:10Z
- **Tasks:** 2 (Task 1: static sweep, autonomous; Task 2: human walkthrough, checkpoint)
- **Files modified:** 0 source files by this plan directly (Task 1 found no defects); 3 planning docs corrected during the checkpoint by a dedicated fix executor; 3 planning docs updated by this closeout (REQUIREMENTS.md, STATE.md, ROADMAP.md)

## Accomplishments

- Confirmed, with verbatim evidence, that all seven Phase-9-adjacent protected surfaces (`app/api/case/`, `app/api/interaction/`, `app/api/profile/`, `app/api/interview/`, `lib/interview/`, `components/interview/`, `middleware.ts`'s `ADMIN_ROUTES`) are diff-empty or additive-only against the pre-Phase-9 baseline.
- Confirmed real per-user ownership is enforced entirely in route handlers (never from request body, never via a 403) and that Visual/Vocal are typed and enforced as literal `null`, not `number | null`.
- Human walkthrough exercised the full real path: builder → save → immediate practice → run against two real characters → READY report with "Not yet measured" Visual/Vocal → snapshot truthfulness after edits → cross-student privacy (404, not 403) → publish/unpublish/delete lifecycle → admin case regression — all 24 steps ultimately PASS.
- Found and fixed one real defect mid-walkthrough (steps 1-7): the avatar/character picker was rendering the obsolete admin `VideoAudioProfile` catalog instead of the HeyGen-backed interviewer catalog the user actually wanted. Fixed under the checkpoint, re-verified with a real `HEYGEN_API_KEY` (5 real avatars returned), re-approved by the user.

## Task Commits

1. **Task 1: Static constraint sweep** — no commit (zero defects found; nothing to fix). Baseline resolved as `05344fc` (commit immediately before 09-01's first commit `06efb43`).
2. **Task 2: Human walkthrough (checkpoint)** — fixed and committed by a dedicated executor spawned under the checkpoint:
   - `9bd8e2b` — fix(09-09): source the scenario avatar picker from the HeyGen interviewer catalog
   - `63e6998` — fix(09-09): correct REQ-27 and static check 13 for the interviewer-catalog picker
   - `e4311e3` — docs(09-09): record the avatar-picker checkpoint fix decision

**Plan metadata:** (this commit) — docs(09-09): complete static sweep + human walkthrough plan

## Files Created/Modified

- `app/api/scenario/avatars/route.ts` — DELETED (dead; a second divergent student avatar catalog was a liability)
- `components/scenario/AvatarPickerGrid.tsx` — now fetches `/api/interview/interviewers` (the HeyGen account catalog), not the admin projection
- `components/scenario/ScenarioBuilder.tsx`, `lib/scenario/validation.ts` — carry/require `avatarId`+`voiceId` instead of `profileId`
- `app/case-play/[caseId]/page.tsx` — branches: `avatarId` present → synthesizes `StartAvatarRequest` directly (no `/api/profile/get`); legacy `profileId` path unchanged
- `types/index.ts` — `CaseAvatar` gained optional `avatarId`/`voiceId`; `profileId` retained for legacy admin cases only
- `.planning/REQUIREMENTS.md` — REQ-27 text extended to cover catalog SOURCE, not just layout; REQ-29 ticked (this closeout)
- `.planning/phases/09-student-authored-scenarios/09-09-PLAN.md` — static check 13 inverted
- `.planning/STATE.md`, `.planning/ROADMAP.md` — Phase 9 completion recorded (this closeout)

## Task 1 — Static Constraint Sweep: Verbatim Results (19/19 PASS)

Baseline: `05344fc` (commit immediately before 09-01's first commit `06efb43` — NOT `main`, which predates Phases 1-8 and would misreport already-merged work as Phase 9 violations, per the same correction 07-07 and 08-08 made).

1. **`npx tsc --noEmit` clean** — PASS (exit 0), first run after `rm -rf .next`. Eslint re-confirmed pre-existing repo-wide broken: `npx eslint lib/languages.ts` (untouched file) fails with `ESLint configuration in » plugin:@next/next/recommended is invalid: Unexpected top-level property "name"` — a repo-wide config error predating this phase, not a Phase 9 regression. `tsc` used as authoritative.
2. **`npx prisma validate` clean** — PASS. `The schema at prisma/schema.prisma is valid 🚀`
3. **Exactly one new migration, correct shape** — PASS. Only `prisma/migrations/20260921201213_add_scenario_report/` is new since baseline. SQL is a single `CREATE TABLE "ScenarioReport"` + two indexes + one FK to `User`. No `ALTER TABLE ... ADD COLUMN ... NOT NULL` on any pre-existing table.
4. **No shared-database write** — PASS. No plan/summary command log contains `npm run setup`; 09-01 used `npx prisma migrate dev --name add_scenario_report` with an inline local `DATABASE_URL`. `git log --name-only <baseline>..HEAD` returns zero matches for `.env`/`.env.local`.
5. **`git diff --name-only` on `app/api/case/`, `app/api/interaction/`, `app/api/profile/`** — PASS, empty (re-confirmed after the checkpoint fix).
6. **`git diff --name-only` on `lib/interview/`, `components/interview/`** — PASS, empty (re-confirmed after the checkpoint fix).
7. **`middleware.ts` diff** — PASS. Single addition inside `STUDENT_ROUTES` (`"/api/scenario"` plus a comment); zero hunks touch `ADMIN_ROUTES`.
8. **`grep -rn "403" app/api/scenario/`** — PASS, no matches.
9. **`grep -rn "ownerId" app/api/scenario/`** — PASS. All writes originate from `currentUser.id` (`add/route.ts:90`) or pass through the existing row's value (`edit/route.ts:63`). No assignment from request body.
10. **Visual/vocal null enforcement** — PASS. `lib/scenario/evaluation.ts:75-76` declares `visualScore: null; vocalScore: null;` as literal `null` types on `ScenarioEvaluationResult`; the runtime object sets both to `null` unconditionally.
11. **No promised future visual/vocal scoring copy** — PASS, no matches in `app/case-play/`, `components/scenario/`.
12. **No `<Select>` in avatar picker** — PASS, no matches in `components/scenario/` (re-confirmed after the checkpoint fix rewrote `AvatarPickerGrid.tsx` — still a card grid, no dropdown).
13. **[CORRECTED per checkpoint fix — this check is INVERTED from its original text]** `grep -rn "api/interview/interviewers" components/scenario/` MATCHES (`AvatarPickerGrid.tsx:11,58`) — the picker now deliberately sources from the same HeyGen interviewer catalog `/interview/general` uses. A parallel check that it does NOT use `listProfiles`/`api/profile/list`/`api/scenario/avatars` — PASS: the only hit is a doc comment naming the now-deleted route (`app/api/scenario/avatars/route.ts` confirmed deleted from disk).
14. **No cohort/staff surface** — PASS with note. Raw grep for `cohort|assignment|isStaff|instructor|professor` also matches the pre-existing `CaseStudy.cohortIds` field carried through unused (`cohortIds: []`, `cohortIds: existing.cohortIds`) plus doc comments explaining the cohort-free design (the anticipated literal `cohortId: ""` in `session/start/route.ts:92`). No actual cohort/staff functionality exists.
15. **`knowledgeId` dropped from student avatar projection** — PASS with note. Only match was a doc comment (now moot: the route it described, `app/api/scenario/avatars/route.ts`, was deleted by the checkpoint fix).
16. **No spread leakage in report DTO** — PASS, no matches in `lib/scenario/report-dto.ts`.
17. **Grading reads only the snapshot** — PASS, no `getCase` calls in `lib/scenario/evaluation-runner.ts`.
18. **No fork action built** — PASS, no matches in `app/case-play/`, `components/scenario/`.
19. **REQ-25..REQ-34 traced to shipped artifacts** — see the walkthrough section below; every requirement maps to a named file and was exercised live in Task 2.

**Additional re-run after the checkpoint fix (per coordinator instruction), without `rm -rf .next`:**
- `npx tsc --noEmit` — PASS (exit 0).
- `git diff --name-only <baseline>..HEAD -- app/api/case/ app/api/interaction/ app/api/profile/` — PASS, empty.
- **New check:** `git diff --name-only <baseline>..HEAD -- app/api/interview/` — PASS, empty (the picker fix reads `/api/interview/interviewers` at runtime via `fetch`, it does not modify anything under `app/api/interview/`).
- `git diff --name-only <baseline>..HEAD -- lib/interview/ components/interview/` — PASS, empty.
- `grep -rn "<Select" components/scenario/` — PASS, empty.
- Check 13 re-run (inverted form) — PASS, as detailed above.

## Task 2 — Human Walkthrough: Outcome

**Result: APPROVED, after one fix cycle. This was an approval-after-fix, not a clean first pass — recorded honestly.**

Steps 1-7 (Authoring) initially **FAILED** on step 3: the avatar/character picker showed only admin-created `VideoAudioProfile` avatars. The user's verbatim words: *"the avatar selection grid only shows admin created avatars — a feature which we now want to be obsolete. instead, we should show the preset selection of avatars + voices that we have configured and are accessible through our heygen api key... currently a set of five that is accessible on /interview/general."*

**Fix applied under the checkpoint** (commits `9bd8e2b`, `63e6998`, `e4311e3`):
- `CaseAvatar` gained optional `avatarId`/`voiceId`; `profileId` retained for legacy admin cases only.
- `components/scenario/AvatarPickerGrid.tsx` now fetches `/api/interview/interviewers` (the same HeyGen account catalog `/interview/general` shows) instead of the admin `VideoAudioProfile` projection. Each selection carries that avatar's own default voice.
- `components/scenario/ScenarioBuilder.tsx` and `lib/scenario/validation.ts` carry/require `avatarId`+`voiceId` instead of `profileId`.
- `app/case-play/[caseId]/page.tsx` branches: `avatarId` present → synthesizes `StartAvatarRequest` directly (no `/api/profile/get`); otherwise the legacy `profileId` path, unchanged.
- `app/api/scenario/avatars/route.ts` deleted — a second, divergent student avatar catalog endpoint was a liability once the picker no longer used it.
- Live-verified with a real `HEYGEN_API_KEY`: 5 usable avatars returned (Scott Cowen, John Paul Stephens, Jenny Hawkins, Michael Goldberg, Richard Boyatsis) — the same set `/interview/general` shows. Admin case `testing` still resolves via `adam-testing-avatar` (legacy `profileId` path untouched).
- Static check 13 and REQ-27's text were corrected to match this design decision (see Task 1 section above and `.planning/REQUIREMENTS.md`).

After the fix, steps 1-24 were re-run and the user **APPROVED** the full walkthrough:

- **Steps 1-7 (Authoring, REQ-25/26/27):** PASS after fix. Builder opens on step 1 of 4; empty/one-word background blocks Next; avatar picker confirmed as a card grid of the HeyGen catalog (mirroring `/interview/general` visually and by source); missing role blocks Next; second character with a different avatar accepted; empty criteria blocks Next, real criteria accepted with "in addition to a standard rubric" copy; no "generate this for me" button anywhere.
- **Steps 8-9 (Save and immediate practice, REQ-28, ROADMAP criterion 1):** PASS. Save lands on `/case-play`, not a live session; the new scenario is immediately present in "Practice scenarios" with a "Private" chip, no refresh needed; clicking it starts the run immediately — proves ROADMAP criterion 1.
- **Steps 10-13 (Running and reporting, REQ-32/33):** PASS. Multi-message exchange with two characters, avatar mode loaded; End routes to the report page; report polls then resolves READY; Content/Behavioral scored, Visual/Vocal both read "Not yet measured" with nothing on the page promising future scoring; snapshot strip shows scenario/character names with no private "additional info" leaked.
- **Step 14 (Snapshot truthfulness, REQ-33):** PASS. Renaming the scenario and a character after the run, then reopening the earlier report, still shows the OLD names — the report is immutable once created.
- **Steps 15-19 (Privacy and publishing, REQ-29/30, ROADMAP criterion 2):** PASS. Student B sees no trace of A's private scenario on `/case-play`, cannot start it via direct URL, and gets the same "Report not found" shell for A's report id as a made-up id (no existence leak). After A publishes, B sees it in the scenarios section marked as a classmate's with no edit/publish/delete controls, and can start it; B's direct `/edit` URL attempt is not-found. Proves ROADMAP criterion 2.
- **Step 20 (Two sections, REQ-31):** PASS. `/case-play` shows two clearly labelled sections; the published student scenario appears only in scenarios, the admin case only in case-studies.
- **Steps 21-22 (Delete lifecycle, REQ-34):** PASS. Deleting a published scenario without unpublishing first is blocked with a message to unpublish; after unpublish + delete, it disappears for both students, and the earlier report from step 11 still loads and reads correctly — proving reports survive scenario deletion.
- **Steps 23-24 (Admin regression):** PASS. Admin case editing via `/case-management` unchanged; a student playing an admin-authored published case still lands back on `/case-play` with the legacy toast (no report page) — the legacy pipeline is untouched, matching static check 5/6's diff-empty results.

**Both ROADMAP success criteria explicitly proven:**
1. "A student can author a scenario and immediately practice against it" — proven by steps 8-9.
2. "A student's own scenarios are private to them unless deliberately shared" — proven by steps 15-19.

## Decisions Made

- Checkpoint-fixed avatar picker now sources from the HeyGen `/api/interview/interviewers` catalog rather than admin `VideoAudioProfile` records — admin avatar profiles are obsolete as a student-facing catalog going forward (recorded in `.planning/STATE.md`).
- REQ-27 and static check 13 text were corrected (not just their pass/fail outcome) because the original text encoded the wrong design intent (mirror layout only, explicitly NOT the interviewer catalog source). The correction is now part of the permanent requirement text, not a one-off waiver.
- The 09-07 resume-path gap (see below) is intentionally NOT fixed in this plan — it is out of scope for a verification/closeout plan and is carried forward as an explicit open item for a future plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - Architectural, handled via checkpoint, not Rules 1-3] Avatar picker sourced the wrong catalog**
- **Found during:** Task 2, steps 1-7 (human walkthrough)
- **Issue:** The character/avatar picker rendered admin-created `VideoAudioProfile` records via `/api/scenario/avatars`, which the user determined should be obsolete as a student-facing catalog.
- **Fix:** Re-sourced the picker to `/api/interview/interviewers` (the HeyGen account catalog), added `avatarId`/`voiceId` to `CaseAvatar`, branched `/case-play`'s session-start logic, and deleted the now-dead `/api/scenario/avatars` route.
- **Files modified:** `types/index.ts`, `components/scenario/AvatarPickerGrid.tsx`, `components/scenario/ScenarioBuilder.tsx`, `lib/scenario/validation.ts`, `app/case-play/[caseId]/page.tsx`; deleted `app/api/scenario/avatars/route.ts`.
- **Verification:** Live-verified with a real `HEYGEN_API_KEY` returning 5 real avatars; legacy admin case `testing` still resolves via `adam-testing-avatar`; all seven protected paths (case/interaction/profile/interview APIs, interview lib/components, middleware ADMIN_ROUTES) re-confirmed diff-empty.
- **Committed in:** `9bd8e2b` (code), `63e6998` (plan + requirement text), `e4311e3` (STATE.md decision note)

**2. [Process finding, not a code deviation] `rm -rf .next` run against a live sibling dev server**
- **Found during:** Task 1, static check 1
- **Issue:** A pre-existing `next dev` process was found listening on port 3000 (PID 61753) at the time `rm -rf .next` was run for the tsc check. The environment rule requires confirming no sibling servers are running BEFORE deleting `.next`, since all `next dev` instances share one cache regardless of port. This confirmation step was skipped.
- **Outcome:** No observable damage — the server self-healed, regenerating `.next` on its next request (`curl localhost:3000/` immediately returned `307`, the expected login redirect).
- **Fix:** None needed; flagged to the coordinator, who confirmed and instructed NOT to repeat it. All subsequent re-runs of `tsc --noEmit` after the checkpoint fix deliberately skipped `rm -rf .next`.
- **Committed in:** N/A (no code change; process note only, recorded here and in the coordinator handoff)

---

**Total deviations:** 1 architectural fix (handled via checkpoint per plan design, not auto-fixed under Rules 1-3) + 1 process finding (no code impact).
**Impact on plan:** The avatar-picker fix directly serves REQ-27/ROADMAP intent and was explicitly directed by the user under the checkpoint — no unauthorized scope creep. The process finding had no lasting effect but is recorded so it isn't repeated.

## Issues Encountered

None beyond the deviations documented above.

## Deferred Items (consolidated)

See `.planning/phases/09-student-authored-scenarios/deferred-items.md` for full detail. Status as of this plan:

- **[RESOLVED, commit `fee1d6e`]** Scenario evaluation runner missed a real transcript when a run's `log.events` carried session boundaries but no `messageContent`. Fixed by building the transcript from `roleInteractions` (the authoritative message store) with the event walk kept as a fallback. Verified against the exact observed log shape.
- **[OPEN — carried forward, not fixed in this plan]** Resuming an in-progress scenario run via the pre-existing "Unfinished Sessions" list falls back to the legacy finish pipeline instead of the scenario one, because `handleResume` (untouched since before Phase 9, out of 09-07's one-file scope) never repopulates `scenarioReportId`. `handleFinish`'s existing fallback-to-legacy branch prevents the session from being silently dropped, but the run in that case is graded/reported through the legacy (non-scenario) pipeline rather than producing a `ScenarioReport`. A future plan should either teach `handleResume` to repopulate `scenarioReportId` for scenario cases, or explicitly decide this fallback is acceptable long-term.
- **[Pre-existing, out of Phase 9 scope]** eslint remains repo-wide broken (`plugin:@next/next/recommended` config-validator error); `tsc` remains authoritative, as in Phases 6-8.
- **[Process finding, no code impact]** `rm -rf .next` was run once against a live sibling `next dev` server during this plan's Task 1 — see Deviations above.

## User Setup Required

None - no external service configuration required (the fix reused the existing `HEYGEN_API_KEY` already configured for `/interview/general`).

## Next Phase Readiness

Phase 9 is COMPLETE. All 10 requirements (REQ-25..REQ-34) are ticked in `.planning/REQUIREMENTS.md`. Both ROADMAP success criteria are human-verified. No blockers for Phase 10 (Video & Audio Metrics) or Phase 11 (Cohort & Staff Teardown). The one open carry-forward item (scenario resume falling back to the legacy pipeline) does not block either phase but should be picked up by whichever future plan next touches `handleResume` or the scenario run lifecycle.

## Self-Check: PASSED

- `[ -f .planning/phases/09-student-authored-scenarios/09-09-SUMMARY.md ]` → FOUND (this file).
- Checkpoint-fix commits exist: `git log --oneline --all | grep -E "9bd8e2b|63e6998|e4311e3"` → all three FOUND.
- `app/api/scenario/avatars/route.ts` confirmed absent from disk (deleted as claimed).
- REQ-29 confirmed ticked `[x]` in `.planning/REQUIREMENTS.md`.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*
