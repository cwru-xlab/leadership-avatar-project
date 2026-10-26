---
phase: 21-adaptive-mastery-path
plan: 19
subsystem: study-plan
tags: [study-plan, path, next-app-router, client-component, next-step, knowledge-checks, coached-sessions]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "selectPathSteps/nextStepFor/PLACEHOLDER_KNOWLEDGE_CHECK_ID (21-14); createPath/readPathForStudyPlan/markStepComplete (21-08); readContributions/computeMastery (21-09/21-05); loadGenerationSources (21-25); generateChecksForCompetency (21-10); readCoachedSession (21-12); the fixed KNOWLEDGE_CHECK destination page (21-22) and COACHED_SESSION destination page (21-24); the existing app/reports/page.tsx surface (07-03/13-13/14)"
provides:
  - "app/api/study-plans/[planId]/path/route.ts — GET the path (200 with {path:null} for a path-less plan, never 404) and POST to generate it (pre-checks availability, closes the PLACEHOLDER_KNOWLEDGE_CHECK_ID hazard, degrades failed check generation to UNAIDED_SESSION, 409 on PathAlreadyExistsError); exports buildPathDTO/PathDTO/PathStepDTO"
  - "components/study-plan/PathPanel.tsx — step list with state, next-step highlight showing the full stored reason, the three fixed link-contract hrefs, a second-line hazard backstop, and a degraded-steps note"
  - "app/reports/page.tsx — additively widened: the path panel inside the existing saved-plan view, its own isolated fetch state, a generate-a-path action"
  - "scripts/verify-path-surface.ts — the REQ-120 regression guard (with a bite-proof), the REQ-122 link-contract/file-existence proof, and the PLACEHOLDER_KNOWLEDGE_CHECK_ID hazard's bite-proof (plant/observe/remove)"
affects: [21-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A route-level step-completion write that a sibling route (21-22's attempt route) deliberately deferred to 'the path route', closed here in the GET handler via markStepComplete, re-checking 21-08's state-dependent validation rule at the transition rather than skipping it"
    - "Deterministic practice-entry derivation for a competency with no single owning interaction type: the first ENGINE_TYPES entry (fixed array order) whose own extraRubricDimensions claims one of the competency's non-shared dimension keys, excluding the four shared keys from the match"
    - "Hazard bite-proof pattern: plant the exact defect a guard exists to catch via a direct library call (bypassing the route under test), observe the detector fire, remove it, confirm clean — applied to PLACEHOLDER_KNOWLEDGE_CHECK_ID"

key-files:
  created:
    - "app/api/study-plans/[planId]/path/route.ts"
    - "components/study-plan/PathPanel.tsx"
    - "scripts/verify-path-surface.ts"
  modified:
    - "app/reports/page.tsx"
    - ".planning/REQUIREMENTS.md"
    - ".planning/phases/21-adaptive-mastery-path/deferred-items.md"
    - ".planning/STATE.md"
    - ".planning/ROADMAP.md"

key-decisions:
  - "The PLACEHOLDER_KNOWLEDGE_CHECK_ID hazard is closed THREE ways, exactly as the hazard log required: (1) the POST route's per-step loop replaces every placeholder with a real KnowledgeCheck.id or degrades the step to UNAIDED_SESSION before createPath is ever called; (2) an explicit assertion right before createPath throws if one somehow survives; (3) PathPanel.tsx's hrefForStep renders no action link for a KNOWLEDGE_CHECK step whose knowledgeCheckId is still the placeholder, as an independent view-layer backstop."
  - "generateChecksForCompetency returns only a created count, not ids, so after each successful generation call the route re-queries the newest KnowledgeCheck row for (studyPlanId, userId, competencyKey) excluding ids already claimed by an earlier step in the same request — avoiding a collision when the KNOWLEDGE_CHECK cycle repeats the same competency across multiple steps."
  - "A KNOWLEDGE_CHECK step's momentOwnerUserIds is built as the requesting user's id repeated once per moment, not looked up from a map — loadGenerationSources only ever assembles ONE user's own sources, so every moment it returns already belongs to that user by construction; this is not a shortcut around 21-07's ownership contract, it is what that contract reduces to for a single-user assembly."
  - "A competency has no single stored owning interaction type (COMPETENCIES' own dimensionKeys deliberately span several types). UNAIDED_SESSION's /practice/{slug} destination is therefore derived, not read from a table: the first ENGINE_TYPES entry (fixed array order) whose extraRubricDimensions claims one of the competency's non-shared dimension keys. Pure, deterministic, database-free."
  - "21-22's attempt route disclosed in its own comment that step-completion for an answered KNOWLEDGE_CHECK belongs to 'the path route' — this plan's GET handler performs that write via markStepComplete on every read (not just at generation time), re-running 21-08's state-dependent validation rule at the actual transition, so an answered check step does not stay PENDING forever and nextStepFor advances past it."
  - "REQ-120 is marked Complete jointly with 21-18 (already landed): REQ-120's text bundles step state/next-step reason (this plan, on /reports) with level/goal progress (21-18, on /mastery) and does not require both halves to live on one page."
  - "REQ-122 is marked Complete: all three step kinds now have working action links, with both generated-page destinations proven to exist on disk (not merely as href substrings) and the pre-existing coached-mode instance limitation (21-24's disclosure) correctly NOT treated as a REQ-122 defect — the link itself reaches a real, startable surface; the surface's own documented gap is tracked against REQ-113/114."

patterns-established:
  - "Pattern: when a sibling route defers a write to 'the path route' in its own disclosed comment, the path route's GET handler is where that deferred write actually lands, re-running the owning module's state-dependent validation at the transition rather than skipping it."

requirements-completed: [REQ-120, REQ-122]

# Metrics
duration: ~50min
completed: 2026-10-21
---

# Phase 21 Plan 19: Path Surface Inside the Study Plan Summary

**The improvement path — its steps, each step's state, the stored reason it was selected, and which one is next — surfaced inside the existing `app/reports/page.tsx` study-plan view (145 insertions, 0 deletions), with a generation route that delegates all source assembly to 21-25, closes the cross-wave `PLACEHOLDER_KNOWLEDGE_CHECK_ID` hazard three independent ways, and a 34-check verifier whose database-gated sections ran for real.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-10-21T05:23:43Z
- **Tasks:** 4
- **Files created:** 3
- **Files modified:** 1 (`app/reports/page.tsx`) plus `.planning/` bookkeeping

## Accomplishments

- `app/api/study-plans/[planId]/path/route.ts`: `GET` returns `{ path: null }` with a 200 for a path-less plan (never 404 — the REQ-120 backward-compatibility case), resolves each `KNOWLEDGE_CHECK` step's format/prompt/attempt-existence and each `COACHED_SESSION` step's DERIVED phase (`readCoachedSession`, no S3 read), returns the STORED `selectionReason` verbatim, and — closing a gap 21-22's own attempt route disclosed in its comments — marks an answered check step COMPLETE on read via `markStepComplete`, since nothing else in the system was performing that write. `POST` loads mastery (`readContributions`/`computeMastery`), delegates ALL source assembly to `loadGenerationSources` (21-25, confirmed by source-grep: no `s3Storage`, no `getInterviewTranscript`, no `prisma.user.find`), pre-checks competency availability via `momentsByCompetency` BEFORE spending a model call, attaches a real `KnowledgeCheck.id` to every `KNOWLEDGE_CHECK` step or degrades it to `UNAIDED_SESSION` (reported in `degradedSteps`), asserts no placeholder survives right before `createPath`, and returns 409 with the existing path's id on `PathAlreadyExistsError` — never regenerating.
- `components/study-plan/PathPanel.tsx`: header (step count + generation date), a next-step block rendering the FULL stored reason untruncated with `aria-current`, every step in position order as an `<ol>` with completed steps retained, no sequential-gating styling anywhere (re-checked by this plan's own verifier's Section 5, a re-run of 21-17's forbidden-term scan), and the three fixed link-contract hrefs (`/study-plans/{planId}/checks/{knowledgeCheckId}`, `/study-plans/{planId}/coached/{stepId}`, `/practice/{practiceSlug}`) — plus a second-line backstop that renders no link at all for a `KNOWLEDGE_CHECK` step still carrying the placeholder.
- `app/reports/page.tsx` widened additively (145 insertions, 0 deletions, confirmed by `git diff --stat`): `PathPanel` renders inside the existing `viewedPlan` section with its own isolated fetch effect (separate `path`/`pathLoading`/`pathError` state from every pre-existing variable), a "Generate a path" action shown only when no path exists, and a 409 response triggers a refetch rather than an error. No existing state variable, flow, or JSX ordering changed.
- `scripts/verify-path-surface.ts`: 34 checks, exit 0, run with `DATABASE_URL` set (DB-gated sections ran for real, not SKIP). Section 1 proves every pre-existing study-plan marker survives, WITH the guard proven to bite on a deliberately removed marker. Section 1b proves the route has no `s3Storage`/`getInterviewTranscript`/`prisma.user.find` and does call `loadGenerationSources`. Section 2 proves no answer-key field reaches `buildPathDTO`'s serialized output, including a real `MULTIPLE_CHOICE` check with a sentinel correct-option string that never appears in the output. Section 3 proves five sentinel `selectionReason`s return verbatim, in position order. Section 4 proves a path-less plan resolves to `{ path: null }`. Section 5 re-runs 21-17's forbidden-identifier scan over the two new files. Section 6 proves the panel's three href shapes AND that both generated destination pages exist ON DISK (not merely as substrings), including the inverted assertion that a deliberately-wrong singular `/check/` page does NOT exist. **Section 7 is the hazard bite-proof**: plants a `PLACEHOLDER_KNOWLEDGE_CHECK_ID` step via a direct `createPath` call (bypassing the route, to prove the detector itself), observes the detector find exactly that one planted step, removes it, confirms clean again, and separately confirms the panel's own backstop renders no `check` artifact for a step still carrying the placeholder.
- Re-ran `verify-path-model.ts`, `verify-next-step.ts`, `verify-levels-goals.ts`, `verify-check-generation.ts`, `verify-coached-mode-isolation.ts`, `verify-report-chrome-coverage.ts`, `verify-report-structure.ts` — all exit 0.
- REQ-120 and REQ-122 marked Complete in `REQUIREMENTS.md`, checkbox and Traceability row both flipped in agreement.

## Task Commits

1. **Task 1: Add the path route — GET the path, POST to generate it** — `622104d` (feat) — `app/api/study-plans/[planId]/path/route.ts`
2. **Task 2: Build the path panel** — `8838e51` (feat) — `components/study-plan/PathPanel.tsx`
3. **Task 3: Add the panel to the existing reports page, additively** — `ef41fa9` (feat) — `app/reports/page.tsx`
4. **Task 4: Regression and surface verifier** — `66b8cc8` (test) — `scripts/verify-path-surface.ts`, plus a small testability amendment to Task 1's route (exporting `buildPathDTO`/`PathDTO`/`PathStepDTO`)

**Plan metadata:** (this commit) — `docs(21-19): complete path surface plan`

All four commits used explicit pathspecs against only this plan's four files, per the concurrency constraint (21-18 ran in the same git index over a disjoint file set: `config/site.ts`, `app/mastery/page.tsx`, `components/mastery/MasteryPanel.tsx`, `app/api/mastery/route.ts` — none of which this plan touched, confirmed by `git diff --name-only` per commit).

## Files Created/Modified

- `app/api/study-plans/[planId]/path/route.ts` (~410 lines) — `GET`, `POST`, exported `buildPathDTO`, `PathDTO`, `PathStepDTO`.
- `components/study-plan/PathPanel.tsx` (~253 lines) — default export `PathPanel`, exported `DegradedStepsNote`, `PathViewDTO`, `PathStepViewDTO`.
- `app/reports/page.tsx` — additive only: +145 lines (imports, 5 new state vars, `fetchPath`/`generatePathForViewedPlan`, a new `useEffect`, and the rendered panel/action block inside the existing `viewedPlan` section).
- `scripts/verify-path-surface.ts` (~470 lines) — 7 sections, 34 checks.
- `.planning/REQUIREMENTS.md` — REQ-120/REQ-122 checkboxes and Traceability rows flipped to Complete.
- `.planning/phases/21-adaptive-mastery-path/deferred-items.md` — recorded the hazard's closure, REQ-122's closure, REQ-120's joint closure with 21-18, and the 21-22 step-completion gap's closure.
- `.planning/STATE.md`, `.planning/ROADMAP.md` — progress and session updated.

## Decisions Made

See `key-decisions` in frontmatter. In short: the placeholder hazard is closed three independent ways (replace-or-degrade, a pre-persist assertion, and a view-layer backstop); check-id attachment re-queries the newest row per competency since `generateChecksForCompetency` returns only a count; a single-user assembly's `momentOwnerUserIds` is just the requesting user's id repeated, not looked up; the `UNAIDED_SESSION` practice-entry slug is derived deterministically from `ENGINE_TYPES` since no competency-to-type table exists; the path route (not the attempt route) is where an answered check step actually gets marked complete, per 21-22's own disclosed deferral; and REQ-120/REQ-122 are both genuinely satisfied now, the former jointly with 21-18.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comments tripped the Task 1 answerKey grep gate**
- **Found during:** Task 1 verification (`grep -c 'answerKey' ... returns 0`)
- **Issue:** Explanatory doc comments used the literal identifier `answerKey` while describing why the field is never read — the same shape of defect 21-06/21-11/21-22's own summaries each disclosed for their own grep gates.
- **Fix:** Reworded to "answer key" / "answer-key column" (no longer a substring match).
- **Files modified:** `app/api/study-plans/[planId]/path/route.ts`
- **Verification:** Re-ran the grep gate — 0 matches — and `npx tsc --noEmit` (clean).
- **Committed in:** `622104d` (fix landed before the task commit).

**2. [Rule 3 - Blocking] `readCoachedSession` is not re-exported from `lib/study-plan/coached/runtime.ts`**
- **Found during:** Task 1 `tsc --noEmit`
- **Issue:** The plan's own context pointed at `runtime.ts`, but `readCoachedSession` is defined and exported in `lib/study-plan/coached/instance.ts`; `runtime.ts` only imports it internally.
- **Fix:** Imported from `lib/study-plan/coached/instance` directly.
- **Files modified:** `app/api/study-plans/[planId]/path/route.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `622104d`.

**3. [Rule 1 - Bug] The verifier's own answer-key regex caught the route's legitimate reworded prose**
- **Found during:** Task 4, first run of `scripts/verify-path-surface.ts`
- **Issue:** The initial regex `/answer[-_]?[Kk]ey/` matched the hyphenated prose "answer-key" the route's own comments use after fix #1 above — a false positive on legitimate doc text, not a leak.
- **Fix:** Narrowed the regex to the real field-name identifiers only (`answerKey`, `answer_key`), carving out the hyphenated-prose form exactly as 21-06/21-11/21-22's own grep gates needed to.
- **Files modified:** `scripts/verify-path-surface.ts`
- **Verification:** Re-ran the battery — 34/34 pass, exit 0.

---

**Total deviations:** 3 auto-fixed (2 bugs in grep-gate literalism, 1 blocking import-path fix). No scope creep, no architectural changes.

## Issues Encountered

None beyond the three auto-fixed deviations above. `DATABASE_URL` was already configured for local dev (per this plan's own instructions), so every database-gated section in `verify-path-surface.ts` ran for real rather than printing SKIP.

## User Setup Required

None. `DATABASE_URL` was already configured; all DB-gated sections ran against it directly.

## Requirements Note

`REQ-120` and `REQ-122` are marked Complete — checkbox and Traceability row both flipped, confirmed in agreement.

- **REQ-120**: the path (step state, next-step reason) is surfaced on `app/reports/page.tsx` additively and regression-guarded; level and goal progress are surfaced on `/mastery` (21-18, already landed). REQ-120's text does not require a single page for both halves.
- **REQ-122**: all three step kinds now render a working action link — `KNOWLEDGE_CHECK` to 21-22's page, `COACHED_SESSION` to 21-24's page (both proven to exist on disk, not just matched by substring), `UNAIDED_SESSION` to a derived `/practice/{slug}` entry. The pre-existing coached-mode `instance`-requiring-type limitation (21-24's own disclosure) is correctly NOT a REQ-122 defect — the link itself reaches a real, startable surface; that surface's own documented gap stays tracked against REQ-113/114 in `deferred-items.md`.

The cross-wave `PLACEHOLDER_KNOWLEDGE_CHECK_ID` hazard recorded in `deferred-items.md` is CLOSED, with the bite-proof (plant/observe/remove) in `scripts/verify-path-surface.ts` Section 7.

## Next Phase Readiness

- 21-20's validation pass can now confirm: REQ-120 and REQ-122's closures, the hazard's three-way closure and its bite-proof, and that `app/reports/page.tsx`'s diff is purely additive.
- No blockers identified. `git diff --name-only` for all four task commits touches only this plan's four files; `config/site.ts`, `app/mastery/page.tsx`, `components/mastery/MasteryPanel.tsx`, and `app/api/mastery/route.ts` (21-18's files) were never touched.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: `app/api/study-plans/[planId]/path/route.ts`
- FOUND: `components/study-plan/PathPanel.tsx`
- FOUND: `scripts/verify-path-surface.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-19-SUMMARY.md`
- FOUND: commit `622104d` (Task 1)
- FOUND: commit `8838e51` (Task 2)
- FOUND: commit `ef41fa9` (Task 3)
- FOUND: commit `66b8cc8` (Task 4)
- `npx tsc --noEmit` clean repo-wide
- `npm run build` succeeds (`/api/study-plans/[planId]/path`, `/study-plans/[planId]/checks/[checkId]`, `/study-plans/[planId]/coached/[stepId]` all in the manifest)
- `npx tsx scripts/verify-path-surface.ts` exit 0, 34/34 checks pass, DB-gated sections ran (not SKIP)
- `npx tsx scripts/verify-path-model.ts`, `verify-next-step.ts`, `verify-levels-goals.ts`, `verify-check-generation.ts`, `verify-coached-mode-isolation.ts` all still exit 0
- REQ-120/REQ-122 checkboxes and Traceability rows confirmed in agreement (`Complete`/`[x]`)
