# 10-10 Summary — Case-Play Scenario Capture Wiring

**Plan:** 10-10
**Status:** Complete
**Wave:** 5
**Completed:** 2026-09-22

## What shipped

`app/case-play/[caseId]/page.tsx` — the scenario player now drives the full capture
pipeline built in waves 1-4:

- **Camera-mode choice on the intro screen**, before the session, with the consent
  dialog gating it. Denied permission blocks with an explanation offering a switch to
  camera-off; a deliberate camera-off proceeds with notice. Two distinct states,
  neither a dead end. No mid-session camera toggle exists anywhere.
- **Turn-level vocal accounting (REQ-44):** `recordTypedTurn()` on the typed path
  (line ~1113), `submitSpokenTurn(audioBlob, elapsedMs)` on the push-to-talk path
  (line ~1278). Both gated on `isScenario`, so admin case studies are untouched.
- **Metrics submitted on finish** as `metrics: { cameraMode, visual, vocal }`.
- **Live affordances:** `SelfViewThumbnail` and `FaceDetectionBanner` as
  fixed-position overlays, scenario-only. The banner folds away the moment the face
  is detected again. Neither scores nor coaches.

## Why turn-level accounting is required here

Two controls exist in `/case-play` and they behave differently:

1. **Camera mode** — chosen before the session and LOCKED.
2. **The Text/Avatar toggle** — pre-existing, NOT locked, may change mid-session.

Because (2) can change mid-run, vocal accounting tags each turn as it happens and
`resolveVocalOutcome` decides from the aggregate. A mixed session scores on its
spoken portion only. This is what lets the toggle stay unlocked without corrupting
the metric.

Typed answers leave Vocal UNMEASURED, never penalized — deliberately NOT symmetric
with the camera case, where an undetected face scores DOWN. That asymmetry is a user
decision, not an oversight.

## Commits

- `d736f29` feat(10-10): camera-mode choice on the scenario intro screen
- `3942da8` feat(10-10): wire scenario capture lifecycle, turn accounting and affordances

## Verification

- `npx tsc --noEmit` clean.
- All three metric components render (`MetricsConsentDialog`, `SelfViewThumbnail`,
  `FaceDetectionBanner`).
- Turn-tagging calls present on both paths, both gated on `isScenario`.
- `app/api/interaction/` confirmed diff-empty across Phases 9 and 10 — admin case
  studies unaffected.

## Execution note — honest account

This plan took four attempts. Three ended in infrastructure failures (network
ENOTFOUND, a session limit, and an earlier stall), none caused by defects in the work.

Critically, at the point of the second failure the agent's own progress report implied
it was at the verification stage, but a direct check found **neither turn tagging nor
metrics submission had been written** — the two things this plan exists to deliver.
Had that self-report been taken at face value, scenario runs would have shipped
producing no vocal metrics at all. The gap was identified by grepping the actual diff
rather than trusting the summary.

The orchestrator completed the final piece (rendering the two live affordances, which
were imported and state-wired but never placed in the JSX) directly after the fourth
failure.

## Limitation — not verified

True browser end-to-end verification was NOT performed: camera permission prompts, a
live HeyGen avatar session, and visual confirmation of the banner and self-view.
Reasons, recorded rather than glossed:
- No browser automation available in the execution environment.
- Turbopack refuses a second `next dev` instance (shared `.next` lock).
- The running port-3000 server points at the SHARED database, which lacks the Phase 10
  migration — it returns a live 500 on `/api/metrics/consent`.

10-11's human walkthrough must cover this. See the orchestrator note about needing a
dev server pointed at the LOCAL dev database.

## Requirements

Advances REQ-35, REQ-36, REQ-37, REQ-38, REQ-43, REQ-44, REQ-49. Checkboxes left for
10-11 to tick after human validation, matching the established phase precedent.
