---
status: resolved
trigger: "elevator-walkout-dead-end — crossing the disengagement threshold on /practice/pitch-elevator locks the session but never delivers a farewell, never auto-finishes, and never reroutes to the report."
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — see Resolution.
test: n/a — resolved.
expecting: n/a
next_action: none (resolved, archived)

## Symptoms

expected: Crossing the threshold plays exactly ONE uninterruptible in-character
farewell, then auto-finishes with a report, no End-session press required
(Phase 18 SC3, REQ-81, REQ-82).
actual: Input locks correctly, but the avatar's "final" line was an opening
question ("Alright, did you have a pitch or an idea you wanted to walk me
through?"), not a farewell. Nothing finishes. No report. No reroute. All
controls permanently disabled.
errors: None surfaced. HTTP succeeds; reply is just unusable.
reproduction: `/practice/pitch-elevator`, stall/repeat to cross the 0.5
threshold (elevator floor `minAssistantTurns: 2`), in under 4 turns.
started: First live exercise of the Phase 18 walk-out since the 2026-10-06
repairs; prior UAT (18-05) had not yet reached this path.

## Eliminated

- hypothesis: "The proof never mints on the crossing turn because the
  `InteractionReport` row does not exist yet (early crossing vs. report
  creation ordering)."
  evidence: Traced `app/practice/[type]/page.tsx`'s `SetupWizard` — for
  `pitch-elevator`, `createReportOnLaunch` is unconditionally true (no
  `isDeckMode`-style false branch for this type). `handleCameraLaunch` POSTs
  `/api/practice/session/start` and awaits a real `reportId` BEFORE calling
  `onLaunch`, which sets page.tsx's `reportId` state before `phase` ever
  becomes `"session"`. `lib/engine/session.ts`'s `startSession` creates the
  row with `status: "IN_PROGRESS"` synchronously inside that same request.
  So the report row and its id are guaranteed to exist and be passed as
  `extraChatBody.reportId` on turn 1. Confirmed false for this reproduction.
  timestamp: 2026-10-09
- hypothesis: "`walkOutFinal` (the independently-computed crossing boolean)
  flips back to false on the forced-farewell (second) request, because the
  transcript sent on that request now includes one extra assistant message
  (the suppressed crossing-turn reply) with no new user message, shifting
  something in the disengagement computation."
  evidence: Mathematically and empirically disproved.
  `computeDisengagement`'s one-way rule is
  `value = clamp(Math.max(clamp(priorValue), computed + cueContribution))` —
  once a prefix's replayed value reaches the threshold, every later prefix's
  value is bounded below by it; `crossed` cannot un-cross.
  `computeDisengagementOverTranscript` replays prefix-by-prefix and carries
  `priorValue` forward exactly this way. Ran a static repro
  (`npx tsx` against the real `computeDisengagementOverTranscript`) with a
  3-user-turn stalled elevator fixture: turn 1 (crossing) → value 0.65,
  crossed true; turn 2 (crossing reply appended, assistantTurnCount+1,
  elapsedSeconds+1, no new user message) → value 0.65, crossed STILL true;
  `walkOutFinal` true on both. Confirmed false — `isWalkOut` does not flip
  false this way.
  timestamp: 2026-10-09
- hypothesis: "HISTORY_TURNS(=10)*2 slicing on the client drops the earlier
  half of a repetition pair between turn 1 and turn 2, un-crossing the
  threshold."
  evidence: User's own report says crossing happens in "less than 4 turns" —
  well under the 20-message slice window. No messages are dropped at that
  length. Confirmed false.
  timestamp: 2026-10-09

## Evidence

- timestamp: 2026-10-09
  checked: `app/api/interaction/chat/route.ts` lines ~536-546 (pre-fix) —
  the `forceWalkOutFarewell` proof-verification gate, and `lines ~277-300` —
  `walkOutFinal`/proof minting, independent of that gate.
  found: `walkOutFinal` (and therefore proof minting) is computed purely
  from `disengagement.crossed` + the turn floor — it does NOT depend on
  `forceWalkOutFarewell`/proof verification at all. The proof gate only
  controls whether the `forceFarewell` DIRECTIVE gets added to
  `turnState.walkOut` for prompt-building. These are two independent
  mechanisms; a failure in one does not explain the other going silent.
  implication: The leading hypothesis (proof-timing failure) was the wrong
  layer. The bug had to be either in how the directive reaches the model,
  or in how the client interprets a result that lacks the directive's
  effect — not in whether the proof exists.
- timestamp: 2026-10-09
  checked: `lib/engine/prompts.ts`, `buildTurnMessages` (pre-fix).
  found: **ROOT CAUSE.** The tail block (which carries the `forceFarewell`
  directive text: "End this conversation now with one brief, in-character
  excuse and a trailing `<engine-end reason="lost_interest" />` marker...")
  is spliced onto the message found by searching the transcript, FROM THE
  END, for `role === "user"`. On every ordinary turn this is also the LAST
  message (the shell always appends the student's new message before
  sending). But the one-shot forced-farewell request
  (`PracticeSessionShell.tsx`'s `sendMessage("", true)`) deliberately resends
  history with NO new user message — by design, so the audible close stays
  singular. On that exact request, the transcript's last entry is the
  SUPPRESSED crossing-turn's own assistant reply, and "latest user message"
  resolves to an OLD, already-answered student turn several messages back.
  The directive gets buried there instead of landing on the live edge of the
  conversation, and the message array handed to the model ends on an
  assistant turn (atypical input) with no clear "do this now" signal. The
  model falls back to ordinary conversational continuation — matching the
  exact observed line, a generic opening-style question.
  implication: This single defect is sufficient, by itself, to explain the
  reported symptom: the model never meaningfully receives the forced-farewell
  instruction on the one request engineered to carry it.
- timestamp: 2026-10-09
  checked: `PracticeSessionShell.tsx`'s walk-out branch
  (`if (isWalkOut) { ... }`), tracing what happens to a forced-farewell
  response that comes back WITHOUT an `<engine-end>` marker.
  found: Given `isWalkOut` IS still true on the forced-farewell response
  (per the "Eliminated" item above), the existing code actually falls
  through to `finishAfterFarewell` regardless of marker presence, because
  `forcedFarewellRequestedRef.current` is already true (skips the retry
  branch) — so in THIS reproduction path the session should technically
  still auto-finish, just with the wrong spoken line. The deeper, more
  dangerous risk is a DIFFERENT, adjacent failure mode: `isWalkOut` is read
  from `walkOutMetadata?.walkOutFinal === true`, and `walkOutMetadata` can be
  `null` whenever the server's end-of-turn metadata computation throws for
  any reason — see next item. In that branch, `isWalkOut` is false
  regardless of what actually happened server-side, and nothing in the old
  code treated "this was the forced-farewell response" as independently
  sufficient to resolve to a terminal state. That gap is exactly what Phase
  18's own debug doc observed from the live session (permanent lock, zero
  errors), and it is real and worth closing even though this specific static
  trace could not force the throw to reproduce it directly.
  implication: Defense-in-depth is required: the response to a
  forced-farewell request must ALWAYS resolve to a terminal (finished or
  explicitly unlocked) state, never fall through to "nothing happens."
- timestamp: 2026-10-09
  checked: `attachTerminationToStream`'s per-line SSE processing in
  `app/api/interaction/chat/route.ts` (pre-fix).
  found: A single `try { ... } catch { /* Pass through malformed frames
  unchanged. */ }` wrapped BOTH the `JSON.parse` of each SSE line AND the
  entire "end" event's metadata computation (disengagement replay, proof
  minting via an `await`). The comment's claim ("pass through... unchanged")
  is false for the "end" branch: on any exception there, the `catch` does
  NOTHING — it does not re-enqueue the line, so the entire "end" frame
  (including `walkOutFinal`, `termination`, the proof) is silently erased,
  with no server log and no client-visible error. The underlying stream
  still closes normally afterward (`finally { controller.close() }`), so the
  client sees a clean `done`, `walkOutMetadata` stays `null`, and
  `isWalkOut` evaluates to `false` with zero evidence anything went wrong.
  This exactly reproduces "HTTP succeeds, no toast, no console error, nothing
  finishes."
  implication: This is a second, independently sufficient mechanism for the
  exact silent-freeze symptom, and a severe robustness defect regardless of
  whether it was the actual trigger in the live report — there was no
  fail-loud path on this hot loop at all.

## Resolution

root_cause: Two independent, confirmed defects, either one sufficient to
produce the reported symptom:

1. **Misplaced directive (primary, demonstrated root cause of the specific
   observed line).** `buildTurnMessages` (`lib/engine/prompts.ts`) always
   spliced its per-turn tail block — including the `forceFarewell` walk-out
   directive — onto the transcript's latest message BY ROLE SEARCH
   ("latest user message"), not onto the live end of the conversation. The
   one-shot forced-farewell request is the one case where the transcript
   intentionally has no new user message, so the directive landed on a
   stale, already-answered turn, several messages behind the model's own
   prior reply. The model never received the instruction as "now" and
   produced an unrelated, generic reply instead of the in-character
   farewell + `<engine-end>` marker.
2. **Silent metadata drop (latent, severe robustness gap).**
   `attachTerminationToStream`'s SSE "end" event handler had no fail-loud
   path: any exception while computing disengagement/termination/proof
   metadata silently erased the entire "end" frame, making a transient
   failure indistinguishable, client-side, from an ordinary ambiguous reply
   — with zero error surfaced anywhere. Combined with the shell's old logic
   (which only resolved to a terminal state when `walkOutMetadata.walkOutFinal
   === true`), this is an independently sufficient way to leave the session
   locked forever with no error.

fix:
- `lib/engine/prompts.ts` (`buildTurnMessages`): when the transcript does
  not end on a user turn (i.e., this is a no-new-message request like the
  forced farewell), append the tail block as a new synthetic trailing user
  message instead of mutating the stale "latest user" message. Ordinary
  turns (which already end on a fresh user message) are byte-identical to
  before.
- `app/api/interaction/chat/route.ts` (`attachTerminationToStream`): split
  the per-line `JSON.parse` try/catch from the "end" event's metadata
  computation. The metadata computation now has its own try/catch that,
  on failure, logs via `console.error` and still enqueues an "end" event
  carrying `walkOutMetadataError: true` (and `walkOutFarewellDeclined: true`
  when a forced farewell was in flight) instead of dropping the frame.
  Also added an explicit `walkOutFarewellDeclined: true` metadata flag on
  the success path whenever the client requested `forceWalkOutFarewell` but
  the signed proof did not verify (`walkOutFarewellRequested` /
  `walkOutFarewellVerified` threaded through `parseOpts`) — a declined
  forced farewell is now always visible in metadata, never served as an
  ordinary-looking reply.
- `components/practice/PracticeSessionShell.tsx` (`sendMessage`): the
  walk-out branch now enters on `isWalkOut || forceWalkOutFarewell`, not
  `isWalkOut` alone. Since `forceWalkOutFarewell` is true only on the
  shell's own one-shot retry, entering this branch is always safe and
  intentional. This guarantees the forced-farewell response ALWAYS resolves
  to a terminal state (speaks + `finishAfterFarewell`) even if the server
  declined the directive or its metadata was dropped for any reason — the
  crossing being honoured was already server-verified on the FIRST request,
  so finishing anyway is correct per the fix-constraint priority ("a locked
  session with no exit is strictly worse than an imperfect ending"). Also
  guards against speaking/finishing on an empty string by substituting a
  safe fallback farewell line when the reply has no usable text.

No threshold, weight, or cue-acceleration value was changed (calibration
policy respected). `lib/pitch/elevator-type.ts` was not touched (read-only
fence respected).

verification:
- `npx tsc --noEmit --pretty false` — clean, zero errors.
- `npx tsx scripts/verify-disengagement-walkout-shell.ts` — all prior 23
  checks still PASS, plus 6 new checks, 29/29 PASS.
- `npx tsx scripts/verify-disengagement.ts`,
  `verify-disengagement-termination.ts`, `verify-disengagement-report.ts` —
  unchanged, all PASS.
- `verify-pitch-types.ts` — unchanged, the single pre-existing documented
  failure from `18-VALIDATION.md` (unrelated fixture/assertion question,
  awaiting a human disposition choice; not touched by this fix).
- **Negative test recorded**: temporarily reverted `lib/engine/prompts.ts`
  alone (`git stash` on that one file) and re-ran the new walk-out-shell
  checks — the 3 new functional checks for the directive-placement fix
  FAILED as expected ("the directive lands on a new trailing turn" /
  "the already-answered user turn is left untouched" /
  "exactly one synthetic trailing turn is appended"), proving the test
  actually exercises the regression and is not a tautology. Restored the
  fix (`git stash pop`); all checks pass again.
- This was a static/code-reading investigation plus an executable
  repro script run directly against the real, unmodified
  `computeDisengagementOverTranscript` and `buildTurnMessages` functions
  (see Evidence) — no live avatar session, database, or deployed service
  was used, consistent with the environment constraints. A live human
  re-check of the elevator walk-out (SC3/REQ-81/REQ-82) is still required
  before Phase 18's 18-05 can close; this debug session only fixes and
  statically/functionally verifies the mechanism.

files_changed:
- lib/engine/prompts.ts
- app/api/interaction/chat/route.ts
- components/practice/PracticeSessionShell.tsx
- scripts/verify-disengagement-walkout-shell.ts (regression tests + negative-test proof)
