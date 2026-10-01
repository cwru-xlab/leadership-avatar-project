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
