# Phase 12: Embodied Visual Signals - Context

Phase 10 built a visual pipeline that can only see a face. Everything below the
neck is invisible by construction: the engine runs exactly one model
(`FaceLandmarker`), and `VISUAL_NOT_MEASURED` in `lib/metrics/types.ts` names
what that costs — `hand_gestures`, `body_posture`, `fidgeting`,
`phone_checking`, `background_environment`.

This phase makes the body measurable.

## Phase Boundary

**In scope:** hand and arm movement, body posture, fidgeting as a descriptive
signal, a phone visible in frame, and the frame-budget work those require.

**Out of scope:** identifying WHICH gesture was made. See "The semantic gap"
below — it is the one thing in this space that landmarks cannot deliver, and
pretending otherwise is how this phase would repeat Phase 10's worst defect.

**Not a rewrite.** The metric contract, the liveness-vs-detection split, the
episode timeline and the consent posture all survive unchanged. This phase adds
producers to an existing pipeline.

## What prompted it

A real session in which the student waved their arms around for a sustained
stretch produced a report that said nothing about it — correctly, because
nothing could see it. An earlier session with several people in frame gesturing
obscenely scored 3/5 "Solid" and was *commended* for having "minimal obvious
fidgeting or posture concerns", because an empty `posture_flags` array read as
"we looked and it was fine".

Phase 10's fix was to stop claiming what was not measured. This phase is the
other half: measure it.

## Implementation Decisions

### Everything needed is already installed

`@mediapipe/tasks-vision@1.0.1` ships `PoseLandmarker`, `HandLandmarker`,
`GestureRecognizer`, `HolisticLandmarker`, `ObjectDetector` and
`ImageSegmenter`. No new dependency. Model files are vendored into
`public/mediapipe/` beside the existing `face_landmarker.task`, matching the
self-hosted, no-CDN convention already established there:

| Model | Size | Signal |
|---|---|---|
| `hand_landmarker.task` | ~8MB | 21 landmarks/hand |
| `pose_landmarker_lite.task` | ~6MB | 33 body landmarks |
| `efficientdet_lite0.tflite` | ~4.4MB | COCO 80 classes, incl. `cell phone` |

### The frame budget gates everything (REQ-57)

Four models at 6 Hz will not coexist with the HeyGen WebRTC stream. REQ-49
exists precisely because this pipeline must never compete with the avatar for
the main thread, and Phase 10 bought that headroom by running a single model.
Two changes are prerequisites, not optimisations:

- **Staggered sampling.** Only gaze needs 6 Hz. Posture is fine at 2 Hz, hands
  at 3 Hz, phone detection at 0.5 Hz. Different models on different ticks via a
  modulo schedule, not every model every tick.
- **Web Worker + `OffscreenCanvas`.** Inference moves off the main thread. This
  is the largest single piece of work in the phase and the one most likely to
  surprise: the WASM runtime and the video source both need rehosting, and
  `VisualCaptureHandle.stop()` becomes async, which every caller must absorb.

`HolisticLandmarker` is worth benchmarking first — it produces face, pose and
hands from one graph and may beat three separate runners outright.

### The semantic gap (REQ-50)

`GestureRecognizer`'s canned vocabulary is seven innocuous categories —
Open_Palm, Closed_Fist, Pointing_Up, Thumb_Up/Down, Victory, ILoveYou. **It will
never identify an obscene gesture.** A custom classifier via MediaPipe Model
Maker would require building labelled training data of the exact thing being
caught.

So this phase measures gesture BEHAVIOUR — rate, amplitude, position — and must
never describe itself as recognising gesture MEANING. Semantic reading needs a
frame to leave the device, which is a separate consent decision (see Deferred).

### Fidgeting is reported, never scored (REQ-52, REQ-53)

It is measurable: high-frequency low-amplitude motion in hand and shoulder
landmarks. It should not carry a grade.

Fidgeting overlaps heavily with stimming, ADHD and anxiety presentations, and
gesture norms vary culturally. "Your hands were in motion for 60% of the
session" is genuinely useful self-awareness. A deduction for it is not
defensible if a student challenges it, and this is a graded assessment at a
university. Describing is fine; penalising is not.

This forces REQ-53: the report must visibly separate scored from descriptive
rows before this signal can land, or an unscored observation reads as a
deduction anyway.

### Phone detection is an observation, not an inference (REQ-54)

COCO's `cell phone` class plus a gaze-down confirmation avoids flagging a phone
merely sitting on the desk. Report it factually — *"a phone was visible in frame
for 40 seconds"*. *"You were distracted"* is a claim about attention that no
sensor here supports.

### Absence still proves nothing (REQ-56)

`VISUAL_NOT_MEASURED` shrinks as each pipeline lands, down to
`["background_environment"]`. The constant's doc comment already states entries
leave only when something genuinely measures them.

The rule that an unflagged session means *not observed*, never *verified clean*,
survives untouched. That rule is what Phase 10 was built around and what the
original 3/5 commendation violated.

### Everything lands on the timeline (REQ-55)

New signals extend `VISUAL_EPISODE_KINDS` rather than adding session-wide
averages: `high_gesticulation`, `hands_near_face`, `slouching`,
`phone_visible`. Session averages are unactionable — a student restless through
one answer reads identically to one restless throughout. The episode
infrastructure, `capture_offset_s` and the Moments tab already exist.

### Privacy posture is unchanged (REQ-58)

Still derived scalars. No frame, landmark array or blob leaves the browser or
outlives its tick. `lib/metrics/ingest.ts`'s media-shape rejection and the
consent copy stay byte-identical. More landmarks are computed per tick; none
are retained.

## Deferred Ideas

**Trigger-only vision frames.** When an on-device heuristic trips (second face,
hands raised with high motion, phone detected), send ONE frame to a multimodal
model for semantic review. This is the only realistic path to identifying a
specific gesture. Cost is negligible — at `detail: "low"` an image is a flat 85
tokens, so 0-5 frames/session is ~$0.01 on the existing `OPENAI_API_KEY`, no new
procurement.

Deferred because the blockers are not technical: `lib/metrics/ingest.ts` rejects
media-shaped strings by design so frames need a separate transport, and
`components/metrics/MetricsConsentDialog.tsx` plus `User.videoAnalysisConsentAt`
currently promise nothing leaves the browser, with no revoke path. That is a
consent and IRB conversation, not an implementation one.

**Background assessment.** `ImageSegmenter` can isolate the background, and
motion behind the student (someone walking through) is a factual, useful signal.
Judging a background as *unprofessional* is substantially a judgment about
someone's housing — a student in a dorm or shared apartment is not less
professional than one with a home office. If this is picked up, the factual half
only; `background_environment` stays in `VISUAL_NOT_MEASURED` for the aesthetic
half permanently.

## Flags for the Planner

1. **Sequence the worker first.** B-series signals are cheap individually and
   worthless if the avatar stutters. Land staggering + the worker, prove REQ-57
   against a live session, then add models one at a time.
2. **`stop()` becoming async is a breaking change.** Both session surfaces await
   it on the finish path alongside `drain()`. Budget for the call-site churn.
3. **REQ-53 blocks REQ-52.** The scored/descriptive distinction is report work,
   not metrics work, and must land before fidgeting data is exposed.
4. **Primary-subject selection already exists** for faces (largest bounding box,
   `runTick` in `lib/metrics/visual-capture.ts`). Pose and hands need the same
   discipline, and for the same reason: with more than one person in frame, index
   order is not stable between frames and two people's measurements would
   interleave silently.
5. **Keep the pure-function seam.** `computeVisualRates` and `extractEpisodes`
   are exported for `scripts/verify-visual-metrics.ts` precisely because the
   divide-by-face-detected bug survived to production by being reachable only
   through a live camera. New derivations should be testable the same way.
