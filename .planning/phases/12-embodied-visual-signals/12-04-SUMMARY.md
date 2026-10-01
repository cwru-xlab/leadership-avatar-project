---
phase: 12-embodied-visual-signals
plan: 04
subsystem: report-ui-and-evaluator-prompts
tags: [react, heroui, report-rendering, prompt-engineering, evaluator]

# Dependency graph
requires:
  - phase: 12-embodied-visual-signals
    plan: 02
    provides: "visualBodyLanguageBands/visualObservationRows/timelineRows rendering functions, VisualDescriptiveObservations type"
provides:
  - "Body language subheading in the Delivery tab, rendering the scored gesture/hands-near-face/posture-drift bands separately from the camera/environment rows"
  - "Unscored Observations section at the bottom of Delivery, stating once at section level that nothing there affects any score"
  - "Single kind-tagged Moments timeline (Camera/Body language/Observation chips) merging scored and descriptive episodes chronologically"
  - "Both evaluator prompts (interview + scenario) extended with the full body-signal contract: gesture-curve rule, describe-then-ask wording rule, posture-drift-vs-absolute-reading rule, and a HARD RULE ON observations"
affects: [12-embodied-visual-signals, report-rendering, evaluator-prompts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A measured-but-never-scored data block gets a SEPARATE rendered section with the non-scoring statement made ONCE at section level, never as a per-row tag inside a list that also carries scored rows."
    - "Prompt rules for a measured-but-unscored input get a HARD RULE of equal declared force to the existing not-measured rule, explicitly contrasted against it (never observed vs. observed-but-excluded) so the model cannot conflate the two failure modes."
    - "jsdom + react-dom/client + a simulated real click is the verification pattern for a HeroUI <Tabs> component with destroyInactiveTabPanel (the default), since renderToStaticMarkup alone only ever renders the first tab's panel."

key-files:
  created: []
  modified:
    - components/report/ReportBody.tsx
    - components/metrics/DeliveryTimeline.tsx
    - lib/interview/prompts.ts
    - lib/scenario/prompts.ts

key-decisions:
  - "The Observations section is wrapped in a rounded-2xl border border-default-100 card purely for visual separation from the per-answer delivery rows above it — explicitly NOT the primary-colour treatment reserved for 'One thing to practice next time', matching the plan's instruction that it must not look like a score card."
  - "hasMoments now ORs the scored episodes array with observations.episodes, so a session whose only finding was a visible phone (zero scored episodes) still gets a Moments tab — verified live, not just by code inspection."
  - "Moments row tags are a plain muted flat Chip labelled by group ('Camera'/'Body language'/'Observation'), never colour-coded, since severity is not a grade and must not be implied by colour."
  - "Both evaluator prompts receive byte-identical new rule text (student/candidate wording substituted only where the surrounding prose already used that noun) so the two evaluators cannot drift apart on the never-score contract."

requirements-completed: []  # REQ-50 through REQ-56 appear in this plan's frontmatter but are NOT marked complete here, matching the project's established split-requirement precedent: the full behaviors (report surfacing + evaluator contract) are now real end-to-end for a session that HAS Phase 12 producer data, but no producer ships until 12-06/12-07 land, so no real session can exercise this path yet.

# Metrics
duration: 70min
completed: 2026-10-01
---

# Phase 12 Plan 04: Report Surfacing and Evaluator Contract Summary

**Added a "Body language" subheading and an unscored "Observations" section to the Delivery tab, merged the Moments timeline into one kind-tagged list, and extended both evaluator prompts with the gesture-curve/describe-then-ask/posture-drift/never-score-observations rules — verified live against a real OpenAI call that described a 90%-fidgeting, 120-second-visible-phone session factually without lowering its visual score.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-10-01T22:45:00Z (approx.)
- **Completed:** 2026-10-01T22:56:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 4

## Accomplishments

- Closed the report-surfacing half of Phase 12's governing principle (a
  real session with obscene gesturing was once *commended* for "minimal
  obvious fidgeting or posture concerns"): scored body-language signals now
  render under their own "Body language" subheading, and descriptive
  observations render in a visually distinct, non-card-like section whose
  unscored status is stated exactly once, at section level — never as a
  per-row tag that could sit beside a scored row.
- Merged the previously camera-only Moments timeline with the new
  descriptive episode stream into one chronological, kind-tagged list
  (`timelineRows`), and widened the Moments tab's visibility condition so a
  session whose only finding is a visible phone (no scored episodes at
  all) still gets a timeline — verified with a real render-and-click test,
  not just code inspection.
- Extended both evaluator prompts (interview and scenario — kept
  byte-identical in substance) with the full body-signal contract from
  `12-CONTEXT.md`: the gesture-curve rule, the "describe the motion, then
  ask a question" wording rule placed adjacent to the existing RULE ON
  INTERNAL STATES, the posture rule distinguishing scored drift from the
  unscored absolute reading, and a HARD RULE ON observations declared
  explicitly equal in force to the existing HARD RULE ON not_measured.
- Proved the live interviewer prompt in `lib/interview/prompts.ts` stayed
  byte-unchanged (diff of hunk line ranges — every hunk lands at line
  289+, inside the evaluator template literal starting at line 278), and
  proved the never-score contract on a REAL OpenAI call rather than by
  prompt-reading alone: a visual_metrics payload with a 90%-fidget /
  120-second-phone `observations` block produced a report that called the
  phone "simply factual, not scored" and did not lower `visual_score`
  relative to the same payload with `observations` omitted (4 → 5, i.e.
  not reduced).

## Task Commits

Each task was committed atomically:

1. **Task 1: Render Body language and the unscored Observations section** -
   `688f194` (feat) — `components/report/ReportBody.tsx`
2. **Task 2: Tag the Moments timeline by kind** - `1f92961` (feat) —
   `components/metrics/DeliveryTimeline.tsx`
3. **Task 3: Extend both evaluator prompts** - `15f015a` (feat) —
   `lib/interview/prompts.ts`, `lib/scenario/prompts.ts`

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `components/report/ReportBody.tsx` — imports
  `visualBodyLanguageBands`/`visualObservationRows`; inserts a "Body
  language" section right after "On camera" (rendered only when the
  function returns rows); inserts an "Observations" section as the LAST
  section of Delivery (muted bordered card, one lead-in line, rendered
  only when rows exist); widens `hasMoments` to OR in
  `observations.episodes.length`; updates the Moments tab's lead-in
  sentence to describe the mixed, tagged timeline.
- `components/metrics/DeliveryTimeline.tsx` — `MomentsPanel` rewritten to
  source from `timelineRows(visual)` instead of mapping
  `visual.episodes` through `episodeBand` directly; each row gains a
  muted flat `Chip` labelled by `group` ("Camera"/"Body
  language"/"Observation"); the component's own `capture_offset_s` shift
  removed since `timelineRows` already applies it; unused `episodeBand`
  import dropped.
- `lib/interview/prompts.ts` — `INTERVIEW_EVALUATOR_PROMPT` extended per
  Task 3's eight points (new field descriptions, gesture-curve rule,
  describe-then-ask wording rule, posture rule, HARD RULE ON
  observations, rubric extension, not_measured per-session clause). Live
  interviewer prompt above it untouched.
- `lib/scenario/prompts.ts` — `SCENARIO_EVALUATOR_PROMPT` extended with
  the identical rule set (student-facing wording).

## Decisions Made

See `key-decisions` in frontmatter. Most load-bearing: the Observations
section uses a bordered card purely for visual grouping, never the
primary-colour treatment — confirmed by reading `ReportBody.tsx`'s
existing "One thing to practice next time" section as the only
primary-colour precedent and deliberately not reusing its classes.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed. All three tasks matched the
plan's design directly; the only friction was in building a working
verification harness (see below), not in the production code.

### Verification method note (not a code deviation)

**Found during:** Task 1/2 verification.

**What happened:** The plan's suggested verification ("render `ReportBody`
server-side... assert the string 'Body language'/'Observations' appear
only in [the Phase 12 fixture]") does not work with a plain
`renderToStaticMarkup` call, because HeroUI's `<Tabs>` defaults
`destroyInactiveTabPanel={true}` — only the selected (first, "Overview")
tab's panel is ever present in static markup, regardless of what data is
passed. A naive static-render fixture reported `Body language=false` even
for the full Phase 12 fixture, which would have been a false negative, not
a real failure.

**Resolution:** Built a jsdom-backed fixture (deleted after use, never
committed) that does a real `react-dom/client` render, dispatches a real
click on the "Delivery" tab button, and reads `innerHTML` afterward —
exercising the actual interactive behavior a student's browser would. This
required polyfilling ~12 missing jsdom globals (`ResizeObserver`,
`MutationObserver`, `ShadowRoot`, `innerWidth`, etc.) that HeroUI's
`@react-aria` dependencies touch during mount/click. Confirmed: legacy
fixture shows neither new section; full Phase 12 fixture shows both, in
the correct order, with no "not scored" text anywhere; a phone-only
fixture (zero scored episodes) still produces a non-empty Moments tab with
only the "Observation" chip; the pre-structured (`reportStructured: null`)
markdown path renders with no tab role and no new section text at all.

**Impact on plan:** None on production code — this was purely a
verification-tooling finding. Documented here so a future plan touching
this `<Tabs>` component does not repeat the same false-negative mistake.

### Known cross-plan compile gap, now resolved by a sibling (not this plan's work)

**Found during:** final `npx tsc --noEmit` sweep.

**What happened:** 12-01's and 12-02's summaries both logged a
non-exhaustive `windowTrips()` switch in `lib/metrics/visual-capture.ts`
over the widened `VisualEpisodeKind` union. By the time this plan's final
sweep ran, that file had already been fixed by a concurrent sibling commit
(`cddb72c`, "fix(12): keep windowTrips exhaustive over the widened episode
vocabulary") — `npx tsc --noEmit` is clean project-wide (aside from one
transient, unrelated `.next/types` stale-cache error referencing a sibling
12-03 spike directory that no longer exists on disk — a `.next` build
artifact, not a real compile error, confirmed by `ls` returning "No such
file or directory" for the referenced path).

**Impact on this plan:** None — this plan made zero edits to
`visual-capture.ts`, confirmed by `git diff`.

## Issues Encountered

Concurrent sibling plans (12-01/12-02/12-03) continued committing to the
same working directory throughout this plan's execution (shared git
index, no worktree isolation — the documented hazard from
08-08/09-02/11-02/12-01/12-02). This plan's own three commits were each
staged with literal file paths and independently confirmed via `git show
--name-only` to contain ONLY this plan's own files — no absorption
occurred in either direction this time.

## User Setup Required

None — no external service configuration required. No schema change, no
migration. The real OpenAI evaluator call used the existing
`OPENAI_API_KEY` already present in the environment (confirmed present
without reading its value, per the environment's file-read protections).

## Next Phase Readiness

- The report-surfacing and evaluator-prompt halves of Phase 12's
  contract are now fully wired for any `VisualMetrics` payload that
  already carries the Phase 12 fields — verified against hand-built
  fixtures (report UI) and a real model call (evaluator prompts).
- No real session can exercise this path end-to-end yet: no producer
  populates `gesture_rate_per_min`/`hands_near_face_pct`/
  `posture_drift_mean`/`observations` on a live `VisualCaptureHandle`
  until plans 12-06/12-07 land. REQ-50 through REQ-56 stay unchecked in
  `REQUIREMENTS.md` for that reason, matching the project's established
  split-requirement precedent.
- The scenario evaluator prompt was extended identically to the interview
  evaluator but was NOT separately exercised with a real OpenAI call in
  this plan (the plan's verify step asks for one real call, singular);
  it shares the exact same rule text and the same
  `buildScenarioEvaluationUserMessage` metrics-passing pattern already
  proven in 10-06, so the risk of prompt-only drift is low, but a future
  phase-closeout sweep (12-08) should include one real scenario-evaluator
  call as a belt-and-braces check.
- No blockers for this plan's own scope.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-01*

## Self-Check: PASSED
All modified files confirmed present on disk with the expected content
(`Body language`/`Observations` strings in `ReportBody.tsx`,
`timelineRows` usage in `DeliveryTimeline.tsx`, `HARD RULE ON observations`
in both prompt files); all three task commits (`688f194`, `1f92961`,
`15f015a`) confirmed present in `git log`.
