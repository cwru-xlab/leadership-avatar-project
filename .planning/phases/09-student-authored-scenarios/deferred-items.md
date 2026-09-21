# Deferred Items — Phase 9 (Student-Authored Scenarios)

Out-of-scope discoveries logged during plan execution but not fixed, per the
scope-boundary rule (only fix issues directly caused by the current task).

## From 09-08 (scenario report page)

- **Scenario evaluation runner appears to miss a real transcript.** During
  live verification, a scenario run's `finish` request included a populated
  `roleInteractions` transcript (six messages, one role), but
  `runScenarioEvaluation`'s markdown output stated "there is no substantive
  transcript available for this roleplay" and scored Content/Behavioral at
  1/5 accordingly. This is pre-existing behavior in
  `lib/scenario/evaluation-runner.ts` / `lib/scenario/evaluation.ts` (09-03/
  09-04, both already complete) — possibly a transcript-flattening or
  role-key-matching issue between the S3 log's `roleInteractions` keys and
  what the evaluator reads. Not fixed here: 09-08's scope is the report
  *page*, and the DTO/page correctly rendered whatever the runner produced
  (READY status, null visual/vocal, numeric content/behavioral, rendered
  markdown) — the page's own contract was satisfied. Worth a follow-up
  investigation before Phase 9 sign-off if real (non-synthetic) scenario
  runs are expected to grade meaningfully.
