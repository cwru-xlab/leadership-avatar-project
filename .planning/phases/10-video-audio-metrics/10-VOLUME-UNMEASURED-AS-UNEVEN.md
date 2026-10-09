---
phase: 10-video-audio-metrics
status: open
found: 2026-10-09
found_by: user's investor-deck UAT session during Phase 19's 19-11, report id e5875653-8391-4982-bf2d-b213f192aad9
severity: HIGH — a scored row asserts a delivery flaw that was never measured
class: Phase 12 criterion 3 ("nothing the pipeline cannot observe is described as absent")
---

# `volume_consistency: 0` means "not measured" but is reported as "Uneven"

## The defect

`lib/metrics/vocal-capture.ts:179` — `computeVolumeConsistency` returns **0** as a
sentinel for *insufficient signal*:

```ts
 * Returns 0 when there are fewer than
 * `RMS_MIN_ABOVE_FLOOR_SAMPLES` above-floor samples — not enough signal to
 * defend a consistency claim.
```
(`RMS_SPEECH_FLOOR = 0.01`, `RMS_MIN_ABOVE_FLOOR_SAMPLES = 20`)

`lib/metrics/bands.ts:197` — `bandVolume` treats 0 as the bottom of a real scale:

```ts
function bandVolume(consistencyRaw: number): string {
  const consistency = clampFinite(consistencyRaw, 0, 1);
  if (consistency < 0.5) return "Uneven";
  ...
```

So **"we could not measure this" renders as "Uneven"** — a scored judgement about
behaviour the pipeline never observed. `0` is indistinguishable from a genuine
reading of zero consistency, because the sentinel and the measurement share a
value.

## Observed in a real session

Report `e5875653-8391-4982-bf2d-b213f192aad9` (investor deck, 425s session,
8 spoken turns, **27.6s total speech**):

- `vocal.volume_consistency: 0` (session level)
- 6 of 8 turns at `volume_consistency: 0`; the other two at 0.06 and 0.02
- `coverage.spoken_seconds: 27.625`

With ~3.5s of speech per turn, most turns plausibly never reached 20 above-floor
samples. The student would be told their volume was **Uneven** on the strength of
audio that was never analysed.

## Why this is the Phase 12 defect again, in the vocal path

Phase 12 Success Criterion 3 states: *"Nothing the pipeline cannot observe is
described as absent, and nothing reported descriptively is scored."* Phase 12
spent **four plans** (12-08, 12-09, 12-10, 12-11) eliminating exactly this for
posture — the off-camera session that confidently reported *"Posture drift: Held
steady"*, then *"Shifted from the opening posture"*, before `isVisible` was
fixed to require in-frame coordinates and `POSTURE_COVERAGE_MIN_RATIO` was
raised to 0.60.

The vocal path has the same bug and it was never caught, for a specific reason:
posture's unmeasured state became `null`/unreadable and was therefore *visible*
as a gap, whereas volume's unmeasured state is `0` — a legal number that flows
through `clampNumber(…, 0, 1)` in `lib/metrics/ingest.ts:269,373` and lands in a
band without anything noticing.

## Fix shape (not applied — needs an owner)

1. **Separate the sentinel from the measurement.** `computeVolumeConsistency`
   should return `null` (or a discriminated `{ measured: false }`) when below the
   sample floor, not `0`. The metric contract already has an unscored/unmeasured
   concept from Phase 10 (`not_measured[]`) and Phase 12 (`unscored_reason`) —
   reuse it rather than inventing a parallel one.
2. **`bandVolume` must render the unmeasured state as unmeasured**, the way the
   Phase 10 four-state `ReportScoreCards` rewrite (10-08) already does for other
   rows, and must never emit "Uneven" for it.
3. **Add `volume` to `not_measured[]`** when it is not measured, so the evaluator
   is told it was not observed rather than inferring from a number.
4. **Check the same sentinel-vs-measurement confusion elsewhere in the vocal
   path** — `pause_count: 0`, `filler_count: 0` and `words_per_minute` on very
   short turns may have the same ambiguity (0 fillers measured vs 0 fillers
   because nothing was analysed). This file covers volume specifically; a sweep
   is warranted.
5. Per-turn rows in `components/metrics/DeliveryTimeline.tsx:105` render
   `volume {pct(turn.volume_consistency * 100)}` — that would show "volume 0%"
   for an unmeasured turn and needs the same treatment.

## Scope note

**Not a Phase 19 defect and not a Phase 19 regression** — the vocal capture
engine is Phase 10 (10-04) and the bands are 10-08. It surfaced during Phase 19's
UAT only because the user inspected a real report DTO. It does **not** block
Phase 19 sign-off; Phase 19's criteria concern the deck family.

A related observation worth carrying into any fix: the funding-request report's
OVERALL narrative said *"Vocal delivery was fast-paced with excessive fillers"*
while that session's measured `filler_word_count` was in the low single digits
in the comparable investor session (1, the word "right"). If the evaluator is
characterising fillers as "excessive" without the measured count constraining it,
that is the same family of problem — prose asserting more than the measurement
supports — and should be checked while the vocal contract is being repaired.
