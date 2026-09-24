# 10-07 Summary — Finish-Route Metric Ingestion + Both Runners

**Plan:** 10-07
**Status:** Complete
**Wave:** 4
**Completed:** 2026-09-22

## What shipped

- `lib/metrics/ingest.ts` — bounded scalar payload validation. Structurally rejects
  any payload shape that is not plain derived numbers, so no media can reach the
  server even if a client tried (REQ-38 enforced server-side, not just by client design).
- `app/api/interview/session/finish/route.ts`, `app/api/scenario/session/finish/route.ts` —
  ingest the aggregated metrics submitted at session end.
- `lib/interview/evaluation-runner.ts`, `lib/scenario/evaluation-runner.ts` — both now
  parse their own stored `Json?` columns back through the SAME ingest discriminator,
  apply `resolveVisualOutcome`/`resolveVocalOutcome`, hand metrics to the evaluator
  ONLY when the outcome says scored, and persist the unscored reason.

Both `TODO(10-07)` placeholder markers left behind by plan 10-06 are resolved.
The historical third force-to-null site (`lib/interview/evaluation-runner.ts`, which
hardcoded `visualScore: null, vocalScore: null` in its Prisma update independently of
the evaluation module) now sources real values.

## Commits

- `3fbb522` feat(10-07): ingest bounded scalar metrics payload at finish
- `deb6c91` feat(10-07): persist real visual/vocal scores and reasons on interview reports
- `0a217f1` feat(10-07): persist real visual/vocal scores and reasons on scenario reports

## Verification — Task 2, verbatim results

The plan names case 2 the single most important result in the phase. All five
assertions pass:

| Case | Expected | Result |
|---|---|---|
| Camera ON, `face_detected_samples: 0`, healthy liveness | REAL SCORE | PASS — `scored=true, reason=null` |
| Track death (`track_live_seconds/session_seconds < 0.5`) | INSUFFICIENT_DATA | PASS |
| `analyzer_error: true` | INSUFFICIENT_DATA | PASS |
| Camera OFF (deliberate opt-out) | CAMERA_OFF_OPTOUT | PASS |
| Typed-only session | vocal unmeasured, NOT penalized | PASS — `TYPED_ONLY` |

Poor performance and technical failure are provably distinct paths. A camera-on
session whose face was never detected produces a real low score; only a dead
pipeline is unscorable.

`npx tsc --noEmit` clean. `grep -c "TODO(10-07)"` returns 0 across `lib/` and `app/`.

## Legacy safety (ROADMAP criterion 2)

A legacy row has `cameraMode === null`. Both runners guard the reason writes on that,
so legacy rows keep BOTH reason columns null and continue to render "Not yet measured"
rather than being mislabelled as a deliberate opt-out. This is what keeps REQ-48
(legacy reports unchanged) from colliding with REQ-45 (a stored, never-re-derived cause).

## Execution note

This plan was executed across three sessions. The first two agent runs ended in
infrastructure failures — a host sleep event, then a stream stall — not defects in the
work. Task 1 survived the first interruption uncommitted and was committed on resume;
the orchestrator completed the scenario runner and verification directly after the
second failure rather than resume a third time. No work was lost or duplicated.

## Requirements

REQ-38, REQ-41, REQ-42, REQ-44, REQ-45, REQ-47, REQ-48 are advanced by this plan.
Checkboxes remain unticked pending 10-09/10-10 wiring capture into the live session
surfaces, matching the established split-requirement precedent.
