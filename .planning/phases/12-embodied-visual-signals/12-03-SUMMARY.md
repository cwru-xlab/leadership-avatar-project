---
phase: 12-embodied-visual-signals
plan: 03
subsystem: visual-capture-threading
tags: [web-worker, mediapipe, offscreen-inference, performance, frame-budget]

# Dependency graph
requires:
  - phase: 12-embodied-visual-signals
    plan: 01
    provides: "frame-budget instrumentation (meanTickMs/p95TickMs/droppedTicks/processed-vs-expected samples)"
provides:
  - "ES-module Web Worker host for @mediapipe/tasks-vision, proven under BOTH next dev --turbopack and next build (webpack)"
  - "Per-tick ImageBitmap frame transfer with one-outstanding-request back-pressure and dropped-tick accounting"
  - "Staggered round-robin SCHEDULE array with one registered tenant, ready for 12-05 to add pose/hands/object"
  - "Automatic degrade-to-main-thread fallback on worker construction failure, init-error, or init timeout"
  - "Frame-budget report that names which thread and which quantity it measured (thread, tickCostKind, dispatchMeanMs/dispatchP95Ms)"
affects: [12-embodied-visual-signals, visual-capture, performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@mediapipe/tasks-vision loads in an ES-module worker via `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` with a static import — the package's own exports map resolves vision_bundle.mjs. The community importScripts failure is specific to the UMD vision_bundle.js and does not apply."
    - "Reductions that would otherwise force a large array across a worker boundary (primary-subject selection, matrix decode) move INTO the worker; threshold comparisons whose constants live on the main thread stay OUT of it. The worker returns raw measurements, never verdicts."
    - "A timing metric that measures a different physical quantity on each of two code paths must carry a field naming which quantity it is (tickCostKind), or a healthy number read off the wrong path silently approves the thing it was meant to gate."

key-files:
  created:
    - lib/metrics/visual-capture.worker.ts
  modified:
    - lib/metrics/visual-capture.ts

key-decisions:
  - "Option A (ES-module worker + static import) won the Task 1 spike outright under both bundlers, so the planned fallbacks were never needed: public/mediapipe/vision_bundle.js was NOT copied and the plan's files_modified entry for it is correctly unfulfilled. No new vendored asset, no bundler-specific workaround."
  - "The GPU-then-CPU delegate fallback moved INTO the worker rather than being negotiated across the message boundary, so the `engine started` diagnostic keeps reporting the delegate that actually won."
  - "A worker failure of any kind (construction, init-error, init timeout) degrades to the pre-existing main-thread path rather than surfacing as analyzer_error — a technical fallback is not a measurement failure (REQ-42)."
  - "REQ-57 turns on main-thread contention, not wall-clock latency, so the budget line reports dispatchMeanMs/dispatchP95Ms (the createImageBitmap + postMessage segment) separately from the worker round-trip. Reporting only the round-trip would have understated the win by ~15x."
  - "SCHEDULE is consulted as `SCHEDULE[tickCount % SCHEDULE.length]`, so with N tenants each model samples at METRICS_SAMPLE_HZ / N while the tick interval itself stays 166.67ms. The per-tick worker budget is therefore unchanged by adding models — what changes is each signal's temporal resolution."

requirements-completed: []  # REQ-57 and REQ-58 appear in this plan's frontmatter but are NOT checked here, matching the project's established split-requirement precedent (12-01 left REQ-57 unchecked for the same reason). REQ-57's text is about FOUR models; one runs today, and its gate is only provisionally satisfied until 12-05 proves the budget with the full set. REQ-58's "every new signal reaches the server as a derived scalar" cannot be fully true until there are new signals — the worker boundary now enforces it structurally, which is the half this plan owns.

# Metrics
duration: ~2 sessions + human verification
completed: 2026-10-01
---

# Phase 12 Plan 03: Worker Migration and Frame Budget Summary

**Face inference now runs in an ES-module Web Worker behind a round-robin scheduler and a main-thread fallback, and the REQ-57 live gate passed decisively: a camera-on session leaves 2.1ms of p95 main-thread cost per 166.67ms tick — 1.3% of the frame budget — with 8 dropped ticks out of 2473 and no perceptible difference from camera-off.**

## The REQ-57 gate: human-verified numbers

Camera-on session, read off `[visual-capture] frame budget` at session end:

| Field | Value | Reading |
|---|---|---|
| `thread` | `worker` | The worker path produced these numbers, not the fallback |
| `delegate` | `GPU` | GPU delegate won inside the worker |
| `tickCostKind` | `worker-roundtrip` | So `meanTickMs`/`p95TickMs` below are wall-clock, not main-thread |
| `dispatchMeanMs` | **0.6** | Mean main-thread cost per tick |
| `dispatchP95Ms` | **2.1** | p95 main-thread cost — **1.3% of the 166.67ms budget** |
| `meanTickMs` | 31.7 | Mean worker round-trip |
| `p95TickMs` | 36.1 | p95 worker round-trip — 21.7% of one tick interval |
| `droppedTicks` | 8 | **0.32%** of expected ticks |
| `processedSamples` | 2470 | |
| `expectedSamples` | 2473 | **99.88% capture** |
| `models` | 1 | |
| `tickIntervalMs` | 166.67 | 6 Hz |

Human verification (blocking checkpoint, Task 3): the camera-off baseline and
the camera-on run were reported as feeling equally good — no avatar video
judder, no audio dropout, no added push-to-talk reply latency.

**Verdict: approved.** `droppedTicks` at 0.32% is far below the "more than a
few percent" tuning trigger the plan set, and the main-thread figure the
requirement actually turns on is ~1% of budget.

## Headroom for 12-05

The gate's purpose was to decide whether three more models may be added. It can.

- **Main thread:** adding tenants does not change per-tick main-thread cost at
  all. The dispatch segment is one `createImageBitmap` + one `postMessage`
  regardless of which model the tick belongs to. 2.1ms p95 is the ceiling.
- **Worker:** `SCHEDULE[tickCount % SCHEDULE.length]` means one model runs per
  tick, so the per-tick worker budget stays 166.67ms no matter how many tenants
  are registered. Face uses 36.1ms p95 of it, leaving ~130ms for a heavier
  model on its own tick.
- **The real cost of more models is temporal resolution, not throughput.** With
  four tenants each signal samples at 1.5 Hz. That is acceptable for the
  multi-second episodes Phase 12 produces, but it is the number 12-05 should be
  designed against — not the frame budget, which is no longer the constraint.
- **Open for 12-05:** pose, hands, and object detection are each heavier than
  face. The 130ms of per-tick slack is ample on this machine's GPU delegate, but
  the CPU-delegate fallback path has not been measured with any model other than
  face. Worth a budget re-read on a CPU-delegate session once a second model
  lands, rather than assuming the GPU numbers transfer.

## Accomplishments

- **Task 1 (spike):** Option A — ES-module worker with a static
  `import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"` —
  worked on the first attempt under both `next dev --turbopack` and
  `next build` (webpack). The package's `exports` map resolves its real ES
  module build (`vision_bundle.mjs`), so the `importScripts` pitfall the
  research flagged never arose; it is specific to the UMD `vision_bundle.js`.
  Options B (classic worker + vendored bundle) and C were therefore never
  needed, and no new asset was added to `public/mediapipe/`.
- **Task 2 (migration):** `detectForVideo` moved across a typed message
  contract (`init` / `detect` / `close` ↔ `ready` / `init-error` /
  `detect-result` / `detect-error` / `closed`). Primary-face selection and the
  head-pose matrix decode moved into the worker so the landmark arrays never
  cross back; the yaw/pitch threshold comparison stayed on the main thread
  where its constants live. All accumulation and derivation are untouched, and
  every pre-existing guard (track `readyState`, the `videoEl.readyState < 2`
  skip, `MAX_CONSECUTIVE_DETECT_ERRORS`, the face-state debounce) stayed
  exactly where it was.
- **Task 3 (gate):** passed, numbers above.
- Two follow-up corrections landed during review: the budget line could not
  previously tell you which thread produced it (`3f5e6c1`), and `meanTickMs`
  silently measured two different quantities on the two paths while its comment
  claimed otherwise (`c83f6d6`). Both were defects that would have let a
  reviewer approve this gate off the wrong number.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint lib/metrics` — 0 errors (241 prettier/padding warnings, matching
  the pre-existing baseline across every file in the directory).
- `npx tsx scripts/verify-visual-metrics.ts` — all checks passed, exit 0. The
  pure-function surface is untouched by this plan.
- `next build` (webpack) succeeds — the plan explicitly rejects a worker path
  that only works under Turbopack dev.
- **REQ-58 grep proof:** every `postMessage` originating in
  `visual-capture.worker.ts` carries either a status string, a reason string,
  or the flat scalar `FaceDetectResult`. No `faceLandmarks`, `landmarks`,
  `ImageBitmap`, or `OffscreenCanvas` identifier appears in any outbound
  payload. The received `ImageBitmap` is `.close()`d on the same message in
  all three branches (success, unsupported-model, and the catch).
- Fallback path exercised by forcing a worker-URL failure: the session still
  measures and logs `thread: "main"`, with `dispatchMeanMs`/`dispatchP95Ms`
  correctly null (on that path `meanTickMs` already IS main-thread time).

## Requirements — progressed, not completed

Both REQ-57 and REQ-58 stay unchecked in `REQUIREMENTS.md`, matching the
split-requirement precedent this phase has used throughout:

- **REQ-57** ("running four models does not degrade the live session") — one
  model runs. The budget is proven, inference is off the main thread, and the
  scheduler exists, which is everything this plan can own; the requirement's
  actual claim is only testable once 12-05 registers the other three.
- **REQ-58** ("no frame, landmark array or media blob ... every new signal
  reaches the server as a derived scalar") — the worker boundary now enforces
  this structurally for face, and the enforcement generalises to any model
  added later. But there are no new signals yet, so the requirement's own text
  has nothing to be true about until 12-06/12-07 ship producers.

## Next

12-05 may proceed to add pose, hands, and object detection to `SCHEDULE`.
