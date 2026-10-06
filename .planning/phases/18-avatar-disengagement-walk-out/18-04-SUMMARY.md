---
phase: 18-avatar-disengagement-walk-out
plan: 04
status: complete
requirements:
  - REQ-86
---

# Plan 18-04 Summary — Factual Walk-Out Reports

## Delivered

- Added a defensive `DisengagementDeclineRecord` narrower for the engine-owned
  `outcome.disengagementDecline` envelope. It accepts only finite values,
  time-ordered session-clock episodes, and the closed observable-cause
  vocabulary.
- Passed the validated decline record plus recorded termination fields to both
  pitch evaluator contexts. Both evaluator prompts now require any decline
  discussion to cite only supplied session-clock episodes and observable causes;
  they explicitly forbid inferring private listener or investor motivations.
- Updated the deck live prompt to permit the same cue/end-marker protocol as
  the policy, replacing its stale instruction that the investor could never end
  a meeting.
- Preserved proof-backed decline evidence across evaluation writes. A valid
  evaluator outcome is merged with the existing protected envelope; an invalid
  evaluator outcome preserves that envelope instead of replacing it with null.
- Added `DisengagementDeclinePanel`, a report-only panel that renders stored
  episode ranges on the existing `m:ss` session clock and maps only closed
  observable causes to reader-friendly language.
- Mounted the normal pitch outcome banner and decline panel through
  `ReportChrome` extras for both elevator and deck reports. A walk-out remains a
  READY report with a notable early-end outcome, never FAILED-evaluation chrome.
- Added a fixture-based report verifier for absent/malformed evidence, session
  timecodes, closed cause labels, outcome-banner framing, evaluator grounding,
  and evaluation-runner threading.

## Automated evidence

```text
npx tsx scripts/verify-disengagement-report.ts
# ALL PASS

npx tsc --noEmit --pretty false
# passed

git diff --check
# passed
```

## Operational boundary

No agent connected to any shared database, Lightsail database, Preview,
Production, Vercel configuration, or deployed application while completing
this plan.

## Follow-on

Plan 18-05 owns full local validation and the mandatory human UAT and
calibration checkpoint. It must not silently retune disengagement weights,
thresholds, or cue acceleration.
