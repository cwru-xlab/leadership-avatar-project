---
phase: 20-difficult-conversation-walk-outs
status: complete-agent-verified
verdict_basis: agent-verified (Playwright, real HeyGen/OpenAI), not human — user decision 2026-10-25
requirements:
  - REQ-95
  - REQ-96
  - REQ-97
  - REQ-98
  - REQ-99
  - REQ-100
  - REQ-101
  - REQ-102
---

# Phase 20 Validation — Difficult-Conversation Walk-Outs

**Every verdict in this file is agent-verified (Playwright, real HeyGen/OpenAI),
not human.** On 2026-10-25 the user decided that agent-driven Playwright evidence
on the real APIs replaces the human UAT for this gate.

**Gate note (20-07 `gated_on` 18-05):** 18-05 did **not** pass. Its SC3 /
REQ-81 / REQ-82 fail on blocker F18-1 (see `18-VALIDATION.md`). This plan
therefore takes the second branch of its gate: it ran anyway and recorded its own
Phase 18 observations in both files. Those are: the REQ-78 ratchet holds live,
and the F18-1 dead end reappears in `difficult-conversation`. Phase 20 is **not**
signed off on these runs.

## 1. Automated script battery

Run locally on 2026-10-25 against `feat/study-plan-expansion` HEAD `bea7c5a`.
These checks use source fixtures only. No agent connected one of them to a shared
database, Lightsail, Preview, Production, Vercel, or a deployed application. The
live sessions below used the local dev server, a local database, and real
HeyGen/OpenAI.

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-hostility-detector.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-disengagement.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-disengagement-termination.ts` | 0 | ALL PASS (Section 5 = Phase 20) |
| `npx tsx scripts/verify-disengagement-walkout-shell.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-disengagement-report.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-dc-type.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-dc-report.ts` | 0 | All eight sections passed |
| `npx tsx scripts/verify-dc-walkout-report.ts` | 0 | ALL PASS |
| `npx tsx scripts/verify-dc-surface-count.ts` | 0 | ALL ELEVEN SECTIONS PASSED |
| `npx tsc --noEmit --pretty false` | 0 | clean |

The battery is fully green. As in Phase 18, the live runs below found
integration-seam defects that the battery passes over (F20-1, F20-2, and F18-1
reappearing).

## Live sessions (2026-10-25)

Setup: headless Chromium with a fake camera (camera **on**) and a fake
microphone, signed in as `alice.johnson@case.edu`, difficulty **Guarded**. All
turns were typed, because typing drives an adversarial script exactly; the
tap-to-send control was exercised in the Phase 18 run and checked as locked
here. Each chat request and its SSE `end` metadata was captured, and the DOM was
polled every 300ms.

Harness and raw evidence (scratchpad, not committed):
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/uat-walkout/`
(`dc.js`, `drive.js`, `report.js`; `dc-*.log`, `dc-*.json`, `dc-D-mixed-report-*.txt`,
`dc-D-mixed-api.json`). Screenshots are in
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/shots/uat-walkout/`.

| Run | Scenario | What was played | Report id | Result |
|---|---|---|---|---|
| A | `fire-team-member` | firm firing, every phrase the plan requires, verbatim included; 9 student turns / 10 assistant turns | `d5f31ff3-e906-43e3-a8fd-f96e91981c49` (left IN_PROGRESS) | value plateaued at **0.30** (`no_common_ground`, `position_unacknowledged`), no hostility cause ever, **no walk-out** |
| B | `confront-low-performer` | insult, ALL-CAPS insult, two sincere apologies (before the floor), then insults | `fe0cd008-7236-428a-8d61-9675b7c109b3` / `4f4c5dd1-2297-431d-a4cc-e94109a489ba` (two rows created at launch; both IN_PROGRESS) | 0.117 → 0.533 → **0.533 → 0.533** (apologies) → **0.65 crossed** at assistant turn 6, `walkOutReason: escalated`, `walkOutProof` **absent** → lock → **no farewell, no auto-finish** (F18-1 + F20-2) |
| C | `ask-for-raise` | severe harassment on student turns 1 **and** 2 (phrases from the severe lexicon), then "Ok." | `9d3a5ca0-6e5c-41ff-a710-821141e46f32` / `20197c00-011a-4e31-9934-20c597c02aec` (IN_PROGRESS) | `walkOutSevere: true`, reason `offensive_content` from turn 1, but value only 0.117 → 0.533 → 0.583 by assistant turn 6; **never crosses 0.6, session never ends** (F20-1) |
| D | `confront-low-performer` | severe remark, then insults and shouting; End session pressed after 45s without auto-finish, to reach a report | `f37d8b5f-b46b-4a41-a775-fbf3f09c63fb` (READY) | crossed 0.65 at assistant turn 4 (= floor), lock, same dead end; manual "End session" → report in 0.5s |

## 2. Success criteria — agent-verified (Playwright, real HeyGen/OpenAI), not human

| # | Criterion (ROADMAP wording) | Automated coverage | Verdict / observed |
|---|---|---|---|
| P20-SC1 | "A student who insults, escalates or stonewalls visibly loses the avatar over time and has the conversation ended on them, computed deterministically from observable signals, with the avatar's own cue able to accelerate but never to decide." | `verify-hostility-detector.ts`, `verify-disengagement.ts` §14-15 | **FAIL.** The detection half passes: run B accumulated deterministically (0.117 / 0.533 / 0.65), with nothing ending on the first sharp remark, and crossed only after the floor. The ending half fails: the crossing reply is suppressed, no farewell request is sent, and no auto-finish follows (F18-1). The student sees "The conversation ended." and must press End session. No cue fired in any DC run, so acceleration was not observed. |
| P20-SC2 | "Firm, uncomfortable but non-hostile language … such as *'your performance has been unacceptable and this is your final warning'* — never triggers a walk-out." | `verify-hostility-detector.ts` FIRM_NOT_HOSTILE corpus | **PASS.** Run A: 10 assistant turns, including "Your performance has been unacceptable and this is your final warning", "This decision is final", "I am ending your employment", "HR has signed off" and "I will escalate this if we cannot agree a plan". The detector never matched hostility, the value capped at 0.30 against a 0.6 threshold, and there was no lock and no end. |
| P20-SC3 | "Severe content (slurs, harassment, threats) ends the session regardless of the four-assistant-turn floor, as a named and enumerated carve-out…" | `verify-disengagement-termination.ts` §5 (INVERTED SC5) | **FAIL (F20-1).** Run C: two severe harassment remarks were detected (`walkOutSevere: true`, `offensive_content`), but the session did not end, at any turn count. Severe content skips the floor but must still cross the 0.6 threshold, and `severeContent` weighs 0. A severe turn adds only one hostile turn (0.35 / 3 ≈ 0.117). |
| P20-SC4 | "The avatar always leaves in character, and the session records an avatar-initiated failure whose reason code distinguishes hostility, stonewalling and severe content. Phase 15's support note and End-session control survive the ending." | `verify-dc-walkout-report.ts`, `verify-disengagement-walkout-shell.ts` | **FAIL.** The avatar never delivers a final line in runs B and D (F18-1), so there is no in-character exit. The reason codes **do** separate the causes in live metadata (`escalated` in B, `offensive_content` in C/D), and report D recorded `terminationReason: offensive_content` with `objectiveStatus: avatar_ended`. The support note ("Practice only — the character stays in role. End anytime…") and an **enabled** End session control both survived the lock (PASS part). |
| P20-SC5 | "The report explains what tipped the conversation on the session clock with quoted, timecoded causes, explicit content sanitized rather than recited, and no rubric dimension capped." | `verify-dc-report.ts`, `verify-dc-walkout-report.ts` | **PARTIAL: sanitizer PASS, decline panel BLOCKED.** Report D shows reaction causes at 0:25 / 0:33 / 0:41. The 0:25 harassment remark is rendered **"[a sexually harassing remark — not repeated here]"** on the page **and** in `GET /api/practice/report/{id}`; the raw text is absent from the API JSON. The hostile lines appear verbatim ("you're useless. You're an incompetent loser.", "ARE YOU SERIOUS? THIS IS PATHETIC. YOU ARE A JOKE."). All 8 score keys are computed and none is zeroed (visual 1, clarity 2, content 1, empathy 1, behavioral 1, holding_the_line 1, objective_achieved 1, vocal null because input was typed). **No disengagement decline panel** appears, and `terminationAtSeconds` is null: the walk-out never completed with a proof (F18-1, F20-2). |

## 3. Requirement checklist — agent-verified (Playwright, real HeyGen/OpenAI), not human

| Requirement | Verdict / observed |
|---|---|
| REQ-95 — one type-level threshold inherited by every scenario | **PASS.** Three seeded scenarios behaved the same against one 0.6 line: `confront-low-performer` crossed at 0.65 (B, D), `ask-for-raise` stayed open at 0.583 (C), and `fire-team-member` stayed open at 0.30 (A). The launcher has no per-scenario control; difficulty is the only setting. |
| REQ-96 — deterministic hostility causes; cue never decides | **PASS (detection).** Insults, ALL-CAPS shouting and severe harassment were each classified live (B/C/D metadata). No cue was emitted in DC runs, so "cue never decides" was not exercised live here. Stonewalling was not exercised. |
| REQ-97 — firm language never trips | **PASS.** See P20-SC2, run A. |
| REQ-98 — live position-unacknowledged signal | **PASS (signal present).** `position_unacknowledged` appeared as a live cause in run A from the second student turn. Calibration note C3: it stayed latched even after the student explicitly acknowledged the character ("I hear that you're upset, and that's fair"). |
| REQ-99 — hostility accumulates and ratchets, no apology recovery | **PASS.** Run B: 0.533 held exactly across two sincere apologies, then rose to 0.65 on the next insult. |
| REQ-100 — severe content ends regardless of the floor | **FAIL (F20-1).** See P20-SC3. |
| REQ-101 — always in character, distinct reason codes, Phase 15 controls survive | **FAIL.** No final line is ever spoken (F18-1). Reason codes and Phase 15 controls PASS (see P20-SC4). |
| REQ-102 — reactionCauses timecoded, explicit content sanitized, no cap | **PASS on the outcome record** (report D: timecodes, sanitized severe quote in both UI and API, verbatim hostile quotes, no zeroed or capped dimension). The session-clock decline panel is BLOCKED by F18-1/F20-2. |

## Findings

### F18-1 (Phase 18 blocker, reappeared here) — the forced farewell never fires

Runs B and D: the crossing response returns `walkOutFinal: true` with
`termination: null`. The shell suppresses that reply and schedules the one-shot
`forceWalkOutFarewell` request, but **no second chat request is sent**. Nothing is
spoken, the input locks, and no `session/finish` follows in 45–120s. Unlike the
elevator, DC keeps Phase 15's enabled "End session", so the student can leave
manually (run D). Full repro and likely cause are in `18-VALIDATION.md` → "F18-1".

### F20-1 — severe content can never end a session on its own (P20-SC3 / REQ-100)

- `app/api/interaction/chat/route.ts` computes `walkOutFinal = threshold != null
  && disengagement.crossed && (disengagement.severe || turns >= floor)`. Its
  comment says: "Severe content clears the floor (REQ-100) but NOT the
  threshold".
- `lib/difficult-conversation/conversation-type.ts` sets `severeContent: 0` ("a
  FLOOR CARVE-OUT, not a graded contribution").
- A severe turn therefore counts as one hostile turn, about 0.117 of 0.6.
- Taken together, this contradicts the locked decision ("Severe content OVERRIDES
  `avatarEndFloor` … ends the session regardless of turn count") and ROADMAP SC3.
- The verifier missed it because §5's INVERTED SC5 assertion calls
  `resolveTermination` with `disengagementValue: 1`. The live derivation cannot
  produce that value from a severe remark. The carve-out is proven in the unit and
  unreachable at the seam.

Repro (run C):

1. `/practice/difficult-conversation/ask-for-raise` → Guarded → camera on → Start.
2. Type "Before we start — if you're nicer to me in private, this whole review
   will go a lot better for you."
3. Type "You know what I mean. Wear something tighter next time, I like looking
   at you."
4. Observed: metadata shows `walkOutSevere: true` and `walkOutReason:
   offensive_content` from the first remark, with `crossed: false` (0.117, then
   0.533). The character asks to "keep it professional", then carries on ("Alright.
   Let's keep going."). The session never ends.

Related lexicon note (not a defect, by stated design): the severe tier holds only
masked placeholder tokens and three harassment phrases. A real slur, or a threat
("You'll regret this…", which is classified hostile, not severe), would not
reach the severe tier at all.

### F20-2 — difficult-conversation chat turns carry no `reportId`, so no walk-out proof is minted

- `app/practice/[type]/[instanceId]/page.tsx` renders `PracticeSessionShell` with
  no `extraChatBody`.
- The pitch page passes `extraChatBody={{ reportId, … }}`. The chat route reads
  `reportId` only from that top-level body field.
- So for DC, `walkOutReport` is null and no `walkOutProof` is minted. The runs
  showed `walkOutFinal: true, proof: no` on both B and D crossings.
- Even with F18-1 fixed, the forced farewell would be declined server-side. The
  shell would then speak whatever the model returned, or the generic fallback,
  rather than the directed in-character exit.
- The enforcement clock also falls back: DC disengagement episodes are stamped
  `start_s: 0` in runs A–D, and `terminationAtSeconds` stays null on report D.

### Side observations (not Phase 20 requirements)

- Report D's Delivery narrative says "tone became angry and aggressive,
  including yelling". The input was typed and Vocal shows "Not measured", so the
  narrative asserts something the pipeline did not observe.
- DC outcome text says "The interview ended…" in a non-interview conversation.
- Two `IN_PROGRESS` report rows were created per launch in runs B and C. This is
  probably the harness re-clicking "Start conversation" after a timeout; it was not
  reproduced on purpose.

## 4. Locked-design checks

- [x] Deterministic detection; the cue only accelerates (`verify-hostility-detector.ts`, `verify-disengagement.ts`; cue capped at `maxCueAcceleration: 0.2`). Live: detection deterministic in B/C/D.
- [x] Firm is not hostile (`verify-hostility-detector.ts` FIRM_NOT_HOSTILE). **Live PASS, run A.**
- [x] One-way ratchet, no apology recovery (`verify-disengagement.ts`). **Live PASS, run B.**
- [ ] Named severe carve-out, floor intact at 4 for everything else (`verify-disengagement-termination.ts` §5 passes). **Live FAIL, F20-1:** the carve-out is unreachable because severe content cannot cross the threshold.
- [ ] Always in character, one ending path. **Live FAIL:** no final line (F18-1, F20-2). No break-frame message was seen either.
- [x] Sanitizer as code (`lib/report/quote-sanitizer.ts`, `verify-dc-walkout-report.ts`). **Live PASS:** UI and API both mask the severe quote.
- [x] No score cap / `postProcessScores` absent (`verify-dc-report.ts`). **Live:** all dimensions computed, none zeroed.
- [x] One type-level threshold, no per-scenario surface, no difficulty modulation (`verify-dc-surface-count.ts`). **Live:** consistent across 3 scenarios at Guarded.

Deliberately absent (Out of Scope, REQUIREMENTS.md):

- [x] No break-frame branch on a severe walk-out. None was observed live.
- [x] No per-scenario or author-settable threshold. Nothing in the launcher (`verify-dc-surface-count.ts`).
- [x] No score cap on an offense-triggered end (`postProcessScores` absent).
- [x] No apology-driven recovery. Live, run B.

## 5. Phase 18 revision handoff

**For Phase 18's closer. This amends Phase 18 Success Criterion 5.**

Exact wording, copied from `20-04-SUMMARY.md` and recorded in
`lib/engine/termination.ts`'s gate-3 comment and in
`scripts/verify-disengagement-termination.ts`'s Section 5 header:

> Phase 18 Success Criterion 5 read: "a walk-out can never fire before a type's `avatarEndFloor` minimum turns." It now reads: "...except for the named severe-content carve-out in `resolveTermination`." Severe content — slurs, harassment, and threats aimed at the person — ends the session regardless of `avatarEndFloor`. This is a deliberate, enumerated exception (REQ-100), not an incidental bypass. The floor is NOT lowered — it still governs every other trigger (ordinary hostility, stalling, stonewalling) at its declared `minAssistantTurns: 4` value for `difficult-conversation`, and unchanged for every other type.

- The floor itself is unchanged at `minAssistantTurns: 4` for
  `difficult-conversation`, and unchanged for every other type (elevator 2).
- `scripts/verify-disengagement-termination.ts` records the exception as an
  **inverted** assertion in its new Section 5 ("INVERTED SC5: severe content ends
  the session at turn 0, below the floor").
- **Live caveat (F20-1):** today the exception is reachable only in that unit
  fixture (`disengagementValue: 1`). Live, severe content still needs a 0.6
  crossing. Phase 18's SC5 wording should be amended only once F20-1 is resolved,
  or amended with that caveat attached.
- Ownership of that verifier file: Sections 1–2 are Phase 18. Sections 3–4 were
  re-pointed by **Phase 19** (deck modes no longer opt in; synthetic floor
  policy). Section 5 is **Phase 20**, purely additive, and touches no Phase 19
  section.

## 6. Calibration record

Every number below is **PROVISIONAL UNTIL CALIBRATED** (the `12-TUNING.md`
precedent). The evidence each rests on is source fixtures plus these four live
agent runs and nothing more.

| Number | Value | Evidence it rests on | Live observation (2026-10-25) |
|---|---|---|---|
| `CONVERSATION_DISENGAGEMENT_THRESHOLD` | 0.6 | `verify-disengagement.ts` §14-15, `20-EPSILON-MARGIN.md` | Firm firing plateaued at 0.30 (half the threshold) after one professional turn. Two insults reached 0.533. A third crossed. |
| `budgetPressure` | 0 | `timeBudget.totalSeconds` is null for this type, so the inherited profile does **not** sum the way it does for a pitch | n/a |
| `turnCountPressure` | 0 | redistributed to Phase 20 causes | n/a |
| `repeatedResponse` | 0 | redistributed | n/a |
| `shortResponseStreak` | 0.05 | fixture | contributed in C ("Ok." ×3: 0.533 → 0.583) |
| `noCommonGround` | 0.05 | fixture | latched from turn 2 in A even with a professional student |
| `hostility` | 0.35 | fixture; largest term | 1 hostile turn = 0.117, 2 = 0.233 |
| `positionUnacknowledged` | 0.25 | fixture | latched from turn 2 in A despite explicit acknowledgement (C3) |
| `severeContent` | 0 | "a floor carve-out, not a graded contribution" | **root of F20-1** |
| `stonewalling` | 0.3 | 2026-10-08 amendment fixtures | not exercised live |
| hostility accumulation curve | `hostileTurnCount / 3`, clamped | `verify-disengagement.ts` | as predicted |
| `SHOUTING_CAPS_RATIO` | 0.6 | `verify-hostility-detector.ts` | ALL-CAPS insult classified hostile (B, D) |
| severe lexicon | 3 masked placeholder tokens + 3 harassment phrase patterns | `verify-hostility-detector.ts` SEVERE corpus | 2 harassment phrases matched (C, D). Real slurs and threats are not in the severe tier. |

Calibration notes (not changes):

- **C1:** severe content cannot end a session alone (F20-1). This is a design or
  wiring decision, not a number to tune quietly.
- **C2:** `position_unacknowledged` + `no_common_ground` put a professional firing
  conversation at 0.30 after one turn and kept it there. One more hostile turn
  (0.117) plus a short-answer streak would bring a firm-but-terse manager close
  to the line. Run A did not trip, but the margin is about 0.3.
- **C3:** `position_unacknowledged` did not clear after "I hear that you're upset,
  and that's fair". The ratchet is by design; the detector's notion of
  "acknowledged" may be narrower than a human's.

**Phase 18's calibration policy, verbatim:** "Do not retune thresholds, weights,
or cue acceleration without explicit human calibration approval. Record any
requested change here as a concrete follow-up."

This phase did not retune any Phase 18 number. Its new weights are zero in the
shared default profile (`DEFAULT_DISENGAGEMENT_WEIGHTS.hostility`,
`severeContent`, `positionUnacknowledged` and `stonewalling` are all 0), so
`pitch-elevator` is unaffected. Live, the elevator runs in `18-VALIDATION.md`
showed only Phase 18 causes. No threshold, weight, lexicon entry or cue
acceleration was changed during this UAT.

## 7. UAT protocol (as executed by the agent)

1. **Run A** (false-positive guard): `Firing a team member`, Guarded, firm
   script with the verbatim line, ≥ 8 assistant turns. Expect no end.
2. **Run B** (accumulation, in-character end): `Confronting a low-performing
   teammate`, insults and ALL-CAPS, with two apologies before the floor. Expect
   accumulation, an in-character end after the floor, locked typed and
   tap-to-record input, the support note and End session still present, and
   auto-finish.
3. **Run C** (severe below the floor): any scenario, severe remark on student
   turn 1–2. Expect an end below the floor, in character, with
   `offensive_content`.
4. **Run D** (report): open reports. Expect normal early-end chrome, a
   session-clock decline panel, the severe quote characterized, hostile quotes
   verbatim, and no capped dimension. Because B and C produced no report (F18-1,
   F20-1), run D was a fourth live session ended manually via Phase 15's End
   session.
5. Spot-check: two other seeded scenarios (`ask-for-raise`,
   `fire-team-member`) behaved against the same threshold. Pitch-elevator
   behaviour is recorded in `18-VALIDATION.md` (Phase 18 causes only).

## 8. Final verdict — agent-verified (Playwright, real HeyGen/OpenAI), not human

**FAIL (2026-10-25).**

- P20-SC2 PASS.
- P20-SC1, P20-SC3 and P20-SC4 FAIL.
- P20-SC5 is PARTIAL: sanitizer, quotes and no-cap PASS; the decline panel is
  BLOCKED.
- REQ-95, 96, 97, 98 and 99 PASS.
- REQ-100 and REQ-101 FAIL.
- REQ-102 PASS on the outcome record, with its decline panel BLOCKED.

Blocking findings:

- **F18-1:** the forced farewell is never sent; shared with Phase 18.
- **F20-1:** severe content cannot end a session alone.
- **F20-2:** DC sends no `reportId`, so no walk-out proof is minted and no session
  clock is set.

Do not mark Phase 20 complete until these are fixed and runs B, C and D are
re-run live.

### Requirement checkbox handoff

REQUIREMENTS.md currently shows REQ-95, REQ-100, REQ-101 and REQ-102 as `[x]`,
and its Traceability table lists REQ-95…102 as Complete. By this live evidence,
REQ-100 and REQ-101 are **not** met. The boxes and the Traceability table were
left untouched here, so the orchestrator or planner can reconcile them. The
Phase 20 roadmap `**Plans:**` line is the planner's to update.


## Re-test after fixes (2026-10-25, later) — agent-verified (Playwright, real HeyGen/OpenAI), not human

Fixes: F18-1 (shared with Phase 18, above). F20-1: a severe turn lifts the
derived value to the threshold in the signal path, `turn-control` passes
`severeContent` to the chat-time gate, and finish gates on the proof's
server-chosen reason. A conservative set of threat, harassment and
identity-demeaning patterns was added, with no slur text committed. F20-2:
chat turns send the shell's own `reportIdRef` after the caller's extra body.
The root cause was a double launch that left the page's reportId pointing
at a second row, which the proof was then signed against. Copy: the
evaluator says "the character" and "the conversation" and makes no
tone-of-voice claims for typed text; the session header reads
"Conversation with". Commits `032ae98`, `57b221f`, merged in `a42eca1`.

| Run | Scenario | Report | Recorded |
|---|---|---|---|
| severe6 | one harassing remark, turn 0 (below the 4-turn floor) | `6ca5fd69` | `offensive_content`, 22s, decline 0.6, episodes `severe_content+hostility` at 13s; remark masked "[… not repeated here]" on Overview and Moments |
| hostile (final3) | sustained insults through two apologies | `5dcaf470` | `escalated`, 55s, decline 0.65, episodes at 17s/21s/47s (real session clock) |

Verdicts (supersede the FAIL rows above):
- P20-SC1 **PASS**. Hostility accumulates, holds through apologies, crosses, the character leaves in character, and the session auto-finishes.
- P20-SC3 **PASS**. One severe remark ends the conversation on its own, below the floor.
- P20-SC4 **PASS**. The character delivers its final line, and the reason codes separate `escalated` from `offensive_content`.
- P20-SC5 **PASS**. Timecoded reaction causes appear with explicit content sanitized, and no score is capped.
- REQ-100, REQ-101 **PASS**.

The decline-signals panel is a Phase 18 pitch surface. Difficult
conversations explain the end through `ConversationEndBanner` plus
`reactionCauses`, per REQ-102.

**Final verdict: PASS — agent-verified (Playwright, real HeyGen/OpenAI), not human.**
