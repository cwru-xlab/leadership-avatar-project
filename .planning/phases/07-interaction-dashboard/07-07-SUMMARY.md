---
phase: 07-interaction-dashboard
plan: 07
subsystem: verification
tags: [static-sweep, human-verification, end-to-end]

# Dependency graph
requires:
  - phase: 07-interaction-dashboard
    provides: "07-01 through 07-06 — the complete student interaction dashboard: registry, dashboard, /case-play index, /reports, /settings, /student-cases retirement"
provides:
  - "Verbatim static-sweep results for all 19 constraint checks (build, no-migration, REQ-11/13/14/15/16)"
  - "Human-confirmed end-to-end walkthrough of the 15-step student path"
  - "Consolidated deferred-items list for Phase 7"
affects: [phase-11-cohort-teardown]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/interview/[type]/report/[reportId]/page.tsx

key-decisions:
  - "Report page back navigation split into two distinct controls: a top 'Back to my reports' link (ArrowLeft icon) for the student arriving from /reports, and a bottom 'Back to practice' button repointed at / (the dashboard) so its label now matches its destination. Fixed under Rule 1 (bug — label/destination disagreed) during the human walkthrough, not a plan deviation."
  - "PHASE7_BASE resolved to 44793da (the commit immediately before 07-01's first commit 588a809), NOT main — main predates Phases 1-6 and diffing against it would misreport unrelated prisma/ and prompts.ts changes as Phase 7 violations."
  - "Deferred items carried forward rather than fixed in this phase, per the plan's verification-first scope boundary: logged-out join-by-code no longer completes (Phase 11 owns removal), /api/case/list stays enumerable by any authenticated user (published is a discovery filter, not access control, by design), per-case avatar-minutes limits are dropped on the student path (accepted consequence of the no-cohort model)."

patterns-established: []

requirements-completed: [REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16]

# Metrics
duration: ~45min (static sweep + human walkthrough + one fix)
completed: 2026-09-20
---

# Phase 7 Plan 07: Static Sweep and Human Validation Summary

**All 19 static constraint checks passed cleanly with zero genuine defects; a human walkthrough of all 15 student-path steps passed, with one real bug (report-page back-navigation label/destination mismatch) found and fixed inline.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 completed (1 auto static sweep, 1 checkpoint human-verify)

## Task 1: Static Constraint Sweep — verbatim results

**PHASE7_BASE resolved to:** `44793da7549715939a6759c71e7640498c9bcea8` (commit immediately before 07-01's first commit `588a809`; `main` is explicitly NOT the baseline per the plan's constraint).

**Build / types**

1. `npx tsc --noEmit` → **zero errors** (no `.next/types/validator.ts` staleness observed).
2. ESLint against untouched `lib/languages.ts` → same repo-wide `plugin:@next/next/recommended is invalid: Unexpected top-level property "name"` error. Confirmed pre-existing, not a Phase 7 regression. Recorded, not fixed.

**No migration happened**

3. `git diff $PHASE7_BASE --stat -- prisma/` → empty.
4. `git log $PHASE7_BASE..HEAD --oneline -- prisma/` → empty.
5. `grep -rn "prisma migrate\|migrate deploy\|migrate dev" .planning/phases/07-interaction-dashboard/*-SUMMARY.md` → no matches.
6. `ls prisma/migrations | tail -5` → last folder `20260916165041_add_user_and_auth_models`, `20260920034855_add_interview_report` — both dated before Phase 7's first commit (Phase 6 work); no Phase 7 migration folder exists.

**REQ-14 completeness**

7. `grep -rn "student-cases" --include="*.ts" --include="*.tsx" app components lib config middleware.ts` → no matches.
8. `ls app/student-cases` → `No such file or directory`.
9. `grep -n '"/reports"\|"/settings"' middleware.ts` → both present in `STUDENT_ROUTES` (lines 205-206).

**REQ-11 decoupling**

10. `grep -rn "lib/interview" lib/interactions/ components/interactions/` → two hits, both inside doc comments stating the LOCKED DECISION ("must never import from lib/interview"); zero actual import statements. Confirmed by a second, precise grep for `^import`/`from "` lines → zero matches.
11. `grep -ric "leading a meeting" lib/interactions/` → 0.
12. Registry count → exactly 5 `InteractionType` records in `lib/interactions/index.ts`; exactly 2 marked `availability: "live"` (interviews, case-studies); the other 3 (pitches, difficult-conversations, networking) are `coming-soon`.

**REQ-13 inertness**

13. Read `components/interactions/InteractionTile.tsx` in full. The live branch (`if (type.availability === "live")`) is the only branch containing `isPressable`/`onPress`/`router.push`. The coming-soon branch returns a plain `<div aria-disabled="true">` with no click handler, href, or role — confirmed by reading the file, not just counting matches.

**REQ-15 correctness — the two-Case trap**

14. `grep -rn "prisma.case\|isPublished" app/case-play/ app/api/case/ components/interactions/` → no matches. The student list is not wired to the staff/gradebook Prisma `Case` table.
15. `git diff $PHASE7_BASE -- app/api/case/get/route.ts` → empty. `published` remains a discovery filter only; `/api/case/get` still serves unpublished cases by direct URL (staff draft-preview mechanism untouched, confirmed separately end-to-end in 07-05).
    - **Accepted, not a defect:** `/api/case/list`'s unfiltered default (when `publishedOnly` is omitted) is reachable by any authenticated user and neither `ADMIN_ROUTES` nor `STUDENT_ROUTES` gate it — recorded in the deferred list below per 07-02's original acceptance.

**REQ-16**

16. `grep -n "toInterviewReportDTO" app/api/interview/reports/route.ts` → present, single import and single `.map(toInterviewReportDTO)` use — no second DTO.
17. `grep -n "IN_PROGRESS" app/api/interview/reports/route.ts` → the filter is `where: { userId: currentUser.id, status: { not: "IN_PROGRESS" } }`, inside the Prisma query, not a client-side `.filter()`.

**Out-of-scope guard**

18. `git diff $PHASE7_BASE --stat -- lib/interview/prompts.ts` → empty (the interview prompt contract is untouched by this phase).
19. Grepped for deferred-idea implementations (interview customization UI, student-authored scenarios, any Pitches/Difficult Conversations/Networking experience beyond the registry record, cohort teardown, CaseBridge→Leadership Avatar rename) across the phase's full changed-file list (`lib/interactions/index.ts`, `lib/interactions/types.ts`, `middleware.ts`, `types/index.ts`, and the other 18 files from `git diff $PHASE7_BASE --stat`) → none found. `prisma/schema.prisma` diff against the base is empty (no cohort-model change).

**Result: all 19 checks recorded; every MUST-be-empty check was empty; no genuine defect found in Task 1.**

## Task 2: Human Walkthrough — result

**Outcome: APPROVED.** The human ran the dev server against the local database (`DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" npm run dev`) and confirmed all 15 numbered steps in the plan's `<how-to-verify>` pass as specified:

1. Login lands on `/` (dashboard) — PASS.
2. Five tiles in order (Practice Interviews, Case Studies, Pitches, Difficult Conversations, Networking), each with icon/name/description/duration, no "Leading a Meeting" tile — PASS.
3. Coming-soon tile is inert (no nav/modal/toast, greyed with "Coming soon" badge, does not take keyboard focus) — PASS.
4. Practice Interviews reaches `/interview/general` unassigned — PASS.
5. Wizard back link returns to the dashboard — PASS.
6. Case Studies reaches `/case-play` with a deliberate empty state when nothing is published — PASS.
7. Admin publish via `/case-management` → student's `/case-play` shows only that case — PASS.
8. Published case plays with no cohort/assignment, no `cohortId` in the URL; intro back arrow returns to `/case-play` — PASS.
9. Direct URL to an unpublished case still opens (published is a visibility filter, not access control) — PASS.
10. Sidebar reads Practice / My Reports / Settings, all three icons render, all three links land on real pages — PASS.
11. `/reports` lists finished reports newest-first with type/interviewer/date/status/scores; IN_PROGRESS sessions absent; rows open full reports; a FAILED report (where present) is listed and clickable — PASS, **with one defect found and fixed** (see below).
12. `/settings` renders with normal page padding — PASS.
13. Admin visiting `/` still sees Cases/Cohorts/Avatars management cards unchanged — PASS.
14. `/student-cases` returns 404 — PASS.
15. Cross-user isolation between `alice.johnson@case.edu` and `bob.williams@case.edu`: each account's `/reports` shows only its own reports, no leakage — PASS.

### Defect found during step 11 and fixed inline

**[Rule 1 - Bug] Report-page back navigation label/destination mismatch**

- **Found during:** Task 2, step 11 (opening a report row from `/reports`).
- **Issue:** The report page (`app/interview/[type]/report/[reportId]/page.tsx`) had only one back control — a bottom button labeled "Back to practice" that actually navigated to `/reports`. The label and the actual destination disagreed, and there was no control that returned to the dashboard (`/`) at all.
- **Fix:** Added an optional `onBackToReports` prop to `ReportShell`, rendered as a new top "Back to my reports" link with an `ArrowLeft` icon, wired at all three shell call sites (needs-login, error, main). Repointed the existing bottom "Back to practice" button at `/` (the dashboard) in both the main and error shells, so its label now matches its destination. `npx tsc --noEmit` clean after the change.
- **Files modified:** `app/interview/[type]/report/[reportId]/page.tsx`
- **Commit:** `f3dddf0` — `fix(07-07): separate report-page back navigation`

## Deferred Items

These are recorded as known and accepted, not fixed in this phase:

1. **Logged-out join-by-code no longer completes.** `pendingCohortJoin` is written by `app/join/[accessCode]/page.tsx:37` and was consumed only by the now-deleted `app/student-cases/page.tsx`; `app/login/page.tsx` never reads a `returnTo` param. A logged-out student opening `/join/{code}` logs in and the join never finishes, leaving an orphaned localStorage key. The logged-in join path (`join:142`) still works. **Phase 11 owns the removal** (cohort teardown).
2. **`/api/case/list` stays enumerable.** `publishedOnly` is opt-in and the route sits in neither `ADMIN_ROUTES` nor `STUDENT_ROUTES`, so any authenticated user can list unpublished cases via the unfiltered default. Accepted — `published` is a discovery filter, not access control, consistent with 07-02's original design and re-confirmed unchanged by static check 15.
3. **Per-case avatar-minutes limits are dropped** on the student path, an accepted consequence of REQ-15's no-cohort model.
4. **ESLint is repo-wide broken** (`plugin:@next/next/recommended is invalid`), pre-existing and unrelated to Phase 7; `tsc --noEmit` is the authoritative type/build check for this project during Phase 7.
5. **`next build` is known-broken on `/about`** (missing `EDGE_CONFIG`), pre-existing and unrelated to Phase 7; not gated on.

## Requirement Traceability (per plan's `<verification>`)

- ROADMAP criterion 1 (student lands on dashboard) → walkthrough step 1: PASS.
- ROADMAP criterion 2 (student starts a practice interview unassigned) → walkthrough step 4: PASS.
- ROADMAP criterion 3 (dashboard routes into the right experience per type) → walkthrough steps 4 and 6: PASS.
- ROADMAP criterion 4 (new interaction type is a registry record, not a new page) → static check 12 plus the registry's shape (single array of typed records, `listInteractionTypes()`/`getInteractionType()` as the only access points): confirmed.
- ROADMAP criterion 5 (no surface depends on cohort membership or admin assignment) → walkthrough steps 7-9 and static check 14: PASS/confirmed.

## Self-Check: PASSED

- FOUND: `app/interview/[type]/report/[reportId]/page.tsx`
- FOUND: commit `f3dddf0`
- FOUND: `.planning/phases/07-interaction-dashboard/07-07-SUMMARY.md`
