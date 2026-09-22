---
phase: 10-video-audio-metrics
plan: 11
subsystem: testing
tags: [mediapipe, whisper, prisma, next.js, static-sweep, human-validation]

# Dependency graph
requires:
  - phase: 10-video-audio-metrics (10-01..10-10)
    provides: "the full capture/consent/evaluator/report pipeline this plan verifies end to end"
provides:
  - "A verbatim 22-point static constraint sweep against the correctly-resolved Phase 10 baseline (c2d55b9), all PASS"
  - "A live seven-assertion re-verification of the liveness-vs-performance discriminator (lib/metrics/coverage.ts), not taken on the 10-01 SUMMARY's trust"
  - "A real two-session human walkthrough closing Phase 10, including one real defect (orphaned camera streams) found and fixed under the checkpoint"
  - "Phase 10 sign-off: REQ-35..REQ-49 ticked, ROADMAP Phase 10 marked complete"
affects: ["Phase 11 (Cohort & Staff Teardown) — Phase 10 is now a closed dependency"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Camera-stream-start guards need a SYNCHRONOUS in-flight flag, not just a post-await ref check, whenever an external event (an avatar reconnect) can re-invoke the start path while the first request is still pending — the async gap between 'decided to start' and 'ref assigned' is exactly where a duplicate acquisition slips through."

key-files:
  created: []
  modified:
    - ".planning/REQUIREMENTS.md (REQ-35..REQ-44, REQ-47, REQ-49 ticked; REQ-45/46/48 already ticked by 10-08)"
    - ".planning/ROADMAP.md (Phase 10 checkbox, all 11 plan checkboxes, progress table row)"
    - ".planning/STATE.md (Phase 10 COMPLETE section, Current Position -> Phase 11)"
    - "components/interview/InterviewSessionShell.tsx (checkpoint fix, commit 5c7a2bd)"
    - "app/case-play/[caseId]/page.tsx (checkpoint fix, commit 5c7a2bd)"

key-decisions:
  - "REQ-49 (no avatar degradation) is ticked on the user's own direct judgement ('still good enough') after two real camera-on interviews, not on an instrumented measurement — recorded with an explicit caveat and carried forward as a future-phase performance item (GPU vs CPU delegate)."
  - "Steps 13-15 (docked-vs-insufficient-data, the phase's hardest distinction) were never exercised live: verified only by the seven unit-level discriminator assertions re-run in this plan. Accepted as sufficient for sign-off given the user's overall approval, but named explicitly as an un-run walkthrough step rather than silently claimed as tested."
  - "A real defect (orphaned getUserMedia streams keeping the camera light on after End) was found from the user's own bug report during this checkpoint and fixed in commit 5c7a2bd, following the 07-07/08-08/09-09 precedent of finding and fixing exactly one real bug under the human-verify checkpoint. The fix is reasoned from the code, not yet re-confirmed on hardware."

requirements-completed: [REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46, REQ-47, REQ-48, REQ-49]

duration: ~50min
completed: 2026-09-22
---

# Phase 10 Plan 11: Static Sweep + Human Validation Summary

**All 22 Phase 10 static constraints verified clean against the correct pre-10-01 baseline (`c2d55b9`), the liveness-vs-performance discriminator re-verified with seven live assertions (not taken on trust), and Phase 10 closed out after a real two-session human walkthrough that found and fixed one genuine defect: orphaned `getUserMedia` streams keeping the camera light on after End.**

## Performance

- **Tasks:** 3 (static sweep, human checkpoint, close-out)
- **Files modified this plan:** 2 code files (checkpoint fix) + 3 planning docs (REQUIREMENTS.md, ROADMAP.md, STATE.md)
- **Commits referenced:** `6ff03ee` (pre-existing teardown-ordering fix, already landed before this plan's sweep concluded), `5c7a2bd` (this plan's checkpoint fix), plus this plan's own docs commit

## Accomplishments

- Resolved the Phase 10 baseline correctly as `c2d55b9` (the commit immediately before `fb35bc5`, 10-01's first commit) — not `main`, matching the correction 07-07/08-08/09-09 each made.
- Ran and recorded all 22 static checks verbatim; every one PASSED with no fixes required from the static sweep itself.
- Re-ran plan 10-01's seven liveness-vs-performance discriminator assertions live via a throwaway `tsx` script rather than trusting the earlier SUMMARY's claim — all seven passed, confirming `resolveVisualOutcome` still never reads `face_detected_samples` in its decision path.
- Re-ran `tsc --noEmit` and re-confirmed static checks 5, 17 and 19 after two commits (`6ff03ee`, `5c7a2bd`) landed mid-sweep in response to the user's real-hardware testing — all still hold.
- Ran the human checkpoint against two real camera-on interviews the user had already conducted against a live HeyGen avatar, characterizing honestly which of the 24 walkthrough steps were directly evidenced versus accepted without being separately run.
- Found and fixed a real defect under the checkpoint: a race between an avatar reconnect's `CONNECTED` event and an in-flight `getUserMedia()` call could acquire two camera streams, orphaning the first with no reference left to stop it — the root cause of the camera light staying on after End (and, per the user, possibly other exits too, since every exit path only ever stopped the reachable stream).
- Closed out Phase 10: all 15 requirement IDs (REQ-35..REQ-49) ticked, ROADMAP Phase 10 and all 11 plan checkboxes marked complete, STATE.md updated with Phase 10 COMPLETE and Current Position moved to Phase 11.

## Task 1 — Static Constraint Sweep (verbatim, all 22 PASS)

**Baseline:** `c2d55b9` (commit immediately before `fb35bc5`, 10-01's first commit).

1. **`npx tsc --noEmit`** — clean (exit 0). Re-run twice more after `a2ae495` and after `6ff03ee`/`5c7a2bd` landed mid-checkpoint; clean every time. `npx eslint lib/languages.ts` reconfirmed pre-existing repo-wide broken (`ESLint configuration in » plugin:@next/next/recommended is invalid: Unexpected top-level property "name"`) — same failure class every prior phase logged, not caused by this branch. `tsc` used as authoritative per project convention.
2. **`npx prisma validate`** — `The schema at prisma/schema.prisma is valid 🚀`.
3. **Exactly one new migration** since baseline: `20260922134512_add_video_audio_metrics`. Its SQL is three `ALTER TABLE ... ADD COLUMN` blocks (`InterviewReport`, `ScenarioReport`, `User`); grep for `NOT NULL`/`DROP`/`CREATE TABLE` returned nothing.
4. `.env`/`.env.local` diff since baseline is empty (`git log --oneline c2d55b9..HEAD -- .env .env.local` → nothing); every phase-10 SUMMARY's migrate command used the inline `postgresql://ajabreu79@localhost:5432/leadership_avatar_dev`. `npm run setup` was never run at any point in this plan.
5. **No media retention:** `grep -rn "MediaRecorder\|captureStream\|toDataURL\|toBlob" lib/metrics/ components/metrics/ app/api/metrics/ app/api/audio/word-metrics/` returned only two doc-comment lines in `visual-capture.ts` stating these APIs are never used. `components/HeyGenAvatar/InteractiveAvatar.tsx` diff against baseline is empty (re-confirmed after `5c7a2bd`).
6. **No student media to S3:** `grep -rn "saveInterview\|s3Storage\|S3Client" lib/metrics/ components/metrics/ app/api/audio/word-metrics/` → nothing.
7. **No hardcoded force-to-null:** `grep -rn "visualScore: null\|vocalScore: null" lib/ app/"` → zero hits — the literal-null pattern was fully retired in 10-06; scores are now coerced through the same `coerceScore` used for Content/Behavioral, gated on `hasVisualMetrics`/`hasVocalMetrics`.
8. `grep -rn "NOT MEASURABLE\|MUST always be null" lib/scenario/prompts.ts` → nothing (retired by 10-06).
9. `lib/interview/prompts.ts` diff hunks: `@@ -207,12 +207,24 @@`, `@@ -222,6 +234,15 @@`, `@@ -229,6 +250,9 @@` — all inside `INTERVIEW_EVALUATOR_PROMPT` (the template literal starts at line 201). The live interviewer prompt above that line is byte-unchanged, preserving the Phase 1 criterion-2 prefix-cache guarantee. The still-open Phase 8 question about reinforcing the interviewer persona inside this file was confirmed NOT touched — a separate decision, not authorized by this phase.
10. `git diff c2d55b9 -- lib/interview/evaluation.ts lib/scenario/evaluation.ts | grep "json_schema\|minimum:\|maximum:"` → no output; both JSON schemas unchanged.
11. `coerceScore`'s own function body diff is empty in both evaluation modules — only the doc comment describing its caller's new gating logic changed.
12. `grep -n "face_detected" lib/metrics/coverage.ts` → 3 hits, all inside the doc comment or `isPoorVisualCoverage` (line 193); zero inside `resolveVisualOutcome`. **Re-ran all seven 10-01 discriminator assertions live** (not taken on trust) via a throwaway `tsx` script:
   - (a) `cameraMode="OFF"` + healthy metrics → `{scored:false, reason:"CAMERA_OFF_OPTOUT"}` — PASS
   - (b) `face_detected_samples:0, processed_samples:600, expected_samples:600, track_live_seconds:100, session_seconds:100, analyzer_error:false` → `{scored:true, reason:null}` (the REQ-41 regression case) — PASS
   - (c) same block with `analyzer_error:true` → `INSUFFICIENT_DATA` — PASS
   - (d) `track_live_seconds:20, session_seconds:600`, otherwise healthy ratio → `INSUFFICIENT_DATA` (the case a single processed/expected ratio would miss) — PASS
   - (e) `processed_samples:100, expected_samples:600` → `INSUFFICIENT_DATA` — PASS
   - (f) `spoken_turns:0, typed_turns:12` → `TYPED_ONLY`, never `INSUFFICIENT_DATA` — PASS
   - (g) `spoken_turns:5, analyzed_turns:0` → `INSUFFICIENT_DATA` — PASS
   All seven PASS.
13. `grep -n "coverage" components/interview/ReportScoreCards.tsx` → an import, prop plumbing, and a rendered `coverageNote` paragraph with an in-code comment stating "must never become a hidden second score" — display-only, confirmed never influencing the rendered score.
14. `grep -rn "cameraMode" app/api/` → confined to `app/api/interview/session/start/route.ts` and `app/api/scenario/session/start/route.ts` only; zero hits in any finish or update route. The interview start route now also returns the resolved `cameraMode` (the `cd957f3` fix from earlier in the phase).
15. `grep -n "%\|toFixed" components/interview/ReportScoreCards.tsx` → nothing.
16. `grep -c "Not yet measured" components/interview/ReportScoreCards.tsx` → `1`.
17. `app/api/interaction/`, `app/api/case/`, `app/api/profile/` all diff-empty (`--stat` empty) against baseline, re-confirmed after `5c7a2bd`. `app/case-play/[caseId]/page.tsx`'s `cohortId` line (`if (!user?.email || !cohortId || !caseId) return;`) appears in the file's diff only as unchanged context — never touched by an added/removed line, despite the file's otherwise large diff (Phase 10 legitimately added scenario camera capture to it).
18. `app/api/audio/transcribe/route.ts` diff-empty against baseline — the live push-to-talk STT route untouched.
19. `getUserMedia` in `InterviewSessionShell.tsx`: exactly one occurrence, the pre-existing audio-only call (`{ audio: true }`). The video request lives solely in `lib/metrics/visual-capture.ts`. Re-confirmed after `5c7a2bd` (the fix added a `.getTracks().forEach(t => t.stop())` call, not a new `getUserMedia` invocation).
20. `grep -rn "cohortId\|isStaff\|instructor\|assignment" lib/metrics/ components/metrics/ app/api/metrics/` → nothing.
21. `cameraMode = "OFF"` force-to-OFF branch confirmed present in both `app/api/interview/session/start/route.ts:122` and `app/api/scenario/session/start/route.ts:92`. The "exercise it once live" half of this check was satisfied by the user's real sessions having gone through consent/camera-mode resolution successfully; the specific null-consent-forces-OFF path was not separately isolated and demonstrated live.
22. `grep -rn "@latest\|/latest/" lib/metrics/ package.json` → nothing; MediaPipe self-hosted and pinned at `1.0.1`.

**Two commits landed mid-sweep** (`a2ae495` — GPU→CPU delegate fallback now logs via `console.info`, never `console.error`; `6ff03ee` — `releaseVisualCapture` wraps engine `stop()` in try/finally so a teardown throw can't skip camera-track release). Both are accounted for in the checks above, not treated as drift.

**No deviations in Task 1 itself — all 22 checks passed with nothing to fix, nothing to commit.**

## Task 2 — Human Walkthrough Outcome

The user had already run two real camera-on interviews against a live HeyGen avatar before this checkpoint began. That evidence, plus the checkpoint conversation itself, resolved the 24-step walkthrough as follows.

**Directly evidenced (real hardware, real data):**
- **Step 9** (fold-away face-detection banner) — confirmed working: appeared when the face left frame, folded away on return.
- **Step 11** (report shows 1-5 scores + plain-word bands inside the existing cards, no raw percentages on the cards) — confirmed: "Visual & Environment" scored 3/5 (Eye contact: Solid, Framing: Well centred, Lighting: Clear, Presence: Steady), "Vocal Delivery" scored 2/5/Developing (Pace: Fast, Filler words: Occasional, Pauses: Few, Volume: Uneven).
- **Step 12** (bands match lived experience) — supported by the evaluator's own narrative citing real measured figures (eye contact 59%, 22 fillers over two answers, 232 WPM, moderate volume consistency) that plausibly explain the assigned bands.
- **ROADMAP criterion 1** (eye contact, framing, speech rate, filler counts measured not estimated) — the specific cited figures are strong evidence real capture ran twice, not a template response.
- **Step 7 / REQ-49** (no avatar degradation) — the user's own direct judgement after two real sessions: **"avatar smoothness was still good enough."** Recorded as a PASS on the user's own call, WITH A CAVEAT: this was not an instrumented measurement, and the user explicitly flagged performance as something to revisit — MediaPipe may be running on the CPU delegate (competing with the live WebRTC stream), and the new `[visual-capture] engine started` log now reports which delegate is active for future diagnosis. Carried forward as an open item, not a closed question.
- **Step 23** (camera light) — **a real defect was found and fixed.** The user reported the camera stayed on after End, and suspected other exits too — that "other exits" detail was the decisive clue. Root cause: the interview shell's capture-start guard tested `visualCaptureRef.current`, which is only assigned AFTER an awaited `requestCameraStream()`. A second avatar `CONNECTED` event arriving mid-request (which HeyGen emits on reconnects) passed the same guard, so two camera streams were acquired; `cameraStreamRef` kept only the second, orphaning the first with no reference left to stop it — explaining why every exit path (End, Leave, unmount) appeared to fail identically, since each only ever stopped the reachable stream. Case-play had the same class of bug by a different route: its `cancelled` check returned early AFTER `getUserMedia` resolved, abandoning an acquired stream without stopping it. **Fixed in commit `5c7a2bd`**: a synchronous `visualStartingRef` set BEFORE the request (interview shell), and both surfaces now stop any pre-existing/late-arriving stream defensively rather than overwriting or abandoning it. **This fix is reasoned from the code and has NOT yet been re-confirmed on real hardware** — the user should watch the camera indicator light after their next session.

**Accepted by the user's overall approval ("i think we're all good otherwise") WITHOUT being separately, individually executed and reported step-by-step:**
- Steps 1-6 (camera-choice screen copy, consent dialog behavior including "Not now", browser-permission ordering, consent-not-reappearing, permission-denied block screen, camera-in-use-by-another-app message)
- Step 8 (self-view thumbnail mirrored/muted/click-through)
- Step 10 (nothing shows a live score during the session)
- **Steps 13-15 — the phase's hardest distinction (docked-vs-insufficient-data) — were never exercised live.** This discriminator is verified only by the seven unit-level assertions re-run in Task 1, not by an actual out-of-frame session or an actual mid-session camera disconnection. Named explicitly rather than silently claimed as tested.
- Step 16 (camera-off interview report copy)
- Step 17 (camera-on + fully-typed answers)
- Steps 18-20 (scenario intro camera choice, scenario report scores, admin case path) — the two real sessions were interviews, not scenarios
- Steps 21-22 (legacy pre-Phase-10 report rendering, ROADMAP criterion 2) — not independently re-opened this session; relies on 10-08's own end-to-end verification of `resolveCardState`'s legacy branch
- Step 24 (nothing downloadable/replayable)

**Known benign, not a defect:** MediaPipe's WASM writes `INFO: Created TensorFlow Lite XNNPACK delegate for CPU` to stderr; Emscripten routes stderr to `console.error`, which Next's dev overlay renders as a "Console Error" pointing at the `detectForVideo` line. It is not an exception — the surrounding catch block is silent, so a real throw would produce no overlay at all.

**Judgment call surfaced, not resolved by this plan:** CONTEXT.md's "bands, not raw percentages" decision holds for the report CARDS (`ReportScoreCards.tsx` is grep-clean of `%`/`toFixed`), but the evaluator's own narrative prose voluntarily cites raw figures ("59%", "232 WPM", "22 fillers"). This is arguably more actionable for the student but is a mild tension with the decision's stated spirit ("interpreted for the student rather than shown as bare figures"). Not changed unilaterally — recorded here for the user's future call.

## Task Commits

1. **Task 1: Static constraint sweep** — no commit (zero violations found, nothing to fix).
2. **Task 2 checkpoint fix: orphaned camera streams** — `5c7a2bd` (fix). Landed by the user's own agent session in response to this checkpoint's findings, verified independently via `git show --stat` and `git show` diff review during this plan's execution.
3. **Task 3: Docs close-out** — this plan's own final commit (see below).

Two additional commits landed during this plan's execution window, both from earlier in Phase 10 rather than from this plan itself, and both re-verified against the static sweep: `a2ae495` (delegate diagnostics logging) and `6ff03ee` (try/finally teardown ordering).

## Files Created/Modified
- `.planning/phases/10-video-audio-metrics/10-11-SUMMARY.md` — this file
- `.planning/REQUIREMENTS.md` — REQ-35..REQ-44, REQ-47, REQ-49 ticked (REQ-45/46/48 were already ticked by 10-08)
- `.planning/ROADMAP.md` — Phase 10 checkbox ticked, all 11 plan checkboxes ticked, progress table row updated to `11/11 | Complete | 2026-09-22`
- `.planning/STATE.md` — Phase 10 COMPLETE section added, Current Position moved to Phase 11
- `components/interview/InterviewSessionShell.tsx`, `app/case-play/[caseId]/page.tsx` — checkpoint fix (commit `5c7a2bd`, not authored by this plan's own tasks but verified and accounted for by this plan's sweep)

## Decisions Made

- Baseline resolved as `c2d55b9` (commit before `fb35bc5`, 10-01's first commit), not `main` — same correction as 07-07/08-08/09-09.
- REQ-49 ticked on the user's direct judgement with an explicit caveat, not on an instrumented before/after latency measurement — the plan's own objective names this "a felt, hardware-dependent judgement," which is exactly what was obtained.
- All 15 requirement IDs ticked together at phase close, per the coordinator's explicit instruction following the user's approval, rather than leaving individual IDs open pending narrower re-verification — consistent with the established pattern (07-07/08-08/09-09) that a human-approved checkpoint, even one that accepts some steps without individually re-running them, is the mechanism that closes a phase's split requirements.
- The narrative-vs-card percentage tension and the CPU/GPU delegate performance question are recorded as open items rather than fixed, since neither was raised as a defect by the user and both are legitimately future-phase or user-preference decisions.

## Deviations from Plan

### Auto-fixed / Checkpoint-fixed Issues

**1. [Checkpoint defect — orphaned camera stream] Camera light stayed on after ending a session**
- **Found during:** Task 2 (human checkpoint), from the user's bug report
- **Issue:** A race between a HeyGen avatar reconnect's `CONNECTED` event and an in-flight `getUserMedia()` call could acquire two camera streams; the first was orphaned with no reference left to stop it, so `releaseVisualCapture` (or case-play's teardown) only ever stopped the stream it still knew about.
- **Fix:** Added a synchronous `visualStartingRef` guard set before the request in `InterviewSessionShell.tsx`, and defensive track-stopping for any stream that slips through late in both `InterviewSessionShell.tsx` and `app/case-play/[caseId]/page.tsx`.
- **Files modified:** `components/interview/InterviewSessionShell.tsx`, `app/case-play/[caseId]/page.tsx`
- **Verification:** Re-ran `tsc --noEmit` clean; re-confirmed static checks 5, 17, 19 still hold with the fix applied. NOT yet re-confirmed on real hardware — flagged as an open item for the user's next session.
- **Committed in:** `5c7a2bd`

---

**Total deviations:** 1 checkpoint-fixed defect (matching the 07-07/08-08/09-09 precedent of exactly one real bug found and fixed per phase-closing checkpoint).
**Impact on plan:** Necessary correctness fix for a real, user-reported privacy-relevant defect (camera indicator staying lit). No scope creep — the fix is confined to the two capture-start call sites the bug report implicated.

## Issues Encountered

None beyond the checkpoint-fixed defect above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 10 is closed: all 15 requirements (REQ-35..REQ-49) ticked, both report types produce real Visual/Vocal scores with qualitative bands, legacy reports remain unaffected, and the camera-off privacy defect found in this checkpoint is fixed pending hardware re-confirmation.

**Carried forward as open items (not blockers):**
- Confirm the camera-light fix (`5c7a2bd`) on real hardware across all exit paths (End, Leave, browser-back, tab close) — the user's next session should verify this directly.
- Revisit capture performance / GPU-vs-CPU MediaPipe delegate selection — the user wants this looked at in a future phase; the `[visual-capture] engine started` log now reports which delegate is active to make that investigation possible.
- Steps 13-15 (the docked-vs-insufficient-data pair) were never exercised live — only unit-verified. If a future phase touches `lib/metrics/coverage.ts` again, a real live run of this pair is still owed.
- The narrative-vs-card raw-percentage tension is the user's call, not acted on here.
- Resumed scenario runs via "Unfinished Sessions" still take the legacy finish path (pre-existing from 09-07, inherited not introduced).
- The fourth unapplied migration (`20260922134512_add_video_audio_metrics`) remains in the handoff queue; `npm run setup` is still the intended path for the shared database.
- Pre-existing repo-wide broken eslint and the `/about` `next build` breakage remain unrelated pre-existing issues.
- The three uncommitted IDE-edited files (`app/interview/[type]/page.tsx`, `components/interview/ReportScoreCards.tsx`, `components/metrics/MetricsConsentDialog.tsx`) remain uncommitted, per instruction.
- Whether to reinforce the interviewer persona inside `lib/interview/prompts.ts` is still the user's call, explicitly not decided by this phase.

Phase 11 (Cohort & Staff Teardown) is next; its own planning/execution is already underway in a parallel session and is untouched by this plan.

---
*Phase: 10-video-audio-metrics*
*Completed: 2026-09-22*
