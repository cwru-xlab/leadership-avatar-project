---
phase: 18-avatar-disengagement-walk-out
status: open
severity: BLOCKER — SC3/REQ-81/REQ-82 fail; the session locks with no exit
found: 2026-10-09
found_by: user, live elevator session during 18-05 UAT
---

# A walk-out that loses its proof locks the session forever

## Reported symptom

User, running `/practice/pitch-elevator` during 18-05:

> "im not sure that the elevator pitch disengagement is working. it's not
> triggering reroute. i can pass the threshold in less than 4 turns, which is
> fine, but because it does that, the final avatar chat doesnt seem like a
> termination and it freezes everything up without rerouting."

The avatar's final line was **`Alright, did you have a pitch or an idea you
wanted to walk me through?`** — an opening question, not a farewell.

## Mechanism (traced, not yet reproduced under instrumentation)

The walk-out is a TWO-REQUEST flow:

1. **Crossing turn.** Server computes `walkOutFinal = threshold != null &&
   crossed && assistantTurnCount >= minAssistantTurns`. When true it mints a
   signed `walkOutProof` and returns it in SSE metadata. The shell
   (`PracticeSessionShell.tsx` ~820-836) sets `walkOutLockRef`, and — because no
   termination was accepted yet — **suppresses the crossing reply entirely** and
   fires a one-shot `sendMessage("", true)`.
2. **Forced-farewell turn.** The shell re-sends history with no new user message
   plus `forceWalkOutFarewell` and the stored proof.

The server honours step 2 ONLY if the proof verifies
(`app/api/interaction/chat/route.ts:536-546`):

```ts
const forceWalkOutFarewell =
  engineTurn?.forceWalkOutFarewell === true &&
  currentUser !== null &&
  typeof rawReportId === "string" &&
  Boolean(await verifyWalkOutProof({ token: engineTurn?.walkOutProof, userId: currentUser.id, reportId: rawReportId }));
```

**If that evaluates false, the failure is SILENT.** `buildWalkOutFragment`'s
`forceFarewell` branch — the directive that says *"End this conversation now with
one brief, in-character excuse and a trailing `<engine-end reason="lost_interest" />`"*
— is never injected. The model receives an ordinary turn with **no new user
message**, and generates a generic opener. That is precisely the observed line.

Then the dead end, in the shell:
- No directive → no `<engine-end>` marker → `acceptedTermination` is null.
- `forcedFarewellRequestedRef.current` is already true, so the one-shot retry
  cannot fire again.
- If this second turn does not itself report `walkOutFinal: true`, control falls
  to the ordinary path: speak, no termination, **no `finishAfterFarewell`**.
- `walkOutLockRef.current` is STILL TRUE from step 1. Typing, Send, PTT, pause
  and leave all stay locked. There is no finish, no report, no reroute.

**The session is unexitable.** The only error recovery that exists
(`PracticeSessionShell.tsx:866-875`) unlocks on a THROWN network error. A
successful HTTP response carrying an unusable reply is not an error, so that
recovery never runs.

## Leading hypothesis for why the proof fails

The proof is bound to `reportId`. The user crossed the threshold very early
(elevator floor is `minAssistantTurns: 2`, so a turn-2 crossing is legitimate and
expected). If the `InteractionReport` row does not yet exist — or the client does
not yet hold its id — when the crossing turn runs, then `typeof rawReportId ===
"string"` is false, no proof is minted, and the farewell degrades exactly as
observed. **An early, legitimate crossing would be the trigger**, which matches
the user's own causal read.

This is a hypothesis traced from source, NOT yet confirmed by instrumentation.
The decisive evidence is whether `walkOutProof` was present in the crossing
turn's SSE metadata.

## Why the green battery missed it

`verify-disengagement-walkout-shell.ts` passes 23/23. It asserts the shell's
replay and auto-finish wiring against fixtures where the proof is present and
valid. **No test covers the proof-absent or proof-invalid path** — the branch
where the server silently declines to force the farewell. This is the identical
shape to Phase 18's first UAT failure: the ratchet was proven in the unit and
unenforced at the integration seam. Here the happy path is proven and the
degraded path is unexercised.

## Required fixes (not applied — needs a debug session)

1. **Fail loudly, not silently.** When `forceWalkOutFarewell` is requested but
   the proof does not verify, the server must say so in metadata rather than
   serving an ordinary turn that looks like a reply.
2. **The shell must never leave a locked session with no exit.** If a forced
   farewell returns without an accepted termination, it must either finish
   anyway (the crossing was already server-verified) or release the lock and
   restore the controls. Trapping the student is strictly worse than an
   imperfect ending.
3. **Settle the proof/reportId ordering** so an early-but-legitimate crossing can
   still mint a proof. If a proof genuinely cannot exist that early, the floor or
   the crossing must account for it rather than producing an unexitable session.
4. **Test the degraded path.** Add proof-absent and proof-invalid cases to
   `verify-disengagement-walkout-shell.ts`, with a recorded negative test.

## Status of Phase 18

**18-05 cannot pass on this.** SC3 (one uninterruptible final statement, then
auto-finish and a report) and REQ-81/REQ-82 are failing in a live session. This
blocks Phase 18's close and therefore Phase 20's 20-07.
