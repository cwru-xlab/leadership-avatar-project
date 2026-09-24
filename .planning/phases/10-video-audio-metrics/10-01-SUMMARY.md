---
phase: 10-video-audio-metrics
plan: 01
subsystem: metrics
tags: [typescript, pure-library, visual-metrics, vocal-metrics, coverage-discriminator]

# Dependency graph
requires: []
provides:
  - "lib/metrics/types.ts — the single shared VisualMetrics/VocalMetrics/SessionMetricsPayload contract"
  - "lib/metrics/bands.ts — raw metric to qualitative band label mapping"
  - "lib/metrics/coverage.ts — resolveVisualOutcome/resolveVocalOutcome/isPoorVisualCoverage discriminator"
affects: [10-video-audio-metrics remaining plans (02-11), lib/interview evaluation, lib/scenario evaluation, both report pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Liveness signals (processed/track-live/analyzer_error) live in a separate sub-object from detection counts, so scorability can never be derived from a detection ratio"
    - "Band-mapping and scoring-eligibility are two entirely separate pure functions (bands.ts vs coverage.ts) so disclosure logic can never leak into gating logic"
    - "Pure libraries with zero React/Prisma/Next/lib-interview/lib-scenario imports, verified by throwaway tsx assertion scripts in the scratchpad (no test framework in this repo, matching Phases 6-9 precedent)"

key-files:
  created:
    - lib/metrics/types.ts
    - lib/metrics/bands.ts
    - lib/metrics/coverage.ts
  modified: []

key-decisions:
  - "resolveVisualOutcome never reads face_detected_samples anywhere in its decision logic — verified by grep and by a regression assertion (face_detected_samples: 0, processed_samples: 600, analyzer_error: false still returns { scored: true, reason: null })"
  - "Three independent technical-failure signatures for Visual (analyzer_error, track-live-ratio < 0.5, processed/expected ratio < 0.5) plus an absolute 60-sample floor, checked in a fixed order so opt-out is never misreported as a failure"
  - "Vocal outcome is deliberately asymmetric with Visual: zero spoken turns or under 30 spoken seconds resolves to TYPED_ONLY (a modality outcome, never a penalty), not INSUFFICIENT_DATA"
  - "isPoorVisualCoverage is a wholly separate REQ-46 disclosure predicate (detection ratio < 0.6) that resolveVisualOutcome never consults"
  - "Band cutoffs recorded as this plan's own decision (CONTEXT.md left them to discretion), mirroring the five-tier feel of ReportScoreCards.tsx's SCORE_LABELS"
  - "REQ-39, REQ-40, REQ-41, REQ-42 and REQ-46 are intentionally left unchecked in REQUIREMENTS.md despite appearing in this plan's frontmatter, matching the Phase 9 precedent for split requirements: this plan delivers the pure discriminator/contract/band logic in full, but REQ-39/40 require a real capture pipeline (10-05/10-06+), and REQ-41/42/46's full text also requires the evaluator, runner and report page to actually consume this module (later plans in this phase) before the end-to-end behavior exists."

patterns-established:
  - "Pattern: liveness sub-object vs measured-value fields — any future metric block added to this module should follow the same split."
  - "Pattern: a disclosure predicate is never the same function as a scoring-eligibility predicate."

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-09-22
---

# Phase 10 Plan 01: Shared Metric Contract, Bands, and Liveness Discriminator Summary

**Pure `lib/metrics/` library (types, band-mapping, and the REQ-42 liveness-vs-performance discriminator) that provably never lets a low face-detection ratio make a live camera-on session unscorable.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-22T13:37:41Z
- **Completed:** 2026-09-22T13:41:41Z
- **Tasks:** 3
- **Files modified:** 3 (all new)

## Accomplishments
- One authoritative `SessionMetricsPayload`/`VisualMetrics`/`VocalMetrics` contract with liveness (`VisualCoverage`/`VocalCoverage`) split into its own sub-object, so no future edit can accidentally derive scorability from a detection ratio.
- `visualBands`/`vocalBands` translate every raw metric into a qualitative band word only — never a percentage, ratio, or bare number — and are provably total (NaN/-1/Infinity all produce a valid, digit-free band string).
- `resolveVisualOutcome` encodes the phase's governing principle in executable form: a live camera-on session with `face_detected_samples: 0` still scores normally (low), distinct from three independent technical-failure signatures (analyzer error, track-death, starvation) plus an absolute sample floor. `resolveVocalOutcome` keeps `TYPED_ONLY` (a modality choice) structurally separate from `INSUFFICIENT_DATA` (a genuine failure).

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the shared metric contract** - `fb35bc5` (feat)
2. **Task 2: Qualitative band mapping** - `65d4d54` (feat)
3. **Task 3: The liveness-vs-performance discriminator** - `a739cc6` (feat)

**Plan metadata:** (this commit) `docs(10-01): complete shared metric contract plan`

## Files Created/Modified
- `lib/metrics/types.ts` (203 lines) - `CameraMode`, `VisualMetrics`/`VisualCoverage`, `VocalMetrics`/`VocalCoverage`, `VisualUnscoredReason`/`VocalUnscoredReason`, `SessionMetricsPayload`, `FILLER_WORD_LEXICON`, `VISUAL_POSTURE_FLAGS`, `METRICS_SAMPLE_HZ`
- `lib/metrics/bands.ts` (159 lines) - `visualBands`, `vocalBands`, both pure and total, cutoffs documented in-file
- `lib/metrics/coverage.ts` (195 lines) - `resolveVisualOutcome`, `resolveVocalOutcome`, `isPoorVisualCoverage`

## Decisions Made
- Band cutoffs (eye contact, framing, pace, filler density, pause rate, volume) recorded as this plan's own decision in a file-level comment in `bands.ts`, deliberately mirroring `ReportScoreCards.tsx`'s five-tier `SCORE_LABELS` feel.
- The three visual technical-failure signatures (analyzer error, track-live ratio, processed/expected starvation ratio) plus the absolute floor were all implemented as specified in the plan — no deviation from the prescribed order or thresholds, since the plan's own reasoning for each (camera seized mid-session, backgrounded tab, degenerate tiny session) was already airtight.
- Left REQ-39/40/41/42/46 unchecked in `REQUIREMENTS.md` — see key-decisions above for full rationale (matches the Phase 9 split-requirement precedent already established in this project).

## Deviations from Plan

None - plan executed exactly as written. All three files compiled clean on the first write; the only correction needed was in the plan-author's own throwaway verification script (a `Pace` band boundary assertion I initially wrote with the wrong expected values), not in the shipped code — `bandPace`'s boundaries matched the plan's cutoffs correctly on the first attempt.

**Total deviations:** 0
**Impact on plan:** None. All three min-line thresholds exceeded (203/159/195 vs required 90/90/80); all verification greps and throwaway `tsx` assertion scripts passed, including the load-bearing REQ-41 regression assertion (`face_detected_samples: 0, processed_samples: 600, analyzer_error: false` → `{ scored: true, reason: null }`) and the track-death case a single ratio would have missed (`track_live_seconds: 20, session_seconds: 600` → `INSUFFICIENT_DATA`).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Pure TypeScript library, no env vars, no migrations.

## Next Phase Readiness
- `lib/metrics/` is ready to be imported by every remaining Phase 10 plan (capture pipeline, evaluators, runners, report pages) with zero further changes anticipated to its public shape.
- Ready for `10-02-PLAN.md`.

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*

## Self-Check: PASSED

All three key files (`lib/metrics/types.ts`, `lib/metrics/bands.ts`, `lib/metrics/coverage.ts`) confirmed present on disk. All three task commits (`fb35bc5`, `65d4d54`, `a739cc6`) confirmed present in git log.
