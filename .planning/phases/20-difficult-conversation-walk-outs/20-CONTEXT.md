# Phase 20: Difficult Conversation Walk-Outs - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning — with two areas deliberately left open (see Open Questions)

<domain>
## Phase Boundary

The `difficult-conversation` type gains a disengagement threshold plus the
hostility and offense signals Phase 18 does not have, so a student who escalates,
stonewalls, or says something offensive has the conversation ended on them by the
avatar — recorded as a failure that explains what tipped it.

Phase 18's machinery is REUSED, never duplicated: `disengagementThreshold`,
`computeDisengagement` / `computeDisengagementOverTranscript`, the walk-out lock
and single uninterruptible final statement, the signed walk-out proof,
auto-finish, and the report decline panel.

**What already exists** (verified in `lib/difficult-conversation/conversation-type.ts`):
the type already declares `avatarMayEnd: true`, `avatarEndReasons:
["walked_out", "shut_down", "escalated", "nothing_left_to_discuss"]`, and
`avatarEndFloor: { minAssistantTurns: 4 }`. The only missing piece on the type
record is `disengagementThreshold`. The missing piece in the engine is the
signals.

**Why Phase 18's signals are insufficient:** `DISENGAGEMENT_CAUSES` is
`["budget_pressure", "turn_count_pressure", "repeated_response",
"short_response_streak", "no_common_ground"]` — all boredom/stall signals. None
detects hostility. And because the DC type sets `timeBudget.totalSeconds: null`,
`budget_pressure` (weight 0.25, the joint-largest) contributes **nothing** here,
so the inherited signal set is weaker for this type than for a pitch.

</domain>

<decisions>
## Implementation Decisions

### What trips the walk-out

All four behavior categories are in scope:

1. **Insults and profanity directed at the avatar** — name-calling, demeaning
   language, swearing at the other person.
2. **Escalation / aggression** — threats, ultimatums, shouting (all-caps),
   contempt. Hostile in tone without necessarily being profane.
3. **Stonewalling / refusing to engage** — dismissing what the avatar says,
   refusing to answer, repeating the same demand. Phase 18's `repeated_response`
   and `short_response_streak` already partly cover this; planning must decide
   what is genuinely new here versus already measured.
4. **Slurs and harassment** — identity-based attacks and sexual harassment.
   Treated as a SEPARATE, more severe category (see the floor carve-out below),
   not as one more flavor of hostility.

### Detection: Phase 18's invariant is preserved

- A **deterministic detector** (lexicon + pattern) computes the signal. The
  avatar's structured cue **accelerates** it but can **never end the session on
  its own** — exactly Phase 18's REQ-79 rule. The role-playing model never grades
  its own patience.
- The existing `DISENGAGEMENT_CUE_ACCELERATION` / `maxCueAcceleration: 0.2`
  ceiling is the precedent to follow.

### The false-positive guard: target the person, not the position

This is the detector's **core test**, and the risk is specific to this phase —
these scenarios are *about* confrontation. Firing someone or confronting a low
performer requires firm, uncomfortable language.

- Only language aimed **AT the other person** counts: insults, contempt, threats.
- *"Your performance has been unacceptable and this is your final warning"* is
  **firm, not hostile**, and must never trip the walk-out.
- Planning should derive the boundary against the seven seeded scenarios' own
  language — a detector that fires on the seeded "firing someone" conversation's
  intended register is broken, not strict.

### An empathy signal, live

A caller-supplied observable signal for **the student never acknowledging the
avatar's position** is IN scope — the live twin of Phase 15's `empathy` rubric
dimension ("acknowledging is not agreeing"). A student who never once
acknowledges the other side is losing them, and that is observable in-session
rather than only at evaluation. Model it on Phase 18's `no_common_ground`, which
is caller-supplied and defaults to false so that no model prose is treated as
live evidence merely because it exists.

### Severity: a declared carve-out in Phase 18's floor guarantee

- **Ordinary hostility ACCUMULATES**, exactly like Phase 18's stall signals, and
  **ratchets one-way**. One sharp remark in a heated firing conversation does not
  end it; a pattern does.
- **Severe content OVERRIDES `avatarEndFloor`.** A narrow, explicitly-declared
  severe category — slurs, harassment, threats — ends the session regardless of
  turn count. Keeping a student in the conversation for two more turns to satisfy
  a gradeable-material floor after a slur is the wrong trade.
- **This is a deliberate carve-out in Phase 18 Success Criterion 5** ("a walk-out
  can never fire before a type's `avatarEndFloor` minimum turns") and must be
  **declared as one** — a named, tested exception in `resolveTermination` with the
  severe category enumerated, not an incidental bypass. Phase 18's SC5 and
  `scripts/verify-disengagement-termination.ts` will need deliberate amendment,
  and planning must flag this as a Phase 18 revision handoff in the way Phases
  14/15/16 handled their Phase 13 extensions.
- The floor is NOT lowered from 4 to make this easier — the floor still governs
  ordinary hostility and stalling, and 15-06 chose 4 so a walk-out leaves
  gradeable material on clarity, empathy AND holding the line.

### No recovery — the value stays one-way

- Reuses Phase 18's ratchet **exactly**. A genuine apology can slow further rise
  (by not adding hostility) but cannot undo what was said.
- This is also the safe choice: a decaying value would directly reverse the
  `computeDisengagementOverTranscript` fix Phase 18 landed for the "Cheese"
  defect, where one novel reply dropped the value from 0.6 to 0.4 because
  `priorValue` had no callers.

### Reason codes: reuse what the type already declares

- Map hostility → `escalated`, stonewalling → `nothing_left_to_discuss`.
- `walked_out` and `shut_down` already exist for the in-character variants.
- Add a **distinct new reason only for the severe category**, so a
  slur-terminated session is queryably different from an escalation-terminated
  one.

### Claude's Discretion

- The threshold value itself, the per-signal weights, and the severe-category
  enumeration. Phase 18's calibration policy applies: **do not retune
  thresholds, weights or cue acceleration without explicit human calibration
  approval** (recorded in `18-VALIDATION.md`). Any value this phase sets must be
  labelled as provisional-until-calibrated, following `12-TUNING.md`'s precedent
  of recording what evidence a number actually rests on.
- Whether the stonewalling signal needs new code at all, or is already covered by
  `repeated_response` + `short_response_streak`.
- Detector implementation (lexicon sourcing, normalization, evasion handling).
- How the empathy signal is derived observably without a model judgement call.

</decisions>

<specifics>
## Specific Ideas

- The user's framing: the trigger is **the student losing control of the avatar's
  emotional state** — not merely a stalled or low-energy conversation. Phase 20
  is about consequence for *how* the student behaved, where Phase 18 is about
  consequence for *boredom*.
- Phase 19 switched every deck mode's walk-out OFF specifically so the mechanism
  would land here instead. `pitch-elevator` is the only other opted-in type.
- The detector's hardest requirement is the one most likely to be got wrong:
  firmness is the point of these scenarios. A detector tuned for a general chat
  product would be wrong here.

</specifics>

<open>
## Open Questions — deliberately not decided

Two gray areas were identified and the user chose not to settle them. They are
NOT Claude's Discretion; they are real decisions that research and planning
should surface for a human, and they are likely worth a
`/gsd:discuss-phase 20` follow-up or an in-plan checkpoint.

1. **In-character ending vs breaking frame.** When a student crosses a real line,
   does the avatar leave in character (*"We're done here"*) or does the app break
   frame with a safety message? These are materially different products for the
   severe category specifically. Phase 15's **support note** and
   **always-visible End-session control** must survive either answer — a walk-out
   must never leave a student with no exit and no explanation. Planning should
   NOT pick one silently.
2. **Scenario opt-in and report treatment.** Do all seven seeded conversations
   plus student-authored ones get a threshold, or only some? May an author set
   their own? Does Phase 15's difficulty step modulate it? And in the report:
   does it quote the offending line back, and does an offense-triggered end cap
   scores? Note Phase 15's outcome record is **unscored** by deliberate decision
   (`15-06` omits `postProcessScores` on purpose, with a comment saying so), and
   Phase 14's early-end score cap was explicitly NOT reused — so any capping here
   would reverse a recorded decision and needs to be argued, not assumed.

</open>

<deferred>
## Deferred Ideas

- Applying the walk-out to interview, networking or case-study types — not
  raised, and out of scope; Phase 20 is the difficult-conversation types only.
- Letting a genuine apology lower the disengagement value (a decaying rather than
  ratcheting value) — considered and rejected for this phase because it reverses
  Phase 18's `computeDisengagementOverTranscript` fix. Revisit only with a
  deliberate plan to keep the ratchet defect closed.
- A two-strikes in-character warning before the walk-out — considered and
  rejected in favor of the accumulating value, to avoid a second mechanism
  running alongside it.

</deferred>

---

*Phase: 20-difficult-conversation-walk-outs*
*Context gathered: 2026-10-08*
