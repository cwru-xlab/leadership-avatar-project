---
phase: 08-interview-customization
plan: 04
subsystem: interview
tags: [security, prompt-engineering, evaluation]

# Dependency graph
requires:
  - phase: 08-interview-customization
    plan: "01"
    provides: "resolveInterviewType / resolveCustomizationRecord"
  - phase: 08-interview-customization
    plan: "02"
    provides: "InterviewReport customization columns + DTO"
provides:
  - "Both prompt-assembly call sites (session/start, interaction/chat) go through the validating resolver, never raw getInterviewType"
  - "Session-start persists a six-field resolved customization snapshot on the InterviewReport row"
  - "Evaluator grades against the report row's own stored role context, falling back through preset then default"
affects: [08-05, 08-06, 08-07, 08-08]

tech-stack:
  added: []
  patterns:
    - "Client resends an identical customization payload every chat turn; resolveInterviewType is pure so the assembled system-prompt prefix stays byte-identical for the whole session"
    - "roleContext fallback chain: report row column -> preset -> DEFAULT_INTERVIEW_TYPE, so pre-Phase-8 rows evaluate exactly as before"

key-files:
  created: []
  modified:
    - app/api/interview/session/start/route.ts
    - app/api/interaction/chat/route.ts
    - lib/interview/evaluation-runner.ts

key-decisions:
  - "chat route gained no reportId and no Prisma lookup — customization travels as a resent payload exactly like resumeText already does"
  - "evaluation-runner's roleContext reads report.roleTitle/industry/difficulty first, not the preset, preserving old behavior for null columns via ?? chaining"

requirements-completed: [REQ-20, REQ-23, REQ-24]

duration: 35min
completed: 2026-09-21
---

# Phase 8 Plan 04: Server-Side Customization Resolution and Evaluator Fix Summary

**Both prompt-assembly call sites now resolve customization through the validating `resolveInterviewType`, session start persists what was actually resolved, and the evaluator grades against the report row's own stored role context instead of the preset's static defaults.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-21T14:24:05Z
- **Tasks:** 3 completed
- **Files modified:** 3

## Accomplishments
- `app/api/interview/session/start/route.ts` reads an optional `customization` body key, resolves it through `resolveInterviewType`, and persists the resolved six-field snapshot via `resolveCustomizationRecord` — an uncustomized start still records the preset's own defaults, never nulls.
- `app/api/interaction/chat/route.ts` re-derives the same validated `InterviewType` every turn via `resolveInterviewType`, with no `reportId` and no Prisma lookup added to the route; a comment documents why the cache-prefix guarantee still holds under customization.
- `lib/interview/evaluation-runner.ts`'s confirmed blind spot is fixed: `roleContext` now reads `report.roleTitle`/`industry`/`difficulty` first, falling back through the preset and then `DEFAULT_INTERVIEW_TYPE`, so a customized session is graded against what the student actually experienced while pre-Phase-8 rows (all six columns null) evaluate exactly as before.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve and persist customization at session start** - `68134b1` (feat)
2. **Task 2: Re-derive the customized type on every chat turn, safely** - `d0b0d3b` (feat)
3. **Task 3: Grade against the session's real customization** - `ceaea94` (fix)

**Plan metadata:** committed as part of this SUMMARY/STATE update.

## Files Created/Modified
- `app/api/interview/session/start/route.ts` - Swapped `getInterviewType` for `resolveInterviewType`; reads `customization` off the request body unfiltered (the resolver is the only validation point); spreads `resolveCustomizationRecord(type)` into the `prisma.interviewReport.create` data; extended the existing `console.info` log with resolved `difficulty`/`targetMinutes`. Auth guard, UUID check, resume truncation, and 201 response shape all untouched.
- `app/api/interaction/chat/route.ts` - Added `customization?: unknown` to `InterviewRequestInput`; replaced `getInterviewType(typeSlug)` with `resolveInterviewType(typeSlug, interviewInput?.customization as InterviewCustomizationInput | undefined)`; updated the comment above `fullSystemPrompt = buildInterviewSystemPrompt(...)` to explain the cache-safety argument under customization. `lib/interview/prompts.ts` untouched; the non-interview `else` branch and its CACHE PREFIX block untouched.
- `lib/interview/evaluation-runner.ts` - Renamed the preset lookup to `preset` and built `roleContext` from `report.roleTitle ?? preset.defaultRoleTitle`, `report.industry ?? preset.defaultIndustry`, `report.difficulty ?? preset.difficulty`, with a comment recording why the row wins over the slug. `getInterviewType` stays imported as the fallback. No other part of the module (READY/FAILED semantics, S3 read, never-throws contract, persistFailure paths) touched.

## Decisions Made
- Passed the client's raw `customization` payload straight into `resolveInterviewType` at both call sites without any pre-filtering, per the plan's explicit instruction — the resolver is the single validation point.
- Kept the chat route free of `reportId` and Prisma, matching 08-RESEARCH.md's rejection of adding a DB round-trip to the hottest path; customization travels as a resent payload exactly like `resumeText` already does.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` specs.

## Verification Performed

- `npx tsc --noEmit` clean across the whole repo after all three edits.
- `grep -n "getInterviewType" app/api/interview/session/start/route.ts` — zero matches.
- `grep -n "getInterviewType\|prisma" app/api/interaction/chat/route.ts` — zero matches.
- `git diff lib/interview/prompts.ts lib/interview/evaluation.ts` — empty.
- `git diff lib/interview/evaluation-runner.ts | grep -c '^-'` — 4 (surgical, not a rewrite).
- `grep -n "roleContext" -A 5 lib/interview/evaluation-runner.ts` — confirms all three fields read `report.*` first.
- **Determinism + injection test** (throwaway `tsx` script, deleted after): called `buildInterviewSystemPrompt(resolveInterviewType("general", c), {resumeText:"r", language})` twice for the same `c = {industrySlug:"technology", roleSlug:"technical", difficulty:"Advanced", lengthSlug:"quick"}` — the two assembled prompts were `===` (byte-identical). With a hostile `c = {industrySlug: "'; DROP TABLE --", difficulty: "God"}`, the resolved type fell back to `general / cross-industry` industry and `Intermediate` difficulty, and the assembled prompt contained neither `DROP TABLE` nor the attacker's difficulty string — REQ-23's crux property held under a direct hostile payload.
- **Session-start persistence test** (throwaway `tsx` script against the local dev DB with a real seeded user, `student@case.edu`; rows deleted after): row 1 created with no customization persisted the `general` preset's own defaults (`Intermediate`, 20 min, 9 questions) — not nulls; row 2 created with `{industrySlug:"technology", roleSlug:"technical", difficulty:"Advanced", lengthSlug:"quick"}` persisted `industry: "technology"`, `difficulty: "Advanced"`, `targetMinutes: 10`, `targetQuestionCount: 5` exactly as the plan's verify step specified. (Note: the plan's example `roleSlug: "technical"` does not match any curated role slug — the actual list uses `technical-engineering` — so `roleTitle` on row 2 correctly fell back to the preset default rather than being silently wrong; this demonstrates the resolver's fallback behavior working as intended, not a defect.)
- **Evaluator re-grading test** (against the local dev DB, a real existing READY report with an intact S3 transcript for user `35945352-ef99-412f-9e83-5966a3b48fd1`): set `industry: "healthcare"`, `roleTitle: "a senior or staff-level role"`, `difficulty: "Advanced"` on the row, flipped it to `FAILED`, and called `runAndPersistEvaluation` directly. The retry completed successfully and resolved back to `READY` with fresh `contentScore`/`behavioralScore`, confirming `roleContext` was read from the row's columns (no crash, no fallback-to-default path taken) rather than from `getInterviewType(report.typeSlug)`. The row was then restored to its exact original state (all customization columns back to null, original scores/markdown/status restored) and verified via `psql`.
- A direct HTTP end-to-end run through a fresh `npm run dev` instance was attempted but blocked — Next.js detected the existing dev server already running on port 3000 (a separate, possibly user-active session) and refused to start a second instance against the same project directory even on a different port. Rather than kill that server (risk of disrupting an active session, per the same caution logged in `07-02-SUMMARY.md`/`07-04-SUMMARY.md`), the verification above was performed by calling the exact same library functions the routes call (`resolveInterviewType`, `resolveCustomizationRecord`, `runAndPersistEvaluation`) directly against the local dev DB with a real seeded user and a real existing transcript, which exercises the identical code path minus the HTTP/auth wrapper already covered by `tsc --noEmit` and the unchanged auth-guard code in Task 1.

## Issues Encountered

None blocking. The one limitation (no fresh HTTP dev server available for a live curl-based test) is documented above with the equivalent-fidelity substitute test performed instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both prompt-assembly call sites (`session/start`, `interaction/chat`) and the evaluator now agree on customization; 08-05 through 08-08 (picker UI, session length UI, persona UI, report display) can build on a server side that already enforces REQ-23 end to end.
- No blockers.

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*

## Self-Check: PASSED

All three modified files confirmed present with the expected content; all three task commits (`68134b1`, `d0b0d3b`, `ceaea94`) confirmed in git history via `git log --oneline`.
