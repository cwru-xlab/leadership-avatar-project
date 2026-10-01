---
phase: 12-embodied-visual-signals
plan: 02
subsystem: metrics
tags: [typescript, mediapipe-contract, type-safety, visual-metrics]

# Dependency graph
requires:
  - phase: 10-video-audio-metrics
    provides: "VisualMetrics/VisualCoverage contract, episode system, visualBands rendering, ingest.ts sanitization pattern"
provides:
  - "Scored body-language fields on VisualMetrics (gesture_rate_per_min, gesture_amplitude_mean, hands_above_shoulder_pct, hands_near_face_pct, posture_drift_mean, posture_drift_max_s, posture_signals_measured)"
  - "VisualDescriptiveObservations — a structurally separate, measured-but-never-scored sub-object (fidget_pct, phone_visible_seconds, absolute posture readings, descriptive episodes)"
  - "Two closed, non-overlapping episode-kind vocabularies: VisualEpisodeKind (scored, now includes excessive_gesturing/minimal_gesturing/hands_near_face/posture_drift) and VisualDescriptiveEpisodeKind (fidgeting/phone_visible)"
  - "resolveNotMeasured() — pure function replacing the unconditional VISUAL_NOT_MEASURED spread with per-session dynamic resolution"
  - "lib/metrics/body-thresholds.ts — every provisional numeric threshold this phase needs, in one PROVISIONAL-labelled file"
  - "Server-side sanitizers (sanitizePostureSignals, sanitizeDescriptiveEpisodes, sanitizeObservations) extending ingest.ts's allowlist pattern"
  - "Three new pure rendering functions in bands.ts: visualBodyLanguageBands (scored), visualObservationRows (descriptive-only), timelineRows (merged, kind-tagged, display-only)"
affects: [12-embodied-visual-signals, visual-capture, report-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scored vs. descriptive signals kept in genuinely separate TypeScript types (VisualEpisode vs VisualDescriptiveEpisode), making 'a descriptive episode entered the scored array' a compile error rather than a convention to remember — mirrors the existing VisualCoverage liveness/detection split."
    - "Every provisional numeric threshold centralized in one PROVISIONAL-labelled file (body-thresholds.ts), never defined inline."
    - "Band/scoring functions and descriptive-rendering functions are structurally separate (visualBands/visualBodyLanguageBands vs visualObservationRows) so neither can accidentally read the other's data."

key-files:
  created:
    - lib/metrics/body-thresholds.ts
  modified:
    - lib/metrics/types.ts
    - lib/metrics/ingest.ts
    - lib/metrics/bands.ts
    - scripts/verify-visual-metrics.ts

key-decisions:
  - "Fidgeting/phone-visible episodes use their own VisualDescriptiveEpisode type, not a widened VisualEpisodeKind union — enforced by a @ts-expect-error probe confirming a descriptive episode cannot be pushed into a VisualEpisode[] array."
  - "VISUAL_NOT_MEASURED keeps all five entries unchanged this plan; resolveNotMeasured exists but every call site today would pass all four measured-flags false until 12-06/12-07 land producers."
  - "'Measured from' row in visualBodyLanguageBands renders unconditionally (including the empty-signals case), deliberately not gated on coverage being poor, per REQ-51."
  - "MAX_PAYLOAD_BYTES left untouched — the new descriptive/scored arrays add at most ~40 rows of 4 numbers each, well inside the existing 64KB budget; MEDIA_SHAPED_PATTERN and MAX_STRING_LENGTH (the REQ-58 defence) untouched."

patterns-established:
  - "A @ts-expect-error probe script is a lightweight way to prove two vocabularies are structurally non-overlapping, beyond what a plain tsc --noEmit pass alone shows."

requirements-completed: []  # REQ-52/53/55/56/58 are contract-only here; full user-facing behavior needs 12-06/12-07's producers, matching this project's established split-requirement precedent.

# Metrics
duration: 25min
completed: 2026-10-01
---

# Phase 12 Plan 02: Type Contract Extension Summary

**Extended the shared visual-metrics contract with scored body-language fields and a structurally separate, measured-but-never-scored `VisualDescriptiveObservations` type, plus the sanitizers, three pure rendering functions, and a single PROVISIONAL-threshold file that back it — pure contract, no producer.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-01T22:14:00Z (approx.)
- **Completed:** 2026-10-01T22:40:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Closed the REQ-56 type-contract gap identified in `12-RESEARCH.md`: a third
  category of visual signal — measured but never scored — now exists as a
  type (`VisualDescriptiveObservations`), structurally unreachable from
  `visualBands()`/`visualBodyLanguageBands()`.
- Two non-overlapping episode-kind vocabularies (scored `VisualEpisodeKind`
  vs. descriptive `VisualDescriptiveEpisodeKind`) make "a fidget episode
  entered the scored array" a compile-time impossibility, verified directly
  with a `@ts-expect-error` probe rather than just asserted by comment.
- Every numeric threshold this phase will need lives in one new file,
  `lib/metrics/body-thresholds.ts`, labelled PROVISIONAL with a pointer to
  plan 12-08 for tuning.
- `scripts/verify-visual-metrics.ts` now proves the whole contract — the
  dynamic `resolveNotMeasured`, the scored/descriptive rendering split, and
  the ingest allowlists — without touching a camera, extending the existing
  pure-seam testing discipline this codebase already relies on.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the metric contract** - `d348b08` (feat) —
   `lib/metrics/types.ts`, `lib/metrics/body-thresholds.ts`
2. **Task 2: Sanitize new fields + separate pure rendering functions** -
   content committed, but landed inside sibling 12-01's commit `53681e8`
   due to the documented shared-git-index hazard (see Deviations below) —
   `lib/metrics/ingest.ts`, `lib/metrics/bands.ts`
3. **Task 3: Extend the verification script** - `31532a8` (test) —
   `scripts/verify-visual-metrics.ts`

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/metrics/types.ts` — `VISUAL_POSTURE_SIGNALS`/`VisualPostureSignal`,
  four new scored `VisualEpisodeKind` entries, `VISUAL_DESCRIPTIVE_EPISODE_KINDS`/
  `VisualDescriptiveEpisodeKind`/`VisualDescriptiveEpisode`,
  `VisualDescriptiveObservations`, eight new optional `VisualMetrics` fields,
  `resolveNotMeasured()`.
- `lib/metrics/body-thresholds.ts` (new) — every provisional threshold
  (visibility floor, posture baseline window, drift trip, gesture curve,
  hands-near-face, fidget discrimination, phone thresholds).
- `lib/metrics/ingest.ts` — `sanitizePostureSignals`, `sanitizeDescriptiveEpisodes`,
  `sanitizeObservations`, `sanitizeNullableNumber`; `sanitizeVisualMetrics`
  extended to emit the new fields only when present.
- `lib/metrics/bands.ts` — `visualBodyLanguageBands`, `visualObservationRows`,
  `timelineRows`, `EPISODE_KIND_GROUP`, `DESCRIPTIVE_EPISODE_LABELS`, extended
  `EPISODE_LABELS`.
- `scripts/verify-visual-metrics.ts` — sections 9–14: `resolveNotMeasured`,
  `visualBodyLanguageBands`, `visualObservationRows`, the structural
  non-scoring assertions, `timelineRows`, and the new ingest allowlists.

## Decisions Made

See `key-decisions` in frontmatter. The most load-bearing one: the
scored/descriptive split is enforced by two genuinely separate TypeScript
types rather than one union with a discriminant flag, matching the plan's
own instruction and verified with a throwaway `@ts-expect-error` compile
probe (not committed — a one-off check, deleted after use) confirming a
`VisualDescriptiveEpisode` cannot be assigned into a `VisualEpisode[]`.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; all three tasks matched the
plan's design directly.

### Process note (not a code deviation): sibling-commit absorption

**Found during:** Task 2's commit step.

**What happened:** `lib/metrics/bands.ts` and `lib/metrics/ingest.ts` were
staged with literal paths (`git add lib/metrics/bands.ts lib/metrics/ingest.ts`)
and committed via `git commit lib/metrics/bands.ts lib/metrics/ingest.ts`.
Sibling plan 12-01 — executing concurrently in the same working directory
with no worktree isolation (the documented hazard from 08-08/09-02/11-02) —
committed its own staged changes to
`components/interview/InterviewSessionShell.tsx` and
`app/case-play/[caseId]/page.tsx` in the narrow window between my `git
status` check and my `git commit` call, and that commit (`53681e8`,
"feat(12-01): await the now-async visual-capture stop()...") absorbed my
already-staged `bands.ts`/`ingest.ts` changes too.

**Verification:** `git show --stat 53681e8` confirms all four files present;
`git diff HEAD -- lib/metrics/bands.ts lib/metrics/ingest.ts` in my working
tree returns empty, confirming the committed content is byte-identical to
what I wrote — nothing lost, only mis-attributed to a 12-01 commit message.
Per the documented hazard protocol, no `git reset` was attempted (a prior
reset in this exact situation class previously raced with a sibling commit
and briefly destroyed work). The sibling independently logged the same event
from their side in
`.planning/phases/12-embodied-visual-signals/deferred-items.md` ("12-01:
sibling-file absorption into a 12-01 commit (git-index race)"), so this is
recorded in two places by design — both executors saw the same race and
corroborate the same resolution.

**Impact on plan:** None on content. Task 2's deliverables are fully present
and verified; only the git commit history misattributes authorship of two
files to a 12-01 commit rather than a dedicated 12-02 commit.

### Known cross-plan compile gap (not fixed, not in scope)

**Found during:** final `npx tsc --noEmit` sweep.

**Symptom:** `lib/metrics/visual-capture.ts(276,66): error TS2366: Function
lacks ending return statement...` — `windowTrips()`'s switch statement is
not exhaustive over the `VisualEpisodeKind` union this plan extended with
`excessive_gesturing`/`minimal_gesturing`/`hands_near_face`/`posture_drift`.

**Why not fixed here:** `visual-capture.ts` is sibling 12-01's exclusively-
owned file per this plan's explicit constraint ("Do NOT edit any of those").
`windowTrips()`'s actual trip conditions for the new kinds are meaningless
without the pose/hand landmark producer code that ships in later plans
(12-06/12-07) — adding a case here now would mean inventing placeholder
logic in a file outside this plan's scope. The sibling independently
discovered and logged this exact issue from their own `tsc` sweep in
`deferred-items.md`, attributing it correctly to this plan's
`VisualEpisodeKind` extension. Confirmed via `git diff` that none of my
commits touch `windowTrips()` or `visual-capture.ts` at all.

**Status:** Not fixed by this plan. Expected to resolve once the plan that
implements the corresponding pose/hand episode logic (12-06/12-07) adds the
missing switch cases. `npx tsc --noEmit` is clean for every file this plan
actually owns (`types.ts`, `body-thresholds.ts`, `ingest.ts`, `bands.ts`,
`scripts/verify-visual-metrics.ts`) — confirmed by filtering the sweep output
to exclude the three sibling-owned files.

## Issues Encountered

None beyond the two items documented above (both are concurrency-hazard
artifacts of running alongside sibling plan 12-01, not problems with this
plan's own design or execution).

## User Setup Required

None — no external service configuration required. No schema change, no
migration (matching this plan's environment notes).

## Next Phase Readiness

- The type contract, sanitizers, and rendering functions for scored
  body-language signals and measured-but-never-scored observations are
  fully in place, verified by 18 new passing assertions in
  `scripts/verify-visual-metrics.ts` (sections 9–14), with `npx tsc --noEmit`
  clean across every file this plan owns.
- `VISUAL_NOT_MEASURED` still carries all five entries, confirmed by direct
  grep against `lib/metrics/types.ts` — no capability is claimed before a
  producer exists.
- No numeric body-signal threshold exists outside `lib/metrics/body-thresholds.ts`,
  confirmed by grep.
- Plans 12-06 (hand_gestures/body_posture producers) and 12-07
  (fidgeting/phone_checking producers) can now populate every optional
  field this plan added without any further contract change; they will also
  need to add the corresponding cases to `windowTrips()` in
  `visual-capture.ts` (see the logged cross-plan compile gap above) and call
  `resolveNotMeasured()` from the capture engine to replace the current
  unconditional `VISUAL_NOT_MEASURED` spread.
- No blockers for this plan's own scope. The one open item (`windowTrips()`
  non-exhaustiveness) is explicitly sibling/downstream-plan territory, not a
  blocker for 12-02 itself.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-01*

## Self-Check: PASSED
All created/modified files confirmed present on disk; all three task commits
(`d348b08`, `53681e8`, `31532a8`) confirmed present in git history.
