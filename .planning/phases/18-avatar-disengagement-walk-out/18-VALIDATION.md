---
phase: 18-avatar-disengagement-walk-out
status: agent-uat-failed
verdict_basis: agent-verified (Playwright, real HeyGen/OpenAI), not human — user decision 2026-10-25
requirements:
  - REQ-78
  - REQ-79
  - REQ-80
  - REQ-81
  - REQ-82
  - REQ-83
  - REQ-84
  - REQ-85
  - REQ-86
---

# Phase 18 Validation — Avatar Disengagement & Walk-Out

## Automated script battery

Run locally on 2026-10-06, re-run fresh on 2026-10-09 (18-05 Task 1) against
`dev` HEAD (`84ccd90`, after Phase 20's 20-04/20-06 concurrent in-flight edits
to `lib/difficult-conversation/conversation-prompts.ts` and
`scripts/verify-disengagement-termination.ts`, neither touched by this plan).
These checks use source fixtures only; no agent connected to a shared database,
Lightsail, Preview, Production, Vercel, or a deployed application.

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-disengagement.ts` | 0 | PASS — all 15 sections, ALL PASS (re-run 2026-10-09) |
| `npx tsx scripts/verify-disengagement-termination.ts` | 0 | PASS — all 5 sections, ALL PASS (re-run 2026-10-09; file has uncommitted edits in flight from Phase 20's 20-04/20-06, not this plan's concern) |
| `npx tsx scripts/verify-disengagement-walkout-shell.ts` | 0 | PASS — 23/23 checks, ALL PASS (re-run 2026-10-09) |
| `npx tsx scripts/verify-disengagement-report.ts` | 0 | PASS — all 5 sections, ALL PASS (re-run 2026-10-09) |
| `npx tsc --noEmit --pretty false` | 0 | PASS — clean, zero errors (re-run 2026-10-09) |
| `npx tsx scripts/verify-pitch-types.ts` | 1 | **1 FAILURE — see disposition below. Added to this battery for the first time; previously omitted, which is the unearned-green `18-PITCH-TYPES-REGRESSION.md` identified.** |

### `verify-pitch-types.ts` disposition — DECISION NEEDED FROM HUMAN

`18-PITCH-TYPES-REGRESSION.md` assigned this script's disposition to 18-05. Re-run
2026-10-09: exactly 1 failure remains (down from 3 — the two deck-owned assertions
were discharged by Phase 19 plan 19-03, confirming its fix, per
`19-VALIDATION.md`'s prediction). The one remaining failure is Phase 18's own and
is NOT fixable by editing `lib/pitch/elevator-type.ts` (read-only per Phase 19's
fence, and the elevator's behavior here is correct, not broken):

```
6. Avatar-end floor
  ok   assistantTurnCount:1 + lost_interest REJECTED
  FAIL assistantTurnCount:2 + lost_interest ACCEPTED
         {"ok":false,"recordedReason":null,"reason":"disengagement-below-threshold"}
  ok   assistantTurnCount:2 + "bored" REJECTED
```

Root cause confirmed exactly as `18-PITCH-TYPES-REGRESSION.md` predicted: this
fixture (`scripts/verify-pitch-types.ts` line ~218, authored at Phase 14 before
disengagement thresholds existed) calls `resolveTermination` with only
`assistantTurnCount: 2` and no derived disengagement value. Now that
`pitch-elevator` declares `disengagementThreshold: 0.5`, the gate correctly
fails closed without a value crossing that threshold — floor alone no longer
suffices for the elevator, by design (18-02/18-03's own threshold-gating intent).
The fixture encodes stale Phase 14 intent ("floor alone is sufficient"), not a
Phase 18 regression.

**This plan does not have `scripts/verify-pitch-types.ts` in its
`files_modified`, and will not edit a test script correctness fixture without
explicit instruction — that is an architectural/test-authority call (Rule 4),
not a bug fix.** Two options for the human to choose at the checkpoint:

- **(A) Invert the assertion** to encode the corrected intent: at the floor
  with no derived-disengagement value supplied, the elevator should be
  REJECTED with `reason: "disengagement-below-threshold"`, not ACCEPTED. This
  makes the script 0 FAILURE(S) and the assertion's name/comment should say
  why (floor alone insufficient once a threshold is declared).
- **(B) Leave it red with this record as the permanent, examined explanation,**
  and document `verify-pitch-types.ts`'s exclusion criterion for Phase 18's own
  battery (it predates disengagement thresholds and was never ownership-
  transferred).

No code behavior changes under either option — only the test fixture's
assertion or this record. Awaiting the human's choice; not decided here.

## Success criteria — human evidence required

| # | Criterion | Automated coverage | Human verdict / verbatim notes |
|---|---|---|---|
| SC1 | Repetitive, stalled, or non-tailored pitch loses engagement from deterministic observable signals; no live indicator appears. | Signal and no-meter verifiers pass. | **PASS** — agent-verified (Playwright, real HeyGen/OpenAI), not human, 2026-10-25. Runs E1/E2: value rose monotonically from observable causes only (`short_response_streak`, `no_common_ground`, `repeated_response`) and crossed on the 4th assistant turn (E1 0.067→0.133→0.483→0.500; E2 0→0→0.267→0.583). DOM polled every 300ms: zero meter/progress/role=meter elements and zero engagement/interest/disengag text. |
| SC2 | A structured avatar cue accelerates a walk-out but cannot end a cold session alone. | Cue/threshold verifier passes. | **BLOCKED (partial)** — agent-verified (Playwright, real HeyGen/OpenAI), not human. Authority half consistent: no session ended below threshold in 3 sessions. The only live cue (`disengagement="rising"`, E1 crossing turn) coincided with the crossing, so acceleration was not isolated; and no walk-out can complete anyway (see SC3). |
| SC3 | A threshold crossing permits exactly one uninterruptible final statement, locks text and PTT, then auto-finishes. | Shell verifier passes. | **FAIL — BLOCKER (F18-1)** — agent-verified (Playwright, real HeyGen/OpenAI), not human. Lock holds (textarea, Send and "Tap to record" all disabled; fill/click rejected). But in E1 and E2 (2/2) the crossing reply is suppressed, the one-shot forced-farewell request is **never sent**, no final statement is spoken, no `session/finish` is issued in 120s, and "End interview" is disabled — the student is trapped. Same dead end as 2026-10-14. |
| SC4 | Auto-end records the avatar termination outcome and report explains session-clock decline from observable causes. | Report verifier passes. | **BLOCKED by F18-1** — agent-verified (Playwright, real HeyGen/OpenAI), not human. No report is reachable; reports `c53a3d50…` (E1) and `7e412c55…` (E2) stay `IN_PROGRESS`, `terminationReason` null. |
| SC5 | Types without a threshold retain existing behavior; walk-out respects each type floor. | Policy/floor verifier passes. | **PASS** — agent-verified (Playwright, real HeyGen/OpenAI), not human. Opt-out (general interview, report `52fdc8f1…`): 7 assistant turns of "Ok." / "I don't know.", value reached 0.69 (above the elevator's 0.5) but `crossed:false`, `walkOutFinal:false` every turn, no lock. Elevator crossings came on assistant turn 4 (floor 2) — consistent, floor itself not isolated. |

## Requirement checklist — human evidence required

| Requirement | Human verdict / notes |
|---|---|
| REQ-78 — Observable disengagement computation | **PASS** — agent-verified (Playwright, real HeyGen/OpenAI), not human. Ratchet re-observed fixed (UAT Finding 1): never dropped on a novel reply in E1/E2, and in P20 run B held at 0.533 across two sincere apologies. |
| REQ-79 — Cue accelerates, never replaces derived authority | **BLOCKED (partial)** — agent-verified (Playwright, real HeyGen/OpenAI), not human. No cue-only end observed; acceleration not isolated (see SC2). |
| REQ-80 — Threshold opt-in preserves other types | **PASS** — agent-verified (Playwright, real HeyGen/OpenAI), not human. Interview at 0.69 never crossed or walked out (SC5). |
| REQ-81 — Final avatar statement locks typed and PTT input | **FAIL (F18-1)** — agent-verified (Playwright, real HeyGen/OpenAI), not human. The lock half PASSES (typed + tap-to-record both disabled from the crossing on). The "exactly one final avatar statement" half fails: none is ever played. |
| REQ-82 — Session auto-finishes after final statement | **FAIL — BLOCKER (F18-1)** — agent-verified (Playwright, real HeyGen/OpenAI), not human. No `session/finish` in 120s after the lock, 2/2 elevator runs. |
| REQ-83 — Existing termination policy/outcome path is reused | **BLOCKED by F18-1** — agent-verified (Playwright, real HeyGen/OpenAI), not human. No auto-ended elevator report exists to inspect. (DC report `f37d8b5f…`, manually ended, does record `terminationReason: offensive_content`, `objectiveStatus: avatar_ended` through the same outcome path.) |
| REQ-84 — Deck observes a real four-assistant-turn floor | **AMENDED/SUPERSEDED, verified 2026-10-09.** ROADMAP.md line ~665-673 and ~753-768 ("AMENDED 2026-10-08 by Phase 19 (user decision)"): the deck half of REQ-84 is reversed — `pitch-deck` now declares no `disengagementThreshold`, `avatarMayEnd: false`, `avatarEndReasons: []`; it cannot walk out at any turn count, so a four-turn floor is moot for it. Confirmed live by `scripts/verify-disengagement-termination.ts` §4 ("no deck mode opts into disengagement", "a maximally disengaged investor still cannot walk out") and §3 ("synthetic policy's floor rejects before four assistant turns even at maximum disengagement") — both PASS, re-run 2026-10-09. `pitch-elevator` retains its own two-assistant-turn floor and 0.5 threshold (unchanged, `524544e`) and is the only opted-in type; its floor is covered by the live human item below, not by this row. Do not re-run a deck fixture for this item at the Task 2 checkpoint — it is closed by this amendment, not pending. |
| REQ-85 — No live engagement meter, warning, or gauge | **PASS** — agent-verified (Playwright, real HeyGen/OpenAI), not human. 300ms DOM poll across 6 live sessions: zero hits. Only "The conversation ended." appears, after the crossing. |
| REQ-86 — Report uses session-clock observable decline evidence | **BLOCKED by F18-1** — agent-verified (Playwright, real HeyGen/OpenAI), not human. |

## Locked-design checks

- [x] Model cue accelerates observable evidence but cannot replace it.
- [x] Disengagement remains invisible during a live session.
- [x] The flow extends `terminationPolicy` and `avatarEndFloor`; no parallel
  termination field was added.
- [x] Pitch deck declares and enforces a four-assistant-turn floor.
- [ ] Elevator stall walk-out and protected final statement — agent-verified 2026-10-25: stall/crossing PASS, final statement FAIL (F18-1).
- [ ] Generated report's early-end banner and decline panel — BLOCKED by F18-1 (agent-verified 2026-10-25).
- [x] Threshold opt-out type spot-checked — agent-verified 2026-10-25 (general interview, PASS).
- [x] Deck floor item SUPERSEDED, not requiring human test — see REQ-84 row
  above. The deck half of REQ-84 was reversed by Phase 19's 2026-10-08
  amendment (deck never walks out at any turn count); confirmed by
  `verify-disengagement-termination.ts` §3-4, re-run 2026-10-09.

## Review repairs before UAT

A read-only code review found authority and replay weaknesses in the initial
walk-out proof flow. Before human UAT, the implementation now:

- mints a proof only for an authenticated caller's owned, `IN_PROGRESS` report;
- derives chat-time enforcement clocks from that persisted report, not a browser
  timestamp;
- uses a proof as permission only, then re-derives the persisted threshold value
  from the submitted transcript at the server-stamped proof time;
- requires proof assistant-turn count not to exceed the submitted transcript;
- records a bounded termination timecode; and
- releases the one-shot farewell lock on that follow-up request's failure.

The proof TTL is two minutes. The authority invariants are covered by the
updated `verify-disengagement-walkout-shell.ts` source-level guard and by the
TypeScript check listed above.

## Human UAT protocol

1. Run a pitch-elevator session with short, repetitive, non-tailored answers.
   Verify no meter or warning appears, then wait for the avatar walk-out after
   the two-assistant-turn floor.
2. During the final line, try typed Send and push-to-talk. Both must remain
   locked until the session auto-finishes.
3. Open the generated report. It must use normal early-end outcome chrome, not
   a FAILED-evaluation error, and its decline panel must show only observable
   causes at `m:ss` session-clock times.
4. In a separate run, observe that a cue can accelerate a deteriorating session
   but cannot independently force an early end in a cold session.
5. Spot-check networking or an interview (no threshold) for unchanged behavior.
6. If a deck is available, confirm it cannot walk out before four assistant
   turns. Otherwise record: "deck floor covered by
   verify-disengagement-termination.ts".

## UAT findings and repairs (2026-10-06)

Human UAT of the elevator stall run surfaced two defects that the automated
battery passed over. Both are fixed; neither changed a threshold, weight, or
cue acceleration, so the calibration policy below was not engaged.

### Finding 1 — the disengagement ratchet never engaged (REQ-78)

Observed: a stalled, repetitive session reached 0.6, then a single novel reply
("Cheese") dropped it to 0.4.

Cause: the one-way guarantee in `computeDisengagement` is
`Math.max(priorValue, computed)`, and `priorValue` had **no callers** — both the
chat route and the finish re-derivation recomputed from scratch each request, so
it always defaulted to 0. `repetitionPressure` scores only the latest student
message, so one unlike reply zeroed the whole `repeatedResponse` term (0.25).

Why the battery missed it: `verify-disengagement.ts` proved the ratchet by
passing `priorValue` into the primitive directly. Nothing asserted that a real
caller supplies it — the contract was proven in the unit and unenforced at the
integration seam.

Fix: `computeDisengagementOverTranscript` replays the transcript prefix by
prefix, threading each step's value into the next. Monotonic without session
state, schema change, or a browser-supplied prior; deterministic and replay-safe,
and the final step still uses the server-stamped elapsed time, assistant turn
count, and cue. The duplicated common-ground rule moved into the shared
`deriveCommonGroundAbsent`, applied per prefix so an early absence ratchets
instead of being erased by one late mention of "fit".

### Finding 2 — dead wait before auto-finish (REQ-82)

Observed: a long, idle pause between the avatar going quiet and the report
appearing.

Cause: `PracticeSessionShell` guessed the farewell's duration as
`words * 500ms + 1000ms`, capped at 15s, and finished on that timer. The
estimate ran well past real speech; the server was idle throughout
(`session/finish` returned 202 in 273ms).

Fix: the avatar handle now exposes `isTalking()` and `waitForSpeechEnd(maxMs)`,
backed by the `AVATAR_SPEAK_STARTED` / `AVATAR_SPEAK_ENDED` events the session
already tracked. The shell awaits the real end of speech; the computed duration
survives only as a ceiling against a dropped event, and the watcher is cleared
on unmount.

### Regression coverage added

| Check | Script |
|---|---|
| A novel reply never lowers the ratcheted value | `verify-disengagement.ts` |
| The replaced from-scratch path still drops on that fixture | `verify-disengagement.ts` |
| Replay is deterministic | `verify-disengagement.ts` |
| Late common ground cannot erase an earlier absence | `verify-disengagement.ts` |
| Episodes span the replayed session | `verify-disengagement.ts` |
| Both server callers replay the transcript | `verify-disengagement-walkout-shell.ts` |
| Neither caller calls the un-ratcheted primitive | `verify-disengagement-walkout-shell.ts` |
| Auto-finish waits on the avatar speech-ended signal | `verify-disengagement-walkout-shell.ts` |
| Auto-finish no longer uses a guessed duration | `verify-disengagement-walkout-shell.ts` |

Battery after the repairs: all four verifiers exit 0 and `npx tsc --noEmit`
is clean. No agent connected to a database, Preview, Production, Vercel, or any
deployed service.

### UAT status

SC1 / REQ-78 and REQ-82 must be re-observed in a live session before a verdict
is recorded; the earlier run demonstrated the defects, not the fixed behavior.
SC2, SC3, SC4, SC5 and the remaining requirements stay **PENDING**.

### Note on an evidence claim checked and rejected (2026-10-09, 18-05 Task 1)

This executor's briefing asserted that Phase 19's 19-11 human UAT had already
observed SC1/REQ-78, REQ-81, REQ-82, and REQ-85 live on 2026-10-09, citing
verbatim quotes attributed to `19-KEYBOARD-PASS-2.md` items 13-15 and a "block D"
/ "block F" in `19-VALIDATION.md`. **Checked directly and found false:**

- `19-KEYBOARD-PASS-2.md` items 1-15, including 13/14/15, are still literally
  `PENDING` with no notes; its own header still reads `status: PENDING`.
- `19-VALIDATION.md`'s every SC/requirement row is still `PENDING`; its "Final
  human verdict" section still reads PENDING; it has no "block D" or "block F"
  structure at all.
- No `19-11-SUMMARY.md` exists. Only `19-11-PLAN.md` exists for that plan. The
  three `19-11`-tagged commits on `dev` (`927f8e2`, `ea495ed`, `b682fe0`) are a
  drafted run sheet and two keyboard-handler bug fixes — not a recorded human
  verdict.
- `.planning/STATE.md`'s own Current Position line says plainly: "19-01 through
  19-10 complete; 19-11 next to execute" and "18-05 human UAT pending."
- None of the briefing's quoted verbatim strings appear anywhere under
  `.planning/` by direct grep.

None of this evidence was carried forward into the tables above. SC1, SC2, SC3,
SC4, SC5 and REQ-78 through REQ-86 all remain genuinely **PENDING** on a live
human session that has not yet happened in either phase. This note exists so a
future reviewer does not re-introduce the same unverified claim as fact.

## Agent browser UAT run (2026-10-14) — NOT a human verdict

Claude drove the built-in browser against the local dev server (seed student,
`/practice/pitch-elevator`, "Completely blind", camera off, typed answers only).
Two sessions: run A had a DOM state recorder and, from turn 6, a fetch tap on
`/api/interaction/chat`; run B was a fresh page load with read-only DOM checks
only. The human rows above stay **PENDING**; this section is evidence for the
human to accept or reject.

Script battery re-run first: the four disengagement verifiers exit 0;
`verify-pitch-types.ts` still exits 1 (the known A/B disposition above).

| Item | Observed | Agent read |
|---|---|---|
| SC1 / REQ-85 no live meter | Polled every 150ms (run A) and after each turn (run B): zero `meter`/`progress`/`role=meter|progressbar` elements, no "engagement/interest level/disengag" text at any point | PASS (DOM-level) |
| SC1 / REQ-78 stall crosses | Run A crossed on assistant turn 6: `disengagement.value 0.558`, `crossed: true`, causes `no_common_ground, short_response_streak, turn_count_pressure`. Run B crossed on turn 7 | PASS |
| REQ-79 cue cannot end alone | Run A turn 5: model spoke a full farewell ("I've got to run. Good luck with it.") with a trailing marker, but the session stayed open and input re-enabled ~1.5s later (below threshold) | PASS on authority, but see UX finding U1 |
| SC5 elevator floor (2 turns) | No walk-out before turn 6/7 in either run | Consistent; floor itself not isolated |
| SC3 / REQ-81 input lock | Crossing turn: `walkOutFinal: true`, termination `unclear_ask` accepted, textarea and record button disabled, "The conversation ended." shown | PASS |
| SC3 / REQ-82 auto-finish | **Both runs: no auto-finish.** Run A watched ~90s, run B ~75s after the crossing turn; still on `/practice/pitch-elevator`, clock still running, input locked, **no `session/finish` or report request issued**. Run A: pressing "End interview" also did nothing; the student is trapped | **FAIL — BLOCKER** (dead end reproduced; `18-WALKOUT-DEAD-END.md` still `status: open`) |
| SC4 / REQ-83/86 report | Not reachable; blocked by REQ-82 | NOT RUN |
| SC2 cue acceleration (A/B timing) | Not attempted; needs repeated runs, too nondeterministic for one pass | NOT RUN |
| SC5 / REQ-80 opt-out types | Deferred until REQ-82 is fixed | NOT RUN |
| PTT lock under real mic | Not testable by agent | HUMAN |

Side findings (not Phase 18 requirements, logged for triage):

- **U1 — farewell leak.** On a below-threshold turn the model may say a full
  in-character goodbye; it is shown and spoken, then the student can keep
  typing to someone who just left. Authority is correct, but the experience
  reads as broken. Candidate: strip/rewrite a rejected `<engine-end>` reply.
- **U2 — opening-window clock never starts on typed turns.** The prompt tail
  said "still within the 60-second opening window (0s elapsed)" on turn 5,
  ~3 min in. The "PITCH WINDOW — starts when you begin your pitch" panel also
  never started. Enforcement uses the report clock and is unaffected; the
  model's timing context is wrong.
- **U3 — interview chrome in pitch mode.** Pitch session shows "0 of ~9
  questions", "Behavioral focus", "Your resume is used only to personalize this
  practice interview", and a "We can't see your face" warning with camera off.

## Agent-verified UAT run (2026-10-25) — replaces the human UAT by user decision

**Verdict basis: agent-verified (Playwright, real HeyGen/OpenAI), not human.**
The user decided on 2026-10-25 that agent-driven Playwright evidence on the real
APIs replaces the human UAT for this gate. Claude drove headless Chromium (fake
camera and microphone, camera **on**) against the local dev server on branch
`feat/study-plan-expansion`, signed in as `alice.johnson@case.edu`. Every chat
request and SSE `end` metadata frame was captured, and the DOM was polled every
300ms for meters. Input used the current **tap-to-send** control: E1's first
turn was a WAV played into the mic ("Tap to record" → "Tap again to send"); all
other turns were typed. No product code was changed.

Harness and raw evidence (scratchpad, not committed):
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/uat-walkout/`
(`elev.js`, `optout.js`, `drive.js`; per-run `*.log` / `*.json`). Screenshots are in
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/shots/uat-walkout/`.

### Script battery re-run (2026-10-25, HEAD `bea7c5a` + merge `8693a93`)

| Command | Exit |
|---|---:|
| `npx tsx scripts/verify-disengagement.ts` | 0 |
| `npx tsx scripts/verify-disengagement-termination.ts` | 0 |
| `npx tsx scripts/verify-disengagement-walkout-shell.ts` | 0 |
| `npx tsx scripts/verify-disengagement-report.ts` | 0 |
| `npx tsx scripts/verify-pitch-types.ts` | **0** — the A/B disposition above has been settled since then: §6 now asserts `assistantTurnCount:4 + walked_out + NO disengagement evidence REJECTED (fails closed)` |
| `npx tsc --noEmit --pretty false` | 0 |

### Sessions

| Run | Type | Script | Report id | Outcome |
|---|---|---|---|---|
| E1 | `pitch-elevator`, "Completely blind", camera on | pure stall: "It's an app." ×N (turn 0 by voice) | `c53a3d50-b874-43f4-a4fe-857618a23aeb` (stays IN_PROGRESS) | crossed at assistant turn 4 (0.500, cue `rising`) → lock → **dead end** |
| E2 | same | two strong, tailored turns, then stall | `7e412c55-93e3-457a-99fc-afb9dc01a8b1` (stays IN_PROGRESS) | 0 → 0 → 0.267 → 0.583 crossed at assistant turn 4 → lock → **dead end** |
| O1 | `general` interview (no threshold) | "Ok." / "I don't know." ×6 | `52fdc8f1-5525-40c6-b539-989e1becf701` | value 0.69, `crossed:false` every turn, no walk-out (expected) |

### F18-1 — BLOCKER: the forced-farewell request never fires, so a walk-out traps the student

Re-observed 2/2 elevator runs today, and the same as the 2026-10-14 agent run,
**after** `4946922 fix(walkout): deliver the forced farewell and never leave the
session locked`.

Repro (E1, verbatim timings from `elev-A.log`):

1. `/practice/pitch-elevator` → subject "A meal-planning app for busy parents" →
   "Completely blind" → camera on → Start.
2. Answer "It's an app." / "It's an app for stuff." / "Yeah. The app.".
3. `15:59:10.248` the 4th chat response returns `walkOutFinal: true`,
   `walkOutProof` present, `termination: null`, `disengagement.value 0.5,
   crossed: true`.
4. Expected: a second `POST /api/interaction/chat` with
   `turnState.forceWalkOutFarewell: true` (the one-shot farewell). **Observed:
   none is ever sent.** The crossing reply is suppressed by design, so nothing is
   spoken.
5. "The conversation ended." appears. Textarea, Send and "Tap to record" are
   disabled. **"End interview" is also disabled.** No `POST
   /api/practice/session/finish` in the following 120s; clock keeps running
   (3:11 in `elev-A-w2-after.png`). The report row stays `IN_PROGRESS`.

Likely cause (read from source, not instrumented):
`PracticeSessionShell.tsx` schedules the retry with
`window.setTimeout(() => void sendMessageRef.current?.("", true), 0)` from inside
the crossing turn's `try`, then `return`s. `sendMessageRef.current` is only
reassigned on re-render, and `sendMessage`'s guard opens with
`if ((!content && !forceWalkOutFarewell) || sending || …) return;`. If the
timeout runs before React re-renders with `setSending(false)` from `finally`, the
stale closure still sees `sending === true` and returns silently. The 4946922
fix only hardened the path **after** the forced request comes back, so it never
runs when the request is not sent. `verify-disengagement-walkout-shell.ts` is a
source-level check, so it cannot see the timing.

The orchestrator decides the fix. No product code was changed here.

### Other observations (not Phase 18 requirements)

- **Calibration (note only, no change):** E2 crossed 0.5 after only **two**
  short replies that followed two strong, tailored turns (0.267 → 0.583, about
  34s on the session clock). That feels eager for an elevator pitch. E1's
  crossing turn landed exactly on 0.500.
- U2/U3 from 2026-10-14 are still present: "Opening stage", "0 of ~9 questions",
  "Behavioral focus" and "Your resume is used only to personalize this practice
  interview" appear in pitch mode, and the pitch-window panel still reads
  "starts when you begin your pitch" after the pitch was typed.
- Elevator episode `start_s` values move between replays (E1 turn 3: rise @25s;
  turn 4: the same rise re-stamped @22s). Harmless for the gate; noted for REQ-86
  once a report is reachable.

### Phase 20 cross-reference

Phase 20's 20-07 runs (see `20-VALIDATION.md`) hit the same F18-1 dead end in
`difficult-conversation`. There the Phase 15 "End session" control stays enabled,
so the student can leave manually. They also confirmed the REQ-78 ratchet holds
across apologies.

## Calibration policy

Do not retune thresholds, weights, or cue acceleration without explicit human
calibration approval. Record any requested change here as a concrete follow-up.

## Final verdict — agent-verified (Playwright, real HeyGen/OpenAI), not human

**FAIL (2026-10-25).** SC1 and SC5 PASS. SC3 FAILS on blocker F18-1: the forced
farewell never fires, the session locks, and nothing finishes it. SC4 is BLOCKED
behind F18-1, and SC2 is only partly shown. REQ-78, 80 and 85 PASS. REQ-81 and
REQ-82 FAIL. REQ-79, 83 and 86 are BLOCKED. REQ-84 stays closed by amendment. Do not
mark Phase 18 complete, and do not tick REQ-81/82/83/86 in REQUIREMENTS.md,
until F18-1 is fixed and SC3/SC4 are re-run live.
