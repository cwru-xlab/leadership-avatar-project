# Phase 12: Embodied Visual Signals - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the body measurable. Phase 10's pipeline runs exactly one model
(`FaceLandmarker`) and can only see a face — `VISUAL_NOT_MEASURED` in
`lib/metrics/types.ts` names what that costs. This phase adds hand and arm
movement, body posture, fidgeting, and a phone in frame, each tied to timecodes
on the existing episode timeline.

**Not a rewrite.** The metric contract, the liveness-vs-detection split, the
episode timeline and the consent posture all survive unchanged. This phase adds
producers to an existing pipeline.

**Out of scope:** identifying WHICH gesture was made. See Deferred Ideas.

</domain>

<decisions>
## Implementation Decisions

### Gesture interpretation

- **Gesturing is a curve, not a flag.** Three bands: too still / well-judged /
  excessive. Moderate gesturing reads as engagement; both extremes are
  reportable. This is NOT a one-sided "distracting" detector.
- **Stillness is a real finding.** Very low movement surfaces the same way
  monotone volume does — flat delivery is feedback, not silence.
- **Hands-near-face is its own signal**, separate from general gesticulation.
  Covering the mouth or touching hair while answering is specific and
  actionable; "you gestured a lot" is not the same observation.
- **Wording: describe the motion, then ask a question.** "Sustained large hand
  movement from 2:10–2:45 — was that intentional emphasis?" The report must NOT
  assert an effect on the interviewer ("this pulls attention away from what
  you're saying"), because no sensor here measured a viewer's attention.
- The threshold for "excessive" must be tuned against real session recordings,
  not picked up front.

### What is scored vs described

| Signal | Treatment |
|---|---|
| Posture (drift) | **Scored** |
| Posture (absolute reading) | Described |
| Gesture rate / stillness | **Scored** |
| Hands near face | **Scored** |
| Fidgeting | **Described, never scored** |
| Phone in frame | **Described, never scored** |

- **Fidgeting is reported but never graded.** It overlaps heavily with stimming,
  ADHD and anxiety presentations. "Your hands were in motion for 60% of the
  session" is useful self-awareness; a deduction for it is not defensible if a
  student challenges it.
- **A phone in frame is an observation, not an inference.** "A phone was visible
  for 40 seconds" is what the sensor saw. "You were distracted" is a claim about
  attention it cannot support. Not scored — a phone sitting on the desk in shot
  is not misconduct.
- **Descriptive signals live in a separate section**, not inline with scored
  rows carrying a "not scored" tag. The two must never share a list.

### Posture and fair measurement

- **The GRADE comes from drift against the student's own opening posture**, not
  from a fixed upright ideal. Calibrate from the opening of the session and
  score degradation from there. A student who progressively slumps gets
  feedback; a student who simply sits differently does not.
- **The absolute reading is still produced and still shown** — in the unscored
  Observations section, never as a grade.
- **This is how the fairness question is handled.** Because the scored baseline
  is always the student's own, a wheelchair user, someone with chronic pain or a
  spinal condition, or someone at a standing desk needs no opt-out and no
  disclosure. Resolved deliberately: an earlier pass through this discussion
  paired a fixed ideal with "self-calibration handles fairness", which do not
  work together — a fixed ideal gives nobody a baseline of their own.
- **Partial bodies score what is visible.** A typical webcam interview is
  head-and-shoulders, so hips are often out of frame. Shoulder line and
  forward-head work from the upper body alone; lean and torso openness are
  skipped rather than faked. Partial feedback beats none.
- **Posture comments always state which signals were available.** Unlike the
  existing coverage disclosure (which surfaces only when coverage is poor), a
  posture comment names what was measured every time.
- **No finer-grained opt-out.** Camera on means all signals. The session-start
  camera decision stays the single consent surface.

### Report surfacing

- **Scored body signals group under a "Body language" subheading** within the
  visual bands, separate from the camera/environment rows (Eye contact, Framing,
  On camera, Lighting). The new capability should be legible as a thing, not
  dissolve into an eight-row list.
- **The unscored Observations section sits at the bottom of the Delivery tab** —
  with the related delivery feedback, well clear of the score cards.
- **Moments rows are tagged by kind**, so body-language moments are
  distinguishable from camera/environment ones in one chronological timeline. A
  student should be able to see which kind of problem clustered where.

### Claude's Discretion

- Threshold values for every band (gesture rate, amplitude, drift magnitude,
  fidget frequency) — to be set from recorded sessions, not guessed.
- The calibration window length for the posture baseline.
- Episode naming, band wording, and the exact copy for the Observations section.
- Whether `HolisticLandmarker` replaces separate pose/hand runners.
- All performance work: staggered per-model sampling, the Web Worker migration.

</decisions>

<specifics>
## Specific Ideas

- The phase exists because a real session spent waving both arms produced a
  report that said nothing about it — correctly, since nothing could see it.
- An earlier session with several people in frame gesturing obscenely scored
  3/5 "Solid" and was *commended* for "minimal obvious fidgeting or posture
  concerns". That defect — absence of a flag read as verified-clean — is the
  thing this phase must not reintroduce while adding flags.
- "Describe + ask a question" was chosen over "describe + likely effect"
  specifically to avoid asserting something unmeasured, consistent with the
  discipline already enforced elsewhere in the pipeline.

</specifics>

<deferred>
## Deferred Ideas

**Identifying WHICH gesture was made.** `GestureRecognizer`'s canned vocabulary
is seven innocuous categories (Open_Palm, Closed_Fist, Pointing_Up,
Thumb_Up/Down, Victory, ILoveYou) and will never flag an offensive gesture. A
custom classifier needs labelled training data of the exact thing being caught.
The realistic path is a trigger-only frame sent to a multimodal model — cost is
negligible (~$0.01/session on the existing key), but the blockers are consent,
not implementation: `lib/metrics/ingest.ts` rejects media-shaped payloads by
design, and the consent dialog promises nothing leaves the browser, with no
revoke path. That is an IRB conversation.

**Background assessment.** `ImageSegmenter` can isolate the background. The
factual half (someone walking behind the student) is fair game; judging a
background as "unprofessional" is largely a judgment about someone's housing, so
`background_environment` stays in `VISUAL_NOT_MEASURED` for the aesthetic half
permanently.

**Per-signal opt-out.** Explicitly rejected for this phase — camera on means all
signals. Revisit only if students raise it.

</deferred>

<flags_for_planner>
## Flags for the Planner

1. **Sequence the frame budget first.** Four models at 6 Hz will not coexist
   with the HeyGen WebRTC stream (REQ-49/REQ-57). Staggered per-model sampling
   and a Web Worker with `OffscreenCanvas` are prerequisites, not
   optimisations. Prove the budget against a live session before adding the
   second model.
2. **`stop()` becoming async is a breaking change.** Both session surfaces await
   it on the finish path alongside `drain()`. Budget for the call-site churn.
3. **REQ-53 changed shape during this discussion.** It was written as an inline
   "not scored" marker; the decision is a *separate section*. Update the
   requirement before planning against it.
4. **Steadiness now overlaps with real posture data.** `high_head_movement` is a
   face-bounding-box proxy that genuine pose landmarks supersede. Both were
   deliberately kept for now — flag retiring `Steadiness` once posture proves
   out, rather than shipping two movement signals of different quality
   indefinitely.
5. **Primary-subject selection already exists** for faces (largest bounding box,
   `runTick` in `lib/metrics/visual-capture.ts`). Pose and hands need the same
   discipline for the same reason: with more than one person in frame, index
   order is not stable between frames and two people's measurements would
   interleave silently.
6. **Keep the pure-function seam.** `computeVisualRates` and `extractEpisodes`
   are exported for `scripts/verify-visual-metrics.ts` precisely because the
   divide-by-face-detected bug survived to production by being reachable only
   through a live camera. New derivations should be testable the same way.
7. **Models are vendored, not CDN-loaded** — `hand_landmarker.task` (~8MB),
   `pose_landmarker_lite.task` (~6MB), `efficientdet_lite0.tflite` (~4.4MB) into
   `public/mediapipe/`, matching the existing `face_landmarker.task` convention.
   No new npm dependency: `@mediapipe/tasks-vision@1.0.1` already ships every
   task required.

</flags_for_planner>

---

*Phase: 12-embodied-visual-signals*
*Context gathered: 2026-10-01*
