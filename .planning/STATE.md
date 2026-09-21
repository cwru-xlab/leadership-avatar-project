# Project State

**Project:** Leadership Avatar — Interview Practice
**Milestone:** v1.0
**Updated:** 2026-09-21 (Phase 9 context gathered)

## Current Position

**Phase:** 9 — Student-Authored Scenarios
**Current Plan:** Not started — context gathered, not yet planned
**Status:** Ready for planning
**Branch:** feature/interview-baseline

Phases 1-5 (interview registry, interviewer catalog, resume ingestion, setup flow,
live session shell) shipped before this project used GSD and were reconstructed
into ROADMAP.md on 2026-09-19 during a mid-project handoff.

## Environment Notes

- **Shared database:** `DATABASE_URL` in `.env` points at the team's AWS Lightsail
  Postgres. `.env` is a SYMLINK to `.env.local` — they are one file and cannot
  hold different values. Never migrate this database from a plan.
- **Local database:** PostgreSQL 17 via Homebrew (`brew services`), database
  `leadership_avatar_dev`, currently empty. This is the migration and validation
  target for Phase 6. Always pass it inline:
  `DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"`
- **Never run `npm run setup`** during Phase 6 — `scripts/setup.mjs:211` runs
  `prisma migrate deploy` against the shared `DATABASE_URL`.
- **`next build` is known-broken** on `/about` prerender (missing `EDGE_CONFIG`),
  unrelated to this phase. Verify with `tsc --noEmit` / `eslint` / `next dev`.
- **`.planning/` is now TRACKED IN GIT.** The `/.planning/*` line was removed
  from `.gitignore` on 2026-09-21 so the folder could be pushed for a teammate
  handoff. Planning docs are versioned from now on and SHOULD be committed.
  Phase 6-8 plan/summary text saying "`.planning/` is gitignored" is stale.
- **Teammate handoff:** see `.planning/HANDOFF.md` for local setup, the two
  unapplied migrations, and the known-issues list.

## Decisions

- **Individual-only product model.** Cohorts, assignments, and staff/admin
  oversight are being removed. New schema must not carry `cohortId`, assignment
  linkage, gradebook hooks, or staff-visibility fields.
- **Interview reports are owner-only.** Cross-user access returns 404, never 403.
- **Visual/Vocal scores stay null** until a real video/audio metrics pipeline
  exists; enforced in validation code, not just by prompt.
- **Product rename pending:** "CaseBridge" strings remain in UI copy. Renaming is
  its own phase, not part of Phase 6.
- [Phase 06-interview-evaluation-and-report]: Evaluation module hardcodes Visual/Vocal scores to null in validateEvaluationResult, never trusting model output for those fields.
- [Phase 06-interview-evaluation-and-report]: InterviewReport migration generated and applied to local dev DB only; shared RDS untouched, handoff via npm run setup
- [Phase 06-interview-evaluation-and-report]: Session start/checkpoint routes copy the upload-resume auth pattern verbatim; ownership always findFirst({id, userId}), 404 never 403.
- [Phase 06-interview-evaluation-and-report]: runAndPersistEvaluation is the single background-job function called by both finish and retry, so READY/FAILED semantics for an interview report exist in exactly one place.
- [Phase 06-interview-evaluation-and-report]: handleEnd reads reportIdRef.current directly and never calls ensureReport(); connecting and immediately pressing End takes the same no-row Leave path, so no orphan IN_PROGRESS row can ever be created from an exit control.
- [Phase 06-interview-evaluation-and-report]: The avatar session is stopped only after a successful (or 409) /api/interview/session/finish response, so a network failure during End leaves the student in a live, retryable interview rather than a dead one.
- [Phase 06-interview-evaluation-and-report]: Report page derives Visual/Vocal unmeasured treatment unconditionally from card logic (never branching on score value), and the pending-vs-content branch keys off the same InterviewReportDTO status the GET route returns, with no separate loading flag.
- [Phase 06-interview-evaluation-and-report]: Report page distinguishes "Not yet measured" (Visual/Vocal, no pipeline exists) from "Not scored" (Content/Behavioral, evaluation genuinely failed to produce a score) as two different states with different causes — discovered during 06-08 end-to-end validation, not specified in the plan, kept as deliberate behavior.
- [Phase 06-interview-evaluation-and-report]: 06-08 end-to-end validation confirmed all 11 real-session checklist steps pass (real LiveAvatar interview, real PDF resume, S3 checkpointing, READY/FAILED/retry, owner-only 404, no resume/S3 leakage). Three pre-existing Phase 5 avatar-surface bugs (unreachable input row + dead elapsed clock, missing avatar keepAlive causing session reaping, silent discard of a completed interview when report-row creation failed) were found and fixed under Rules 1/3; the Phase 6 evaluation/report core itself needed no changes.
- [Phase 07-interaction-dashboard]: Interviews tile copy/route hardcoded in lib/interactions, not derived from INTERVIEW_TYPES, to keep the registry free of imports from lib/interview
- [Phase 07-interaction-dashboard]: `published` on the S3 CaseStudy gates discovery only, never access — `/api/case/get` is deliberately unchanged so an unpublished case still plays by direct URL for staff preview; no backfill script exists, so every pre-existing case defaults to unpublished until staff manually toggle it.
- [Phase 07-interaction-dashboard]: `/api/case/list`'s unfiltered default stays reachable by any authenticated user; `publishedOnly` is opt-in and no role gate was added in 07-02 (deliberately deferred, referenced by 07-07 static check 15).
- [Phase 07-interaction-dashboard]: The `/reports` list endpoint reuses `toInterviewReportDTO` verbatim rather than a second, stripped mapping — `reportMarkdown` rides along on every row by deliberate choice, not oversight.
- [Phase 07-interaction-dashboard]: Unauthenticated calls to `/api/interview/reports` return middleware's `307` redirect-to-`/login`, not a JSON `401` — identical to the pre-existing behavior on `/api/interview/report/[reportId]`, already logged as a deferred gap in `06-08-SUMMARY.md`; not fixed here, out of scope.
- [Phase 07-interaction-dashboard]: `app/page.tsx`'s `useEffect` redirect to `/student-cases` was deleted outright rather than left dormant, since 07-06 (wave 3) owns repointing the other 13 `/student-cases` references and must not touch this file again; no new page-level auth check was added because `middleware.ts` already gates `/` before the role branch is reached.
- [Phase 07-interaction-dashboard]: `/case-play` (the new index page) adds no page-level auth check — `middleware.ts` already gates it under `STUDENT_ROUTES` and `/api/case/list` is reachable by any authenticated user, matching the codebase's middleware-based auth model rather than duplicating a role check per page.
- [Phase 07-interaction-dashboard]: 07-06 sends the interview report page's not-found button and `onBack` handler to `/reports` (not `/`) since a student leaving a report is more likely to want the report list; all four case-play exit points go to `/case-play` (not `/`) since a student finishing one case most likely wants another, and the `cohortId` query string on the old save-and-exit target was dropped entirely (the new index takes no cohort param).
- [Phase 07-interaction-dashboard]: Deleting `/student-cases` (07-06) breaks the logged-out join-by-code flow — `app/join/[accessCode]/page.tsx` still writes `pendingCohortJoin` to localStorage, but its only consumer was the now-deleted page, and `app/login/page.tsx` never read a `returnTo` param. Accepted as a Phase 11 cohort-teardown item; the logged-in join path still works.
- [Phase 07-interaction-dashboard]: 07-07's static sweep resolved the Phase 7 baseline as the commit immediately before 07-01 (`44793da`), not `main` — `main` predates Phases 1-6, so diffing against it would misreport already-merged, legitimate `prisma/` and `lib/interview/prompts.ts` changes as Phase 7 violations. All 19 static checks passed clean against that baseline; zero migrations, zero student-cases references, registry exactly 5 types/2 live, `InteractionTile`'s live branch is the only interactive branch, `app/api/case/get/route.ts` unchanged, `toInterviewReportDTO` reused with the `IN_PROGRESS` filter in the Prisma `where`.
- [Phase 07-interaction-dashboard]: 07-07's human walkthrough approved all 15 student-path steps end to end (dashboard landing, unassigned interview start, coming-soon tile inertness, published-case discovery with no cohort, cross-user report isolation between two seeded students). One real bug was found and fixed during the walkthrough: the report page's only back control was a bottom "Back to practice" button that actually navigated to `/reports` (label/destination mismatch, no route back to the dashboard existed at all). Fixed by adding a top "Back to my reports" link and repointing the bottom button at `/`, commit `f3dddf0`.
- [Phase 08-interview-customization]: difficulty stored as plain String? on InterviewReport, not a Prisma enum, keeping lib/interview/types.ts InterviewDifficulty as the single source of truth
- [Phase 08-interview-customization]: No column added for raw pasted interviewer-profile text; only the derived interviewerPersona summary is persisted on InterviewReport
- [Phase 08-interview-customization]: resolveInterviewType is pure and deterministic; unknown/empty customization fields silently fall back to preset defaults rather than throwing.
- [Phase 08-interview-customization]: `/api/interview/persona/distill` (08-03) defines `MAX_PERSONA_LENGTH = 600` locally rather than importing it from `lib/interview/customization.ts`, keeping the route independent of plan 08-01; the pasted profile text is truncated to 4000 chars before the model call, never persisted, and never logged (only lengths and error class are logged).
- [Phase 08-interview-customization]: Both prompt-assembly call sites (session/start, interaction/chat) now resolve customization through resolveInterviewType instead of raw getInterviewType; evaluation-runner grades against report.roleTitle/industry/difficulty first, falling back through the preset then DEFAULT_INTERVIEW_TYPE so pre-Phase-8 rows evaluate unchanged.
- [Phase 08-interview-customization]: CustomizePanel suppresses onChange until the panel has been opened at least once for the active preset (an openedOnce flag reset whenever the selected preset changes), so the picker page never writes a sessionStorage customization the student never asked for.
- [Phase 08-interview-customization]: ReportCustomizationStrip never renders `interviewerPersona`'s value, only a neutral "Custom interviewer persona" presence chip, and collapses to one quiet line when every customization column is null (legacy pre-Phase-8 rows) instead of five empty-looking chips.
- [Phase 08-interview-customization]: advanceProgress derives resumeQuestionCap and behavioralCategoryQuota from targetQuestionCount (Math.round(n/3), clamped), verified bit-for-bit identical to the pre-change function for the 9-question standard length.
- [Phase 08-interview-customization]: A pasted interviewer persona carries its own display name via a new display-only `personaDisplayName` field, never interpolated into the assembled prompt; the in-character naming directive that makes the model actually introduce itself as that person lives inside the persona string itself, not a new `lib/interview/prompts.ts` field — found and fixed during 08-08's human walkthrough (commit `a0cc711`) after the session header was shown to display the avatar's name instead of the pasted persona's name.
- [Phase 08-interview-customization]: Non-overlapping `files_modified` between concurrently-executing plans in the same wave does not by itself isolate them from each other — the git index is shared across agents in the same working directory (no worktree isolation), so a bracketed pathspec like `app/interview/[type]/...` can glob-match a sibling agent's staged file. Surfaced in wave 3 (08-06/08-07), independently re-verified clean in 08-08; noted for any future phase running concurrent agents.

## Progress

- 06-01 (InterviewReport model + migration): complete. Commit `c198b17`.
- 06-02 (evaluation module — `lib/interview/evaluation.ts`): complete, wave 1.
  Committed as part of `c198b17` (concurrent-agent git index race with 06-01
  in the same wave — see `06-02-SUMMARY.md` for details; content verified
  byte-identical, nothing lost).
- 06-03 (session start/checkpoint endpoints — `app/api/interview/session/{start,checkpoint}/route.ts`):
  complete, wave 2. Commits `329cf77`, `e0f96a2`. Verified end-to-end against
  the local dev DB with real login cookies (two temporary test users, deleted
  after); non-owner checkpoint confirmed 404, non-IN_PROGRESS confirmed 409.
- 06-04 (evaluation runner + finish/retry endpoints — `lib/interview/evaluation-runner.ts`,
  `app/api/interview/session/finish/route.ts`, `app/api/interview/report/[reportId]/retry/route.ts`):
  complete, wave 2. Commits `55c2749`, `ab17c62`, `a8a4947`. Verified end-to-end
  against the local dev DB with real login cookies and real OpenAI calls (two
  temporary test users, deleted after): finish returned 202 in well under a
  second and the background job resolved the row to READY with content/
  behavioral scores and null visual/vocal within ~13s; non-owner finish/retry
  confirmed 404; re-finishing a READY report confirmed 409; retry on a FAILED
  report with no transcript confirmed 409; retry on a FAILED report with a
  transcript re-ran under the same reportId and resolved to READY; retry on a
  READY report confirmed 409.
- 06-05 (report DTO + owner-scoped GET — `lib/interview/report-dto.ts`,
  `app/api/interview/report/[reportId]/route.ts`): complete, wave 2.
  Commits `dbdbc06`, `d2ec0ec`. Verified end-to-end against the local dev DB
  with two real logged-in test users (created and deleted): owner GET returned
  200 with the full DTO (real content/behavioral scores, null visual/vocal,
  markdown body); non-owner GET, nonexistent-id GET, and malformed-id GET all
  returned the exact same 404 `{"error":"Report not found"}`.
- 06-06 (wire live session to persistence + report navigation —
  `components/interview/InterviewSessionShell.tsx`, `app/interview/[type]/page.tsx`):
  complete, wave 3. Commits `0ff813d`, `c8bc1e5`, `9f5f113`. The report row is
  now created on the first real assistant turn via `ensureReport()`
  (never from an exit path); every subsequent assistant turn fires a
  fire-and-forget checkpoint POST; End and Leave are behind a shared confirm
  modal with distinct copy, End warns under 3 answered questions without
  blocking, and a successful End navigates to
  `/interview/{slug}/report/{reportId}`. Verified with `npx tsc --noEmit`
  clean and `npm run dev` (inline local `DATABASE_URL`) serving
  `/interview/general` without a compile error. Full live-avatar/S3/DB
  end-to-end verification deferred to the Step 3 validation checklist owned
  by later plans in this phase.
- 06-07 (report page — `components/interview/ReportMarkdown.tsx`,
  `components/interview/ReportScoreCards.tsx`,
  `app/interview/[type]/report/[reportId]/page.tsx`): complete, wave 3.
  Commits `b62f261`, `bfa4aeb`. Verified end-to-end against the local dev DB
  with a real logged-in test user (created and deleted) and a real OpenAI
  evaluation run: session start → finish → the report resolved to READY
  with `content: 4`, `behavioral: 4`, `visual: null`, `vocal: null`, and the
  page's four card titles matched the live evaluator markdown's own Category
  Breakdown table headings byte-for-byte; a nonexistent report id under a
  real cookie produced a single (non-looping) API call and the 404 shell.
  The FAILED/retry UI path was code-reviewed against 06-04's already
  end-to-end-verified retry contract rather than exercised with a forced
  LLM failure.
- 06-08 (static sweep + real end-to-end validation): complete, wave 4.
  Commits `ac212c7`, `0a60904`, `44793da` (three pre-existing Phase 5 bugfixes
  surfaced by the live run; no changes to the Phase 6 evaluation/report core
  itself were needed). Task 1 static sweep: tsc clean (6 pre-existing stale
  `.next/types/validator.ts` errors unrelated to this branch), prisma validate
  clean, all constraint greps zero matches, `lib/interview/prompts.ts` diff
  empty. eslint confirmed pre-existing repo-wide broken (verified against
  untouched `lib/languages.ts`); tsc used as authoritative. Env-safety grep on
  `.env`/`.env.local` blocked by the permission system itself (not worked
  around); corroborated instead via git history that neither file was
  touched. Migration SQL captured with handoff note: not applied to the
  shared database, `npm run setup` is the intended handoff path. Task 2: all
  11 end-to-end checklist steps human-verified PASS against a real LiveAvatar
  session with a real PDF resume on the local dev DB — real report row
  lifecycle, S3 checkpointing observed mid-interview (transitively, via the
  evaluator quoting real answers), End/Leave modals, READY report with
  correct null Visual/Vocal and scored Content/Behavioral, owner-only 404
  against a second real seeded student, no resume/S3 leakage on the report
  page, and a forced FAILED evaluation that retried once, persisted a
  readable failure reason, kept the transcript, and retried to READY under
  the same reportId with no duplicate row. Full details, verbatim per-step
  results, and deferred (not fixed) open items in `06-08-SUMMARY.md`.
- 07-01 (interaction type registry — `lib/interactions/types.ts`,
  `lib/interactions/index.ts`): complete, wave 1. Commits `588a809`,
  `4231261`. Five interaction types registered (interviews and case-studies
  live, pitches/difficult-conversations/networking coming-soon), zero imports
  from `lib/interview`, `listInteractionTypes()` returns live-first,
  `getInteractionType(slug)` mirrors the `lib/interview/types.ts` lookup
  pattern. `npx tsc --noEmit` clean. No UI in this plan.
- 07-02 (S3 CaseStudy publish flag — `types/index.ts`,
  `app/api/case/list/route.ts`, `app/case-management/[caseId]/page.tsx`):
  complete, wave 1. Commits `8b67991`, `71e1cb6`. Added optional
  `published?: boolean` to `CaseStudy`; `GET /api/case/list?publishedOnly=true`
  filters strictly on `published === true` while the unfiltered default is
  unchanged; the case editor gained a Published `Switch` wired into both the
  `caseStorage.add` and `caseStorage.update` save branches. `npx tsc --noEmit`
  clean; `lib/case-storage.ts`, `lib/s3-client.ts`, and
  `app/api/case/edit/route.ts` confirmed untouched via `git diff --name-only`;
  no Prisma file touched. Manual authenticated-session toggle of the switch in
  a running dev server was not separately re-verified this run (a pre-existing
  user-owned `npm run dev` session was already occupying port 3000); relied on
  `tsc --noEmit` plus targeted greps instead, given the change is additive
  state/props with no new logic branches.
- 07-03 (owner-scoped reports list endpoint + `/reports` page —
  `app/api/interview/reports/route.ts`, `app/reports/page.tsx`): complete,
  wave 1. Commits `20941bd`, `11abb80`. `GET /api/interview/reports` filters
  `status: { not: "IN_PROGRESS" }` in the Prisma `where` clause and maps rows
  through `toInterviewReportDTO` verbatim; verified end-to-end against the
  local dev DB with a real logged-in student (`alice.johnson@case.edu`) whose
  fixture data included 2 `IN_PROGRESS` and 2 `READY` rows — the endpoint
  returned exactly the 2 `READY` rows, newest-first. `/reports` renders
  loading/empty/list states and every row (including `FAILED`) links to
  `/interview/{typeSlug}/report/{id}`. `npx tsc --noEmit` clean. Confirmed
  (not introduced) that unauthenticated hits redirect `307` to `/login`
  rather than 401 — matches the pre-existing sibling route, already a
  deferred item from 06-08.
- 07-04 (interaction dashboard — `components/interactions/InteractionTile.tsx`,
  `components/interactions/InteractionDashboard.tsx`, `app/page.tsx`): complete,
  wave 2. Commits `df7e88e`, `6f194b0`, `e45aaa5`. `InteractionTile` renders
  live (clickable, `router.push`) and coming-soon (non-interactive `<div>`,
  no click handler/href/role) variants; `InteractionDashboard` renders all
  five `listInteractionTypes()` records live-first in a responsive grid,
  importing nothing from `lib/interview` or `case-play`. `app/page.tsx`'s
  student branch now returns `<InteractionDashboard />` directly; the old
  `router.replace("/student-cases")` effect is deleted. `npx tsc --noEmit`
  clean; confirmed via real login against the local dev DB that
  `GET /api/auth/me` returns the lowercase `role: "student"` / `role: "admin"`
  strings the new branch checks. Full manual click-through (five tiles,
  clicking Practice Interviews, clicking a coming-soon tile) was deferred —
  a pre-existing dev server on port 3000 had a live browser session actively
  editing a case; restarting it to pick up code changes let that session
  reconnect and continue working, but no further manual interaction was
  performed to avoid disrupting it. Same limitation class already logged in
  `07-02-SUMMARY.md`.
- 07-05 (published-case index — `app/case-play/page.tsx`): complete, wave 2.
  Commit `f05b11e`. New client component (no bare `/case-play` route existed
  before this plan) fetches `GET /api/case/list?publishedOnly=true` on mount
  and renders results via the existing `CaseCard` in the same grid classes as
  `app/case-management/page.tsx`; clicking a card navigates to
  `/case-play/{caseId}` with no `cohortId` query param. `npx tsc --noEmit`
  clean; zero matches on `cohort|student/cases|listCohorts|cohortIds` in the
  new file. Verified end-to-end against the local dev DB with real seeded
  users (`student@case.edu`, `admin@example.com`): with the one existing S3
  case (`adam-testing`) unpublished, the index correctly returned `[]`;
  admin toggled it to `published: true` via `POST /api/case/edit` (confirmed
  admin-only — student got "Access denied: admin only"); the student's index
  then returned exactly that one case, and `GET /case-play/adam-testing`
  returned 200 with no `cohortId` in the URL; reverted to `published: false`
  and confirmed the index returned `[]` again while the same direct URL and
  `/api/case/get?id=adam-testing` still returned 200/success for the student
  — the staff draft-preview mechanism is untouched. `app/api/case/get/route.ts`
  and `app/case-play/[caseId]/page.tsx` confirmed unmodified via
  `git status --short`; no Prisma file touched.
- 07-06 (retire `/student-cases` — `app/settings/page.tsx`, `app/settings/layout.tsx`,
  `config/site.ts`, `middleware.ts`, and link repoints in `app/login/page.tsx`,
  `app/join/[accessCode]/page.tsx`, `app/interview/[type]/page.tsx`,
  `app/interview/[type]/report/[reportId]/page.tsx`,
  `app/case-play/[caseId]/page.tsx`): complete, wave 3. Commits `47770bd`,
  `79e9a26`, `c454362`, `893e590`. Moved settings to a top-level `/settings`
  (`git mv`, no import rewrites needed) with a new layout reproducing the
  deleted `student-cases` padding wrapper; deleted `app/student-cases/`
  outright. Student sidebar rebuilt to Practice (`/`) / My Reports
  (`/reports`) / Settings (`/settings`); `STUDENT_ROUTES` in `middleware.ts`
  drops `/student-cases` and gains `/reports` and `/settings`. A fresh
  repo-wide grep (not the plan's stale 13-site estimate) found and repointed
  exactly 10 `/student-cases` occurrences across 5 files; a final grep for
  `student-cases` in `app/`, `components/`, `lib/`, `config/`,
  `middleware.ts` returns nothing. `npx tsc --noEmit` clean (`rm -rf .next`
  run first to clear stale `validator.ts` errors from the route deletion, as
  the plan anticipated). `app/page.tsx` diff confirmed empty (07-04 owns it);
  `app/api/student/cases/route.ts` confirmed untouched (Phase 11's job). See
  `07-06-SUMMARY.md` for the deferred logged-out join-by-code consequence.
- 07-07 (static sweep + human validation): complete, wave 4. Commit `f3dddf0`
  (Task 1's static sweep found zero defects — nothing to fix, nothing to
  commit for that task). Task 1: all 19 static checks recorded clean against
  a correctly-derived baseline (`44793da`, the commit before 07-01, not
  `main`) — zero prisma diff/commits/migration folders since the baseline,
  zero `student-cases` references, registry exactly 5 types/2 live, no
  `lib/interview` imports (only doc-comment mentions), `InteractionTile`'s
  interactive behavior confined to its live branch, no `prisma.case`/
  `isPublished` wiring to the wrong Case table, `app/api/case/get/route.ts`
  and `lib/interview/prompts.ts` both diff-empty against the baseline,
  `toInterviewReportDTO` reused with the `IN_PROGRESS` filter inside the
  Prisma `where`. ESLint's repo-wide breakage reconfirmed pre-existing
  against untouched `lib/languages.ts`; `tsc --noEmit` authoritative and
  clean. Task 2: human walkthrough approved all 15 steps end to end
  (dashboard landing, unassigned interview start and wizard-back, inert
  coming-soon tiles, admin-publish-then-student-sees-exactly-that-case,
  direct-URL draft preview of an unpublished case, three-item sidebar,
  `/reports` newest-first with IN_PROGRESS excluded, `/settings` padding,
  admin `/` unchanged, `/student-cases` 404, and cross-user report isolation
  between `alice.johnson@case.edu` and `bob.williams@case.edu`). One real bug
  found during step 11 and fixed inline: the report page's only back control
  disagreed with its own label (bottom button said "Back to practice" but
  navigated to `/reports`); fixed by adding a top "Back to my reports" link
  and repointing the bottom button at `/`. Full verbatim per-check and
  per-step results in `07-07-SUMMARY.md`.

- 08-01 (interview customization data layer — `lib/interview/types.ts`,
  `lib/interview/customization-options.ts`, `lib/interview/customization.ts`):
  complete, wave 1. Commits `ab371a5`, `a2d3c2e`, `4d764ab`. Registered
  `TECHNICAL_INTERVIEW`, `CONSULTING_INTERVIEW`, `EARLY_CAREER_INTERVIEW`
  presets alongside the byte-unchanged `GENERAL_INTERVIEW` (only addition:
  a display-only `questionAreas` field), `general` listed first; built four
  closed curated option lists (industries, roles, session lengths,
  personality dials); built `resolveInterviewType`, a pure validating
  resolver that merges customization onto a preset, silently falling back to
  the preset default on any unknown/empty/malicious field. `npx tsc --noEmit`
  clean on all three files; `listInterviewTypes()` verified to return exactly
  4 records general-first; five resolver assertions (identity with no
  customization, full fallback on garbage input, length-preset lookup,
  determinism across two calls, dial-ignored-when-persona-pasted) all passed
  via a one-off `tsx` script. `lib/interview/prompts.ts` diff confirmed empty.

- 08-02 (InterviewReport customization columns + DTO —
  `prisma/schema.prisma`, `lib/interview/report-dto.ts`): complete, wave 1.
  Commits `e524439`, `23acfa2`. Added six nullable columns (`industry`,
  `roleTitle`, `difficulty`, `targetMinutes`, `targetQuestionCount`,
  `interviewerPersona`) to `InterviewReport` via migration
  `20260921141342_add_interview_customization`, applied to the local dev DB
  only (inline `DATABASE_URL`, `npm run setup` never run); migration SQL
  committed as the handoff artifact for the shared database, exactly as
  06-01. `InterviewReportDTO` gained a nested `customization` block mapped
  field by field in `toInterviewReportDTO`; no row spread, no private-column
  leak, pre-Phase-8 rows map cleanly with all six fields null. `npx tsc
  --noEmit` clean; `git diff --stat prisma/` and each commit's file list
  confirmed no file outside `prisma/` and `lib/interview/report-dto.ts` was
  touched.

- 08-03 (persona distillation endpoint — `app/api/interview/persona/distill/route.ts`):
  complete, wave 1. Commit `d779d6b`. New authenticated `POST` route, auth/response
  scaffolding copied from `upload-resume`, that takes a pasted `{profileText}` (never
  a URL), truncates it to 4000 chars, makes one non-streaming OpenAI call (same wiring
  as `attemptEvaluation`), and returns `{persona}` hard-capped to 600 chars. Nothing is
  persisted or logged beyond `{userId, inputLength, outputLength}`. Verified end-to-end
  against the local dev DB with the existing seeded user `alice.johnson@case.edu` (no
  temp user created) and real OpenAI calls: 200 with a 498-char persona for a ~200-word
  fictional bio, the assembled "playing the role of: ..." sentence read grammatically,
  a 5,000-char input truncated and still succeeded, and a blank `profileText` returned
  400. Unauthenticated `POST` confirmed to hit middleware's pre-existing 307
  redirect-to-login (never reaching the model), matching the 06-08-logged sibling-route
  behavior. `npx tsc --noEmit` clean; only file touched.

- 08-04 (server-side customization resolution + evaluator fix —
  `app/api/interview/session/start/route.ts`, `app/api/interaction/chat/route.ts`,
  `lib/interview/evaluation-runner.ts`): complete, wave 2. Commits `68134b1`,
  `d0b0d3b`, `ceaea94`. Both prompt-assembly call sites now go through
  `resolveInterviewType` instead of raw `getInterviewType`; session start persists
  a six-field resolved snapshot via `resolveCustomizationRecord`; the chat route
  re-derives the same validated type every turn with no `reportId`/Prisma lookup
  added; the evaluator's `roleContext` now reads `report.roleTitle`/`industry`/
  `difficulty` first, falling back through the preset then `DEFAULT_INTERVIEW_TYPE`.
  `npx tsc --noEmit` clean; zero `getInterviewType` matches under `app/api/`;
  `lib/interview/prompts.ts`/`evaluation.ts` diff-empty. Verified: a throwaway
  determinism/injection script proved the assembled prompt is byte-identical
  across two calls with the same customization and that a hostile industry/
  difficulty string never reaches the prompt (falls back to `general /
  cross-industry` / `Intermediate`, no `DROP TABLE`); a throwaway script against
  the local dev DB with the real seeded `student@case.edu` confirmed an
  uncustomized session-start row persists the preset's own defaults (not nulls)
  and a customized one persists `industry: "technology"`, `difficulty:
  "Advanced"`, `targetMinutes: 10`, `targetQuestionCount: 5`; a real existing
  READY report's transcript was used to force a FAILED→retry cycle with
  distinctive `industry`/`roleTitle`/`difficulty` set on the row, confirming
  `runAndPersistEvaluation` reads the row's columns without error, then the row
  was restored exactly. A fresh HTTP dev server on a second port could not be
  started (Next.js blocked it — an existing dev server was already running on
  port 3000, left untouched to avoid disrupting a possibly-active session), so
  the library functions were exercised directly instead of through curl; see
  `08-04-SUMMARY.md` for full detail.

- 08-05 (preset picker index + Customize panel — `app/interview/page.tsx`,
  `components/interview/PresetCard.tsx`, `components/interview/CustomizePanel.tsx`,
  `lib/interactions/index.ts`): complete, wave 2. Commits `95a6387`, `a74eab2`,
  `a1c8034`, `02932ea`. New static picker page lists all four
  `listInterviewTypes()` presets (general first) with difficulty/length/
  question-area chips; the dashboard tile's route changed from
  `/interview/general` to `/interview` with zero new `lib/interview` imports.
  `CustomizePanel` is collapsed by default (a read-only summary line), opens
  into five dropdown-only controls pre-filled from the active preset and
  reset whenever the preset changes; `onChange` is suppressed until the
  panel has actually been opened, so the fast path never writes an
  unrequested customization. A pasted-profile "Build persona" button calls
  `/api/interview/persona/distill` once and visibly disables the
  personality dial while a distilled persona is present, with required
  rehearsal-simulation framing copy and no URL field. Start writes the
  resolved `InterviewCustomizationInput` to `sessionStorage` under
  `interview:customization:{slug}` inside a try/catch (never on the URL),
  then navigates with a clean slug, for 08-06 to read once and remove.
  `npx tsc --noEmit` clean; every plan-specified grep passed (no
  `lib/interview` import in `lib/interactions/`, exactly one changed line in
  that file, no `localStorage`/URL input in `CustomizePanel.tsx`, no
  `cohort`/`assignment` reference, sessionStorage write inside a try/catch
  immediately before `router.push`). A pre-existing `next dev` server on
  port 3000 blocked a second instance on any port (Next.js's own
  directory-level lock, not a port conflict) — left untouched per the
  established policy; manual click-through deferred, relying on
  `tsc --noEmit` plus the plan's own greps instead, matching the limitation
  class already logged in `07-02-SUMMARY.md`/`07-04-SUMMARY.md`.

- 08-06 (wire customization into the wizard and live session —
  `app/interview/[type]/page.tsx`, `components/interview/InterviewSessionShell.tsx`):
  complete, wave 3. Commits `0529271`, `9b271b9`. The wizard now reads the picker's
  `sessionStorage:interview:customization:{slug}` handoff exactly once on mount
  (ref-guarded against strict-mode's double-invoke), clears it immediately, and
  resolves via `resolveInterviewType` in place of `getInterviewType`; a refresh
  degrades cleanly to preset defaults. `InterviewSessionShell` gained a
  `customization` prop resent unchanged in the `session/start` and every
  `/api/interaction/chat` body, never on `checkpoint`/`finish`. `advanceProgress()`
  now derives its resume/behavioral stage thresholds from `targetQuestionCount`
  instead of a hardcoded literal `3`, with the 9-question `standard` case proven
  bit-for-bit identical to the pre-change function via a throwaway side-by-side
  comparison script. `npx tsc --noEmit` clean; all plan-specified greps passed
  (no `getInterviewType`, unchanged `SetupStep` union, `customization` in exactly
  the two intended request bodies, zero remaining `>= 3` literals). Verified
  end-to-end against the local dev DB with a real temporary test user (created and
  deleted): logged in, confirmed the wizard route degrades without a server error
  for a known/customized/unknown slug, and a real `POST /api/interview/session/start`
  call with the shell's exact `customization` shape against the `technical` preset
  persisted the resolved "quick" length (`targetMinutes: 10`, `targetQuestionCount: 5`).
  A `git add` on the bracketed `[type]` path was briefly misinterpreted by git's
  pathspec glob matching and picked up unrelated concurrent 08-07 work; caught via
  `git show --stat`, undone non-destructively (`git reset HEAD~1`, nothing
  discarded), and redone with a literal pathspec — both final commits confirmed via
  `git show --name-only` to touch exactly one file each. Full interactive browser
  click-through (Customize panel → Start → live three-turn Network-tab byte
  comparison) deferred — same hardware/browser-session limitation class already
  logged in `07-02-SUMMARY.md`/`08-05-SUMMARY.md`.

- 08-07 (report customization display — `components/interview/ReportCustomizationStrip.tsx`,
  `app/interview/[type]/report/[reportId]/page.tsx`): complete, wave 3. Commits `b286154`,
  `df22daa`. New component renders Preset/Industry/Role/Difficulty/Length as chips matching
  the report page's existing palette, wired between the `ReportShell` header and
  `ReportScoreCards`, shown only in the READY/FAILED branches. `interviewerPersona` is never
  rendered as text, only a neutral "Custom interviewer persona" presence chip; an all-null
  customization block (every pre-Phase-8 row) collapses to one quiet line. `npx tsc --noEmit`
  clean; zero `resumeText`/`transcriptKey` matches; `git diff --name-only` across both commits
  touches exactly the two files in `files_modified`. Verified via `renderToStaticMarkup`
  against three inputs (all-null, fully populated with a distinct persona string confirmed
  absent from the output, and a since-removed preset slug falling back to the raw slug) plus
  a real `GET /api/interview/report/{id}` fetch against an existing legacy READY row on the
  local dev DB with a real logged-in seeded user (`alice.johnson@case.edu`), confirming the
  DTO's `customization` block really is all-null for that row. A full two-report browser
  comparison was not completed — the only reachable `next dev` server was occupied by the
  concurrently-running 08-06 execution and a second instance is blocked by Next's own
  directory lock. A git race with the concurrent 08-06 executor (same working directory, no
  worktree isolation) briefly absorbed this plan's uncommitted work into a transient 08-06
  commit that was then reset back out; content verified byte-identical, nothing lost, and
  re-committed cleanly under this plan's own two commits. See `08-07-SUMMARY.md` for full
  detail.

- 08-08 (static sweep + real end-to-end human validation): complete, wave 4. No commit
  for Task 1 (all 17 static checks passed clean on first run, nothing to fix). Task 2
  (human walkthrough) approved after one real defect was found and fixed under the
  checkpoint, commit `a0cc711`: the pasted interviewer persona was wired as flavour text
  rather than an identity — the session header showed the AVATAR's name even when the
  persona named a real person, and nothing in the prompt told the interviewer to
  introduce itself by name, contradicting REQ-22's "plays the named person directly."
  Fixed by having the distillation endpoint return structured `{ persona, displayName }`
  via JSON mode, adding a display-only `personaDisplayName` field to
  `InterviewCustomizationInput` (documented as never interpolated into the prompt), and
  having the wizard header prefer that name over the avatar's; the in-character naming
  directive is carried inside the persona string itself so `lib/interview/prompts.ts`
  stays diff-empty against the Phase 8 baseline — re-verified independently after the fix,
  not taken on trust. Baseline resolved to `e27bb8f` (commit before 08-01's first commit
  `ab371a5`), not `main`. All 17 static checks recorded verbatim: tsc clean/authoritative
  (eslint reconfirmed pre-existing broken against untouched `lib/languages.ts`); prisma
  valid; exactly one migration directory, zero `NOT NULL` columns; no shared-DB writes or
  `npm run setup`; `lib/interview/prompts.ts` diff-empty; `GENERAL_INTERVIEW` unchanged
  except the added `questionAreas` field; zero `getInterviewType` in `app/api/`; zero
  `lib/interview` imports in `lib/interactions/`; that file's diff is one line; zero
  cohort/assignment/isStaff/instructor references in interview surfaces; zero server-side
  URL fetching of student input and the one `linkedin` match is a doc comment explaining
  what was deliberately not built; `profileText` never persisted/logged; zero hardcoded
  `>= 3` stage thresholds; prompt assembly proven byte-identical across two calls for all
  four presets and resistant to a hostile customization payload (`DROP TABLE`, prompt-
  injection strings, `Godmode` difficulty) which never reached the assembled prompt;
  `listInterviewTypes()` returns exactly 4 records, general first. All 14 walkthrough
  steps human-confirmed PASS against a real LiveAvatar session on the local dev DB with a
  real pasted persona and a real report, including the fast path, Customize panel reset
  on preset switch, dropdown-only industry/role, persona-build disabling the personality
  dial, per-turn `customization` byte-identical across three chat requests, a READY report
  with a correct customization strip and no persona text leak, a legacy pre-Phase-8 report
  showing the quiet no-customization line, and an uncustomized regression run behaving
  exactly as before Phase 8. Independently re-verified (not trusted from the orchestrator's
  own claim): the wave-3 one-file-per-commit isolation, and the checkpoint fix's exact
  4-file scope. Full verbatim per-check and per-step results, and the consolidated
  deferred-items list, in `08-08-SUMMARY.md`.

## Phase 6 Status: COMPLETE

All 8 plans (06-01 through 06-08) executed and verified, including a real
end-to-end LiveAvatar validation run. See `06-08-SUMMARY.md` for the deferred
open items list (middleware 307-vs-401 on unauthenticated API calls,
silent-fail `ensureReport()` start call, 500-instead-of-401 on a stale JWT
naming a missing user, repo-wide broken eslint config, stray sibling
`package-lock.json`, suggested `dev:local` npm script) — none block Phase 6
sign-off; each is either genuinely pre-existing/out-of-scope or a candidate
for a future gap-closure plan.

## Phase 7 Status: COMPLETE

All 7 plans (07-01 through 07-07) executed and verified, including a real
static constraint sweep and a human-confirmed end-to-end walkthrough of the
full student path. See `07-07-SUMMARY.md` for the deferred open items list
(logged-out join-by-code no longer completes — Phase 11 owns removal;
`/api/case/list` stays enumerable by design; per-case avatar-minutes limits
dropped on the student path; pre-existing repo-wide broken eslint config;
pre-existing `/about` build breakage) — none block Phase 7 sign-off.

## Phase 8 Status: COMPLETE

All 8 plans (08-01 through 08-08) executed and verified, including a real
static constraint sweep and a human-confirmed end-to-end walkthrough of the
full customized student path with a real LiveAvatar session and a real pasted
interviewer persona. REQ-17 through REQ-24 all satisfied and ticked in
`REQUIREMENTS.md`. One real defect was found during the human walkthrough and
fixed under the checkpoint (commit `a0cc711`): the pasted persona showed the
avatar's name instead of the named person's and never told the interviewer to
introduce itself by name — fixed by adding a display-only `personaDisplayName`
field that never reaches the assembled prompt, keeping `lib/interview/prompts.ts`
diff-empty against the Phase 8 baseline throughout. See `08-08-SUMMARY.md` for
the full verbatim per-check/per-step results and the consolidated deferred
items list (pre-existing eslint/`/about` breakage, the six uncommitted
CaseBridge-rename files, the wave-3 bracketed-pathspec git-index hazard as a
process finding for future concurrent-agent phases, and the open question of
whether the persona should be reinforced further inside `prompts.ts` itself —
flagged for the user, not resolved here) — none block Phase 8 sign-off.

## Next

Phase 9 context captured in
`.planning/phases/09-student-authored-scenarios/09-CONTEXT.md` (commit `e739a2e`).
Run `/gsd:plan-phase 9`.

Key Phase 9 decisions:
- A "scenario" is a CASE-STYLE ROLEPLAY (situation + one or more avatar
  characters), explicitly NOT a saved interview preset. Lives alongside admin
  cases in `/case-play`, shown as a separate section.
- Avatar picker must mirror `/interview/[type]`'s card grid with preview images,
  NOT the admin form's `<Select>` dropdown. Verbatim user instruction.
- Guided step-by-step builder; situation + >=1 character + criteria required to
  save; save then launch from the list (criterion 1's "immediately" preserved by
  landing on a list where the new scenario is instantly startable).
- Author writes criteria ON TOP OF a standard behind-the-scenes prompt covering
  EQ and conversational adequacy, structurally similar to the interview prompt.
- Private by default, publishable to all students (reusing Phase 7's `published`
  discovery pattern). Nothing built for staff, but the model must not preclude
  it. Forking allowed by the model, not necessarily built.
- Reports SNAPSHOT the scenario at run time (Phase 8 precedent) and survive
  scenario deletion; a published scenario must be unpublished before deleting.

Two things the planner must handle:
- **Phase 9 has no REQ IDs.** REQUIREMENTS.md ends at REQ-24. Generate REQ-25
  onward or the plan-checker has nothing to verify against — same gap Phase 8 hit.
- **Real ownership does not exist for cases.** `CaseStudy.createdBy` is a display
  string, `cohortIds` is the obsolete scoping, and `app/api/case/add|edit|delete`
  contain NO auth code at all — they are admin-gated only by `middleware.ts:153-155`.
  Student authoring requires genuine server-side owner enforcement in the routes.

Known dependency: Visual/Vocal stay "Not yet measured" until Phase 10. No Phase 9
plan may promise real visual or sound-oriented scoring.

Open from Phase 8 (unchanged):
- Whether to reinforce the interviewer persona inside `lib/interview/prompts.ts`
  itself, which would mean relaxing that file's diff-empty constraint. User's call.
- Six uncommitted "CaseBridge -> Leadership Avatar" rename files still in the
  working tree.
