# Phase 12 — Deferred Items

## 12-01: `windowTrips()` non-exhaustive switch (out of scope)

**Found during:** 12-01's final `npx tsc --noEmit` sweep.

**Symptom:**
```
lib/metrics/visual-capture.ts(276,66): error TS2366: Function lacks ending
return statement and return type does not include 'undefined'.
```

**Cause:** Sibling plan 12-02 (executing concurrently in the same working
directory, no worktree isolation) extended `VisualEpisodeKind` in
`lib/metrics/types.ts` with new kinds (`excessive_gesturing`,
`minimal_gesturing`, `hands_near_face`, `posture_drift`). `windowTrips()`'s
switch statement in `lib/metrics/visual-capture.ts` is not exhaustive over
the now-larger union.

**Why not fixed here:** `windowTrips()` and the new episode kinds' actual
window-trip conditions belong to whichever later Phase 12 plan implements
pose/hand capture (the kinds are meaningless without the pose/hand landmark
data that plan introduces) — 12-01's scope is strictly the async-`stop()`
and frame-budget instrumentation work. Per the scope-boundary rule, this is
a pre-existing/sibling-caused issue in a file outside 12-01's task set, not
something caused by 12-01's own changes. Confirmed via `git diff` that
12-01's edits never touch `windowTrips()` or `VisualEpisodeKind`.

**Status:** Not fixed. Expected to resolve once the plan that implements the
corresponding pose/hand episode logic lands (likely 12-04/12-05 per the
plan list).

## 12-01: sibling-file absorption into a 12-01 commit (git-index race)

**Commit:** `53681e8` ("feat(12-01): await the now-async visual-capture
stop() at all five teardown paths").

**What happened:** This commit was intended to contain only
`components/interview/InterviewSessionShell.tsx` and
`app/case-play/[caseId]/page.tsx` (`git status --short` immediately before
`git commit` showed exactly those two files staged, with `lib/metrics/bands.ts`
and `lib/metrics/ingest.ts` shown as unstaged). Sibling plan 12-02 staged its
own changes to those two files into the shared git index between that
`git status` check and the `git commit` call, and the commit absorbed them.

**Verification:** `git show --stat 53681e8` confirms sibling content
(`lib/metrics/bands.ts` +216/-?, `lib/metrics/ingest.ts` +128/-?) is present,
intact, and matches sibling 12-02's own work (diffed against 12-02's prior
commit `d348b08` — content is additive and consistent with 12-02's stated
scope). Nothing was lost or corrupted; the only effect is mis-attribution
(sibling's work landed under a 12-01 commit message instead of its own
12-02 commit). Per the documented hazard protocol, no `git reset` was
attempted.

## 12-08: Fidgeting retired to permanently not-measured (measurement-capability limit, not a tuning gap)

**Found during:** 12-08 Task 1 checkpoint, across three real session recordings.

**Symptom:** `fidget_pct` read 0% on every real recording regardless of
behaviour — a still session, a mixed session with real hand-near-face/
gesture activity the user confirmed happened, and a third session — even
after `FIDGET_MIN_DIRECTION_CHANGES_PER_S` was lowered once (1.5 -> 0.5
reversals/second) to fix what looked like a schedule-rate bug analogous to
`POSTURE_BASELINE_MIN_SAMPLES`'s.

**Real readings:**
- Mixed session (274.7s): `directionChangeRatePerS` 0.35 against the 0.5/s gate.
- A later session (73.5s): `directionChangeRatePerS` 0.15 against the same gate.

**Root cause (Nyquist-shaped, not a mistuned threshold):** Fidgeting is BY
DEFINITION small, fast motion. The hands model is one of four tenants on
`visual-capture.ts`'s `SCHEDULE = ["face", "pose", "face", "hands"]`,
receiving only 1/4 of ticks — its achievable rate is ~1.5 Hz. A reversal
requires a tick-to-tick direction comparison, so the fastest reversal
frequency this pipeline can even OBSERVE is bounded by that ~1.5 Hz tick
rate (roughly ~0.75/s at the conservative end of that bound). Real
fidgeting — the kind of motion the signal exists to describe — happens
materially faster than that. The sampler was never measuring fidget
frequency at all; it was ALIASING it, which is why the measured rate (0.35,
0.15) looked unrelated to what the user actually did in either session.
Lowering the gate further would not fix this — at the limit, a gate near or
below the aliasing noise floor would trip on ordinary hand motion, shipping
a noise detector wearing a fidget label on a signal shown to students about
stimming-adjacent behaviour (explicit user concern, carried from this
signal's original design decision in 12-CONTEXT.md).

**Decision:** User decided to retire `fidgeting` to permanently
not-measured for the rest of this phase, rather than continue tuning a
threshold that cannot be fixed by threshold-tuning. Implemented in 12-08:
`fidgeting` moved into `VISUAL_NOT_MEASURED` (permanent, not per-session
conditional) in `lib/metrics/types.ts`; `fidget_pct` removed from
`VisualDescriptiveObservations`; the `fidgeting` descriptive episode kind
removed from `VISUAL_DESCRIPTIVE_EPISODE_KINDS`; the "Hand motion" report
row removed; `FIDGET_MAX_AMPLITUDE`/`FIDGET_MIN_DIRECTION_CHANGES_PER_S`/
`FIDGET_EPISODE_TRIP_PCT` retired from `body-thresholds.ts`; both evaluator
prompts' HARD RULE ON observations text describing fidgeting as
describable self-awareness information removed, with the HARD RULE ON
not_measured text strengthened to state fidgeting is now ALWAYS present
there, every session, with no exception. REQ-52 (fidgeting measured and
reported-but-never-scored) is marked NOT MET in REQUIREMENTS.md with this
reasoning, not left silently checked.

**What a real fix would require (for a future phase to pick up
deliberately):** A materially higher hands model sample rate — enough
ticks per second that a tick-to-tick reversal comparison can actually
resolve real fidget-frequency motion, not just alias it. This is not a
constant change; it requires either giving hands a larger share of
`SCHEDULE` (at the cost of face/pose temporal resolution, which the
REQ-57 frame-budget work already treats as a scarce, contended resource
against the live HeyGen stream) or running hands on an independent,
faster-than-`METRICS_SAMPLE_HZ` timer the way object detection already
does on its own slower one — either path needs its own frame-budget gate
and live-session verification before it could ship, the same discipline
12-03/12-05 already established for adding a model to this pipeline at all.

**Status:** Not fixed — deliberately retired rather than fixed. Revisit
only as a new, scoped piece of work with its own frame-budget analysis,
not as a 12-08 threshold retune.
