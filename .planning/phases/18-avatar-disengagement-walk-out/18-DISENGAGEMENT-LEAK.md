---
phase: 18-avatar-disengagement-walk-out
status: accepted-by-user
found: 2026-10-09
found_by: user, during Phase 19's 19-11 human UAT (block D)
severity: none — user reviewed and accepted 2026-10-09
proposed_owner: none — see Disposition
---

# The disengagement value is shipped to the browser on every turn, for every type

## What the user observed

While running Phase 19's block D (confirming the investor deck no longer walks
out), the user reported: *"the investor pitch still has the disengagement score
showing in dev tools, but i cant seem to get it to cross 0.675 so it never
leaves."*

## What is actually correct here

The **behaviour is right**. Verified at runtime:

```
pitch-deck       avatarMayEnd= false  threshold= undefined
pitch-elevator   avatarMayEnd= true   threshold= 0.5
pitch-funding    avatarMayEnd= false  threshold= undefined
pitch-product    avatarMayEnd= false  threshold= undefined
pitch-talk       avatarMayEnd= false  threshold= undefined
pitch-general    avatarMayEnd= false  threshold= undefined
```

The deck cannot walk out at ANY value — there is no threshold to cross, so 0.675
is not a ceiling the user failed to beat, it is simply irrelevant. Phase 19's
block D passes. `walkOutFinal` is correctly gated at
`app/api/interaction/chat/route.ts:278` on `disengagementThreshold != null`.

## The actual defect

`computeDisengagementOverTranscript` is called **unconditionally** at
`app/api/interaction/chat/route.ts:263`, and its result is attached to the SSE
frame at ~line 293:

```ts
event.metadata = {
  ...(event.metadata ?? {}),
  termination: parsed.termination,
  disengagement,          // <-- full value, episodes, dominantCauses
  disengagementCue: parsed.disengagementCue,
  walkOutFinal,
  walkOutProof,
};
```

So on **every turn of every interaction type** — interview, case-study,
networking, all five deck modes, none of which can walk out — the server
computes a disengagement value and ships it to the client. Two consequences:

1. **Gratuitous computation** for types that have no threshold. A full
   prefix-by-prefix transcript replay per turn, discarded.
2. **The number is visible to any student who opens dev tools.** REQ-85's letter
   is satisfied — there is no meter, indicator or warning in the session shell —
   but its recorded rationale is not. The v1.1 Out-of-Scope table gives the
   reason for REQ-85 as: *"it makes the student optimize a gauge instead of the
   conversation."* An F12 press defeats that.

## Why this is Phase 18's, not Phase 19's

The emission is 18-03 code (`3d6f80a`, hardened by `3479921`) and predates
Phase 19 entirely. Phase 19's job was to stop the deck walking out, and it did
exactly that. Surfacing here is a credit to the UAT, not a Phase 19 regression.

## What the client actually needs

`components/practice/PracticeSessionShell.tsx` consumes it at lines 788 and
808-809 (`disengagementValue`, `disengagementRef`). Note 18-03's own design
already established that the browser is **not trusted** for report evidence —
`3479921` ("bind proofs to server evidence") exists precisely because the signed
`walkOutProof` is the authority. So the raw value in the browser is a
convenience, not a contract, and is a candidate for removal rather than merely
gating.

## Proposed fix (for whoever owns it)

1. **Gate the computation** on `disengagementThreshold != null` so no-threshold
   types do no work. This alone removes the leak for all five deck modes,
   interview, case-study and networking.
2. **Then decide whether threshold-bearing types need the raw value client-side
   at all**, given the signed proof is the authority. If the shell only needs
   "a walk-out is happening", send that boolean and not the number.
3. Do **not** treat this as a reason to weaken REQ-85 — the requirement is right;
   the implementation leaks around it.

## Disposition — ACCEPTED BY THE USER, 2026-10-09

**The user reviewed this and accepted it deliberately:** *"im not so worried
about whether the students can see their scores in dev tools. in fact, that
helps me debug at the moment."*

So the dev-tools visibility is **intended behaviour for now**, not a defect.
No plan owns a fix and none should be planned.

**Why this file is kept rather than deleted:** REQ-85 is a tracked, shipped
requirement ("no meter, indicator or warning anywhere in the session shell"),
and Phase 18's pending 18-05 UAT verifies it. A future reviewer who finds the
value in a network payload could reasonably read it as a REQ-85 violation and
re-raise it. This record is the answer: REQ-85's letter is satisfied — the
session shell carries no meter — and the payload visibility was examined and
knowingly accepted, the same way Phase 12's phone-duration under-count was
accepted on the record rather than silently passed.

**Two things that remain true and may matter later, neither requiring action
now:**
1. The value is computed for every type including the eight that can never walk
   out. That is wasted per-turn work, not a correctness problem — and while the
   user is debugging, computing it everywhere is actively useful.
2. If the product ever ships to students in a graded setting, revisit (1) and
   the visibility together. The debugging value that justifies it today is a
   development-time benefit, not a production one.

Does not block Phase 19 sign-off.
