
## 10-02: pre-existing tsc error in sibling in-progress file (out of scope)

`app/api/audio/word-metrics/route.ts:116` fails `tsc --noEmit` with
`WordMetricsResponseBody` not assignable to `Record<string, unknown>`. This
file is untracked WIP belonging to a concurrently-executing sibling plan
(10-03/10-04 territory), not touched or created by 10-02. Confirmed via
`git stash -u` that `tsc --noEmit` is clean with that file removed, and
errors identically regardless of whether 10-02's own changes are present.
Out of scope per the deviation-rules scope boundary — not fixed here.

## 10-05: pre-existing tsc errors in sibling in-progress files (out of scope)

`lib/interview/evaluation-runner.ts:82` and `lib/interview/evaluation.ts:221`
fail `tsc --noEmit` (missing `visualMetrics`/`vocalMetrics` on
`EvaluationInput`, and an arity mismatch). These files are modified WIP
belonging to a concurrently-executing sibling plan (10-06/10-07/10-08
territory widening the evaluator contract), not touched by 10-05. Confirmed
via `git stash push -u -- middleware.ts app/api/metrics` that the identical
errors are present with 10-05's own changes fully removed. Out of scope per
the deviation-rules scope boundary — not fixed here.
