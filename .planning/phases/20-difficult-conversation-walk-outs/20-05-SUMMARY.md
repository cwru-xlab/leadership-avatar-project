# 20-05 Summary — Live wiring for the difficult-conversation walk-out

**Status:** complete · **Date:** 2026-10-15
**Files:** `app/api/interaction/chat/route.ts`, `lib/engine/session.ts`,
`lib/engine/prompts.ts`, `lib/engine/walk-out-proof.ts`,
`scripts/verify-disengagement-walkout-shell.ts`
**Session shell:** untouched, as the plan requires (`git diff --stat
components/practice/PracticeSessionShell.tsx` empty). No deviation was needed.

## 1. The defect this plan existed to close

`buildWalkOutFragment` hardcoded `<engine-end reason="lost_interest" />`.
`resolveTermination` gate (2) rejects any reason outside the type's own
`avatarEndReasons`, and `difficult-conversation` does **not** declare
`lost_interest`. So a forced farewell in a difficult conversation was issued by
the server, spoken by the avatar, and then **silently rejected** — the session
never terminated.

This is not a difficult-conversation quirk. **Any future type whose
`avatarEndReasons` differ from the pitch types' would have hit the same wall**,
with no error anywhere: the directive is private, the rejection is a boolean,
and the only symptom is a session that refuses to end. The fix interpolates a
server-decided reason, falling back to `lost_interest` only when none is
supplied, which keeps the pitch types byte-identical.

## 2. The inert-threshold defect found during execution

Phase 20 declared `CONVERSATION_DISENGAGEMENT_THRESHOLD` and a
`disengagementWeights` profile on the type in 20-03, but **neither live caller
passed the profile**. `computeDisengagementOverTranscript`'s `weights`
parameter is optional and silently falls back to
`DEFAULT_DISENGAGEMENT_WEIGHTS`, where all four Phase 20 causes — `hostility`,
`severe_content`, `position_unacknowledged`, `stonewalling` — are weight **0**
by design (20-02 made them zero so existing types computed byte-identically).

Net effect before this plan: a hostile difficult conversation computed the same
value it would have computed before Phase 20 existed. Hostility contributed
nothing. **The walk-out could never fire for the trigger the whole phase is
about.** Both callers now pass the profile.

This is precisely the failure shape Phase 18's UAT found — a contract proven in
the unit and unenforced at the integration seam — which is why every new
assertion in Task 3 is written against the real caller's source, not a fixture.

## 3. What changed

- **`prompts.ts`** — `EngineTurnState["walkOut"]` gained `reason?: string |
  null`, documented as server-decided. The forced-farewell directive
  interpolates it and now also instructs the character to leave *without
  explaining why in any terms outside the conversation* (REQ-101). One ending
  path; no break-frame branch, no second directive.
- **`chat/route.ts`** — both computation sites pass
  `terminationPolicy.disengagementWeights`. The stream site resolves
  `resolveWalkOutReason` once and threads it into the signed proof and SSE
  metadata (`walkOutSevere`, `walkOutReason`). `walkOutFinal` gained the
  carve-out: severe content clears the **floor** but still requires the
  threshold — severity is never a bypass of derived evidence. The pre-turn site
  recomputes the reason from its own derived result, never from the client.
- **`walk-out-proof.ts`** — `severe` and `reason` added to the signed payload
  and `VerifiedWalkOutProof`, validated like the existing fields (wrong type →
  `null`). TTL, `kind`, subject/report binding and the `crossed` requirement are
  unchanged. Finish learns severity from a server-signed value, never a body.
- **`session.ts`** — `deriveFinishDisengagement` forwards the type's weights, so
  the recorded value uses the same arithmetic as the live gate. `severeContent`
  is derived from server evidence (verified proof when it matches the
  transcript, else the fresh re-derivation) and passed into
  `resolveTermination`, so the carve-out applies on the recorded path too —
  without it a severe session that legitimately ended below the floor would be
  recorded as a non-termination and the evidence lost. `recordedTerminationReason`
  prefers the mapped reason over the model's marker, which is what makes
  `offensive_content` queryably distinct from `escalated`. `severe` added to the
  persisted `disengagementDecline`.

## 4. Verification

`npx tsc --noEmit` clean. All green: `verify-disengagement`,
`-termination`, `-walkout-shell`, `-report`, `verify-hostility-detector`,
`verify-dc-{surface-count,type,report,walkout-report}`, `verify-pitch-types`,
`verify-engine-surface-count`, `verify-pitch-surface-count`,
`verify-turn-control`, `verify-pitch-session-state`.

`verify-disengagement-walkout-shell.ts` went 25 → 37 `check(` call sites,
purely additive — the only deleted line is the import it extends.

**Negative-tested, both confirmed to bite:**

| Reverted change | Result |
| --- | --- |
| Hardcode the farewell reason again | exit 1 — fails the regex row *and* the behavioural row |
| Drop `disengagementWeights` from the chat route | exit 1 — fails the caller-level weights row |

Restoring each returned the suite to ALL PASS.

## 5. Note for 20-07

The behavioural assertion builds its config through `buildTailBlock` rather than
`buildTurnMessages`, with a **real** seeded instance. The DC type's system
prompt and in-character reminder both refuse to build without one; that refusal
is correct behaviour and was kept rather than stubbed around.

Phase 20's live path is now complete. 20-07's human UAT is the only remaining
plan, and it is still gated on Phase 18's 18-05.
