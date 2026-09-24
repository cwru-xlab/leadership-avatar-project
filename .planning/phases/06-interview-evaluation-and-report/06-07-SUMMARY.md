---
phase: 06-interview-evaluation-and-report
plan: 07
subsystem: ui
tags: [react, nextjs, react-markdown, remark-gfm, heroui, interview, polling]

# Dependency graph
requires:
  - phase: 06-04
    provides: "POST /api/interview/session/finish and POST /api/interview/report/[reportId]/retry (202 {reportId, status}, exact error shapes)"
  - phase: 06-05
    provides: "InterviewReportDTO, toInterviewReportDTO, REPORT_TERMINAL_STATUSES, GET /api/interview/report/[reportId] (owner-scoped, identical 404 for non-owner/nonexistent)"
provides:
  - "components/interview/ReportMarkdown.tsx — react-markdown + remark-gfm renderer, raw HTML disabled, CaseBridge-styled component overrides including a table wrapper for the Category Breakdown"
  - "components/interview/ReportScoreCards.tsx — four fixed-order rubric cards with the evaluator prompt's exact headings; Visual/Vocal unconditionally greyed; no combined score"
  - "app/interview/[type]/report/[reportId]/page.tsx — owner-facing report page: 2s poll while PENDING/IN_PROGRESS, 2-minute give-up with manual recheck, real-layout pending skeleton, FAILED state with working retry, canonical-URL redirect on typeSlug mismatch"
affects: [06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Report page state derives isPending purely from REPORT_TERMINAL_STATUSES-style status checks (PENDING/IN_PROGRESS), never from a separate loading flag, so polling start/stop and the skeleton-vs-content branch can never disagree"
    - "A single ReportShell wrapper renders the header/footer/nav chrome for every state (score cards + body card composition is the same across pending/ready/failed) so the page never reflows when the report transitions"
    - "Score/markdown components hand-map every field and never spread the DTO or Prisma row, continuing the explicit-mapping pattern from 06-05's report-dto.ts"

key-files:
  created:
    - components/interview/ReportMarkdown.tsx
    - components/interview/ReportScoreCards.tsx
    - "app/interview/[type]/report/[reportId]/page.tsx"
  modified: []

key-decisions:
  - "Visual & Environment and Vocal Delivery cards are unconditionally rendered in the greyed 'Not yet measured' treatment regardless of any incoming score value — the component ignores scores.visual/scores.vocal entirely rather than branching on them, so a future non-null value from the API could never accidentally render as a number without a deliberate code change."
  - "The four card titles (Visual & Environment, Vocal Delivery, Content & Structure, Behavioral & Mindset) are copied verbatim from the live evaluator output's own Category Breakdown table, confirmed byte-for-byte against a real end-to-end evaluation run during verification, not just against the prompt source."
  - "Polling and give-up state live entirely in the page component via a Date.now() ref captured on mount (startedAtRef) and two named constants (POLL_MS=2000, POLL_GIVE_UP_MS=120_000), with the interval cleared whenever status leaves PENDING/IN_PROGRESS or timedOut flips true — no separate polling hook or library."
  - "A 401 from the report GET sets a needsLogin flag and renders a 'Please sign in' card with a button to /login, rather than an automatic router.replace — since login could lose the user's place, a manual action was preferred over a silent redirect for this one gate."
  - "The typeSlug-mismatch redirect and the terminal-status poll-stop both key off the same InterviewReportDTO the GET route already returns; no second request or extra endpoint was added for either behavior."

requirements-completed: [REQ-08, REQ-09]

# Metrics
duration: ~45min
completed: 2026-09-20
---

# Phase 6 Plan 7: Student-Facing Interview Report Page Summary

**The owner-only report page at `/interview/[type]/report/[reportId]`: a real-layout pending skeleton that polls every 2s and gives up at 2 minutes, four rubric cards with Visual/Vocal permanently greyed "Not yet measured" and no combined score, and a GFM-table-capable markdown renderer with raw HTML disabled — verified end-to-end against the local dev DB with a real logged-in user and a real OpenAI evaluation run.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-20T (see task commit timestamps)
- **Completed:** 2026-09-20
- **Tasks:** 2 completed
- **Files modified:** 3 (all created)

## Accomplishments

- `ReportMarkdown.tsx`: `react-markdown` with `remarkGfm`, no `rehypePlugins`, explicit CaseBridge-palette component overrides for every element the evaluator's markdown uses, including a bordered/rounded table wrapper for the Category Breakdown table.
- `ReportScoreCards.tsx`: four cards in fixed order with the evaluator's exact rubric headings; Visual & Environment and Vocal Delivery are unconditionally rendered greyed with "Not yet measured" / "Requires video and audio analysis"; Content & Structure and Behavioral & Mindset render `N / 5` with a label map (5 Excellent … 1 Needs work) or "Not scored" when null; a `pending` prop swaps every card's value region for a same-height `animate-pulse` placeholder so the grid never reflows; no combined/overall score anywhere in the file.
- `app/interview/[type]/report/[reportId]/page.tsx`: fetches the report on mount, polls every `POLL_MS` (2000ms) while status is `PENDING`/`IN_PROGRESS`, gives up after `POLL_GIVE_UP_MS` (120,000ms) with a "This is taking longer than expected." state and a manual "Check again" button; renders `ReportMarkdown` on `READY`; renders a `CircleAlert` block with `failureReason`, a transcript-safety reassurance line, and a "Try again" button (POSTs to the retry endpoint, resumes polling on `202`) on `FAILED`; redirects via `router.replace` to the canonical `/interview/{typeSlug}/report/{id}` URL when the address bar's `[type]` segment disagrees with the stored `typeSlug`; footer actions "Back to practice" (`/student-cases`) and "Practice again" (`/interview/[type]`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the markdown + score-card components** - `b62f261` (feat)
2. **Task 2: The report page — polling, skeleton, ready, failed** - `bfa4aeb` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified

- `components/interview/ReportMarkdown.tsx` - `react-markdown` + `remark-gfm` renderer with CaseBridge-styled overrides, raw HTML disabled
- `components/interview/ReportScoreCards.tsx` - four fixed-order rubric score cards, Visual/Vocal unconditionally unmeasured, no combined score
- `app/interview/[type]/report/[reportId]/page.tsx` - owner-facing report page with polling, give-up, skeleton, READY/FAILED rendering, retry, and canonical-URL redirect

## Decisions Made

- Followed the plan's exact card titles, palette hex values, and constant names (`POLL_MS`, `POLL_GIVE_UP_MS`) verbatim.
- Reworded two doc comments (in `ReportMarkdown.tsx` and `ReportScoreCards.tsx`) that initially tripped the plan's own leak/no-raw-HTML/no-overall-score verification greps by containing the literal banned substrings in prose (e.g. "no `rehypeRaw` plugin, no `dangerouslySetInnerHTML`" and "no overall/average score") — same class of false positive 06-05 documented and fixed for its own greps. No behavioral change; the underlying code already satisfied every constraint.
- Used a `needsLogin` state + a "Please sign in to view this report." card with a button to `/login`, rather than an automatic `router.replace("/login")`, per the plan's guidance to avoid guessing a route silently — `/login` was confirmed to exist as a real page route before using it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, verification tooling] Doc comments initially tripped this plan's own leak-detection greps**
- **Found during:** Task 1 verification (`grep -c "rehype-raw\|rehypeRaw\|dangerouslySetInnerHTML"` and `grep -c "average\|overall\|reduce("`)
- **Issue:** Explanatory comments describing what the code deliberately avoids (e.g. "No `rehypeRaw` plugin, no `dangerouslySetInnerHTML`" and "no overall/average score") contained the literal banned substrings, so the plan's own automated verification greps returned nonzero even though no raw-HTML pass-through or combined score existed in the code.
- **Fix:** Reworded both comment blocks to describe the same guarantees without the literal identifiers (e.g. "no plugin enabling raw HTML pass-through," "no single combined score"). No behavioral change.
- **Files modified:** `components/interview/ReportMarkdown.tsx`, `components/interview/ReportScoreCards.tsx`
- **Verification:** Both required greps return `0` after the reword; `npx tsc --noEmit` remained clean throughout.
- **Committed in:** `b62f261` (Task 1) — corrected before the commit, so no separate fix-up commit exists.

### Out-of-scope discovery (documented, not fixed)

**1. [Scope boundary — pre-existing, repo-wide, previously logged by every prior Phase 6 plan] ESLint config is broken repo-wide**
- **Found during:** Task 1 and Task 2 verification (`npx eslint --fix` on this plan's own files)
- **Confirmed:** identical `plugin:@next/next/recommended is invalid: Unexpected top-level property "name"` failure documented in 06-01 through 06-06. Not caused by this plan; `npx tsc --noEmit` treated as authoritative per the plan's own instruction.
- **Fix:** Not applied — cross-cutting, outside this plan's three files, already logged to `deferred-items.md` by prior plans in this phase.

---

**Total deviations:** 1 auto-fixed (comment wording, no behavior change), 1 out-of-scope discovery re-confirmed (not newly found).
**Impact on plan:** None on correctness. All three files satisfy every literal verification command in the plan.

## Issues Encountered

- `npx eslint --fix` could not run on any of this plan's files due to the same pre-existing, repo-wide flat-config break documented by every prior Phase 6 plan. `npx tsc --noEmit` is clean for all three files touched by this plan; the only repo-wide error is the known, pre-existing stale `.next/types/validator.ts` reference to a nonexistent `app/api/student/progress/route.js`, unrelated to this plan.
- Playwright was already available in the repo (`npx playwright --version` → 1.63.0) but its browser binaries were not installed; installing them was correctly out of scope per this plan's "do not install software" constraint, so DOM-level rendering was verified through direct API responses and server request logs (confirmed single fetch on a 404, no polling loop; confirmed the poll loop resolving PENDING → READY against a real evaluation run) rather than a headless-browser screenshot.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The report page is reachable end-to-end from a live session (06-06's `onFinish` navigation) and now renders a real evaluated report.
- Verified live against the local dev DB with a real logged-in test user (created and deleted) and a real OpenAI evaluation call: `session/start` → `session/finish` → background evaluation resolved to `READY` in well under the 2-minute give-up window, with `content: 4`, `behavioral: 4`, `visual: null`, `vocal: null`, and a `reportMarkdown` whose "Category Breakdown" table used the exact four headings this plan's `ReportScoreCards` also uses, confirmed byte-for-byte from the live response.
- A GET on a random nonexistent report id under a real cookie returned the page shell with a single (non-looping) API call and the expected `{"error":"Report not found"}` body, confirming the not-found path never polls forever.
- The `FAILED`/retry path was not exercised with a forced LLM failure in this plan's live verification (would require mocking OpenAI, out of scope for a UI-only plan); the page's retry call was code-reviewed against 06-04's already end-to-end-verified retry contract (`POST /api/interview/report/[reportId]/retry` → `202 {reportId, status:"PENDING"}` on success, `409` variants otherwise) and matches it exactly.
- No blockers identified for 06-08. Local dev DB confirmed at 0 `User` and 0 `InterviewReport` rows after test cleanup.

## Self-Check: PASSED

All three files confirmed present on disk; both task commit hashes (`b62f261`, `bfa4aeb`) confirmed in `git log`.

---
*Phase: 06-interview-evaluation-and-report*
*Completed: 2026-09-20*
